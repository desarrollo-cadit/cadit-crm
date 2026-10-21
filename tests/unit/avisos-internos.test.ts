import { describe, expect, it } from "vitest";
import {
  armarAvisoFacturacion,
  armarAvisoSoporte,
  avisoDeFacturacionQueToca,
  avisosQueTocan,
  destinatariosDeArea,
  diasHastaElInicio,
  fechaDeInicio,
  MAX_INTENTOS_AVISO,
  puedeReclamar,
  RECLAMO_VENCIDO_MS,
  sinFacturar,
  type InscripcionParaFacturar,
} from "@/lib/staff-notices";

/**
 * 039 — Confirmación de cohortes y avisos internos por correo.
 *
 * Lo que decide CUÁNDO sale un aviso, A QUIÉN y QUÉ dice es puro: se prueba
 * acá sin base ni correo.
 */

const MVD = "America/Montevideo";
/** El inicio de una cohorte se guarda a medianoche UTC del día. */
const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
/** Un instante de pared en Montevideo (UTC-3, sin horario de verano). */
const mvd = (iso: string, hora = "10:00") => new Date(`${iso}T${hora}:00.000-03:00`);

describe("diasHastaElInicio — días de calendario en la zona de la academia", () => {
  it("cuenta días de calendario, no 24 horas", () => {
    expect(diasHastaElInicio(dia("2026-10-27"), mvd("2026-10-20", "23:30"), MVD)).toBe(7);
    expect(diasHastaElInicio(dia("2026-10-27"), mvd("2026-10-21", "00:10"), MVD)).toBe(6);
  });

  it("usa el día de la ACADEMIA: a las 22:00 de Montevideo ya es mañana en UTC", () => {
    // 2026-10-25 22:00 en Montevideo = 2026-10-26 01:00 UTC.
    expect(diasHastaElInicio(dia("2026-10-27"), mvd("2026-10-25", "22:00"), MVD)).toBe(2);
  });

  it("el día de inicio es 0 y después es negativo", () => {
    expect(diasHastaElInicio(dia("2026-10-27"), mvd("2026-10-27"), MVD)).toBe(0);
    expect(diasHastaElInicio(dia("2026-10-27"), mvd("2026-10-28"), MVD)).toBe(-1);
  });

  it("zona inválida → null (no inventa una fecha)", () => {
    expect(diasHastaElInicio(dia("2026-10-27"), mvd("2026-10-20"), "Marte/Olympus")).toBeNull();
  });
});

describe("avisoDeFacturacionQueToca — las ventanas T-7 y T-2", () => {
  const inicio = dia("2026-10-27");
  const confirmadaTemprano = mvd("2026-10-01");

  it("sin confirmar no toca nada", () => {
    expect(
      avisoDeFacturacionQueToca({ startDate: inicio, confirmedAt: null }, mvd("2026-10-20"), MVD)
    ).toBeNull();
  });

  it("T-7: desde 7 días antes hasta 3 días antes", () => {
    for (const hoy of ["2026-10-20", "2026-10-22", "2026-10-24"]) {
      expect(
        avisoDeFacturacionQueToca({ startDate: inicio, confirmedAt: confirmadaTemprano }, mvd(hoy), MVD)
      ).toBe("facturacion_t7");
    }
  });

  it("antes de la ventana T-7 no toca nada", () => {
    expect(
      avisoDeFacturacionQueToca({ startDate: inicio, confirmedAt: confirmadaTemprano }, mvd("2026-10-19"), MVD)
    ).toBeNull();
  });

  it("T-2: 2 y 1 día antes; al llegar la de T-2, la de T-7 ya no toca", () => {
    for (const hoy of ["2026-10-25", "2026-10-26"]) {
      expect(
        avisoDeFacturacionQueToca({ startDate: inicio, confirmedAt: confirmadaTemprano }, mvd(hoy), MVD)
      ).toBe("facturacion_t2");
    }
  });

  it("el día de inicio y después ya no toca ninguno", () => {
    for (const hoy of ["2026-10-27", "2026-10-30"]) {
      expect(
        avisoDeFacturacionQueToca({ startDate: inicio, confirmedAt: confirmadaTemprano }, mvd(hoy), MVD)
      ).toBeNull();
    }
  });

  it("confirmada 3 días antes: la de T-7 NO sale retroactiva; la de T-2 sí, en su día", () => {
    const tarde = mvd("2026-10-24");
    expect(
      avisoDeFacturacionQueToca({ startDate: inicio, confirmedAt: tarde }, mvd("2026-10-24", "11:00"), MVD)
    ).toBeNull();
    expect(
      avisoDeFacturacionQueToca({ startDate: inicio, confirmedAt: tarde }, mvd("2026-10-25"), MVD)
    ).toBe("facturacion_t2");
  });

  it("confirmada justo el día T-7 cuenta para la de T-7", () => {
    expect(
      avisoDeFacturacionQueToca(
        { startDate: inicio, confirmedAt: mvd("2026-10-20", "09:00") },
        mvd("2026-10-20", "09:05"),
        MVD
      )
    ).toBe("facturacion_t7");
  });

  it("confirmada 1 día antes: la de T-2 sale igual (ya estamos dentro de su ventana)", () => {
    const víspera = mvd("2026-10-26");
    expect(
      avisoDeFacturacionQueToca({ startDate: inicio, confirmedAt: víspera }, mvd("2026-10-26", "10:05"), MVD)
    ).toBe("facturacion_t2");
  });

  it("un servidor apagado el día T-7 se pone al día mientras siga dentro de la ventana", () => {
    expect(
      avisoDeFacturacionQueToca({ startDate: inicio, confirmedAt: confirmadaTemprano }, mvd("2026-10-23"), MVD)
    ).toBe("facturacion_t7");
  });
});

describe("puedeReclamar — un aviso por cohorte y tipo, nunca dos", () => {
  const ahora = new Date("2026-10-20T12:00:00Z");
  const hace = (ms: number) => new Date(ahora.getTime() - ms);

  it("sin registro previo se reclama", () => {
    expect(puedeReclamar(null, ahora, { reintentarOmitido: false })).toBe(true);
  });

  it("enviado NUNCA se vuelve a mandar, ni reconfirmando", () => {
    const previo = { status: "sent" as const, attempts: 1, claimedAt: hace(1000) };
    expect(puedeReclamar(previo, ahora, { reintentarOmitido: false })).toBe(false);
    expect(puedeReclamar(previo, ahora, { reintentarOmitido: true })).toBe(false);
  });

  it("cancelado (se quitó la confirmación) vuelve a estar disponible", () => {
    expect(
      puedeReclamar({ status: "cancelled", attempts: 3, claimedAt: hace(1000) }, ahora, {
        reintentarOmitido: false,
      })
    ).toBe(true);
  });

  it("fallido se reintenta hasta el máximo de intentos", () => {
    const base = { status: "failed" as const, claimedAt: hace(1000) };
    expect(puedeReclamar({ ...base, attempts: MAX_INTENTOS_AVISO - 1 }, ahora, { reintentarOmitido: false })).toBe(true);
    expect(puedeReclamar({ ...base, attempts: MAX_INTENTOS_AVISO }, ahora, { reintentarOmitido: false })).toBe(false);
  });

  it("omitido es definitivo para la periódica; un acto humano (confirmar) lo reintenta", () => {
    const previo = { status: "skipped" as const, attempts: 1, claimedAt: hace(1000) };
    expect(puedeReclamar(previo, ahora, { reintentarOmitido: false })).toBe(false);
    expect(puedeReclamar(previo, ahora, { reintentarOmitido: true })).toBe(true);
  });

  it("en curso no se pisa; uno colgado (proceso caído) se reclama pasado el plazo", () => {
    expect(
      puedeReclamar({ status: "pending", attempts: 1, claimedAt: hace(60_000) }, ahora, {
        reintentarOmitido: false,
      })
    ).toBe(false);
    expect(
      puedeReclamar({ status: "pending", attempts: 1, claimedAt: hace(RECLAMO_VENCIDO_MS + 1) }, ahora, {
        reintentarOmitido: false,
      })
    ).toBe(true);
    expect(
      puedeReclamar(
        { status: "pending", attempts: MAX_INTENTOS_AVISO, claimedAt: hace(RECLAMO_VENCIDO_MS + 1) },
        ahora,
        { reintentarOmitido: false }
      )
    ).toBe(false);
  });
});

describe("destinatariosDeArea", () => {
  it("área apagada o sin casilla → null (se omite, no se lanza)", () => {
    expect(destinatariosDeArea(null)).toBeNull();
    expect(destinatariosDeArea({ enabled: false, mailbox: "a@x.test", ccEmails: [] })).toBeNull();
    expect(destinatariosDeArea({ enabled: true, mailbox: null, ccEmails: ["b@x.test"] })).toBeNull();
  });

  it("To = casilla; CC sin duplicados ni la casilla", () => {
    expect(
      destinatariosDeArea({
        enabled: true,
        mailbox: "soporte@x.test",
        ccEmails: ["Soporte@x.test", "jefa@x.test", "JEFA@x.test"],
      })
    ).toEqual({ to: ["soporte@x.test"], cc: ["jefa@x.test"] });
  });
});

describe("sinFacturar — a quién le falta la factura", () => {
  const base: InscripcionParaFacturar = {
    enrollmentId: "en_1",
    nombre: "Ana Pérez",
    email: "ana@x.test",
    nationalId: null,
    invoiceNumber: null,
    amount: 1200000,
    currency: "UYU",
    empresa: null,
    deBaja: false,
    esHija: false,
  };

  it("deja solo madres activas sin número de factura", () => {
    const filas = [
      base,
      { ...base, enrollmentId: "en_2", invoiceNumber: "A-0001" },
      { ...base, enrollmentId: "en_3", invoiceNumber: "   " },
      { ...base, enrollmentId: "en_4", deBaja: true },
      { ...base, enrollmentId: "en_5", esHija: true },
    ];
    expect(sinFacturar(filas).map((f) => f.enrollmentId)).toEqual(["en_1", "en_3"]);
  });

  it("todas facturadas → lista vacía (no se manda nada)", () => {
    expect(sinFacturar([{ ...base, invoiceNumber: "A-1" }])).toEqual([]);
  });
});

describe("fechaDeInicio — compuesta con schedule-time, nunca a mano", () => {
  it("día en palabras y hora de pared de la academia", () => {
    expect(fechaDeInicio(dia("2026-10-27"), "18:30", MVD)).toBe(
      "martes 27 de octubre de 2026, 18:30 (hora de Uruguay)"
    );
  });

  it("sin horario cargado lo dice", () => {
    expect(fechaDeInicio(dia("2026-10-27"), null, MVD)).toBe(
      "martes 27 de octubre de 2026 (sin horario cargado)"
    );
  });
});

describe("armarAvisoSoporte", () => {
  const datos = {
    curso: "Revit Arquitectura",
    cohorte: "Octubre <2026>",
    startDate: dia("2026-10-27"),
    startTime: "18:30",
    timeZone: MVD,
    profesor: "Ovidio Santos",
    softwareDeLaCohorte: ["Revit"],
    programasDelGrupo: ["Revit"],
    alumnos: [
      {
        nombre: "Ana <b>Pérez</b>",
        email: "ana@x.test",
        telefono: "+59899111222",
        licenciaPropia: false,
        licencias: [{ programa: "Revit", origen: "grupo" as const, asignada: true }],
      },
      {
        nombre: "Beto Gómez",
        email: null,
        telefono: null,
        licenciaPropia: true,
        licencias: [],
      },
    ],
  };

  it("asunto con curso, cohorte y fecha", () => {
    const { subject } = armarAvisoSoporte(datos);
    expect(subject).toBe("[Soporte] Grupo confirmado: Revit Arquitectura — Octubre <2026> · inicia 27/10/2026");
  });

  it("lleva profesor, inicio, alumnos y sus licencias, todo escapado", () => {
    const { html } = armarAvisoSoporte(datos);
    expect(html).toContain("Ovidio Santos");
    expect(html).toContain("martes 27 de octubre de 2026, 18:30");
    expect(html).toContain("Ana &lt;b&gt;Pérez&lt;/b&gt;");
    expect(html).not.toContain("<b>Pérez</b>");
    expect(html).toContain("Octubre &lt;2026&gt;");
    expect(html).toContain("Revit (grupo)");
    expect(html).toContain("tiene licencia propia");
    expect(html).toContain("2 alumnos");
  });

  it("sin profesor ni alumnos lo dice en vez de dejar huecos", () => {
    const { html } = armarAvisoSoporte({ ...datos, profesor: null, alumnos: [] });
    expect(html).toContain("sin profesor asignado");
    expect(html).toContain("Todavía no hay alumnos inscriptos");
  });
});

describe("armarAvisoFacturacion", () => {
  const pendientes: InscripcionParaFacturar[] = [
    {
      enrollmentId: "en_1",
      nombre: "Ana Pérez",
      email: "ana@x.test",
      nationalId: "1.234.567-8",
      invoiceNumber: null,
      amount: 1200000,
      currency: "UYU",
      empresa: { razonSocial: "Constructora <Sur> SA", rut: "210000000012" },
      deBaja: false,
      esHija: false,
    },
    {
      enrollmentId: "en_2",
      nombre: "Beto Gómez",
      email: null,
      nationalId: null,
      invoiceNumber: null,
      amount: null,
      currency: "USD",
      empresa: null,
      deBaja: false,
      esHija: false,
    },
  ];
  const base = {
    curso: "Revit Arquitectura",
    cohorte: null,
    startDate: dia("2026-10-27"),
    startTime: null,
    timeZone: MVD,
    pendientes,
  };

  it("asunto distingue T-7 y T-2", () => {
    expect(armarAvisoFacturacion("facturacion_t7", base).subject).toBe(
      "[Administración] Facturación pendiente (7 días): Revit Arquitectura · inicia 27/10/2026"
    );
    expect(armarAvisoFacturacion("facturacion_t2", base).subject).toBe(
      "[Administración] Facturación pendiente (2 días): Revit Arquitectura · inicia 27/10/2026"
    );
  });

  it("monto con moneda, empresa con razón social y RUT, escapado", () => {
    const { html } = armarAvisoFacturacion("facturacion_t7", base);
    expect(html).toContain("UYU 12.000");
    expect(html).toContain("sin monto");
    expect(html).toContain("Constructora &lt;Sur&gt; SA");
    expect(html).toContain("210000000012");
    expect(html).toContain("2 inscripciones sin factura");
  });
});

describe("avisosQueTocan — lo que la periódica intenta en una pasada", () => {
  const inicio = dia("2026-10-27");
  const cohorte = { startDate: inicio, confirmedAt: mvd("2026-10-01") };
  const ahora = mvd("2026-10-25");

  it("sin confirmar, nada", () => {
    expect(avisosQueTocan({ startDate: inicio, confirmedAt: null }, {}, ahora, MVD)).toEqual([]);
  });

  it("el aviso a Soporte que nunca salió (proceso caído tras confirmar) se recupera", () => {
    expect(avisosQueTocan(cohorte, {}, ahora, MVD)).toEqual(["cohorte_confirmada", "facturacion_t2"]);
  });

  it("lo ya enviado u omitido no se repite", () => {
    expect(
      avisosQueTocan(
        cohorte,
        {
          cohorte_confirmada: { status: "sent", attempts: 1, claimedAt: mvd("2026-10-01") },
          facturacion_t2: { status: "skipped", attempts: 1, claimedAt: mvd("2026-10-25", "09:00") },
        },
        ahora,
        MVD
      )
    ).toEqual([]);
  });

  it("un fallido se reintenta dentro de su ventana", () => {
    expect(
      avisosQueTocan(
        cohorte,
        {
          cohorte_confirmada: { status: "sent", attempts: 1, claimedAt: mvd("2026-10-01") },
          facturacion_t2: { status: "failed", attempts: 1, claimedAt: mvd("2026-10-25", "09:00") },
        },
        ahora,
        MVD
      )
    ).toEqual(["facturacion_t2"]);
  });

  it("una cohorte que ya empezó no recibe ninguno (tampoco el de Soporte)", () => {
    expect(avisosQueTocan(cohorte, {}, mvd("2026-10-27"), MVD)).toEqual([]);
  });
});
