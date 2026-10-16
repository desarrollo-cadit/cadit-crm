/**
 * 035 (FR-003) — De dónde viene una licencia.
 *
 * - `individual`: alguien se la asignó a esta persona (lo de siempre; todas
 *   las filas anteriores a la 0058 quedan así).
 * - `grupo`: la tiene porque el programa está asignado a TODO el grupo de su
 *   cohorte. Se quita desde la cohorte, nunca por alumno.
 *
 * Archivo propio y sin dependencias: `schema.ts` lo importa por ruta relativa
 * (drizzle-kit lo carga fuera de Next).
 */
export const LICENSE_SOURCES = ["grupo", "individual"] as const;
export type LicenseSource = (typeof LICENSE_SOURCES)[number];
