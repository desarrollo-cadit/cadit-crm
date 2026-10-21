import { normalizarCorreo } from "@/lib/contact-identity";

/**
 * Correo para la licencia (2026-10-21) — `enrollment.license_email`.
 *
 * La licencia de una inscripción puede ir a otro correo que el del alumno
 * (el de su empresa, por ejemplo). Todo lo que MUESTRA o EXPORTA el correo de
 * una licencia pasa por acá: `license_email ?? contact.email`. Una hija de
 * módulo sin correo propio hereda el de la madre (la venta es la madre).
 *
 * `distinto` enciende la marca en la pantalla: el correo de la licencia no es
 * el del alumno. Se compara sin mayúsculas.
 *
 * Quién lo ve: el mismo que ve el correo del alumno. Ni más ni menos.
 */
export function correoDeLicencia(input: {
  licenseEmail: string | null;
  parentLicenseEmail?: string | null;
  contactEmail: string | null;
}): { email: string | null; distinto: boolean } {
  const propio = normalizarCorreo(input.licenseEmail) ?? normalizarCorreo(input.parentLicenseEmail);
  const delAlumno = normalizarCorreo(input.contactEmail);
  if (!propio) return { email: input.contactEmail, distinto: false };
  return { email: propio, distinto: propio !== delAlumno };
}
