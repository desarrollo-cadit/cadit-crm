import { CURRENCIES, type Currency } from "@/lib/db/schema";
import type { CourseKind } from "@/lib/course-kind";
import { wallClockInZone } from "@/lib/schedule-time";
import {
  destinatariosDeArea,
  diaCorto,
  documento,
  e,
  fechaDeInicio,
  monto,
  nombreDeCohorte,
  puedeReclamar,
  tabla,
  type AvisoRegistrado,
  type Destinatarios,
} from "@/lib/staff-notices";

/**
 * 041 — Avisos internos de cobranza: las reglas.
 *
 * Tres avisos a **Administración**, sobre el mismo registro e idempotencia
 * que los de 039 (`staff_notice`):
 *
 *  - `inscripcion_nueva` → al crearse una VENTA, para facturarla. Con copia al
 *    vendedor de esa venta.
 *  - `pago_registrado` → al registrarse un pago.
 *  - `morosidad_semanal` → los lunes (hora de la academia), las cuotas
 *    vencidas e impagas.
 *
 * Puro a propósito (sin base, sin correo): se prueba en
 * `tests/unit/avisos-cobranza.test.ts`. La lectura de la base vive en
 * `src/server/billing-notices.ts`.
 */

export const BILLING_EVENT_KINDS = ["inscripcion_nueva", "pago_registrado"] as const;
export type BillingEventKind = (typeof BILLING_EVENT_KINDS)[number];

/**
 * Un aviso de inscripción o de pago que no salió en una semana ya no es un
 * aviso: la periódica deja de reintentarlo (queda registrado como estaba).
 */
export const HORIZONTE_REINTENTO_MS = 7 * 24 * 60 * 60_000;

/** El resumen semanal sale los lunes desde esta hora de pared de la academia. */
export const HORA_DEL_RESUMEN = "08:00";

const DIA_MS = 86_400_000;

/* ============================================================
 * Qué es una venta
 * ============================================================ */

/**
 * ¿Esta inscripción es una VENTA que Administración tiene que facturar?
 *
 * La misma regla que el vendedor obligatorio (`exigeVendedor`) y que
 * `ventas-por-vendedor.ts`: una inscripción MADRE con cohorte. El lead sin
 * cohorte es interés; la hija de un módulo es parte del paquete que ya se
 * vendió en la madre; anotarse a un taller no es una cursada (033) y tiene sus
 * propios avisos.
 */
export function esVentaParaAviso(e: {
  cohortId: string | null;
  parentEnrollmentId: string | null;
  courseKind?: CourseKind | null;
}): boolean {
  if (e.courseKind === "taller") return false;
  return e.cohortId !== null && e.parentEnrollmentId === null;
}

/**
 * El lead que recibe cohorte (tablero de Pipeline): de "sin cohorte" a una
 * cohorte. Mudar de una cohorte a otra NO es una venta nueva.
 */
export function pasaAVenta(antes: string | null, despues: string | null | undefined): boolean {
  return antes === null && typeof despues === "string" && despues.length > 0;
}

/* ============================================================
 * Destinatarios
 * ============================================================ */

export type VendedorParaAviso = {
  email: string | null;
  /** El correo de su cuenta del panel (`seller.user_id`, 040), si tiene. */
  userEmail: string | null;
  archived: boolean;
};

/** El correo del vendedor: el suyo, o el de su cuenta. Archivado → nadie. */
export function correoDelVendedor(v: VendedorParaAviso | null): string | null {
  if (!v || v.archived) return null;
  return v.email?.trim() || v.userEmail?.trim() || null;
}

/**
 * Administración (casilla + copias) y, en copia, el vendedor de la venta.
 * Sin Administración (apagada o sin casilla) el aviso se OMITE entero: no se
 * le manda solo al vendedor un correo que es para facturar.
 */
export function destinatariosDeVenta(
  area: { enabled: boolean; mailbox: string | null; ccEmails: string[] } | null,
  vendedor: VendedorParaAviso | null
): Destinatarios | null {
  const base = destinatariosDeArea(area);
  if (!base) return null;
  const correo = correoDelVendedor(vendedor);
  if (!correo) return base;
  const vistos = new Set([...base.to, ...base.cc].map((x) => x.toLowerCase()));
  if (vistos.has(correo.toLowerCase())) return base;
  return { to: base.to, cc: [...base.cc, correo] };
}

/* ============================================================
 * La semana del resumen
 * ============================================================ */

/** "2026-W43": la semana ISO 8601 (lunes a domingo) de un día `YYYY-MM-DD`. */
export function semanaIso(fecha: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
  const desdeLunes = (t.getUTCDay() + 6) % 7;
  // El jueves de esa semana decide de qué año es.
  const jueves = new Date(t.getTime() + (3 - desdeLunes) * DIA_MS);
  const año = jueves.getUTCFullYear();
  const enero4 = new Date(Date.UTC(año, 0, 4));
  const primerJueves = new Date(enero4.getTime() + (3 - ((enero4.getUTCDay() + 6) % 7)) * DIA_MS);
  const semana = 1 + Math.round((jueves.getTime() - primerJueves.getTime()) / (7 * DIA_MS));
  return `${año}-W${String(semana).padStart(2, "0")}`;
}

/**
 * ¿Toca el resumen semanal AHORA? Devuelve la llave de la semana, o `null`.
 *
 * - La semana se corta en la zona de la academia (`wallClockInZone`).
 * - El lunes, desde las 08:00: el correo llega al empezar el día hábil, y lo
 *   vencido el fin de semana ya cuenta.
 * - Un servidor apagado el lunes se pone al día cualquier día de ESA semana
 *   (hasta el domingo). La semana siguiente tiene su propia llave: lo que no
 *   salió no se manda tarde.
 */
export function resumenSemanalQueToca(now: Date, timeZone: string): string | null {
  const pared = wallClockInZone(now, timeZone);
  if (!pared) return null;
  const semana = semanaIso(pared.fecha);
  if (!semana) return null;
  const lunes = new Date(`${pared.fecha}T00:00:00.000Z`).getUTCDay() === 1;
  if (lunes && pared.hora < HORA_DEL_RESUMEN) return null;
  return semana;
}

/* ============================================================
 * Reintentos de la periódica
 * ============================================================ */

/**
 * ¿La periódica tiene que (re)intentar este aviso de inscripción o de pago?
 * Las reglas de 039 (`puedeReclamar`, sin insistir con los omitidos) dentro
 * del horizonte de una semana.
 */
export function reintentoDeEventoQueToca(r: AvisoRegistrado & { createdAt: Date }, now: Date): boolean {
  if (now.getTime() - r.createdAt.getTime() > HORIZONTE_REINTENTO_MS) return false;
  return puedeReclamar(r, now, { reintentarOmitido: false });
}

/* ============================================================
 * Saldos y morosidad — nunca se suman monedas
 * ============================================================ */

export type SaldoMoneda = { currency: Currency; saldo: number };

/**
 * Lo que le queda por pagar a una inscripción, por moneda: las cuotas
 * VIGENTES menos lo pagado a cada una (`listInstallments`, la misma cuenta
 * que `outstandingBalance`). Un pago a cuenta (sin cuota) no descuenta de
 * ninguna, igual que en el estado de cuenta. Sin plan → `[]`.
 */
export function saldoPorMoneda(
  cuotas: readonly { amount: number; paid: number; currency: Currency; canceledAt: string | Date | null }[]
): SaldoMoneda[] {
  const out: SaldoMoneda[] = [];
  for (const currency of CURRENCIES) {
    const vigentes = cuotas.filter((c) => c.currency === currency && !c.canceledAt);
    if (vigentes.length === 0) continue;
    out.push({ currency, saldo: vigentes.reduce((s, c) => s + Math.max(0, c.amount - c.paid), 0) });
  }
  return out;
}

export type CuotaParaMorosidad = {
  installmentId: string;
  enrollmentId: string;
  amount: number;
  currency: Currency;
  dueDate: Date;
  canceledAt: Date | null;
  alumno: string;
  alumnoDeBaja: boolean;
  cohortId: string;
  cohorte: string;
};

export type PagoParaMorosidad = { installmentId: string | null; amount: number; voidedAt: Date | null };

export type FilaMorosidad = {
  enrollmentId: string;
  alumno: string;
  alumnoDeBaja: boolean;
  currency: Currency;
  cuotasVencidas: number;
  adeudado: number;
  venceDesde: Date;
  diasDeAtraso: number;
};

export type ResumenMorosidad = {
  cohortes: { cohortId: string; cohorte: string; filas: FilaMorosidad[] }[];
  totales: { currency: Currency; adeudado: number; inscripciones: number }[];
};

/**
 * 041 — El resumen semanal. La definición de morosidad es la del panel de
 * cobranza (`listOverdue`, 008): cuota VIGENTE (no anulada), vencida
 * (`due_date` < ahora) y con saldo después de los pagos NO anulados; los días
 * de atraso se cuentan desde la cuota vencida más vieja, con la misma cuenta.
 * Como el panel, incluye talleres y alumnos de baja (marcados).
 *
 * Diferencia a propósito: una fila por inscripción **y moneda**. Si una
 * inscripción debe en dos monedas, son dos filas: nunca se suman.
 */
export function resumirMorosidad(
  cuotas: readonly CuotaParaMorosidad[],
  pagos: readonly PagoParaMorosidad[],
  now: Date
): ResumenMorosidad {
  const pagado = new Map<string, number>();
  for (const p of pagos) {
    if (p.voidedAt || !p.installmentId) continue;
    pagado.set(p.installmentId, (pagado.get(p.installmentId) ?? 0) + p.amount);
  }

  const porCohorte = new Map<string, { cohortId: string; cohorte: string; filas: Map<string, FilaMorosidad> }>();
  for (const c of cuotas) {
    if (c.canceledAt || c.dueDate.getTime() >= now.getTime()) continue;
    const saldo = c.amount - (pagado.get(c.installmentId) ?? 0);
    if (saldo <= 0) continue;

    const grupo = porCohorte.get(c.cohortId) ?? { cohortId: c.cohortId, cohorte: c.cohorte, filas: new Map() };
    porCohorte.set(c.cohortId, grupo);
    const clave = `${c.enrollmentId}:${c.currency}`;
    const previa = grupo.filas.get(clave);
    const venceDesde = previa && previa.venceDesde < c.dueDate ? previa.venceDesde : c.dueDate;
    grupo.filas.set(clave, {
      enrollmentId: c.enrollmentId,
      alumno: c.alumno,
      alumnoDeBaja: c.alumnoDeBaja,
      currency: c.currency,
      cuotasVencidas: (previa?.cuotasVencidas ?? 0) + 1,
      adeudado: (previa?.adeudado ?? 0) + saldo,
      venceDesde,
      diasDeAtraso: Math.floor((now.getTime() - venceDesde.getTime()) / DIA_MS),
    });
  }

  const cohortes = [...porCohorte.values()]
    .map((g) => ({
      cohortId: g.cohortId,
      cohorte: g.cohorte,
      filas: [...g.filas.values()].sort(
        (a, b) =>
          b.diasDeAtraso - a.diasDeAtraso ||
          a.alumno.localeCompare(b.alumno, "es") ||
          CURRENCIES.indexOf(a.currency) - CURRENCIES.indexOf(b.currency)
      ),
    }))
    .sort((a, b) => a.cohorte.localeCompare(b.cohorte, "es") || a.cohortId.localeCompare(b.cohortId));

  const filas = cohortes.flatMap((c) => c.filas);
  const totales = CURRENCIES.flatMap((currency) => {
    const deEsaMoneda = filas.filter((f) => f.currency === currency);
    if (deEsaMoneda.length === 0) return [];
    return [
      {
        currency,
        adeudado: deEsaMoneda.reduce((s, f) => s + f.adeudado, 0),
        inscripciones: new Set(deEsaMoneda.map((f) => f.enrollmentId)).size,
      },
    ];
  });

  return { cohortes, totales };
}

/* ============================================================
 * Contenido de los correos
 * ============================================================ */

export type EmpresaParaFacturar = {
  razonSocial: string;
  nombreComercial: string | null;
  rut: string | null;
  /** Dirección fiscal ya armada ("calle, ciudad, departamento, país"). */
  direccion: string | null;
  contactoFacturacion: string | null;
  correoFacturacion: string | null;
  telefonoFacturacion: string | null;
  condicionDePago: "contado" | "credito" | null;
  diasDeCredito: number | null;
};

export type DatosAvisoInscripcion = {
  alumno: { nombre: string; email: string | null; telefono: string | null; documento: string | null };
  curso: string;
  cohorte: string | null;
  startDate: Date;
  startTime: string | null;
  timeZone: string;
  vendedor: string | null;
  amount: number | null;
  currency: Currency;
  installments: number | null;
  invoiceNumber: string | null;
  empresa: EmpresaParaFacturar | null;
};

const fila = (k: string, v: string) => [e(k), v];
const oGuion = (v: string | null | undefined) => (v && v.trim() ? e(v) : "—");

function condicionDePago(emp: EmpresaParaFacturar): string {
  if (emp.condicionDePago === "contado") return "Contado";
  if (emp.condicionDePago === "credito") {
    return emp.diasDeCredito ? `Crédito a ${emp.diasDeCredito} días` : "Crédito";
  }
  return "sin condición cargada";
}

/** El aviso de una venta nueva: lo que Administración necesita para facturarla. */
export function armarAvisoInscripcion(d: DatosAvisoInscripcion): { subject: string; html: string } {
  const titulo = nombreDeCohorte(d.curso, d.cohorte);
  const subject = `[Administración] Nueva inscripción: ${d.alumno.nombre} · ${titulo}`;
  const factura = d.invoiceNumber?.trim();

  const venta = [
    fila("Alumno", e(d.alumno.nombre)),
    fila("Documento", oGuion(d.alumno.documento)),
    fila("Correo", oGuion(d.alumno.email)),
    fila("Teléfono", oGuion(d.alumno.telefono)),
    fila("Curso", e(titulo)),
    fila("Inicio", e(fechaDeInicio(d.startDate, d.startTime, d.timeZone))),
    fila("Vendedor", d.vendedor ? e(d.vendedor) : "sin vendedor"),
    fila("Monto", e(monto(d.amount, d.currency))),
    fila("Cuotas", d.installments ? `${d.installments} ${d.installments === 1 ? "cuota" : "cuotas"}` : "sin cuotas cargadas"),
    fila("Factura", factura ? `Ya tiene factura: ${e(factura)}` : "Sin factura todavía"),
  ];

  let empresa: string;
  if (!d.empresa) {
    empresa = "<p>Particular (sin empresa)</p>";
  } else {
    const emp = d.empresa;
    empresa = tabla(
      ["Dato", "Valor"],
      [
        fila("Razón social", e(emp.razonSocial)),
        fila("Nombre comercial", oGuion(emp.nombreComercial)),
        fila("RUT", emp.rut?.trim() ? `RUT ${e(emp.rut)}` : "sin RUT cargado"),
        fila("Dirección fiscal", oGuion(emp.direccion)),
        fila("Contacto de facturación", oGuion(emp.contactoFacturacion)),
        fila("Correo de facturación", oGuion(emp.correoFacturacion)),
        fila("Teléfono de facturación", oGuion(emp.telefonoFacturacion)),
        fila("Condición de pago", e(condicionDePago(emp))),
      ]
    );
  }

  const html = documento(
    `Nueva inscripción: ${d.alumno.nombre}`,
    tabla(["Dato", "Valor"], venta) + '<h3 style="margin:20px 0 8px;">Empresa</h3>' + empresa
  );
  return { subject, html };
}

export const METODOS_DE_PAGO: Record<"efectivo" | "transferencia" | "tarjeta" | "otro", string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  tarjeta: "Tarjeta",
  otro: "Otro",
};

export type DatosAvisoPago = {
  alumno: string;
  curso: string | null;
  cohorte: string | null;
  esTaller: boolean;
  amount: number;
  currency: Currency;
  method: keyof typeof METODOS_DE_PAGO;
  /** Fecha del pago, guardada a medianoche UTC del día. */
  paidAt: Date;
  receiptNumber: string | null;
  /** Número de la cuota imputada; `null` = pago a cuenta. */
  cuota: number | null;
  /** `saldoPorMoneda` de la inscripción; vacío = sin plan de cuotas. */
  saldos: SaldoMoneda[];
};

/** El aviso de un pago registrado, con lo que le queda por pagar a esa inscripción. */
export function armarAvisoPago(d: DatosAvisoPago): { subject: string; html: string } {
  const importe = monto(d.amount, d.currency);
  const subject = `[Administración] Pago registrado: ${d.alumno} · ${importe}`;
  const curso = d.curso ? nombreDeCohorte(d.curso, d.cohorte) : "sin grupo (lead)";

  const saldo =
    d.saldos.length === 0
      ? "Sin plan de cuotas: no hay saldo calculado"
      : d.saldos.map((s) => e(monto(s.saldo, s.currency))).join("<br>");

  const datos = [
    fila("Alumno", e(d.alumno)),
    fila(d.esTaller ? "Taller" : "Curso", e(curso)),
    fila("Monto", e(importe)),
    fila("Método", e(METODOS_DE_PAGO[d.method])),
    fila("Fecha del pago", e(diaCorto(d.paidAt))),
    fila("Recibo", d.receiptNumber?.trim() ? e(d.receiptNumber) : "sin recibo"),
    fila("Imputado a", d.cuota !== null ? `Cuota ${d.cuota}` : "A cuenta (sin cuota)"),
    fila("Saldo de la inscripción", saldo),
  ];

  const html = documento(`Pago registrado: ${d.alumno}`, tabla(["Dato", "Valor"], datos));
  return { subject, html };
}

/** El resumen semanal de morosidad: totales por moneda y una tabla por cohorte. */
export function armarResumenMorosidad(d: { periodKey: string; resumen: ResumenMorosidad }): {
  subject: string;
  html: string;
} {
  const inscripciones = new Set(d.resumen.cohortes.flatMap((c) => c.filas.map((f) => f.enrollmentId))).size;
  const subject = `[Administración] Morosidad semanal ${d.periodKey}: ${inscripciones} ${
    inscripciones === 1 ? "inscripción" : "inscripciones"
  } con cuotas vencidas`;

  const totales = tabla(
    ["Moneda", "Adeudado vencido", "Inscripciones"],
    d.resumen.totales.map((t) => [e(t.currency), e(monto(t.adeudado, t.currency)), String(t.inscripciones)])
  );

  const porCohorte = d.resumen.cohortes
    .map(
      (c) =>
        `<h3 style="margin:20px 0 8px;">${e(c.cohorte)}</h3>` +
        tabla(
          ["Alumno", "Cuotas vencidas", "Adeudado", "Vencida desde", "Atraso"],
          c.filas.map((f) => [
            `${e(f.alumno)}${f.alumnoDeBaja ? " (de baja)" : ""}`,
            String(f.cuotasVencidas),
            e(monto(f.adeudado, f.currency)),
            e(diaCorto(f.venceDesde)),
            `${f.diasDeAtraso} ${f.diasDeAtraso === 1 ? "día" : "días"}`,
          ])
        )
    )
    .join("");

  const html = documento(
    `Morosidad semanal (${d.periodKey})`,
    "<p>Cuotas vencidas e impagas al día de hoy. Los totales van por moneda: no se suman entre sí.</p>" +
      totales +
      porCohorte
  );
  return { subject, html };
}
