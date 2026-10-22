import { escapeHtml } from "@/lib/utils";
import { formatAmountWithCode } from "@/lib/money";
import { pendienteDeFacturar } from "@/lib/facturacion-regla";
import { classInstant, conZona, formatInZone, wallClockInZone } from "@/lib/schedule-time";

/**
 * 039 — Confirmación de cohortes y avisos internos por correo: las reglas.
 *
 * Puro a propósito (sin base, sin correo): CUÁNDO sale un aviso, A QUIÉN y
 * QUÉ dice se prueba en `tests/unit/avisos-internos.test.ts`. La lectura de
 * la base vive en `src/server/staff-notices.ts`.
 *
 * Tres avisos, uno por cohorte y tipo (`staff_notice`, UNIQUE):
 *
 *  - `cohorte_confirmada` → a **Soporte**, al confirmar: quién cursa y qué
 *    licencias necesita cada uno.
 *  - `facturacion_t7` / `facturacion_t2` → a **Administración**, 7 y 2 días de
 *    calendario antes del inicio (en la zona de la academia): quién no tiene
 *    factura todavía.
 */

export const STAFF_NOTICE_KINDS = [
  "cohorte_confirmada",
  "facturacion_t7",
  "facturacion_t2",
  // 041 — Avisos de cobranza a Administración (`src/lib/billing-notices.ts`).
  "inscripcion_nueva",
  "pago_registrado",
  "morosidad_semanal",
  // Avisos de nuevos interesados (`src/lib/lead-notices.ts`).
  "interesado_nuevo",
  // Grupos sin confirmar a T-7, T-2 y el día de inicio (`src/lib/avisos-sin-confirmar.ts`).
  "sin_confirmar_t7",
  "sin_confirmar_t2",
  "sin_confirmar_inicio",
] as const;
export type StaffNoticeKind = (typeof STAFF_NOTICE_KINDS)[number];

/** 039 — Los avisos que cuelgan de UNA cohorte (los de la confirmación). */
export const COHORT_NOTICE_KINDS = ["cohorte_confirmada", "facturacion_t7", "facturacion_t2"] as const;
export type CohortNoticeKind = (typeof COHORT_NOTICE_KINDS)[number];

/**
 * Los avisos de un grupo que todavía NO se confirmó, a quienes pueden
 * confirmarlo (`cohortes.confirmar`). Uno por grupo, ventana y fecha de
 * inicio: reprogramar el grupo abre ventanas nuevas.
 */
export const UNCONFIRMED_NOTICE_KINDS = ["sin_confirmar_t7", "sin_confirmar_t2", "sin_confirmar_inicio"] as const;
export type UnconfirmedNoticeKind = (typeof UNCONFIRMED_NOTICE_KINDS)[number];

/**
 * 041 — De QUÉ es cada aviso. La idempotencia de 039 era "uno por cohorte y
 * tipo"; con los avisos de cobranza pasa a ser "uno por sujeto": una cohorte
 * (039), una inscripción (venta nueva), un pago, o una semana de la
 * organización (resumen de morosidad).
 */
export type SujetoDeAviso =
  | { kind: CohortNoticeKind; cohortId: string }
  | { kind: "inscripcion_nueva"; enrollmentId: string }
  | { kind: "pago_registrado"; enrollmentId: string; paymentId: string }
  | { kind: "morosidad_semanal"; periodKey: string }
  /**
   * Un interesado que dejó sus datos en un formulario público. `envio`
   * distingue un envío de otro de la MISMA persona (`claveDeInteresado` de
   * `src/lib/lead-notices.ts`: interés + día).
   */
  | { kind: "interesado_nuevo"; contactId: string; envio: string }
  /**
   * Un grupo sin confirmar. `inicio` (`YYYY-MM-DD`) es la fecha de inicio a
   * la que se refiere el aviso: si el grupo se reprograma, la llave cambia y
   * las ventanas de la fecha nueva vuelven a avisar.
   */
  | { kind: UnconfirmedNoticeKind; cohortId: string; inicio: string };

/**
 * La llave única por organización (`staff_notice.dedup_key`). Para los avisos
 * de 039 es `kind:cohortId`, exactamente lo que la migración 0062 rellena en
 * las filas que ya existían: la llave nueva no reabre nada que ya salió.
 */
export function claveDeAviso(s: SujetoDeAviso): string {
  switch (s.kind) {
    case "inscripcion_nueva":
      return `${s.kind}:${s.enrollmentId}`;
    case "pago_registrado":
      return `${s.kind}:${s.paymentId}`;
    case "morosidad_semanal":
      return `${s.kind}:${s.periodKey}`;
    case "interesado_nuevo":
      return `${s.kind}:${s.contactId}:${s.envio}`;
    case "sin_confirmar_t7":
    case "sin_confirmar_t2":
    case "sin_confirmar_inicio":
      return `${s.kind}:${s.cohortId}:${s.inicio}`;
    default:
      return `${s.kind}:${s.cohortId}`;
  }
}

export type ColumnasDelSujeto = {
  cohortId: string | null;
  enrollmentId: string | null;
  paymentId: string | null;
  periodKey: string | null;
  /** El contacto de `interesado_nuevo` (migración 0065). */
  contactId: string | null;
};

/** Qué columnas de `staff_notice` llena cada sujeto (el CHECK de la 0062/0065 exige las suyas). */
export function columnasDelSujeto(s: SujetoDeAviso): ColumnasDelSujeto {
  const vacio: ColumnasDelSujeto = {
    cohortId: null,
    enrollmentId: null,
    paymentId: null,
    periodKey: null,
    contactId: null,
  };
  switch (s.kind) {
    case "inscripcion_nueva":
      return { ...vacio, enrollmentId: s.enrollmentId };
    case "pago_registrado":
      return { ...vacio, enrollmentId: s.enrollmentId, paymentId: s.paymentId };
    case "morosidad_semanal":
      return { ...vacio, periodKey: s.periodKey };
    case "interesado_nuevo":
      return { ...vacio, contactId: s.contactId };
    default:
      return { ...vacio, cohortId: s.cohortId };
  }
}

/**
 * La inversa, para la periódica que lee filas. Una fila incompleta → `null`.
 * `interesado_nuevo` necesita además la llave: la parte del envío vive solo ahí.
 */
export function sujetoDeRegistro(
  r: { kind: StaffNoticeKind; dedupKey?: string; contactId?: string | null } & Omit<
    ColumnasDelSujeto,
    "contactId"
  >
): SujetoDeAviso | null {
  switch (r.kind) {
    case "inscripcion_nueva":
      return r.enrollmentId ? { kind: r.kind, enrollmentId: r.enrollmentId } : null;
    case "pago_registrado":
      return r.enrollmentId && r.paymentId
        ? { kind: r.kind, enrollmentId: r.enrollmentId, paymentId: r.paymentId }
        : null;
    case "morosidad_semanal":
      return r.periodKey ? { kind: r.kind, periodKey: r.periodKey } : null;
    case "interesado_nuevo": {
      if (!r.contactId || !r.dedupKey) return null;
      const prefijo = `${r.kind}:${r.contactId}:`;
      if (!r.dedupKey.startsWith(prefijo) || r.dedupKey.length === prefijo.length) return null;
      return { kind: r.kind, contactId: r.contactId, envio: r.dedupKey.slice(prefijo.length) };
    }
    case "sin_confirmar_t7":
    case "sin_confirmar_t2":
    case "sin_confirmar_inicio": {
      if (!r.cohortId || !r.dedupKey) return null;
      const prefijo = `${r.kind}:${r.cohortId}:`;
      const inicio = r.dedupKey.startsWith(prefijo) ? r.dedupKey.slice(prefijo.length) : "";
      return /^\d{4}-\d{2}-\d{2}$/.test(inicio) ? { kind: r.kind, cohortId: r.cohortId, inicio } : null;
    }
    default:
      return r.cohortId ? { kind: r.kind, cohortId: r.cohortId } : null;
  }
}

export const BILLING_NOTICE_KINDS = ["facturacion_t7", "facturacion_t2"] as const;
export type BillingNoticeKind = (typeof BILLING_NOTICE_KINDS)[number];

/**
 * `pending` = reclamado y en vuelo; `skipped` = no había a quién o qué mandar
 * (área apagada, todos facturados); `cancelled` = se quitó la confirmación
 * antes de que saliera.
 */
export const STAFF_NOTICE_STATUSES = ["pending", "sent", "skipped", "failed", "cancelled"] as const;
export type StaffNoticeStatus = (typeof STAFF_NOTICE_STATUSES)[number];

export const STAFF_NOTICE_LABELS: Record<StaffNoticeKind, string> = {
  cohorte_confirmada: "Aviso a Soporte",
  facturacion_t7: "Facturación, 7 días antes",
  facturacion_t2: "Facturación, 2 días antes",
  inscripcion_nueva: "Nueva inscripción",
  pago_registrado: "Pago registrado",
  morosidad_semanal: "Morosidad semanal",
  interesado_nuevo: "Nuevo interesado",
  sin_confirmar_t7: "Sin confirmar, 7 días antes",
  sin_confirmar_t2: "Sin confirmar, 2 días antes",
  sin_confirmar_inicio: "Sin confirmar, día de inicio",
};

export const STAFF_NOTICE_STATUS_LABELS: Record<StaffNoticeStatus, string> = {
  pending: "en curso",
  sent: "enviado",
  skipped: "omitido",
  failed: "falló",
  cancelled: "cancelado",
};

/** 039 — Lo que la pantalla de la cohorte muestra de cada aviso. */
export type AvisoDto = {
  kind: StaffNoticeKind;
  status: StaffNoticeStatus;
  detail: string | null;
  error: string | null;
  sentAt: string | null;
  updatedAt: string;
};

export type ConfirmacionDto = {
  confirmedAt: string | null;
  confirmedBy: { id: string; name: string } | null;
  /**
   * Lo que se dibuja (`marcaDeConfirmacion`): `sin_confirmar_vencido` = llegó
   * el día de inicio sin confirmar (rojo, con las salidas).
   */
  marca: "confirmado" | "sin_confirmar" | "sin_confirmar_vencido";
  avisos: AvisoDto[];
};

/** Un aviso que falla se reintenta, pero no para siempre. */
export const MAX_INTENTOS_AVISO = 3;

/**
 * Un `pending` más viejo que esto es de un proceso que se cayó a mitad del
 * envío: se puede volver a reclamar (cuenta como otro intento).
 */
export const RECLAMO_VENCIDO_MS = 30 * 60_000;

/* ============================================================
 * Fechas: días de calendario en la zona de la academia
 * ============================================================ */

/** `cohort.start_date` se guarda a medianoche UTC del día: se lee en UTC. */
function diaGuardado(day: Date): string {
  return day.toISOString().slice(0, 10);
}

function diasEntre(desde: string, hasta: string): number {
  const a = Date.parse(`${desde}T00:00:00.000Z`);
  const b = Date.parse(`${hasta}T00:00:00.000Z`);
  return Math.round((b - a) / 86_400_000);
}

/**
 * Cuántos días de calendario faltan para el inicio, contados desde HOY en la
 * zona de la academia (`wallClockInZone`, la misma regla que el resto). 0 = el
 * día de inicio; negativo = ya empezó. Zona inválida → `null`.
 */
export function diasHastaElInicio(startDate: Date, now: Date, timeZone: string): number | null {
  const hoy = wallClockInZone(now, timeZone);
  if (!hoy) return null;
  return diasEntre(hoy.fecha, diaGuardado(startDate));
}

/**
 * 039 — Qué aviso de facturación toca HOY para una cohorte, si alguno.
 *
 * - **T-2**: faltan 2 o 1 día. Sale aunque la cohorte se haya confirmado
 *   tarde (un día antes, incluso): todavía se está a tiempo de facturar.
 * - **T-7**: faltan entre 7 y 3 días, **y** la cohorte ya estaba confirmada el
 *   día T-7. Una confirmación tardía (p. ej. 3 días antes) NO dispara la de
 *   T-7 retroactiva: ese aviso era "falta una semana", y con 3 días el que
 *   corresponde es el de T-2, en su día. Un servidor apagado el día T-7 sí se
 *   pone al día mientras siga dentro de la ventana.
 * - Llegada la ventana de T-2, la de T-7 ya no toca (si no salió, no sale).
 * - El día de inicio y después, ninguno.
 */
export function avisoDeFacturacionQueToca(
  cohorte: { startDate: Date; confirmedAt: Date | null },
  now: Date,
  timeZone: string
): BillingNoticeKind | null {
  if (!cohorte.confirmedAt) return null;
  const faltan = diasHastaElInicio(cohorte.startDate, now, timeZone);
  if (faltan === null) return null;
  if (faltan >= 1 && faltan <= 2) return "facturacion_t2";
  if (faltan >= 3 && faltan <= 7) {
    const confirmada = wallClockInZone(cohorte.confirmedAt, timeZone);
    if (!confirmada) return null;
    return diasEntre(confirmada.fecha, diaGuardado(cohorte.startDate)) >= 7 ? "facturacion_t7" : null;
  }
  return null;
}

/* ============================================================
 * Idempotencia: ¿se puede reclamar este aviso?
 * ============================================================ */

export type AvisoRegistrado = {
  status: StaffNoticeStatus;
  attempts: number;
  claimedAt: Date | null;
};

/**
 * ¿Se puede reclamar (y mandar) el aviso dado lo que ya está registrado?
 *
 * - `sent` → nunca más, ni reconfirmando: el correo ya salió.
 * - `cancelled` → sí: se quitó la confirmación antes de que saliera y la
 *   cohorte se volvió a confirmar.
 * - `failed` → sí, hasta `MAX_INTENTOS_AVISO`.
 * - `skipped` → solo si lo pide un acto humano (`reintentarOmitido`: volver a
 *   confirmar después de configurar el área). La periódica no insiste.
 * - `pending` → no, salvo que el reclamo esté vencido (proceso caído).
 *   041: un `pending` SIN reclamo (`attempts` 0, `claimed_at` NULL) es un
 *   aviso ENCOLADO en la transacción del alta o del pago que todavía nadie
 *   tomó: se puede reclamar enseguida.
 */
export function puedeReclamar(
  previo: AvisoRegistrado | null,
  now: Date,
  opts: { reintentarOmitido: boolean }
): boolean {
  if (!previo) return true;
  switch (previo.status) {
    case "sent":
      return false;
    case "cancelled":
      return true;
    case "failed":
      return previo.attempts < MAX_INTENTOS_AVISO;
    case "skipped":
      return opts.reintentarOmitido;
    case "pending": {
      if (previo.attempts >= MAX_INTENTOS_AVISO) return false;
      if (previo.claimedAt === null) return true;
      const desde = previo.claimedAt.getTime();
      return now.getTime() - desde > RECLAMO_VENCIDO_MS;
    }
  }
}

/**
 * 039 — Qué avisos intenta la periódica en una pasada para UNA cohorte.
 *
 * - Sin confirmar, o ya empezada (el día de inicio o después): ninguno.
 * - `cohorte_confirmada`: lo manda la confirmación misma (después del commit).
 *   Acá se recupera solo si nunca salió —el proceso se cayó tras confirmar—
 *   o si falló y le quedan intentos. Un omitido no se insiste.
 * - El de facturación que toque hoy (`avisoDeFacturacionQueToca`), si
 *   `puedeReclamar` lo deja.
 */
export function avisosQueTocan(
  cohorte: { startDate: Date; confirmedAt: Date | null },
  registrados: Partial<Record<CohortNoticeKind, AvisoRegistrado>>,
  now: Date,
  timeZone: string
): CohortNoticeKind[] {
  if (!cohorte.confirmedAt) return [];
  const faltan = diasHastaElInicio(cohorte.startDate, now, timeZone);
  if (faltan === null || faltan < 1) return [];
  const periodica = { reintentarOmitido: false };
  const out: CohortNoticeKind[] = [];
  if (puedeReclamar(registrados.cohorte_confirmada ?? null, now, periodica)) {
    out.push("cohorte_confirmada");
  }
  const facturacion = avisoDeFacturacionQueToca(cohorte, now, timeZone);
  if (facturacion && puedeReclamar(registrados[facturacion] ?? null, now, periodica)) {
    out.push(facturacion);
  }
  return out;
}

/* ============================================================
 * Destinatarios
 * ============================================================ */

export type Destinatarios = { to: string[]; cc: string[] };

/**
 * To = la casilla del área; CC = sus copias, sin duplicados (sin distinguir
 * mayúsculas) ni la casilla. Área sin fila, apagada o sin casilla → `null`:
 * el aviso se OMITE y se registra, nunca se lanza.
 */
export function destinatariosDeArea(
  config: { enabled: boolean; mailbox: string | null; ccEmails: string[] } | null
): Destinatarios | null {
  if (!config || !config.enabled || !config.mailbox) return null;
  const to = [config.mailbox];
  const vistos = new Set(to.map((e) => e.toLowerCase()));
  const cc: string[] = [];
  for (const email of config.ccEmails) {
    const key = email.toLowerCase();
    if (vistos.has(key)) continue;
    vistos.add(key);
    cc.push(email);
  }
  return { to, cc };
}

/* ============================================================
 * Quién no tiene factura
 * ============================================================ */

export type InscripcionParaFacturar = {
  enrollmentId: string;
  nombre: string;
  email: string | null;
  nationalId: string | null;
  invoiceNumber: string | null;
  amount: number | null;
  currency: string;
  empresa: { razonSocial: string; rut: string | null } | null;
  /** El contacto está dado de baja (`contact.archived_at`). */
  deBaja: boolean;
  /** Inscripción hija de un módulo: la plata vive en la madre. */
  esHija: boolean;
};

/**
 * Las inscripciones MADRE, activas, sin número de factura (vacío o solo
 * espacios cuenta como sin factura). Lista vacía → no se manda nada.
 */
export function sinFacturar(filas: readonly InscripcionParaFacturar[]): InscripcionParaFacturar[] {
  // 042 — La misma regla que la pantalla de Facturación (`enLaVista`): una
  // sola función, para que el correo y la pantalla no puedan discrepar.
  return filas.filter(pendienteDeFacturar);
}

/* ============================================================
 * Contenido de los correos
 * ============================================================ */

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

function diaEnPalabras(day: Date): string {
  return `${DIAS[day.getUTCDay()]} ${day.getUTCDate()} de ${MESES[day.getUTCMonth()]} de ${day.getUTCFullYear()}`;
}

/** "27/10/2026" de una fecha de día guardada a medianoche UTC. */
export function diaCorto(day: Date): string {
  const [y, m, d] = diaGuardado(day).split("-");
  return `${d}/${m}/${y}`;
}

/**
 * "martes 27 de octubre de 2026, 18:30 (hora de Uruguay)".
 *
 * La hora sale de `classInstant()` (el único lugar que compone fechas de
 * clase) y se vuelve a leer en la zona de la academia: nunca se pega el texto
 * `"18:30"` a mano.
 */
export function fechaDeInicio(startDate: Date, startTime: string | null, timeZone: string): string {
  const dia = diaEnPalabras(startDate);
  const instante = classInstant(startDate, startTime, timeZone);
  if (!instante) return `${dia} (sin horario cargado)`;
  return `${dia}, ${conZona(formatInZone(instante, timeZone), timeZone)}`;
}

/**
 * "UYU 12.000" / "UYU 5.245,32" a partir de CENTÉSIMOS; sin monto lo dice.
 * Una moneda por vez: nunca se suman. El formato vive en `src/lib/money.ts`.
 */
export function monto(amount: number | null, currency: string): string {
  return formatAmountWithCode(amount, currency);
}

/** Escapa para HTML; `null` → vacío. */
export const e = (v: string | null | undefined) => escapeHtml(v ?? "");

const TD = 'style="padding:6px 10px;border-bottom:1px solid #e5e7eb;vertical-align:top;text-align:left;"';
const TH = 'style="padding:6px 10px;border-bottom:2px solid #d1d5db;text-align:left;font-weight:600;"';

/** Una tabla con encabezado; cada celda llega YA escapada. */
export function tabla(encabezados: string[], filas: string[][]): string {
  return [
    '<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:14px;">',
    `<thead><tr>${encabezados.map((h) => `<th ${TH}>${e(h)}</th>`).join("")}</tr></thead>`,
    `<tbody>${filas.map((f) => `<tr>${f.map((c) => `<td ${TD}>${c}</td>`).join("")}</tr>`).join("")}</tbody>`,
    "</table>",
  ].join("");
}

export function documento(titulo: string, cuerpo: string): string {
  return [
    "<!doctype html>",
    '<html lang="es"><body style="font-family:Segoe UI,Arial,sans-serif;color:#111827;line-height:1.5;">',
    `<h2 style="margin:0 0 12px;">${e(titulo)}</h2>`,
    cuerpo,
    '<p style="margin-top:24px;font-size:12px;color:#6b7280;">Aviso automático de CadIT CRM. No respondas a este correo.</p>',
    "</body></html>",
  ].join("");
}

/** "Curso — Cohorte", o solo el curso si la cohorte no agrega nada. */
export function nombreDeCohorte(curso: string, cohorte: string | null): string {
  return cohorte && cohorte.trim() && cohorte.trim() !== curso ? `${curso} — ${cohorte.trim()}` : curso;
}

export type LicenciaParaSoporte = {
  programa: string;
  origen: "grupo" | "individual";
  asignada: boolean;
};

export type AlumnoParaSoporte = {
  nombre: string;
  email: string | null;
  telefono: string | null;
  licenciaPropia: boolean;
  licencias: LicenciaParaSoporte[];
};

export type DatosAvisoSoporte = {
  curso: string;
  cohorte: string | null;
  startDate: Date;
  startTime: string | null;
  timeZone: string;
  profesor: string | null;
  /** Lo que la cohorte DECLARA usar (`cohort_software`). */
  softwareDeLaCohorte: string[];
  /** Lo asignado a todo el grupo (`cohort_group_software`). */
  programasDelGrupo: string[];
  alumnos: AlumnoParaSoporte[];
};

function licenciasEnTexto(a: AlumnoParaSoporte): string {
  const partes = a.licencias.map(
    (l) => `${e(l.programa)} (${l.origen})${l.asignada ? "" : " — sin asignar"}`
  );
  if (a.licenciaPropia) partes.push("tiene licencia propia");
  return partes.length > 0 ? partes.join("<br>") : "ninguna cargada";
}

/** El aviso a Soporte al confirmar la cohorte. */
export function armarAvisoSoporte(d: DatosAvisoSoporte): { subject: string; html: string } {
  const titulo = nombreDeCohorte(d.curso, d.cohorte);
  const subject = `[Soporte] Grupo confirmado: ${titulo} · inicia ${diaCorto(d.startDate)}`;

  const datos = [
    ["Curso", e(d.curso)],
    ["Grupo", e(d.cohorte?.trim() || d.curso)],
    ["Inicio", e(fechaDeInicio(d.startDate, d.startTime, d.timeZone))],
    ["Profesor", d.profesor ? e(d.profesor) : "sin profesor asignado"],
    ["Software del grupo", d.softwareDeLaCohorte.length > 0 ? e(d.softwareDeLaCohorte.join(", ")) : "ninguno declarado"],
    ["Programas del grupo", d.programasDelGrupo.length > 0 ? e(d.programasDelGrupo.join(", ")) : "ninguno"],
  ];

  const n = d.alumnos.length;
  const alumnos =
    n === 0
      ? "<p>Todavía no hay alumnos inscriptos.</p>"
      : `<p>${n} ${n === 1 ? "alumno" : "alumnos"}:</p>` +
        tabla(
          ["Alumno", "Correo", "Teléfono", "Licencias"],
          d.alumnos.map((a) => [e(a.nombre), a.email ? e(a.email) : "—", a.telefono ? e(a.telefono) : "—", licenciasEnTexto(a)])
        );

  const html = documento(
    `Grupo confirmado: ${titulo}`,
    tabla(["Dato", "Valor"], datos.map(([k, v]) => [e(k), v!])) +
      '<h3 style="margin:20px 0 8px;">Alumnos y licencias</h3>' +
      alumnos
  );
  return { subject, html };
}

export type DatosAvisoFacturacion = {
  curso: string;
  cohorte: string | null;
  startDate: Date;
  startTime: string | null;
  timeZone: string;
  pendientes: InscripcionParaFacturar[];
};

/** El aviso a Administración: las inscripciones sin factura a T-7 / T-2. */
export function armarAvisoFacturacion(
  kind: BillingNoticeKind,
  d: DatosAvisoFacturacion
): { subject: string; html: string } {
  const titulo = nombreDeCohorte(d.curso, d.cohorte);
  const dias = kind === "facturacion_t7" ? 7 : 2;
  const subject = `[Administración] Facturación pendiente (${dias} días): ${titulo} · inicia ${diaCorto(d.startDate)}`;

  const n = d.pendientes.length;
  const filas = d.pendientes.map((p) => [
    e(p.nombre),
    p.nationalId ? e(p.nationalId) : "—",
    p.email ? e(p.email) : "—",
    e(monto(p.amount, p.currency)),
    p.empresa ? `${e(p.empresa.razonSocial)}${p.empresa.rut ? `<br>RUT ${e(p.empresa.rut)}` : ""}` : "—",
  ]);

  const html = documento(
    `Facturación pendiente: ${titulo}`,
    `<p>El grupo empieza el ${e(fechaDeInicio(d.startDate, d.startTime, d.timeZone))}. ` +
      `Hay ${n} ${n === 1 ? "inscripción sin factura" : "inscripciones sin factura"}:</p>` +
      tabla(["Alumno", "Documento", "Correo", "Monto", "Empresa"], filas)
  );
  return { subject, html };
}
