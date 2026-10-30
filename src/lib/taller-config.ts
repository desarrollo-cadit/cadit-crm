/**
 * 2026-10-29 — Configuración de un GRUPO de curso de tipo taller: ¿tiene
 * evaluaciones? ¿emite certificado?
 *
 * Una sola regla, pura, para los tres paneles y para el backend. Aplica solo a
 * grupos de cursos `kind = 'taller'` que se cursan como cualquier otro, es
 * decir SIN `registration_status` (las ediciones de Marketing siguen afuera de
 * todo, ver `src/server/workshop-scope.ts`). Para cualquier otro grupo las dos
 * preguntas valen "sí", sin importar lo guardado en `cohort.has_assessments` /
 * `cohort.issues_certificate`: un curso común no se puede configurar así.
 *
 * Decisiones:
 * - Sin evaluaciones no hay RESULTADO: ni "Reprobado" ni "Resultado pendiente"
 *   por falta de notas de algo que no existe. El estado de aprobación del grupo
 *   es `sin_datos` ("no aplica"); ver `resultadoDeCursada` y
 *   `estadoDeAprobacionDeCursada`. La asistencia sigue contándose y mostrándose.
 * - Apagar "tiene evaluaciones" con evaluaciones ya cargadas es un 409
 *   (`grupo_con_evaluaciones`): nunca se borran datos en silencio.
 * - Apagar "emite certificado" NO borra ni anula lo emitido: los certificados
 *   vigentes siguen vigentes (descarga y /verificar); solo se frena la emisión
 *   NUEVA (`grupo_sin_certificado`).
 *
 * Puro: no lee la base ni el reloj.
 */

export type ConfigDeGrupo = {
  /** `course.kind` del curso del grupo. */
  courseKind: string | null | undefined;
  /** `cohort.registration_status`: no nulo = edición de Marketing. */
  registrationStatus?: string | null;
  /** Lo guardado en `cohort.has_assessments` (default true). */
  hasAssessments?: boolean | null;
  /** Lo guardado en `cohort.issues_certificate` (default true). */
  issuesCertificate?: boolean | null;
};

/** ¿Es un grupo configurable? Taller cursable (no edición de Marketing). */
export function esTallerConfigurable(g: Pick<ConfigDeGrupo, "courseKind" | "registrationStatus">): boolean {
  return g.courseKind === "taller" && (g.registrationStatus ?? null) === null;
}

export function grupoTieneEvaluaciones(g: ConfigDeGrupo): boolean {
  if (!esTallerConfigurable(g)) return true;
  return g.hasAssessments !== false;
}

export function grupoEmiteCertificado(g: ConfigDeGrupo): boolean {
  if (!esTallerConfigurable(g)) return true;
  return g.issuesCertificate !== false;
}

/** Códigos de error uniformes del backend. */
export const GRUPO_SIN_EVALUACIONES = {
  status: 409 as const,
  code: "grupo_sin_evaluaciones" as const,
  message: "Este grupo no tiene evaluaciones",
};
export const GRUPO_SIN_CERTIFICADO = {
  status: 409 as const,
  code: "grupo_sin_certificado" as const,
  message: "Este grupo no emite certificado",
};
export const GRUPO_CON_EVALUACIONES = {
  status: 409 as const,
  code: "grupo_con_evaluaciones" as const,
  message:
    "El grupo ya tiene evaluaciones cargadas: eliminalas antes de indicar que no tiene evaluaciones",
};

/**
 * Lo que se guarda al dar de alta o editar: un grupo que no es un taller
 * configurable se fuerza a "sí" (ignora lo que mande el pedido).
 */
export function configAGuardar(
  g: Pick<ConfigDeGrupo, "courseKind" | "registrationStatus">,
  pedido: { hasAssessments?: boolean; issuesCertificate?: boolean }
): { hasAssessments: boolean; issuesCertificate: boolean } {
  if (!esTallerConfigurable(g)) return { hasAssessments: true, issuesCertificate: true };
  return {
    hasAssessments: pedido.hasAssessments ?? true,
    issuesCertificate: pedido.issuesCertificate ?? true,
  };
}
