/**
 * 012 (T017d) — Por qué un alumno todavía no puede tener portal, en palabras.
 *
 * Vive en un módulo HOJA, sin un solo import, por una razón medida: lo
 * necesitan `src/server/access.ts` (que invita) y `src/server/enrollments.ts`
 * (que arma el roster). Cuando el texto vivía en `access.ts`, importarlo
 * arrastraba `better-auth`, Microsoft Graph y el motor de plantillas al grafo
 * de módulos del roster — para leer un string. Los tests de roster y de
 * inscripciones pasaron de 866 ms a ~4900 ms, rozando el timeout de 5 s de
 * vitest, y empezaron a fallar de a ratos.
 *
 * Una constante compartida entre dos capas tiene que pesar lo que pesa el
 * dato, no lo que pesa el módulo donde nació.
 */
export const PORTAL_NO_EMAIL_REASON =
  "No tiene correo cargado. Agregale un correo al contacto y vas a poder invitarlo.";
