import { randomBytes } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import {
  attendanceByModule,
  attendancePercentage,
  resolveMinAttendance,
} from "@/server/attendance";
import {
  dispensaVigente,
  etiquetaDeModulo,
  listarHijas,
  listarModulos,
  lugaresDelPrograma,
  modulosConOrdinal,
} from "@/server/program-modules";

/**
 * 010 — Evaluación y certificados.
 *
 * La escala es APROBADO / NO APROBADO (DV-001): no hay nota numérica y por lo
 * tanto no hay ponderación. Un alumno aprueba la cohorte cuando aprobó TODAS
 * las evaluaciones obligatorias Y cumple el mínimo de asistencia de 009.
 */

export type ApprovalState = "aprobado" | "reprobado" | "pendiente";

export type StudentGrading = {
  enrollmentId: string;
  contactName: string;
  /** Resultado por evaluación: `true`/`false`/`null` (pendiente). */
  results: Record<string, boolean | null>;
  attendancePct: number | null;
  state: ApprovalState;
  /**
   * Qué falló, para poder decírselo al alumno sin que nadie tenga que
   * reconstruirlo mirando dos pantallas (FR-004).
   */
  reasons: string[];
  certificate: { code: string; issuedAt: string; revokedAt: string | null } | null;
};

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
export function programApprovalState(childStates: ApprovalState[]): {
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

  // FR-017 — un módulo que todavía no empezó deja `pendiente`, jamás
  // `reprobado`. Sobre ocho meses de cursada eso es la norma, no el matiz.
  const pendientes = childStates.filter((s) => s === "pendiente").length;
  if (pendientes > 0) {
    return {
      state: "pendiente",
      reasons: [
        pendientes === 1
          ? "Falta aprobar un módulo"
          : `Faltan aprobar ${pendientes} módulos`,
      ],
    };
  }

  return { state: "aprobado", reasons: [] };
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
 * Arma la dispensa vigente de una inscripción, o `null`.
 *
 * La vigencia la decide `dispensaVigente` (fase 1) y no esta función: si cada
 * pantalla mirara las columnas por su cuenta, una acabaría honrando una
 * dispensa revocada que otra ya descartó.
 */
export function dispensaDeInscripcion(fila: {
  attendanceWaiverAt: Date | null;
  attendanceWaiverReason: string | null;
  attendanceWaiverRevokedAt: Date | null;
  attendanceWaiverByName?: string | null;
}): DispensaDeAsistencia | null {
  if (!dispensaVigente(fila)) return null;
  return {
    otorgadaEl: fila.attendanceWaiverAt!,
    otorgadaPor: fila.attendanceWaiverByName ?? null,
    motivo: fila.attendanceWaiverReason!.trim(),
  };
}

/**
 * Código público del certificado. Aleatorio y NO secuencial (FR-010): con un
 * correlativo, cualquiera que tenga un código puede recorrer el endpoint de
 * verificación y listar a todos los egresados de la academia.
 *
 * Alfabeto sin `0/O` ni `1/I/L`: el código se dicta por teléfono y se copia a
 * mano de un papel.
 */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateCertificateCode(): string {
  const bytes = randomBytes(12);
  const chars = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]);
  // Formato XXXX-XXXX-XXXX: más fácil de leer y de dictar.
  return `${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}-${chars.slice(8, 12).join("")}`;
}

/* ============================================================
 * Operaciones
 * ============================================================ */

export type GradingResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: 404 | 409 | 422; code: string; message: string };

export type AssessmentDto = {
  id: string;
  name: string;
  position: number;
  required: boolean;
};

export async function listAssessments(
  organizationId: string,
  cohortId: string
): Promise<AssessmentDto[]> {
  const rows = await getDb()
    .select()
    .from(schema.assessment)
    .where(
      scoped(
        schema.assessment.organizationId,
        organizationId,
        eq(schema.assessment.cohortId, cohortId)
      )
    )
    .orderBy(asc(schema.assessment.position));
  return rows.map((a) => ({
    id: a.id,
    name: a.name,
    position: a.position,
    required: a.required,
  }));
}

export async function createAssessment(
  organizationId: string,
  cohortId: string,
  input: { name: string; required?: boolean }
): Promise<GradingResult<AssessmentDto>> {
  const db = getDb();

  const cohortRows = await db
    .select({ id: schema.cohort.id })
    .from(schema.cohort)
    .where(scoped(schema.cohort.organizationId, organizationId, eq(schema.cohort.id, cohortId)))
    .limit(1);
  if (!cohortRows[0]) {
    return { ok: false, status: 404, code: "not_found", message: "Cohorte no encontrada" };
  }

  const existing = await listAssessments(organizationId, cohortId);
  const inserted = await db
    .insert(schema.assessment)
    .values({
      id: newId("assessment"),
      organizationId,
      cohortId,
      name: input.name,
      position: existing.length,
      required: input.required ?? true,
    })
    .returning();

  const a = inserted[0]!;
  return {
    ok: true,
    data: { id: a.id, name: a.name, position: a.position, required: a.required },
  };
}

/** Carga o corrige el resultado de un alumno. Volver a cargar CORRIGE. */
export async function recordResults(
  organizationId: string,
  assessmentId: string,
  entries: { enrollmentId: string; passed: boolean | null; notes?: string | null }[],
  recordedBy?: string | null
): Promise<GradingResult<{ recorded: number }>> {
  const db = getDb();

  const rows = await db
    .select({ id: schema.assessment.id })
    .from(schema.assessment)
    .where(
      scoped(
        schema.assessment.organizationId,
        organizationId,
        eq(schema.assessment.id, assessmentId)
      )
    )
    .limit(1);
  if (!rows[0]) {
    return { ok: false, status: 404, code: "not_found", message: "Evaluación no encontrada" };
  }

  const now = new Date();
  for (const e of entries) {
    await db
      .insert(schema.assessmentResult)
      .values({
        id: newId("assessmentResult"),
        organizationId,
        assessmentId,
        enrollmentId: e.enrollmentId,
        passed: e.passed,
        notes: e.notes ?? null,
        recordedBy: recordedBy ?? null,
      })
      .onConflictDoUpdate({
        target: [schema.assessmentResult.assessmentId, schema.assessmentResult.enrollmentId],
        set: { passed: e.passed, notes: e.notes ?? null, updatedAt: now },
      });
  }

  return { ok: true, data: { recorded: entries.length } };
}

/* ============================================================
 * 014 (T013, DV-009) — Copiar las evaluaciones de otra cohorte
 * ============================================================
 *
 * Las evaluaciones cuelgan de la COHORTE, no del curso, y eso está bien: es lo
 * que impide que tocar un curso altere una cohorte en marcha. El precio es que
 * cada cohorte nueva nace vacía — hoy, las 41 lo están.
 *
 * Copiar y NO heredar es la decisión: una copia se hace una vez, en un momento
 * elegido, y después las dos cohortes son independientes para siempre. Heredar
 * del curso sería justo lo contrario.
 *
 * **No se copian los resultados**: son de las personas de la otra cohorte.
 */

export type CopyPlan = {
  /** Las que hay que insertar, ya con su posición final. */
  aCopiar: { name: string; required: boolean; position: number }[];
  /** Las que ya existían en el destino, por nombre. */
  omitidas: string[];
  /** Qué contar cuando no se copió nada. Nunca es un error. */
  aviso: string | null;
};

/** El nombre se compara sin mayúsculas, sin acentos y sin espacios de sobra. */
function claveDeNombre(name: string): string {
  return name
    .trim()
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ");
}

/**
 * Decide qué copiar. **Pura**: sin base de datos, así que la regla se puede
 * probar entera.
 *
 * Constitución IV — copiar dos veces no duplica. La llave es el nombre
 * normalizado, no el `id`: la copia crea filas nuevas, así que el `id` nunca
 * coincide y compararlo dejaría duplicar sin límite.
 */
export function planAssessmentCopy(
  origen: readonly AssessmentDto[],
  destino: readonly AssessmentDto[]
): CopyPlan {
  if (origen.length === 0) {
    return {
      aCopiar: [],
      omitidas: [],
      aviso: "La cohorte de origen no tiene evaluaciones cargadas: no hay nada que copiar.",
    };
  }

  const yaEstan = new Set(destino.map((a) => claveDeNombre(a.name)));
  const aCopiar: CopyPlan["aCopiar"] = [];
  const omitidas: string[] = [];

  // Se agregan DESPUÉS de las que ya hay, respetando el orden del origen.
  let position = destino.reduce((max, a) => Math.max(max, a.position + 1), 0);

  for (const a of [...origen].sort((x, y) => x.position - y.position)) {
    const clave = claveDeNombre(a.name);
    // El `has` mira también las de esta misma tanda: un origen con dos
    // evaluaciones llamadas igual copia una sola.
    if (yaEstan.has(clave)) {
      omitidas.push(a.name);
      continue;
    }
    yaEstan.add(clave);
    aCopiar.push({ name: a.name.trim(), required: a.required, position: position++ });
  }

  return {
    aCopiar,
    omitidas,
    aviso:
      aCopiar.length === 0
        ? "La cohorte ya tenía todas esas evaluaciones: no se copió ninguna."
        : null,
  };
}

export type CopyAssessmentsDto = {
  copiadas: number;
  omitidas: string[];
  aviso: string | null;
  assessments: AssessmentDto[];
};

/**
 * Copia las evaluaciones de una cohorte a otra: nombre, orden y si es
 * obligatoria. **Nunca los resultados.**
 */
export async function copyAssessments(
  organizationId: string,
  desdeCohorteId: string,
  haciaCohorteId: string
): Promise<GradingResult<CopyAssessmentsDto>> {
  if (desdeCohorteId === haciaCohorteId) {
    return {
      ok: false,
      status: 422,
      code: "misma_cohorte",
      message: "El origen y el destino son la misma cohorte",
    };
  }

  const db = getDb();

  // Las dos tienen que existir Y ser de esta organización. Se piden juntas:
  // dos consultas darían el mismo resultado con el doble de viajes.
  const cohortes = await db
    .select({ id: schema.cohort.id })
    .from(schema.cohort)
    .where(
      scoped(
        schema.cohort.organizationId,
        organizationId,
        inArray(schema.cohort.id, [desdeCohorteId, haciaCohorteId])
      )
    );
  const encontradas = new Set(cohortes.map((c) => c.id));
  if (!encontradas.has(haciaCohorteId)) {
    return { ok: false, status: 404, code: "not_found", message: "Cohorte no encontrada" };
  }
  if (!encontradas.has(desdeCohorteId)) {
    return {
      ok: false,
      status: 404,
      code: "origen_not_found",
      message: "La cohorte de origen no existe",
    };
  }

  const [origen, destino] = await Promise.all([
    listAssessments(organizationId, desdeCohorteId),
    listAssessments(organizationId, haciaCohorteId),
  ]);

  const plan = planAssessmentCopy(origen, destino);

  if (plan.aCopiar.length > 0) {
    await db.insert(schema.assessment).values(
      plan.aCopiar.map((a) => ({
        id: newId("assessment"),
        organizationId,
        cohortId: haciaCohorteId,
        name: a.name,
        position: a.position,
        required: a.required,
      }))
    );
  }

  return {
    ok: true,
    data: {
      copiadas: plan.aCopiar.length,
      omitidas: plan.omitidas,
      aviso: plan.aviso,
      assessments: await listAssessments(organizationId, haciaCohorteId),
    },
  };
}

/* ============================================================
 * 028 (FR-016/FR-030) — La especialización, compuesta sobre sus módulos
 * ============================================================ */

export type ModuleGrading = {
  /** La inscripción HIJA: es contra ella que se registró todo. */
  enrollmentId: string;
  cohortId: string | null;
  cohortName: string;
  courseName: string;
  /** El orden que decidió la academia (FR-002). `null` = dato sin cargar. */
  position: number | null;
  /**
   * 1..n según el lugar del módulo en el PROGRAMA, no en la lista de esta
   * persona. `null` = sin `position` cargada, o un módulo que la camada no
   * tiene entre los suyos.
   */
  ordinal: number | null;
  /** "Módulo 2 — Revit Estructura", ya armado con el ordinal del programa. */
  label: string;
  /** La camada del módulo que efectivamente cursó. */
  camadaId: string | null;
  /** `true` = lo cursó con OTRA camada: recursada o baja voluntaria (US4). */
  otraCamada: boolean;
  startDate: string | null;
  endDate: string | null;
  /** El porcentaje REAL, nunca inflado por la dispensa (FR-026). */
  attendancePct: number | null;
  minAttendancePct: number | null;
  state: ApprovalState;
  reasons: string[];
  /** `true` cuando este módulo tiene una dispensa vigente (FR-022). */
  dispensada: boolean;
};

export type ProgramGradingDto = {
  /** La inscripción MADRE. */
  enrollmentId: string;
  cohortId: string | null;
  state: ApprovalState;
  reasons: string[];
  modules: ModuleGrading[];
};

/**
 * 028 (FR-016) — El estado de una especialización, caminando el recorrido.
 *
 * Es la mitad que faltaba: `programApprovalState` (fase 1) es pura y compone
 * estados ya calculados; acá se cargan las hijas, se resuelve el estado de
 * **cada una como si fuera una cohorte cualquiera** —porque lo es— y recién
 * después se compone.
 *
 * Tres cosas que esta función NO hace, y no por olvido:
 *
 * - **No agrega la asistencia.** No existe "la asistencia de la
 *   especialización": cada módulo tiene su cronograma y su propio mínimo
 *   (regla 5, DV-002). `attendanceByModule` devuelve un número por módulo y
 *   ninguno por el programa.
 * - **No toca `approvalState()`.** El módulo se evalúa con la misma regla que
 *   cualquier cohorte, más la dispensa (`moduleApprovalState`), y esa regla no
 *   sabe ni necesita saber que hay un programa arriba.
 * - **No bloquea nada.** Reprobar un módulo no impide los demás (regla 2,
 *   FR-018): el sistema registra, la academia decide quién recursa.
 *
 * Las razones de la madre nombran el módulo que las causó (SC-010): "faltan
 * aprobar 2 módulos" sin decir cuáles obliga a abrir otra pantalla, que es
 * exactamente lo que la vista de la madre viene a evitar.
 */
export async function programGrading(
  organizationId: string,
  parentEnrollmentId: string
): Promise<ProgramGradingDto | null> {
  const db = getDb();

  const madreRows = await db
    .select({ id: schema.enrollment.id, cohortId: schema.enrollment.cohortId })
    .from(schema.enrollment)
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        eq(schema.enrollment.id, parentEnrollmentId)
      )
    )
    .limit(1);
  const madre = madreRows[0];
  if (!madre) return null;

  const hijas = await listarHijas(organizationId, parentEnrollmentId);

  // DV-005 — una madre sin hijas está `pendiente`, jamás `aprobado`. El
  // paquete se vende y se paga antes de que la academia arme los módulos, y
  // el default optimista de `approvalState([], null, null)` afirmaría que
  // alguien aprobó una especialización de la que no se cargó nada.
  if (hijas.length === 0) {
    const compuesto = programApprovalState([]);
    return { enrollmentId: madre.id, cohortId: madre.cohortId, ...compuesto, modules: [] };
  }

  /**
   * El ORDEN DEL PROGRAMA, que es de donde sale el ordinal de cada módulo.
   *
   * No sale del lugar que el módulo ocupa en la lista de esta persona, y la
   * diferencia no es cosmética: quien nunca cursó el módulo 1 vería su módulo
   * 2 rotulado "Módulo 1". Eso le afirma que está en un lugar donde no está, y
   * hace que esta pantalla y la grilla del staff —que ya numera por el
   * programa— digan cosas distintas de la misma persona.
   *
   * Es la MISMA lectura y la misma regla que `program-staff.ts`: `listarModulos`
   * de la camada madre, `modulosConOrdinal` para el lugar y
   * `lugaresDelPrograma` para poder preguntarlo por cohorte o por curso.
   */
  const modulosDelPrograma = madre.cohortId
    ? modulosConOrdinal(await listarModulos(organizationId, madre.cohortId))
    : [];
  const lugarEnElPrograma = lugaresDelPrograma(
    modulosDelPrograma.map((m) => ({
      cohortId: m.id,
      courseId: m.courseId,
      ordinal: m.ordinal,
    }))
  );

  const cohorteIds = hijas
    .map((h) => h.cohortId)
    .filter((id): id is string => id !== null);
  const inscripcionIds = hijas.map((h) => h.id);

  const [sesiones, marcas, evaluaciones, resultados] = await Promise.all([
    cohorteIds.length
      ? db
          .select({
            id: schema.classSession.id,
            cohortId: schema.classSession.cohortId,
            date: schema.classSession.date,
            canceledAt: schema.classSession.canceledAt,
          })
          .from(schema.classSession)
          .where(
            scoped(
              schema.classSession.organizationId,
              organizationId,
              inArray(schema.classSession.cohortId, cohorteIds)
            )
          )
      : [],
    db
      .select({
        enrollmentId: schema.attendance.enrollmentId,
        classSessionId: schema.attendance.classSessionId,
        status: schema.attendance.status,
      })
      .from(schema.attendance)
      .where(
        scoped(
          schema.attendance.organizationId,
          organizationId,
          inArray(schema.attendance.enrollmentId, inscripcionIds)
        )
      ),
    cohorteIds.length
      ? db
          .select({
            id: schema.assessment.id,
            cohortId: schema.assessment.cohortId,
            required: schema.assessment.required,
          })
          .from(schema.assessment)
          .where(
            scoped(
              schema.assessment.organizationId,
              organizationId,
              inArray(schema.assessment.cohortId, cohorteIds)
            )
          )
      : [],
    db
      .select({
        assessmentId: schema.assessmentResult.assessmentId,
        enrollmentId: schema.assessmentResult.enrollmentId,
        passed: schema.assessmentResult.passed,
      })
      .from(schema.assessmentResult)
      .where(
        scoped(
          schema.assessmentResult.organizationId,
          organizationId,
          inArray(schema.assessmentResult.enrollmentId, inscripcionIds)
        )
      ),
  ]);

  const porModulo = attendanceByModule(
    hijas.map((h) => ({
      enrollmentId: h.id,
      cohortId: h.cohortId,
      enrolledAt: h.enrolledAt,
    })),
    sesiones,
    marcas
  );

  const modules: ModuleGrading[] = hijas.map((h, i) => {
    const minPct = resolveMinAttendance(
      h.cohortMinAttendancePct,
      h.courseMinAttendancePct
    );
    const pct = porModulo.get(h.id) ?? null;

    // Sólo las obligatorias definen la aprobación, y una sin resultado cargado
    // cuenta como pendiente y no como reprobada (FR-017).
    const obligatorias = evaluaciones.filter(
      (a) => a.cohortId === h.cohortId && a.required
    );
    const evaluadas = obligatorias.map(
      (a) =>
        resultados.find((r) => r.assessmentId === a.id && r.enrollmentId === h.id)
          ?.passed ?? null
    );

    const dispensa = dispensaDeInscripcion(h);
    const { state, reasons } = moduleApprovalState(evaluadas, pct, minPct, dispensa);
    const cohortName = h.cohortName ?? h.courseName ?? "Módulo sin nombre";

    const enElPrograma =
      (h.cohortId ? lugarEnElPrograma.get(`cohorte:${h.cohortId}`) : undefined) ??
      (h.courseId ? lugarEnElPrograma.get(`curso:${h.courseId}`) : undefined);
    // Sin lugar en el programa —un módulo que la camada no tiene cargado— se
    // cae al lugar en la propia lista, que es lo único que hay. Es el mismo
    // respaldo que usa la grilla del staff.
    const ordinal = enElPrograma?.ordinal ?? (h.position === null ? null : i + 1);

    return {
      enrollmentId: h.id,
      cohortId: h.cohortId,
      cohortName,
      courseName: h.courseName ?? "—",
      position: h.position,
      ordinal,
      label: etiquetaDeModulo(ordinal, cohortName),
      camadaId: h.parentCohortId,
      // FR-008 — el módulo cursado con otra camada es el escenario que define
      // la fase; que se note en el DTO es lo que permite decirlo en pantalla.
      otraCamada: h.parentCohortId !== null && h.parentCohortId !== madre.cohortId,
      startDate: h.startDate?.toISOString() ?? null,
      endDate: h.endDate?.toISOString() ?? null,
      attendancePct: pct,
      minAttendancePct: minPct,
      state,
      reasons,
      dispensada: dispensa !== null,
    };
  });

  const compuesto = programApprovalState(modules.map((m) => m.state));
  /**
   * SC-010 — las razones nombran el módulo que las causó, con la MISMA
   * etiqueta que ya lleva el módulo: el ordinal del programa, nunca el número
   * guardado en `position`. Con posiciones 10/20/30 —el hueco que alguien deja
   * para poder insertar un módulo en el medio sin renumerar— imprimir la
   * columna diría "Módulo 30" para el tercero de tres, y recontar sobre la
   * lista de esta persona renumeraría al que tiene huecos.
   */
  const culpables = modules.filter((m) =>
    compuesto.state === "reprobado" ? m.state === "reprobado" : m.state === "pendiente"
  );

  return {
    enrollmentId: madre.id,
    cohortId: madre.cohortId,
    state: compuesto.state,
    reasons: [
      ...compuesto.reasons,
      ...culpables.map((m) => `${m.label}: ${m.state}`),
    ],
    modules,
  };
}

export type CohortGradingDto = {
  assessments: AssessmentDto[];
  minAttendancePct: number | null;
  students: StudentGrading[];
};

/** Planilla de evaluación de la cohorte, con el estado de cada alumno. */
export async function cohortGrading(
  organizationId: string,
  cohortId: string
): Promise<CohortGradingDto | null> {
  const db = getDb();

  const cohortRows = await db
    .select({
      id: schema.cohort.id,
      minAttendancePct: schema.cohort.minAttendancePct,
      courseMinPct: schema.course.minAttendancePct,
    })
    .from(schema.cohort)
    .innerJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .where(scoped(schema.cohort.organizationId, organizationId, eq(schema.cohort.id, cohortId)))
    .limit(1);
  const cohort = cohortRows[0];
  if (!cohort) return null;

  const minPct = resolveMinAttendance(cohort.minAttendancePct, cohort.courseMinPct);
  const assessments = await listAssessments(organizationId, cohortId);

  const enrollments = await db
    .select({
      id: schema.enrollment.id,
      enrolledAt: schema.enrollment.enrolledAt,
      firstName: schema.contact.firstName,
      lastName: schema.contact.lastName,
      /**
       * 028 (FR-024) — La dispensa viaja en la consulta que YA lee el roster,
       * con el nombre de su autor. Una cohorte de módulo se corrige con esta
       * misma planilla (FR-030): si la dispensa no llegara acá, el módulo
       * mostraría `reprobado` a alguien que el dueño ya habilitó, y la
       * emisión del certificado —que lee esta planilla— lo negaría.
       *
       * En las 33 cohortes simples las tres columnas son NULL y no cambia
       * absolutamente nada (FR-032).
       */
      attendanceWaiverAt: schema.enrollment.attendanceWaiverAt,
      attendanceWaiverReason: schema.enrollment.attendanceWaiverReason,
      attendanceWaiverRevokedAt: schema.enrollment.attendanceWaiverRevokedAt,
      attendanceWaiverByName: schema.user.name,
    })
    .from(schema.enrollment)
    .innerJoin(schema.contact, eq(schema.enrollment.contactId, schema.contact.id))
    .leftJoin(schema.user, eq(schema.enrollment.attendanceWaiverBy, schema.user.id))
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        eq(schema.enrollment.cohortId, cohortId)
      )
    )
    .orderBy(asc(schema.contact.firstName));

  const [results, sessions, marks, certs] = await Promise.all([
    db
      .select()
      .from(schema.assessmentResult)
      .innerJoin(
        schema.assessment,
        eq(schema.assessmentResult.assessmentId, schema.assessment.id)
      )
      .where(
        and(
          eq(schema.assessmentResult.organizationId, organizationId),
          eq(schema.assessment.cohortId, cohortId)
        )
      ),
    db
      .select()
      .from(schema.classSession)
      .where(
        scoped(
          schema.classSession.organizationId,
          organizationId,
          eq(schema.classSession.cohortId, cohortId)
        )
      ),
    db
      .select()
      .from(schema.attendance)
      .innerJoin(
        schema.classSession,
        eq(schema.attendance.classSessionId, schema.classSession.id)
      )
      .where(
        and(
          eq(schema.attendance.organizationId, organizationId),
          eq(schema.classSession.cohortId, cohortId)
        )
      ),
    db
      .select()
      .from(schema.certificate)
      .where(scoped(schema.certificate.organizationId, organizationId)),
  ]);

  const resultsByEnrollment = new Map<string, Map<string, boolean | null>>();
  for (const r of results) {
    const row = r.assessment_result;
    const map = resultsByEnrollment.get(row.enrollmentId) ?? new Map();
    map.set(row.assessmentId, row.passed);
    resultsByEnrollment.set(row.enrollmentId, map);
  }

  const attendanceByEnrollment = new Map<string, Map<string, string>>();
  for (const m of marks) {
    const row = m.attendance;
    const map = attendanceByEnrollment.get(row.enrollmentId) ?? new Map();
    map.set(row.classSessionId, row.status);
    attendanceByEnrollment.set(row.enrollmentId, map);
  }

  const certByEnrollment = new Map(certs.map((c) => [c.enrollmentId, c]));
  const obligatorias = assessments.filter((a) => a.required);

  return {
    assessments,
    minAttendancePct: minPct,
    students: enrollments.map((e) => {
      const mine = resultsByEnrollment.get(e.id) ?? new Map<string, boolean | null>();
      const asistencia = attendanceByEnrollment.get(e.id) ?? new Map<string, string>();

      const pct = attendancePercentage(
        sessions.map((s) => ({
          sessionDate: s.date,
          canceled: Boolean(s.canceledAt),
          status: (asistencia.get(s.id) ?? null) as
            | "presente"
            | "tarde"
            | "ausente"
            | "justificado"
            | null,
        })),
        e.enrolledAt
      );

      // Solo las obligatorias definen la aprobación; una evaluación sin
      // resultado cargado cuenta como pendiente, no como reprobada.
      const evaluadas = obligatorias.map((a) =>
        mine.has(a.id) ? (mine.get(a.id) ?? null) : null
      );
      const { state, reasons } = moduleApprovalState(
        evaluadas,
        pct,
        minPct,
        dispensaDeInscripcion(e)
      );
      const cert = certByEnrollment.get(e.id);

      return {
        enrollmentId: e.id,
        contactName: [e.firstName, e.lastName].filter(Boolean).join(" "),
        results: Object.fromEntries(mine),
        attendancePct: pct,
        state,
        reasons,
        certificate: cert
          ? {
              code: cert.code,
              issuedAt: cert.issuedAt.toISOString(),
              revokedAt: cert.revokedAt?.toISOString() ?? null,
            }
          : null,
      };
    }),
  };
}
