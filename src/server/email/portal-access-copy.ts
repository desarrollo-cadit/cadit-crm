import type { AccountLinkKind } from "@/lib/db/schema";

/**
 * El correo de acceso (`acceso-portal.html`) es UNO para las dos audiencias
 * del portal. Lo que cambia es qué hay adentro: prometerle a un profesor "tu
 * legajo y tus certificados" es describirle un portal que no es el suyo.
 */
export function contenidoPortalPara(kind: AccountLinkKind): string {
  return kind === "profesor"
    ? "Ahí vas a encontrar tus cohortes, la asistencia de cada clase y tus horas dictadas."
    : "Ahí vas a encontrar tus cursadas, tu legajo y tus certificados.";
}
