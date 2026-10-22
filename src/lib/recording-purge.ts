/**
 * Grabaciones que ya no están en Zoom: cuándo se borran del CRM.
 *
 * Pura (la usan la verificación diaria y la pantalla de Grabaciones). Una
 * grabación marcada como faltante (`zoom_recording.missing_in_zoom_at`) se
 * conserva `ZOOM_MISSING_PURGE_DAYS` días —por si vuelve a aparecer, y para
 * que se vea quién la había asignado— y después se borra.
 */

const DAY_MS = 86_400_000;

/** El instante a partir del cual se borra; `null` si no falta. */
export function fechaDeBorrado(missingAt: Date | null, purgeDays: number): Date | null {
  return missingAt ? new Date(missingAt.getTime() + purgeDays * DAY_MS) : null;
}

/** ¿Ya cumplió el plazo? Una grabación que no falta no se borra nunca. */
export function debeBorrarse(missingAt: Date | null, now: Date, purgeDays: number): boolean {
  const limite = fechaDeBorrado(missingAt, purgeDays);
  return limite !== null && now.getTime() >= limite.getTime();
}

/** El corte para la consulta: falta desde ANTES de esto ⇒ se borra. */
export function corteDeBorrado(now: Date, purgeDays: number): Date {
  return new Date(now.getTime() - purgeDays * DAY_MS);
}

/* ============================================================
 * Freno de borrado masivo
 * ============================================================ */

/**
 * Que un aula "pierda" de golpe la mitad de sus grabaciones casi nunca es que
 * alguien las borró: es un aula re-vinculada a otro usuario de Zoom, un
 * permiso que cambió o una cuenta que dejó de devolver lo viejo. Por eso, si
 * la verificación marcaría como faltantes:
 *  - al menos `FRENO_MIN_FALTANTES` y al menos `FRENO_PROPORCION` de las
 *    conocidas del aula en la ventana, o
 *  - TODAS, con al menos `FRENO_TODAS_DESDE` conocidas,
 * esa aula no marca nada y la conexión no purga. Borrar una o dos pasa.
 */
export const FRENO_MIN_FALTANTES = 5;
export const FRENO_PROPORCION = 0.5;
export const FRENO_TODAS_DESDE = 3;

/** `known`: conocidas (no faltantes) del aula en la ventana; `wouldFlag`: las que no vinieron. */
export function frenoDeBorradoMasivo(c: { known: number; wouldFlag: number }): boolean {
  if (c.known <= 0 || c.wouldFlag <= 0) return false;
  if (c.wouldFlag >= FRENO_MIN_FALTANTES && c.wouldFlag / c.known >= FRENO_PROPORCION) return true;
  return c.known >= FRENO_TODAS_DESDE && c.wouldFlag >= c.known;
}
