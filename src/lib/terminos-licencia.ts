import type { LicenseSource } from "./license-source";

/**
 * 2026-10-23 — A quién le van los términos de la licencia ATC. Pura.
 *
 * Los términos documentan un PRÉSTAMO de licencia: no tienen sentido para
 * quien no tiene una asignada ni para quien trajo la suya ("Tenía licencia
 * propia"). Y el préstamo se hace a la cuenta de la licencia, así que el
 * correo sale a `correoDeLicencia` (`src/lib/license-email.ts`), nunca
 * directo al del alumno.
 *
 * Una sola regla para las tres puertas: el envío individual
 * (`sendEnrollmentEmail`), el envío al grupo (`partitionRecipients`) y la
 * exportación para licenciamiento (`exportCohortRosterCsv`).
 *
 * "Licencia asignada" = alguna fila de `license` con `assigned = true` de la
 * inscripción o, en una especialización, de sus inscripciones hijas (los
 * módulos). Es lo mismo que nombra el correo (`ownLicenseNames` +
 * `moduleLicenseNames`) y lo que el roster marca en verde.
 */

export type MotivoSinTerminos = "licencia_propia" | "sin_licencia" | "sin_correo_licencia";

export const MENSAJE_SIN_TERMINOS: Record<MotivoSinTerminos, string> = {
  licencia_propia: "Tenía licencia propia: no corresponden los términos del préstamo.",
  sin_licencia: "Sin licencia asignada: los términos se mandan recién al asignarla.",
  sin_correo_licencia:
    "Sin correo para la licencia: cargá el correo del alumno o el de la licencia.",
};

/** ¿Hay que prestarle (y documentarle) una licencia? */
export function necesitaLicencia(input: {
  licenseAssigned: boolean;
  hadOwnLicense: boolean;
}): boolean {
  return input.licenseAssigned && !input.hadOwnLicense;
}

export type DestinoDeTerminos =
  | { ok: true; email: string }
  | { ok: false; motivo: MotivoSinTerminos; mensaje: string };

/**
 * A qué correo van los términos, o por qué no van. `licenseEmail` es lo que
 * ya resolvió `correoDeLicencia` (acá no se vuelve a resolver).
 */
export function destinoDeTerminos(input: {
  licenseAssigned: boolean;
  hadOwnLicense: boolean;
  licenseEmail: string | null;
}): DestinoDeTerminos {
  const no = (motivo: MotivoSinTerminos): DestinoDeTerminos => ({
    ok: false,
    motivo,
    mensaje: MENSAJE_SIN_TERMINOS[motivo],
  });
  if (input.hadOwnLicense) return no("licencia_propia");
  if (!input.licenseAssigned) return no("sin_licencia");
  const email = input.licenseEmail?.trim();
  if (!email) return no("sin_correo_licencia");
  return { ok: true, email };
}

export const MENSAJE_LICENCIA_PROPIA_ASIGNAR =
  "Esta inscripción tiene marcada «Tenía licencia propia»: no se le asigna una licencia. Desmarcala primero si de verdad necesita una.";

export const MENSAJE_LICENCIA_ASIGNADA_MARCAR =
  "Tiene una licencia asignada: liberala primero y después marcá «Tenía licencia propia».";

export type PlanMarcarLicenciaPropia =
  | { ok: true; liberarDelGrupo: string[] }
  | { ok: false; mensaje: string };

/**
 * Marcar "Tenía licencia propia" con licencias ya asignadas (las de la
 * inscripción y, en una especialización, las de sus módulos):
 *
 * - Una INDIVIDUAL la asignó alguien a mano: se rechaza y se pide liberarla
 *   primero. Liberarla en silencio devolvería stock sin que nadie lo decida.
 * - Una del GRUPO no se puede liberar por alumno (035, FR-008), así que
 *   rechazar dejaría a la persona sin salida. Quien trajo su licencia deja de
 *   ser del grupo a efectos de licencias —igual que una baja—, y la del grupo
 *   vuelve al stock.
 */
export function planMarcarLicenciaPropia(
  licencias: readonly { id: string; assigned: boolean; source: LicenseSource | null }[]
): PlanMarcarLicenciaPropia {
  const asignadas = licencias.filter((l) => l.assigned);
  if (asignadas.some((l) => (l.source ?? "individual") === "individual")) {
    return { ok: false, mensaje: MENSAJE_LICENCIA_ASIGNADA_MARCAR };
  }
  return { ok: true, liberarDelGrupo: asignadas.map((l) => l.id) };
}
