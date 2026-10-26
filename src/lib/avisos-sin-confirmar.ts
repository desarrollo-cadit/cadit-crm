import { capabilitiesFor, sanitizeCapabilities, type Capability } from "@/lib/capabilities";
import type { CourseKind } from "@/lib/course-kind";
import {
  diaCorto,
  diasHastaElInicio,
  documento,
  e,
  fechaDeInicio,
  nombreDeCohorte,
  puedeReclamar,
  tabla,
  type AvisoRegistrado,
  type SujetoDeAviso,
  type UnconfirmedNoticeKind,
} from "@/lib/staff-notices";

/**
 * Avisos de grupos SIN CONFIRMAR: las reglas.
 *
 * Hoy un grupo sin confirmar se vuelve "en curso" en silencio el día que
 * llega su fecha de inicio. Estos avisos le avisan antes a quien puede
 * decidir (la capacidad `cohortes.confirmar`): a T-7, a T-2 y el día de
 * inicio, en la zona de la academia. Si el grupo se confirma antes de una
 * ventana, esa ventana no sale.
 *
 * Puro (sin base, sin correo): la lectura y el envío viven en
 * `src/server/avisos-sin-confirmar.ts`, que reusa el reclamo de
 * `staff_notice` y el envío fuera de transacción de `src/server/staff-notices.ts`.
 */

/**
 * Qué grupos reciben el aviso.
 *
 * - **Un taller no**: no es una cursada (033) y no se confirma como un grupo.
 * - **Un módulo tampoco**: lo que "sale" es la especialización, que es la que
 *   se vende y se confirma. Avisar por cada módulo sería mandar ocho correos
 *   por un programa que ya se decidió, y el módulo uno empieza el mismo día
 *   que el programa: la madre ya avisa por él.
 */
export function grupoRecibeAvisoSinConfirmar(g: {
  courseKind: CourseKind | null;
  parentCohortId: string | null;
}): boolean {
  return g.courseKind !== "taller" && g.parentCohortId === null;
}

/**
 * Qué ventana toca HOY, si alguna:
 *
 * - **T-7**: faltan entre 7 y 3 días (un servidor apagado el día T-7 se pone
 *   al día dentro de la ventana).
 * - **T-2**: faltan 2 o 1 día.
 * - **Inicio**: es el día de inicio.
 * - Antes de T-7, después del día de inicio, o con el grupo confirmado: nada.
 */
export function avisoSinConfirmarQueToca(
  g: { startDate: Date; confirmedAt: Date | null },
  now: Date,
  timeZone: string
): UnconfirmedNoticeKind | null {
  if (g.confirmedAt) return null;
  const faltan = diasHastaElInicio(g.startDate, now, timeZone);
  if (faltan === null) return null;
  if (faltan === 0) return "sin_confirmar_inicio";
  if (faltan >= 1 && faltan <= 2) return "sin_confirmar_t2";
  if (faltan >= 3 && faltan <= 7) return "sin_confirmar_t7";
  return null;
}

/** `YYYY-MM-DD` del inicio guardado (medianoche UTC del día). */
export function inicioDeLaClave(startDate: Date): string {
  return startDate.toISOString().slice(0, 10);
}

/** El sujeto del aviso: grupo + ventana + fecha de inicio (la llave cambia al reprogramar). */
export function sujetoSinConfirmar(
  cohortId: string,
  kind: UnconfirmedNoticeKind,
  startDate: Date
): Extract<SujetoDeAviso, { kind: UnconfirmedNoticeKind }> {
  return { kind, cohortId, inicio: inicioDeLaClave(startDate) };
}

/**
 * Lo que la periódica intenta en una pasada para UN grupo: la ventana de hoy,
 * si `puedeReclamar` la deja (enviada nunca más; fallada hasta el tope;
 * omitida no se insiste).
 */
export function avisoSinConfirmarQueTocaHoy(
  g: { startDate: Date; confirmedAt: Date | null },
  registrado: AvisoRegistrado | null,
  now: Date,
  timeZone: string
): UnconfirmedNoticeKind | null {
  const kind = avisoSinConfirmarQueToca(g, now, timeZone);
  if (!kind) return null;
  return puedeReclamar(registrado, now, { reintentarOmitido: false }) ? kind : null;
}

/**
 * Los correos de quienes TIENEN la capacidad. La capacidad de cada miembro se
 * resuelve igual que la sesión (`requireSession`): la fila de `role` de su
 * organización si existe, y si no el mapeo de código (`capabilitiesFor`).
 * Nunca se mira el nombre del rol.
 *
 * Quien apagó "Recibir avisos internos por correo" (`member.receives_internal_notices`,
 * que se cambia en Equipo) queda afuera aunque tenga la capacidad. Sin el campo
 * cuenta como encendido.
 *
 * Sin repetidos (sin distinguir mayúsculas), en el orden de llegada.
 */
export function correosConCapacidad(
  miembros: readonly {
    email: string | null;
    role: string;
    receivesInternalNotices?: boolean;
  }[],
  roles: readonly { key: string; capabilities: unknown }[],
  capacidad: Capability
): string[] {
  const porLlave = new Map(roles.map((r) => [r.key, sanitizeCapabilities(r.capabilities)]));
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const m of miembros) {
    const email = m.email?.trim();
    if (!email) continue;
    if (m.receivesInternalNotices === false) continue;
    const caps = porLlave.get(m.role) ?? capabilitiesFor(m.role);
    if (!caps.includes(capacidad)) continue;
    const key = email.toLowerCase();
    if (vistos.has(key)) continue;
    vistos.add(key);
    out.push(email);
  }
  return out;
}

export type DatosAvisoSinConfirmar = {
  curso: string;
  cohorte: string | null;
  startDate: Date;
  startTime: string | null;
  timeZone: string;
  /** Inscripciones de la cohorte con el contacto activo. */
  inscriptos: number;
  /** Enlace absoluto a la página del grupo. */
  url: string;
};

const CUANDO: Record<UnconfirmedNoticeKind, string> = {
  sin_confirmar_t7: "faltan 7 días",
  sin_confirmar_t2: "faltan 2 días",
  sin_confirmar_inicio: "empieza hoy",
};

/** El correo a quienes pueden confirmar el grupo. */
export function armarAvisoSinConfirmar(
  kind: UnconfirmedNoticeKind,
  d: DatosAvisoSinConfirmar
): { subject: string; html: string } {
  const titulo = nombreDeCohorte(d.curso, d.cohorte);
  const subject = `[Académico] Grupo sin confirmar (${CUANDO[kind]}): ${titulo} · inicia ${diaCorto(d.startDate)}`;

  const n = d.inscriptos;
  const inscriptos = n === 0 ? "Todavía no tiene inscriptos" : `${n} ${n === 1 ? "inscripto" : "inscriptos"}`;

  const intro =
    kind === "sin_confirmar_inicio"
      ? "El grupo empieza hoy y todavía no está confirmado."
      : "El grupo todavía no está confirmado.";

  const html = documento(
    `Grupo sin confirmar: ${titulo}`,
    `<p>${e(intro)} Si sale, confirmalo; si no sale, reprogramalo o borralo desde la página del grupo.</p>` +
      tabla(
        ["Dato", "Valor"],
        [
          [e("Curso"), e(d.curso)],
          [e("Grupo"), e(d.cohorte?.trim() || d.curso)],
          [e("Inicio"), e(fechaDeInicio(d.startDate, d.startTime, d.timeZone))],
          [e("Inscriptos"), e(inscriptos)],
        ]
      ) +
      `<p style="margin-top:16px;"><a href="${e(d.url)}">Abrir el grupo en CadIT</a></p>`
  );
  return { subject, html };
}
