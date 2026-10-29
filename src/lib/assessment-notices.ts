import { fechaVigente } from "@/lib/fecha-vigente";
import { documento, e } from "@/lib/staff-notices";

/**
 * 0084 — Los correos al ALUMNO sobre sus evaluaciones, en PURO: a quién toca
 * el recordatorio, las llaves de idempotencia y qué dice cada correo. Solo
 * correo, nunca WhatsApp (decisión del dueño). El envío y el reclamo viven en
 * `src/server/email/assessment-notices.ts`.
 */

/** Días antes del plazo VIGENTE en que se recuerda. Se cambia con `ASSESSMENT_REMINDER_DAYS`. */
export const DIAS_DE_RECORDATORIO = 2;
/** Un correo que falló se reintenta hasta este número de intentos. */
export const INTENTOS_MAX = 3;

const DIA_MS = 24 * 60 * 60 * 1000;

export type CandidatoARecordatorio = {
  assessmentId: string;
  enrollmentId: string;
  /** El plazo del GRUPO ya efectivo: el propio o la entrega final heredada. */
  plazoDelGrupo: Date | null;
  /** La prórroga individual, si la tiene. */
  prorroga: Date | null;
  entrego: boolean;
  /** Ya tiene un resultado oficial (aprobado o no): no hay nada que recordar. */
  tieneResultado: boolean;
  email: string | null;
  /** Contacto del Laboratorio: jamás recibe nada. */
  esPrueba: boolean;
  /** Contacto archivado o inscripción en una etapa perdida. */
  dadoDeBaja: boolean;
  /** 043 — vencido el acceso, no se le pide nada. */
  accesoVencido: boolean;
};

export type RecordatorioQueToca = {
  assessmentId: string;
  enrollmentId: string;
  vigente: Date;
  clave: string;
};

export function claveDeRecordatorio(assessmentId: string, enrollmentId: string, vigente: Date): string {
  return `recordatorio:${assessmentId}:${enrollmentId}:${vigente.toISOString()}`;
}

export function claveDeCorreccionPublicada(correctionId: string): string {
  return `correccion:${correctionId}`;
}

/**
 * A quién le toca el recordatorio AHORA: plazo vigente (el más tardío entre el
 * del grupo y la prórroga, `fechaVigente`) todavía por delante y a lo sumo a
 * `dias` días. La llave lleva el plazo vigente: si una prórroga lo corre,
 * corresponde otro recordatorio; si no cambia, nunca se repite.
 */
export function seleccionarRecordatorios(
  candidatos: readonly CandidatoARecordatorio[],
  now: Date,
  dias: number
): RecordatorioQueToca[] {
  if (!(dias > 0)) return [];
  const out: RecordatorioQueToca[] = [];
  for (const c of candidatos) {
    if (c.entrego || c.tieneResultado || c.esPrueba || c.dadoDeBaja || c.accesoVencido) continue;
    if (!c.email?.trim()) continue;
    const vigente = fechaVigente(c.plazoDelGrupo, c.prorroga);
    if (!vigente) continue;
    const falta = vigente.getTime() - now.getTime();
    if (falta <= 0 || falta > dias * DIA_MS) continue;
    out.push({
      assessmentId: c.assessmentId,
      enrollmentId: c.enrollmentId,
      vigente,
      clave: claveDeRecordatorio(c.assessmentId, c.enrollmentId, vigente),
    });
  }
  return out;
}

/** "martes 10 de noviembre, 23:59", en la zona de la ACADEMIA (FR-005e). */
function fechaYHora(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("es-UY", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

function boton(enlace: string, texto: string): string {
  return `<p style="margin:20px 0;"><a href="${e(enlace)}" style="background:#001b5e;color:#ffffff;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:600;">${e(texto)}</a></p>`;
}

export type DatosDeRecordatorio = {
  nombre: string;
  evaluacion: string;
  curso: string;
  vigente: Date;
  timeZone: string;
  enlace: string;
};

export function armarRecordatorio(d: DatosDeRecordatorio): { subject: string; html: string } {
  const subject = `Recordatorio: «${d.evaluacion}» vence pronto`;
  const html = documento(
    subject,
    [
      `<p>Hola ${e(d.nombre)}:</p>`,
      `<p>Te recordamos que la evaluación <strong>${e(d.evaluacion)}</strong> de <strong>${e(d.curso)}</strong> vence el <strong>${e(fechaYHora(d.vigente, d.timeZone))}</strong> y todavía no registramos tu entrega.</p>`,
      "<p>Podés entregarla desde el campus, en la pestaña Evaluaciones de tu curso. Si necesitás más tiempo, desde ahí mismo podés solicitar una prórroga.</p>",
      boton(d.enlace, "Ir a mis evaluaciones"),
    ].join("")
  );
  return { subject, html };
}

export type DatosDeCorreccionPublicada = {
  nombre: string;
  evaluacion: string;
  curso: string;
  enlace: string;
};

/** La nota NO viaja en el correo: se lee en el campus, con su devolución completa. */
export function armarCorreccionPublicada(d: DatosDeCorreccionPublicada): { subject: string; html: string } {
  const subject = `Tu corrección fue publicada: «${d.evaluacion}»`;
  const html = documento(
    subject,
    [
      `<p>Hola ${e(d.nombre)}:</p>`,
      `<p>Ya está publicada la corrección de <strong>${e(d.evaluacion)}</strong> de <strong>${e(d.curso)}</strong>. En el campus vas a ver el resultado, cada criterio y la devolución de tu profesor.</p>`,
      boton(d.enlace, "Ver mi corrección"),
    ].join("")
  );
  return { subject, html };
}
