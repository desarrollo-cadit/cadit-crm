import { describe, expect, it } from "vitest";
import {
  armarAvisoInscripcion,
  armarAvisoPago,
  armarResumenMorosidad,
  correoDelVendedor,
  destinatariosDeVenta,
  esVentaParaAviso,
  HORIZONTE_REINTENTO_MS,
  pasaAVenta,
  reintentoDeEventoQueToca,
  resumenSemanalQueToca,
  resumirMorosidad,
  saldoPorMoneda,
  semanaIso,
  type CuotaParaMorosidad,
  type DatosAvisoInscripcion,
  type DatosAvisoPago,
} from "@/lib/billing-notices";
import {
  claveDeAviso,
  columnasDelSujeto,
  MAX_INTENTOS_AVISO,
  puedeReclamar,
  sujetoDeRegistro,
} from "@/lib/staff-notices";
import { exigeVendedor } from "@/server/sellers";

/**
 * 041 — Avisos internos de cobranza: nueva inscripción, pago registrado y el
 * resumen semanal de morosidad, todos a Administración.
 *
 * Lo que decide CUÁNDO sale un aviso, A QUIÉN y QUÉ dice es puro: se prueba
 * acá sin base ni correo.
 */

const MVD = "America/Montevideo";
/** Fechas de día (inicio de cohorte, vencimiento, pago) se guardan a medianoche UTC. */
const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
/** Un instante de pared en Montevideo (UTC-3, sin horario de verano). */
const mvd = (iso: string, hora = "10:00") => new Date(`${iso}T${hora}:00.000-03:00`);

describe("claveDeAviso — la llave de idempotencia de cada aviso", () => {
  it("una por cohorte y tipo (039), por inscripción, por pago y por semana", () => {
    expect(claveDeAviso({ kind: "cohorte_confirmada", cohortId: "co_1" })).toBe("cohorte_confirmada:co_1");
    expect(claveDeAviso({ kind: "facturacion_t2", cohortId: "co_1" })).toBe("facturacion_t2:co_1");
    expect(claveDeAviso({ kind: "inscripcion_nueva", enrollmentId: "en_1" })).toBe("inscripcion_nueva:en_1");
    expect(claveDeAviso({ kind: "pago_registrado", enrollmentId: "en_1", paymentId: "pay_9" })).toBe(
      "pago_registrado:pay_9"
    );
    expect(claveDeAviso({ kind: "morosidad_semanal", periodKey: "2026-W43" })).toBe("morosidad_semanal:2026-W43");
  });

  it("la de 039 coincide con el backfill de la migración (`kind || ':' || cohort_id`)", () => {
    expect(claveDeAviso({ kind: "facturacion_t7", cohortId: "co_x" })).toBe(["facturacion_t7", "co_x"].join(":"));
  });

  it("cada sujeto llena solo su columna, y se puede reconstruir desde la fila", () => {
    const sujetos = [
      { kind: "cohorte_confirmada", cohortId: "co_1" },
      { kind: "inscripcion_nueva", enrollmentId: "en_1" },
      { kind: "pago_registrado", enrollmentId: "en_1", paymentId: "pay_1" },
      { kind: "morosidad_semanal", periodKey: "2026-W43" },
    ] as const;
    for (const s of sujetos) {
      const cols = columnasDelSujeto(s);
      expect(sujetoDeRegistro({ kind: s.kind, ...cols })).toEqual(s);
    }
    expect(columnasDelSujeto({ kind: "morosidad_semanal", periodKey: "2026-W43" })).toEqual({
      cohortId: null,
      enrollmentId: null,
      paymentId: null,
      periodKey: "2026-W43",
    });
  });

  it("una fila incompleta no se reconstruye (no se inventa un sujeto)", () => {
    expect(
      sujetoDeRegistro({ kind: "pago_registrado", cohortId: null, enrollmentId: "en_1", paymentId: null, periodKey: null })
    ).toBeNull();
  });
});

describe("esVentaParaAviso — qué alta le avisa a Administración", () => {
  it("una inscripción MADRE con cohorte es una venta", () => {
    expect(esVentaParaAviso({ cohortId: "co_1", parentEnrollmentId: null, courseKind: "curso" })).toBe(true);
    expect(esVentaParaAviso({ cohortId: "co_1", parentEnrollmentId: null, courseKind: null })).toBe(true);
  });

  it("el lead sin cohorte, la hija de un módulo y el taller no lo son", () => {
    expect(esVentaParaAviso({ cohortId: null, parentEnrollmentId: null, courseKind: null })).toBe(false);
    expect(esVentaParaAviso({ cohortId: "co_m", parentEnrollmentId: "en_madre", courseKind: "modulo" })).toBe(false);
    expect(esVentaParaAviso({ cohortId: "co_t", parentEnrollmentId: null, courseKind: "taller" })).toBe(false);
  });

  it("es la MISMA regla que la del vendedor obligatorio (y la de ventas por vendedor)", () => {
    const casos = [
      { cohortId: "co_1", parentEnrollmentId: null, courseKind: "curso" as const },
      { cohortId: null, parentEnrollmentId: null, courseKind: null },
      { cohortId: "co_m", parentEnrollmentId: "en_madre", courseKind: "modulo" as const },
      { cohortId: "co_t", parentEnrollmentId: null, courseKind: "taller" as const },
    ];
    for (const c of casos) expect(esVentaParaAviso(c)).toBe(exigeVendedor(c));
  });
});

describe("pasaAVenta — el lead que recibe cohorte", () => {
  it("de sin cohorte a una cohorte: sí", () => {
    expect(pasaAVenta(null, "co_1")).toBe(true);
  });

  it("mudar de cohorte, volver a lead o no tocar la cohorte: no", () => {
    expect(pasaAVenta("co_1", "co_2")).toBe(false);
    expect(pasaAVenta("co_1", null)).toBe(false);
    expect(pasaAVenta(null, null)).toBe(false);
    expect(pasaAVenta(null, undefined)).toBe(false);
  });
});

describe("destinatariosDeVenta — Administración + el vendedor de la venta", () => {
  const admin = { enabled: true, mailbox: "admin@cadit.test", ccEmails: ["conta@cadit.test"] };

  it("el correo del vendedor; si está vacío, el de su cuenta del panel", () => {
    expect(correoDelVendedor({ email: "vale@cadit.test", userEmail: "otra@cadit.test", archived: false })).toBe(
      "vale@cadit.test"
    );
    expect(correoDelVendedor({ email: "  ", userEmail: "vale.panel@cadit.test", archived: false })).toBe(
      "vale.panel@cadit.test"
    );
  });

  it("vendedor archivado, sin correo o sin vendedor → nadie", () => {
    expect(correoDelVendedor({ email: "vale@cadit.test", userEmail: null, archived: true })).toBeNull();
    expect(correoDelVendedor({ email: null, userEmail: null, archived: false })).toBeNull();
    expect(correoDelVendedor(null)).toBeNull();
  });

  it("To = casilla de Administración; el vendedor va en copia", () => {
    expect(destinatariosDeVenta(admin, { email: "vale@cadit.test", userEmail: null, archived: false })).toEqual({
      to: ["admin@cadit.test"],
      cc: ["conta@cadit.test", "vale@cadit.test"],
    });
  });

  it("sin repetir a quien ya está (sin distinguir mayúsculas)", () => {
    expect(destinatariosDeVenta(admin, { email: "CONTA@cadit.test", userEmail: null, archived: false })).toEqual({
      to: ["admin@cadit.test"],
      cc: ["conta@cadit.test"],
    });
  });

  it("vendedor archivado o sin correo → solo Administración", () => {
    expect(destinatariosDeVenta(admin, { email: "vale@cadit.test", userEmail: null, archived: true })).toEqual({
      to: ["admin@cadit.test"],
      cc: ["conta@cadit.test"],
    });
    expect(destinatariosDeVenta(admin, null)).toEqual({ to: ["admin@cadit.test"], cc: ["conta@cadit.test"] });
  });

  it("Administración apagada o sin casilla → se omite, aunque el vendedor tenga correo", () => {
    const vendedor = { email: "vale@cadit.test", userEmail: null, archived: false };
    expect(destinatariosDeVenta({ ...admin, enabled: false }, vendedor)).toBeNull();
    expect(destinatariosDeVenta({ ...admin, mailbox: null }, vendedor)).toBeNull();
    expect(destinatariosDeVenta(null, vendedor)).toBeNull();
  });
});

describe("semanaIso — la llave del resumen semanal", () => {
  it("lunes 19/10/2026 es la semana 43", () => {
    expect(semanaIso("2026-10-19")).toBe("2026-W43");
    expect(semanaIso("2026-10-25")).toBe("2026-W43");
    expect(semanaIso("2026-10-26")).toBe("2026-W44");
  });

  it("los bordes del año: el 1/1/2027 (viernes) es de la semana 53 de 2026", () => {
    expect(semanaIso("2027-01-01")).toBe("2026-W53");
    expect(semanaIso("2027-01-04")).toBe("2027-W01");
    expect(semanaIso("2025-12-29")).toBe("2026-W01");
  });

  it("una fecha mal formada → null", () => {
    expect(semanaIso("2026-13-40")).toBeNull();
    expect(semanaIso("hoy")).toBeNull();
  });
});

describe("resumenSemanalQueToca — los lunes desde las 08:00, con recuperación en la semana", () => {
  it("el lunes antes de las 08:00 (hora de la academia) todavía no", () => {
    expect(resumenSemanalQueToca(mvd("2026-10-19", "07:59"), MVD)).toBeNull();
  });

  it("el lunes desde las 08:00 toca, con la semana como llave", () => {
    expect(resumenSemanalQueToca(mvd("2026-10-19", "08:00"), MVD)).toBe("2026-W43");
  });

  it("un servidor apagado el lunes se pone al día el resto de ESA semana", () => {
    expect(resumenSemanalQueToca(mvd("2026-10-21", "03:00"), MVD)).toBe("2026-W43");
    expect(resumenSemanalQueToca(mvd("2026-10-25", "23:59"), MVD)).toBe("2026-W43");
  });

  it("la semana se corta en la zona de la academia, no en UTC", () => {
    // Lunes 26 a las 01:00 UTC = domingo 25 a las 22:00 en Montevideo.
    expect(resumenSemanalQueToca(new Date("2026-10-26T01:00:00.000Z"), MVD)).toBe("2026-W43");
    // Lunes 26 a las 10:59 UTC = 07:59 en Montevideo: la semana nueva todavía no toca.
    expect(resumenSemanalQueToca(new Date("2026-10-26T10:59:00.000Z"), MVD)).toBeNull();
  });

  it("zona inválida → null (no inventa una semana)", () => {
    expect(resumenSemanalQueToca(mvd("2026-10-19", "09:00"), "Mars/Olympus")).toBeNull();
  });
});

describe("reintentoDeEventoQueToca — la periódica recupera inscripciones y pagos", () => {
  const now = mvd("2026-10-19", "12:00");
  const reciente = new Date(now.getTime() - 60 * 60_000);

  it("el encolado que nunca se mandó (proceso caído tras el commit) se recupera", () => {
    expect(
      reintentoDeEventoQueToca({ status: "pending", attempts: 0, claimedAt: null, createdAt: reciente }, now)
    ).toBe(true);
  });

  it("fallido se reintenta hasta el máximo; enviado y omitido no", () => {
    expect(
      reintentoDeEventoQueToca({ status: "failed", attempts: 1, claimedAt: reciente, createdAt: reciente }, now)
    ).toBe(true);
    expect(
      reintentoDeEventoQueToca(
        { status: "failed", attempts: MAX_INTENTOS_AVISO, claimedAt: reciente, createdAt: reciente },
        now
      )
    ).toBe(false);
    expect(
      reintentoDeEventoQueToca({ status: "sent", attempts: 1, claimedAt: reciente, createdAt: reciente }, now)
    ).toBe(false);
    expect(
      reintentoDeEventoQueToca({ status: "skipped", attempts: 1, claimedAt: reciente, createdAt: reciente }, now)
    ).toBe(false);
  });

  it("uno en vuelo no se pisa", () => {
    const hace5 = new Date(now.getTime() - 5 * 60_000);
    expect(
      reintentoDeEventoQueToca({ status: "pending", attempts: 1, claimedAt: hace5, createdAt: reciente }, now)
    ).toBe(false);
  });

  it("pasada una semana ya no es aviso: no se reintenta", () => {
    const viejo = new Date(now.getTime() - HORIZONTE_REINTENTO_MS - 1);
    expect(
      reintentoDeEventoQueToca({ status: "failed", attempts: 1, claimedAt: viejo, createdAt: viejo }, now)
    ).toBe(false);
  });

  it("puedeReclamar: el encolado sin reclamo (attempts 0, claimed_at null) se puede reclamar enseguida", () => {
    expect(puedeReclamar({ status: "pending", attempts: 0, claimedAt: null }, now, { reintentarOmitido: false })).toBe(
      true
    );
  });
});

describe("saldoPorMoneda — lo que le queda por pagar a una inscripción", () => {
  it("cuotas vigentes, por moneda, sin sumar monedas", () => {
    expect(
      saldoPorMoneda([
        { amount: 10000, paid: 10000, currency: "UYU", canceledAt: null },
        { amount: 10000, paid: 4000, currency: "UYU", canceledAt: null },
        { amount: 300, paid: 0, currency: "USD", canceledAt: null },
      ])
    ).toEqual([
      { currency: "UYU", saldo: 6000 },
      { currency: "USD", saldo: 300 },
    ]);
  });

  it("una cuota anulada no debe nada y un sobrepago no da saldo negativo", () => {
    expect(
      saldoPorMoneda([
        { amount: 10000, paid: 0, currency: "UYU", canceledAt: "2026-10-01T00:00:00.000Z" },
        { amount: 5000, paid: 6000, currency: "UYU", canceledAt: null },
      ])
    ).toEqual([{ currency: "UYU", saldo: 0 }]);
  });

  it("sin plan de cuotas → lista vacía (no se inventa un saldo)", () => {
    expect(saldoPorMoneda([])).toEqual([]);
  });
});

describe("resumirMorosidad — la misma definición que el panel de cobranza", () => {
  const now = mvd("2026-10-19", "08:30");
  const base = {
    alumnoDeBaja: false,
    canceledAt: null,
    currency: "UYU" as const,
  };
  const cuotas: CuotaParaMorosidad[] = [
    // Ana, Revit: dos vencidas, una pagada a medias.
    { ...base, installmentId: "in_1", enrollmentId: "en_a", amount: 10000, dueDate: dia("2026-09-10"), alumno: "Ana Pérez", cohortId: "co_r", cohorte: "Revit — Octubre" },
    { ...base, installmentId: "in_2", enrollmentId: "en_a", amount: 10000, dueDate: dia("2026-10-10"), alumno: "Ana Pérez", cohortId: "co_r", cohorte: "Revit — Octubre" },
    // Ana: una que todavía no vence.
    { ...base, installmentId: "in_3", enrollmentId: "en_a", amount: 10000, dueDate: dia("2026-11-10"), alumno: "Ana Pérez", cohortId: "co_r", cohorte: "Revit — Octubre" },
    // Beto, Revit: vencida pero saldada.
    { ...base, installmentId: "in_4", enrollmentId: "en_b", amount: 8000, dueDate: dia("2026-10-01"), alumno: "Beto Gómez", cohortId: "co_r", cohorte: "Revit — Octubre" },
    // Caro, AutoCAD, en dólares y de baja.
    { ...base, installmentId: "in_5", enrollmentId: "en_c", amount: 300, currency: "USD", dueDate: dia("2026-10-05"), alumno: "Caro Ruiz", alumnoDeBaja: true, cohortId: "co_a", cohorte: "AutoCAD" },
    // Dani: anulada (refinanciación), no cuenta.
    { ...base, installmentId: "in_6", enrollmentId: "en_d", amount: 9000, dueDate: dia("2026-08-01"), alumno: "Dani Sosa", cohortId: "co_a", cohorte: "AutoCAD", canceledAt: dia("2026-08-15") },
  ];
  const pagos = [
    { installmentId: "in_1", amount: 4000, voidedAt: null },
    { installmentId: "in_4", amount: 8000, voidedAt: null },
    // Un pago anulado no descuenta.
    { installmentId: "in_2", amount: 10000, voidedAt: dia("2026-10-12") },
    // Un pago a cuenta (sin cuota) no se imputa a ninguna.
    { installmentId: null, amount: 99999, voidedAt: null },
  ];

  it("agrupa por cohorte y alumno, sin anuladas, sin saldadas, sin las que no vencieron", () => {
    const r = resumirMorosidad(cuotas, pagos, now);
    expect(r.cohortes.map((c) => c.cohorte)).toEqual(["AutoCAD", "Revit — Octubre"]);
    const revit = r.cohortes.find((c) => c.cohortId === "co_r")!;
    expect(revit.filas).toHaveLength(1);
    expect(revit.filas[0]).toMatchObject({
      enrollmentId: "en_a",
      alumno: "Ana Pérez",
      currency: "UYU",
      cuotasVencidas: 2,
      adeudado: 16000,
    });
  });

  it("días de atraso desde la cuota vencida más vieja (misma cuenta que el panel)", () => {
    const r = resumirMorosidad(cuotas, pagos, now);
    const ana = r.cohortes.find((c) => c.cohortId === "co_r")!.filas[0]!;
    expect(ana.venceDesde).toEqual(dia("2026-09-10"));
    expect(ana.diasDeAtraso).toBe(Math.floor((now.getTime() - dia("2026-09-10").getTime()) / 86_400_000));
  });

  it("totales por moneda, en el orden fijo, nunca sumados entre sí", () => {
    const r = resumirMorosidad(cuotas, pagos, now);
    expect(r.totales).toEqual([
      { currency: "UYU", adeudado: 16000, inscripciones: 1 },
      { currency: "USD", adeudado: 300, inscripciones: 1 },
    ]);
  });

  it("el alumno de baja sigue, marcado", () => {
    const r = resumirMorosidad(cuotas, pagos, now);
    expect(r.cohortes.find((c) => c.cohortId === "co_a")!.filas[0]).toMatchObject({ alumno: "Caro Ruiz", alumnoDeBaja: true });
  });

  it("una inscripción con cuotas en dos monedas da dos filas, no una suma", () => {
    const mixtas: CuotaParaMorosidad[] = [
      { ...base, installmentId: "x1", enrollmentId: "en_x", amount: 100, dueDate: dia("2026-10-01"), alumno: "Equis", cohortId: "co_r", cohorte: "Revit" },
      { ...base, installmentId: "x2", enrollmentId: "en_x", amount: 50, currency: "USD", dueDate: dia("2026-10-01"), alumno: "Equis", cohortId: "co_r", cohorte: "Revit" },
    ];
    const r = resumirMorosidad(mixtas, [], now);
    expect(r.cohortes[0]!.filas.map((f) => [f.currency, f.adeudado])).toEqual([
      ["UYU", 100],
      ["USD", 50],
    ]);
  });

  it("nadie debe → vacío (no se manda nada)", () => {
    const r = resumirMorosidad([], [], now);
    expect(r.cohortes).toEqual([]);
    expect(r.totales).toEqual([]);
  });
});

describe("armarAvisoInscripcion", () => {
  const datos: DatosAvisoInscripcion = {
    alumno: { nombre: "Ana <Pérez>", email: "ana@x.test", telefono: "+59899111222", documento: "1.234.567-8" },
    curso: "Revit Arquitectura",
    cohorte: "Octubre",
    startDate: dia("2026-10-27"),
    startTime: "18:30",
    timeZone: MVD,
    vendedor: "Valeria Díaz",
    amount: 24000,
    currency: "UYU",
    installments: 4,
    invoiceNumber: null,
    empresa: {
      razonSocial: "Constructora Sur SA",
      nombreComercial: "ConSur",
      rut: "210000000012",
      direccion: "Av. Italia 1234, Montevideo, Uruguay",
      contactoFacturacion: "Marta López",
      correoFacturacion: "facturas@consur.test",
      telefonoFacturacion: "29001234",
      condicionDePago: "credito",
      diasDeCredito: 30,
    },
  };

  it("asunto con alumno, curso y cohorte", () => {
    expect(armarAvisoInscripcion(datos).subject).toBe(
      "[Administración] Nueva inscripción: Ana <Pérez> · Revit Arquitectura — Octubre"
    );
  });

  it("lleva inicio, vendedor, monto con moneda, cuotas y si ya tiene factura — escapado", () => {
    const { html } = armarAvisoInscripcion(datos);
    expect(html).toContain("Ana &lt;Pérez&gt;");
    expect(html).toContain("martes 27 de octubre de 2026, 18:30 (hora de America/Montevideo)");
    expect(html).toContain("Valeria Díaz");
    expect(html).toContain("UYU 24.000");
    expect(html).toContain("4 cuotas");
    expect(html).toContain("Sin factura todavía");
  });

  it("los datos de facturación de la empresa", () => {
    const { html } = armarAvisoInscripcion(datos);
    expect(html).toContain("Constructora Sur SA");
    expect(html).toContain("ConSur");
    expect(html).toContain("RUT 210000000012");
    expect(html).toContain("Av. Italia 1234, Montevideo, Uruguay");
    expect(html).toContain("Marta López");
    expect(html).toContain("facturas@consur.test");
    expect(html).toContain("Crédito a 30 días");
  });

  it("con factura, sin empresa, sin vendedor ni monto: lo dice en vez de dejar huecos", () => {
    const { html } = armarAvisoInscripcion({
      ...datos,
      invoiceNumber: "A-0042",
      empresa: null,
      vendedor: null,
      amount: null,
      installments: null,
    });
    expect(html).toContain("Ya tiene factura: A-0042");
    expect(html).toContain("Particular (sin empresa)");
    expect(html).toContain("sin vendedor");
    expect(html).toContain("sin monto");
    expect(html).toContain("sin cuotas cargadas");
  });

  it("condición contado y empresa sin datos de facturación", () => {
    const { html } = armarAvisoInscripcion({
      ...datos,
      empresa: {
        razonSocial: "Estudio Norte",
        nombreComercial: null,
        rut: null,
        direccion: null,
        contactoFacturacion: null,
        correoFacturacion: null,
        telefonoFacturacion: null,
        condicionDePago: "contado",
        diasDeCredito: null,
      },
    });
    expect(html).toContain("Estudio Norte");
    expect(html).toContain("Contado");
    expect(html).toContain("sin RUT cargado");
  });
});

describe("armarAvisoPago", () => {
  const datos: DatosAvisoPago = {
    alumno: "Ana Pérez",
    curso: "Revit Arquitectura",
    cohorte: "Octubre",
    esTaller: false,
    amount: 6000,
    currency: "UYU",
    method: "transferencia",
    paidAt: dia("2026-10-19"),
    receiptNumber: "R-<77>",
    cuota: 2,
    saldos: [
      { currency: "UYU", saldo: 12000 },
      { currency: "USD", saldo: 0 },
    ],
  };

  it("asunto con alumno y monto", () => {
    expect(armarAvisoPago(datos).subject).toBe("[Administración] Pago registrado: Ana Pérez · UYU 6.000");
  });

  it("método, fecha, recibo, cuota y saldo por moneda — escapado", () => {
    const { html } = armarAvisoPago(datos);
    expect(html).toContain("Transferencia");
    expect(html).toContain("19/10/2026");
    expect(html).toContain("R-&lt;77&gt;");
    expect(html).toContain("Cuota 2");
    expect(html).toContain("UYU 12.000");
    expect(html).toContain("USD 0");
  });

  it("sin plan de cuotas, sin recibo, a cuenta y de un taller: lo dice", () => {
    const { html } = armarAvisoPago({ ...datos, saldos: [], receiptNumber: null, cuota: null, esTaller: true });
    expect(html).toContain("Sin plan de cuotas: no hay saldo calculado");
    expect(html).toContain("sin recibo");
    expect(html).toContain("A cuenta (sin cuota)");
    expect(html).toContain("Taller");
  });
});

describe("armarResumenMorosidad", () => {
  it("asunto con la semana y la cantidad; totales por moneda y una tabla por cohorte", () => {
    const now = mvd("2026-10-19", "08:30");
    const resumen = resumirMorosidad(
      [
        { installmentId: "i1", enrollmentId: "en_a", amount: 10000, currency: "UYU", dueDate: dia("2026-10-01"), canceledAt: null, alumno: "Ana <P>", alumnoDeBaja: false, cohortId: "co_r", cohorte: "Revit" },
        { installmentId: "i2", enrollmentId: "en_c", amount: 300, currency: "USD", dueDate: dia("2026-10-05"), canceledAt: null, alumno: "Caro", alumnoDeBaja: true, cohortId: "co_a", cohorte: "AutoCAD" },
      ],
      [],
      now
    );
    const { subject, html } = armarResumenMorosidad({ periodKey: "2026-W43", resumen });
    expect(subject).toBe("[Administración] Morosidad semanal 2026-W43: 2 inscripciones con cuotas vencidas");
    expect(html).toContain("UYU 10.000");
    expect(html).toContain("USD 300");
    expect(html).toContain("Revit");
    expect(html).toContain("AutoCAD");
    expect(html).toContain("Ana &lt;P&gt;");
    expect(html).toContain("(de baja)");
    expect(html).toContain("01/10/2026");
    expect(html).toContain("18 días");
  });
});
