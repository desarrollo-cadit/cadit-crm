import type { HrefAlumno, HrefProfesor } from "@/lib/nav";

/**
 * 027 (FR-009/FR-011) — La guía del portal: **su propio contenido**.
 *
 * No es una versión recortada de la del staff, y no comparte módulo con ella a
 * propósito. Es el Principio 3 del roadmap —cada audiencia con su superficie—
 * y la misma decisión que ya se tomó con `PortalNav`, que no reusa `AppNav`:
 * compartir el módulo sería compartir el vocabulario, y el `if` que separa a
 * las dos audiencias terminaría adentro de un archivo que las dos leen.
 *
 * Además hay una asimetría de fondo que hace que reusar sea directamente malo.
 * La guía del staff tiene una sección de "esto lo hace otro rol" porque el
 * staff tiene un problema de escalamiento interno —a quién le pido—. Quien
 * cursa no lo tiene: su camino es uno solo, escribirle a la academia.
 * Enumerarle los permisos internos sería mostrarle el organigrama de la
 * academia a alguien de afuera, sin ningún beneficio.
 *
 * Y el idioma cambia. El staff lee "registrar pagos"; quien cursa lee "lo que
 * debés y lo que ya pagaste". Acá no se nombra un permiso, ni un rol, ni una
 * pantalla del panel: nada de eso significa algo para quien lee.
 *
 * Los dos registros están tipados por el `href` de cada ítem del menú del
 * portal, así que **agregar una pantalla al menú sin explicarla no compila**:
 * el mismo mecanismo que protege la guía del staff, aplicado acá.
 */

export const GUIA_PORTAL_ALUMNO: Record<HrefAlumno, string> = {
  "/portal":
    "Resumen de tus cursos: próxima clase, avance y pendientes.",
  "/portal/cuenta":
    "Cuotas, pagos registrados, saldo y próximo vencimiento. Si algún importe no coincide con lo que pagaste, escribinos y lo revisamos.",
  "/portal/certificados":
    "Los certificados de los cursos que finalizaste. Cada uno incluye un enlace público de verificación: podés compartirlo con una empresa sin otorgarle acceso a otros datos personales.",
  "/portal/cursos-offline":
    "Las guías teóricas y los cuestionarios de los cursos asignados. Cada cuestionario se corrige al enviarlo: muestra el puntaje, si quedó aprobado y cuántos intentos quedan.",
};

export const GUIA_PORTAL_PROFESOR: Record<HrefProfesor, string> = {
  "/portal/dictado":
    "Las cohortes a tu cargo. Desde acá registrás la asistencia de cada clase, cargás los resultados de las evaluaciones, revisás las entregas y publicás material.",
  "/portal/horas":
    "Las horas que dictaste, con el total general y el de cada cohorte. Sirve como referencia para controlar la liquidación.",
};

/**
 * Lo que hace falta decir además de lo que hay en el menú.
 *
 * Va acá y no escrito en la pantalla porque las dos audiencias reciben el
 * mismo cierre y no tiene sentido escribirlo dos veces: la única salida de
 * quien lee esto es hablar con la academia, y decirlo es más útil que
 * cualquier lista.
 */
export const CIERRE_PORTAL =
  "¿No encontrás lo que buscás? Escribinos por WhatsApp o por correo y te ayudamos.";
