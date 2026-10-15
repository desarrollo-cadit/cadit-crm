/**
 * 032 — El TIPO de un curso: curso, módulo o taller.
 *
 * Vive en `lib/` y no en el esquema ni en `server/` porque lo usan las dos
 * puntas: el esquema declara la columna con esta lista y la pantalla del
 * staff dibuja los filtros con ella. Importar `schema.ts` desde un componente
 * cliente arrastraría drizzle al navegador.
 *
 * **El tipo clasifica; no cambia cómo funcionan las cohortes.** Lo único que
 * gobierna es la visibilidad: en el catálogo público (FR-004) y en los
 * selectores de curso (un módulo no se ofrece por defecto).
 */

export const COURSE_KINDS = ["curso", "modulo", "taller"] as const;
export type CourseKind = (typeof COURSE_KINDS)[number];

export const COURSE_KIND_LABEL: Record<CourseKind, string> = {
  curso: "Curso",
  modulo: "Módulo",
  taller: "Taller",
};

/**
 * 032 (FR-004) — Si un curso sale en el catálogo público de la web.
 *
 * Un módulo NO sale aunque esté marcado como publicado: es una etapa de una
 * especialización, no un producto que la academia vende suelto. La misma
 * regla, en SQL, es `condicionDeCatalogo()` de `server/public-catalog.ts`.
 */
export function apareceEnCatalogo(course: { published: boolean; kind: CourseKind }): boolean {
  return course.published && course.kind !== "modulo";
}

/** 032 (FR-006) — Largo máximo del nombre de un módulo nuevo. */
export const MODULE_NAME_MAX = 120;

export type NombreDeModulo = { ok: true; nombre: string } | { ok: false; message: string };

/**
 * 032 (FR-006) — El nombre de un "Módulo nuevo": obligatorio, sin espacios
 * sobrantes y hasta 120 caracteres (el mismo tope que el nombre de un curso,
 * porque termina siéndolo).
 */
export function validarNombreDeModulo(raw: unknown): NombreDeModulo {
  const nombre = typeof raw === "string" ? raw.trim() : "";
  if (!nombre) return { ok: false, message: "El nombre del módulo es obligatorio." };
  if (nombre.length > MODULE_NAME_MAX) {
    return {
      ok: false,
      message: `El nombre del módulo puede tener hasta ${MODULE_NAME_MAX} caracteres.`,
    };
  }
  return { ok: true, nombre };
}

export type CursoDelAlta =
  | { ok: true; via: "existente"; courseId: string }
  | { ok: true; via: "nuevo"; nombre: string }
  | { ok: false; message: string };

/**
 * 032 (FR-005) — De qué curso va a colgar una cohorte que se da de alta.
 *
 * - **Curso existente**: el comportamiento de siempre, con su `courseId`.
 * - **Módulo nuevo**: se crea un curso de tipo módulo con ese nombre. Solo
 *   tiene sentido dentro de una especialización: una cohorte común atada a un
 *   curso inventado en el momento es exactamente el catálogo huérfano que
 *   esta fase vino a limpiar.
 *
 * Las dos cosas a la vez, o ninguna, es un pedido ambiguo y se rechaza.
 */
export function resolverCursoDelAlta(input: {
  courseId?: string | null;
  newModuleName?: string | null;
  parentCohortId?: string | null;
}): CursoDelAlta {
  const tieneCurso = Boolean(input.courseId);
  const pideNuevo = input.newModuleName !== undefined && input.newModuleName !== null;

  if (tieneCurso && pideNuevo) {
    return { ok: false, message: "Elegí un curso existente o un módulo nuevo, no los dos." };
  }
  if (pideNuevo) {
    if (!input.parentCohortId) {
      return {
        ok: false,
        message: "Un módulo nuevo se crea desde la pestaña de su especialización.",
      };
    }
    const nombre = validarNombreDeModulo(input.newModuleName);
    if (!nombre.ok) return nombre;
    return { ok: true, via: "nuevo", nombre: nombre.nombre };
  }
  if (tieneCurso) return { ok: true, via: "existente", courseId: input.courseId! };
  return { ok: false, message: "Falta elegir el curso." };
}

/**
 * 032 — Los cursos que ofrece un selector (cohorte común, formulario de
 * captación).
 *
 * Los de tipo módulo no se ofrecen por defecto: inscribir a alguien
 * directamente en un módulo ya está prohibido desde la 028, y ofrecerlos
 * llenaría el selector de "Módulo 1" de cada especialización. El que ya está
 * elegido se conserva siempre: si no, editar una cohorte atada a un módulo
 * mostraría el selector vacío y el próximo Guardar la cambiaría de curso.
 */
export function cursosParaSelector<T extends { id: string; kind: CourseKind }>(
  courses: readonly T[],
  opciones: { incluirModulos?: boolean; seleccionado?: string | null } = {}
): T[] {
  if (opciones.incluirModulos) return [...courses];
  return courses.filter((c) => c.kind !== "modulo" || c.id === opciones.seleccionado);
}
