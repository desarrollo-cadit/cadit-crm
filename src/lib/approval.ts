/**
 * 031 (T037) — La regla de aprobación, PURA.
 *
 * Vivía en `src/server/grading.ts`, que importa la base: la escolaridad
 * (`src/lib/escolaridad.ts`) tiene que decidir estados con ESTA regla —no con
 * una copia— y seguir siendo pura. Se mudó sin cambiar una línea, y
 * `grading.ts` la re-exporta para que ningún llamador se entere.
 *
 * Nada de este archivo lee la base ni el reloj.
 */

export type ApprovalState = "aprobado" | "reprobado" | "pendiente";

/**
 * 030 — El estado de un MÓDULO de especialización: `ApprovalState` más
 * `sin_datos`, el mismo nombre que el legajo (013) usa para lo mismo.
 * `ApprovalState` no se amplía: la planilla de la cohorte sigue con su
 * default optimista, que ahí está bien. Ver `estadoDeModulo`.
 */
export type ModuleState = ApprovalState | "sin_datos";

/* ============================================================
 * La regla, pura
 * ============================================================ */

/**
 * Estado de aprobación de un alumno.
 *
 * Tres reglas que no son negociables:
 *
 * 1. Una evaluación obligatoria SIN corregir deja al alumno en `pendiente`,
 *    nunca en `reprobado` (FR-005). Marcar como reprobado a quien todavía no
 *    fue evaluado es acusarlo de algo que no pasó.
 * 2. La asistencia insuficiente reprueba aunque las notas estén todas bien, y
 *    viceversa: se cruzan los dos criterios (FR-004).
 * 3. `reprobado` gana sobre `pendiente`: si ya desaprobó una obligatoria, que
 *    falte corregir otra no lo salva.
 */
export function approvalState(
  results: (boolean | null)[],
  attendancePct: number | null,
  minAttendancePct: number | null
): { state: ApprovalState; reasons: string[] } {
  const reasons: string[] = [];

  const reprobadas = results.filter((r) => r === false).length;
  const pendientes = results.filter((r) => r === null).length;

  const asistenciaExigida = minAttendancePct !== null;
  const asistenciaInsuficiente =
    asistenciaExigida && attendancePct !== null && attendancePct < minAttendancePct;
  const asistenciaSinDatos = asistenciaExigida && attendancePct === null;

  if (reprobadas > 0) {
    reasons.push(
      reprobadas === 1
        ? "Desaprobó una evaluación obligatoria"
        : `Desaprobó ${reprobadas} evaluaciones obligatorias`
    );
  }
  if (asistenciaInsuficiente) {
    reasons.push(`Asistencia ${attendancePct}% (mínimo ${minAttendancePct}%)`);
  }
  if (reprobadas > 0 || asistenciaInsuficiente) {
    return { state: "reprobado", reasons };
  }

  if (pendientes > 0) {
    reasons.push(
      pendientes === 1
        ? "Falta corregir una evaluación"
        : `Faltan corregir ${pendientes} evaluaciones`
    );
  }
  if (asistenciaSinDatos) {
    reasons.push("Todavía no hay asistencia registrada");
  }
  if (pendientes > 0 || asistenciaSinDatos) {
    return { state: "pendiente", reasons };
  }

  return { state: "aprobado", reasons: [] };
}

/**
 * 028 (DV-005, FR-016) — El estado de una ESPECIALIZACIÓN, compuesto sobre
 * el de sus módulos.
 *
 * `approvalState()` no se toca: corre tal cual está sobre cada inscripción de
 * módulo, y no sabe ni necesita saber que hay un programa arriba. Lo que
 * compone es esta función, y sólo sobre estados ya calculados — no camina el
 * árbol ni consulta nada. QUIÉN la llama, recorriendo las inscripciones
 * hijas, es trabajo de la fase 2.
 *
 * **Por qué existe la lista vacía como caso propio (DV-005)**: una madre PUEDE
 * existir sin hijas todavía creadas — se vende y se paga el paquete antes de
 * que la academia arme el detalle de los módulos. Si el estado de esa madre
 * se calculara con `approvalState([], null, null)`, el default optimista
 * devolvería `aprobado`: el sistema afirmaría que alguien aprobó una
 * especialización de la que no se cargó un solo módulo.
 *
 * Ese default está bien en la planilla de cohorte y es falso cuando se afirma
 * algo sobre una persona. Es exactamente la trampa que en el legajo (013)
 * obligó a inventar `sin_datos`, y que CLAUDE.md deja anotada como ya
 * conocida. Acá se paga con tres líneas y un test.
 */
export function programApprovalState(childStates: ModuleState[]): {
  state: ApprovalState;
  reasons: string[];
} {
  if (childStates.length === 0) {
    return {
      state: "pendiente",
      reasons: ["Todavía no hay ningún módulo cargado en la especialización"],
    };
  }

  const reprobados = childStates.filter((s) => s === "reprobado").length;
  if (reprobados > 0) {
    return {
      state: "reprobado",
      reasons: [
        reprobados === 1 ? "Reprobó un módulo" : `Reprobó ${reprobados} módulos`,
      ],
    };
  }

  /**
   * 030 — Un módulo `sin_datos` deja la especialización en `pendiente`: no
   * reprueba a nadie —nadie cargó nada que lo acuse—, pero tampoco la deja
   * certificable. Se dice aparte de "falta aprobar", porque lo que falta no
   * es que la persona apruebe sino que alguien cargue el dato.
   */
  const reasons: string[] = [];
  const sinDatos = childStates.filter((s) => s === "sin_datos").length;
  if (sinDatos > 0) {
    reasons.push(
      sinDatos === 1
        ? "Un módulo sin datos: nadie cargó evaluaciones ni asistencia"
        : `${sinDatos} módulos sin datos: nadie cargó evaluaciones ni asistencia`
    );
  }

  // FR-017 — un módulo que todavía no empezó deja `pendiente`, jamás
  // `reprobado`. Sobre ocho meses de cursada eso es la norma, no el matiz.
  const pendientes = childStates.filter((s) => s === "pendiente").length;
  if (pendientes > 0) {
    reasons.push(
      pendientes === 1
        ? "Falta aprobar un módulo"
        : `Faltan aprobar ${pendientes} módulos`
    );
  }

  if (reasons.length > 0) return { state: "pendiente", reasons };

  return { state: "aprobado", reasons: [] };
}

/**
 * 030 — La razón que nombra el módulo que frena el general (SC-010), con el
 * estado dicho en palabras: `sin_datos` es un identificador, no una frase.
 */
export function razonDeModulo(label: string, state: ModuleState): string {
  return `${label}: ${state === "sin_datos" ? "sin datos" : state}`;
}

/* ============================================================
 * 028 (FR-022/FR-024/FR-025) — La dispensa de asistencia
 * ============================================================ */

/**
 * Una dispensa ya verificada como VIGENTE (`dispensaVigente`, fase 1), con lo
 * que hace falta para poder explicarla en una frase.
 *
 * `otorgadaPor` viene resuelto a nombre por quien consulta: la columna guarda
 * un id de `user` y el `set null` de la baja hace que un día pueda faltar.
 * Que falte es un estado real, no un error, y se dice como tal.
 */
export type DispensaDeAsistencia = {
  otorgadaEl: Date;
  /** Nombre de quien la otorgó. `null` = el autor ya no está en el sistema. */
  otorgadaPor: string | null;
  motivo: string;
};

/** D/M/AAAA en UTC: el texto no puede depender de la máquina que lo arma. */
function fechaCorta(d: Date): string {
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`;
}

/**
 * El motivo que viaja en `approvalReasons` (FR-025).
 *
 * `observacion` es la frase que la compuerta de asistencia habría dicho —
 * "Asistencia 62% (mínimo 80%)"—, y se conserva ENTERA: el certificado congela
 * la asistencia real (FR-026) y la pantalla tiene que mostrar el mismo número.
 * Inflar el porcentaje para que la aprobación "cierre" sería falsificar el
 * dato; el hecho es que faltó y que alguien lo habilitó igual, y las dos
 * mitades quedan escritas en la misma línea.
 */
function motivoDeDispensa(observacion: string, d: DispensaDeAsistencia): string {
  const quien = d.otorgadaPor
    ? `por ${d.otorgadaPor}`
    : "por un usuario que ya no está en el sistema";
  return `${observacion} — dispensa otorgada ${quien} el ${fechaCorta(d.otorgadaEl)}: ${d.motivo}`;
}

/**
 * 028 (FR-024) — `approvalState()` de un MÓDULO, con la dispensa adentro.
 *
 * `approvalState()` no se toca: es la regla por cohorte y la usan la planilla,
 * el legajo y el portal. Lo que hace esta función es envolverla para el único
 * caso que el ciclo 028 agrega, y hacerlo de manera que sin dispensa devuelva
 * **exactamente** el mismo objeto (FR-032).
 *
 * La dispensa saltea **sólo la compuerta de asistencia**:
 *
 * - una evaluación obligatoria en `false` sigue reprobando —perdona faltas, no
 *   trabajos—, y una en `null` sigue dejando `pendiente` (FR-017);
 * - la asistencia deja de pesar tanto cuando está por debajo del mínimo como
 *   cuando no hay una sola marca: con el módulo ya habilitado, quedar
 *   `pendiente` para siempre por una lista que nadie tomó es el mismo
 *   resultado equivocado por otro camino.
 *
 * La compuerta no se reimplementa: se le pregunta a `approvalState` con la
 * lista de evaluaciones VACÍA, donde lo único que puede observar es la
 * asistencia. Así el umbral vive en un solo lugar y no pueden divergir.
 */
export function moduleApprovalState(
  results: (boolean | null)[],
  attendancePct: number | null,
  minAttendancePct: number | null,
  dispensa: DispensaDeAsistencia | null
): { state: ApprovalState; reasons: string[] } {
  const conCompuerta = approvalState(results, attendancePct, minAttendancePct);
  if (!dispensa) return conCompuerta;

  const compuerta = approvalState([], attendancePct, minAttendancePct);
  // Una dispensa que no tenía nada que perdonar no ensucia la pantalla: quien
  // cumplió la asistencia no necesita que le expliquen por qué aprobó.
  if (compuerta.reasons.length === 0) return conCompuerta;

  const sinCompuerta = approvalState(results, null, null);
  return {
    state: sinCompuerta.state,
    reasons: [
      ...sinCompuerta.reasons,
      motivoDeDispensa(compuerta.reasons[0]!, dispensa),
    ],
  };
}

/**
 * 030 — El estado de un módulo cuando lo que se afirma es sobre una PERSONA:
 * el recorrido, el certificado general, el legajo y el portal.
 *
 * `sin_datos` = el módulo no tiene evaluaciones obligatorias que mirar Y no
 * hay asistencia registrada para esa inscripción. **0% porque nadie pasó
 * lista no es 0% porque no vino**: `attendanceByModule` y
 * `attendancePercentage` ya devuelven `null` —no 0— cuando nadie tomó lista,
 * y eso es lo que se lee acá.
 *
 * Con cualquiera de los dos datos, la regla es EXACTAMENTE
 * `moduleApprovalState`, dispensa incluida. Sin ninguno, la dispensa no lo
 * salva: perdona faltas, no inventa notas.
 *
 * La planilla de la cohorte (`cohortGrading`) NO pasa por acá: ahí el
 * coordinador sabe que todavía no cargó nada, y el default optimista está
 * bien (CLAUDE.md, "Cuidado con los defaults optimistas").
 */
export function estadoDeModulo(
  results: (boolean | null)[],
  attendancePct: number | null,
  minAttendancePct: number | null,
  dispensa: DispensaDeAsistencia | null
): { state: ModuleState; reasons: string[] } {
  if (results.length === 0 && attendancePct === null) {
    return {
      state: "sin_datos",
      reasons: ["Nadie cargó todavía evaluaciones obligatorias ni asistencia de este módulo"],
    };
  }
  return moduleApprovalState(results, attendancePct, minAttendancePct, dispensa);
}
