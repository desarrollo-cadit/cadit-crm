/**
 * 2026-10-07 — Qué se anota en `activity_log`.
 *
 * Lista CERRADA, como las capacidades: un `kind` mal escrito no se puede
 * colar en una fila que después nadie sabe leer. Para registrar algo nuevo,
 * se agrega acá con su rótulo.
 */

export const ACTIVITY_KINDS = ["portal.sign_in"] as const;

export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export const ACTIVITY_LABELS: Record<ActivityKind, string> = {
  "portal.sign_in": "Inició sesión en el portal",
};

/**
 * ¿Esta sesión nueva es un INGRESO?
 *
 * Better Auth crea sesiones también al dar de alta una cuenta (la invitación
 * al portal la crea el staff, desde SU computadora) y en otros flujos. Contar
 * esas como «inicio de sesión» le atribuiría al alumno la IP de quien lo
 * invitó. Por eso se pregunta por la RUTA que originó la sesión.
 */
export function esInicioDeSesion(path: string | null | undefined): boolean {
  return typeof path === "string" && path.startsWith("/sign-in/");
}
