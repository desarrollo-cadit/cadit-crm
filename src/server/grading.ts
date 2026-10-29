import { randomBytes } from "node:crypto";
import { grupoEmiteCertificado } from "@/lib/taller-config";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import {
  evaluacionEsDeGrupoConEvaluaciones,
  exigirEvaluacionesDeEvaluacion,
  exigirEvaluacionesDeGrupo,
} from "@/server/taller-config";
import { instanteDeEntregaFinal } from "@/lib/entrega-final";
import {
  admiteAtajo,
  completarIds,
  leerPlantilla,
  normalizarPlantilla,
  plantillaCongelada,
  plantillaDe,
  validarPlantilla,
  type Criterion,
  type Scale,
  type Template,
  type TextField,
} from "@/lib/grading-template";
import { validarConsigna, type ConsignaInput } from "@/lib/assessment-consigna";
import {
  adjuntosPorContenedor,
  copiarAdjuntos,
  reemplazarAdjuntos,
  type AdjuntoDto,
} from "@/server/resources";
import {
  asistenciaTomadaSql,
  attendanceByModule,
  attendancePercentage,
  relojDeAsistencia,
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

/*
 * 031 (T037) — La regla pura vive en `src/lib/approval.ts` (la escolaridad la
 * necesita sin arrastrar la base). Se re-exporta acá para que los llamadores
 * de siempre no cambien.
 */
export {
  approvalState,
  estadoDeModulo,
  moduleApprovalState,
  programApprovalState,
  razonDeModulo,
  type ApprovalState,
  type DispensaDeAsistencia,
  type ModuleState,
} from "@/lib/approval";
import {
  estadoDeModulo,
  moduleApprovalState,
  programApprovalState,
  razonDeModulo,
  type ApprovalState,
  type DispensaDeAsistencia,
  type ModuleState,
} from "@/lib/approval";

export type StudentGrading = {
  enrollmentId: string;
  contactName: string;
  /** Resultado por evaluación: `true`/`false`/`null` (pendiente). */
  results: Record<string, boolean | null>;
  /**
   * 031 (DV-004) — La nota 1–100 por evaluación numérica, solo informativa:
   * el estado sigue saliendo de `results`. Sin entrada = sin nota.
   */
  scores: Record<string, number | null>;
  attendancePct: number | null;
  state: ApprovalState;
  /**
   * Qué falló, para poder decírselo al alumno sin que nadie tenga que
   * reconstruirlo mirando dos pantallas (FR-004).
   */
  reasons: string[];
  /**
   * 024 (SC-004) — El certificado, y si está anulado, POR QUÉ y de quién fue
   * la decisión.
   *
   * `revokedAt` solo decía que el papel no vale. El motivo y el autor viajan
   * porque son lo que hace revisable la anulación seis meses después: sin
   * ellos la planilla afirma que un título se anuló y no puede decir quién lo
   * decidió — exactamente la excepción silenciosa que la dispensa ya prohíbe
   * (028, FR-023).
   *
   * Viajan a `evaluacion.ver`, la misma puerta por la que esta planilla ya
   * baja `attendanceWaiverByName`: el autor de una excepción de staff no es un
   * dato nuevo en este payload.
   */
  certificate: {
    code: string;
    issuedAt: string;
    revokedAt: string | null;
    revokeReason: string | null;
    revokedByName: string | null;
    /** 2026-10-29 — El grupo ya no emite: existe, pero está suspendido (sin PDF). */
    suspended?: boolean;
  } | null;
};


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
  /**
   * 016 (FR-005) — La fecha límite del grupo, como instante ISO. `null` = sin
   * plazo, que es un estado legítimo (DV-001).
   *
   * Es OPCIONAL en el tipo y no obligatorio a propósito: `planAssessmentCopy`
   * es pura y se prueba con objetos armados a mano, y volverla obligatoria
   * convertiría una columna nueva en una tanda de fixtures rotos que no dicen
   * nada sobre el producto. El plazo NO se copia entre cohortes: la fecha de
   * una camada no significa nada en la siguiente.
   */
  dueAt?: string | null;
  /**
   * 031 (DV-002) — La plantilla de corrección. Opcional por la misma razón que
   * `dueAt`: los fixtures puros de la copia no tienen por qué conocerla. Una
   * evaluación sin estos campos ES aprobado/no aprobado (ver `plantillaDe`).
   */
  scale?: Scale;
  minScore?: number | null;
  requiresApproval?: boolean;
  criteria?: Criterion[];
  textFields?: TextField[];
  /**
   * 0084 — La consigna (gramática en línea). Opcional por la misma razón que
   * la plantilla: los fixtures puros no tienen por qué conocerla. No se
   * congela y SÍ se copia.
   */
  instructionsMd?: string;
};

type FilaAssessment = typeof schema.assessment.$inferSelect;

function assessmentDto(a: FilaAssessment): AssessmentDto {
  return {
    id: a.id,
    name: a.name,
    position: a.position,
    required: a.required,
    dueAt: a.dueAt?.toISOString() ?? null,
    instructionsMd: a.instructionsMd ?? "",
    ...leerPlantilla(a),
  };
}

/**
 * 0084 — Una evaluación MODELO del curso, leída como evaluación de origen
 * para `planAssessmentCopy`: tomar del curso es copiar, con la MISMA regla de
 * duplicados por nombre normalizado. Sin plazo: el modelo no tiene fecha.
 */
export function modeloComoEvaluacion(m: {
  id: string;
  name: string;
  position: number;
  required: boolean;
  instructionsMd: string;
} & Template): AssessmentDto {
  return {
    id: m.id,
    name: m.name,
    position: m.position,
    required: m.required,
    instructionsMd: m.instructionsMd,
    scale: m.scale,
    minScore: m.minScore,
    requiresApproval: m.requiresApproval,
    criteria: m.criteria,
    textFields: m.textFields,
  };
}

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
  return rows.map(assessmentDto);
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
    return { ok: false, status: 404, code: "not_found", message: "Grupo no encontrado" };
  }
  const sinEvaluaciones = await exigirEvaluacionesDeGrupo(organizationId, cohortId);
  if (sinEvaluaciones) return sinEvaluaciones;

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

  return { ok: true, data: assessmentDto(inserted[0]!) };
}

/**
 * 031 (T011, DV-008) — Guarda la plantilla de corrección de una evaluación.
 *
 * Una vez que hay una corrección publicada (o una publicada que ya fue
 * reemplazada), escala, mínimo y ejercicios quedan CONGELADOS: cambiarlos le
 * movería la nota a alguien que ya la vio (FR-005). Los nombres, los campos de
 * texto y "requiere aprobación" se pueden seguir tocando.
 */
export async function guardarPlantilla(
  organizationId: string,
  assessmentId: string,
  entrada: Template
): Promise<GradingResult<AssessmentDto>> {
  const db = getDb();

  const rows = await db
    .select()
    .from(schema.assessment)
    .where(
      scoped(schema.assessment.organizationId, organizationId, eq(schema.assessment.id, assessmentId))
    )
    .limit(1);
  const fila = rows[0];
  if (!fila) {
    return { ok: false, status: 404, code: "not_found", message: "Evaluación no encontrada" };
  }
  const sinEvaluaciones = await exigirEvaluacionesDeEvaluacion(organizationId, assessmentId);
  if (sinEvaluaciones) return sinEvaluaciones;

  // 0084 — Normalizar antes de comparar: un espacio de más en una frase de la
  // rúbrica no es un cambio de plantilla.
  const plantilla = normalizarPlantilla(completarIds(entrada));
  const valida = validarPlantilla(plantilla);
  if (!valida.ok) {
    return { ok: false, status: 422, code: "plantilla_invalida", message: valida.mensaje };
  }

  // Solo se pregunta por correcciones publicadas si el cambio toca lo que se
  // congela: renombrar un ejercicio no paga la consulta.
  if (plantillaCongelada(leerPlantilla(fila), plantilla)) {
    const publicadas = await db
      .select({ id: schema.correction.id })
      .from(schema.correction)
      .where(
        scoped(
          schema.correction.organizationId,
          organizationId,
          and(
            eq(schema.correction.assessmentId, assessmentId),
            inArray(schema.correction.status, ["published", "superseded"])
          )
        )
      )
      .limit(1);
    if (publicadas[0]) {
      return {
        ok: false,
        status: 409,
        code: "plantilla_congelada",
        message:
          "Esta evaluación ya tiene correcciones publicadas: la escala, la nota mínima y los ejercicios no se pueden cambiar. Los nombres sí.",
      };
    }
  }

  const actualizada = await db
    .update(schema.assessment)
    .set({
      scale: plantilla.scale,
      minScore: plantilla.minScore,
      requiresApproval: plantilla.requiresApproval,
      criteria: plantilla.criteria,
      textFields: plantilla.textFields,
      updatedAt: new Date(),
    })
    .where(
      scoped(schema.assessment.organizationId, organizationId, eq(schema.assessment.id, assessmentId))
    )
    .returning();

  return { ok: true, data: assessmentDto(actualizada[0]!) };
}

/**
 * Carga o corrige el resultado de un alumno. Volver a cargar CORRIGE.
 *
 * 031 (DV-003/DV-005) — Hay DOS orígenes, y el default es el restringido:
 *
 * - `atajo` (la celda de la planilla, el portal del profesor, la corrección
 *   vieja de la entrega): solo vale en aprobado/no aprobado sin aprobación.
 *   En cualquier otra evaluación responde 422 `usar_correccion`, porque
 *   dejaría un `passed` sin nota que lo explique o publicaría salteando a
 *   quien aprueba.
 * - `correccion`: lo pasa SOLO `publicarCorreccion()`, y es el único camino que
 *   escribe `score`.
 *
 * El default es `atajo` a propósito: quien agregue un llamador nuevo y se
 * olvide de pensar en esto queda del lado seguro.
 */
export async function recordResults(
  organizationId: string,
  assessmentId: string,
  entries: {
    enrollmentId: string;
    passed: boolean | null;
    notes?: string | null;
    score?: number | null;
  }[],
  recordedBy?: string | null,
  opciones: { origen?: "atajo" | "correccion" } = {}
): Promise<GradingResult<{ recorded: number }>> {
  const db = getDb();
  const desdeCorreccion = opciones.origen === "correccion";

  const rows = await db
    .select({
      id: schema.assessment.id,
      scale: schema.assessment.scale,
      requiresApproval: schema.assessment.requiresApproval,
    })
    .from(schema.assessment)
    .where(
      scoped(
        schema.assessment.organizationId,
        organizationId,
        eq(schema.assessment.id, assessmentId)
      )
    )
    .limit(1);
  const evaluacion = rows[0];
  if (!evaluacion) {
    return { ok: false, status: 404, code: "not_found", message: "Evaluación no encontrada" };
  }
  const sinEvaluaciones = await exigirEvaluacionesDeEvaluacion(organizationId, assessmentId);
  if (sinEvaluaciones) return sinEvaluaciones;
  if (!desdeCorreccion && !admiteAtajo(plantillaDe({
    scale: evaluacion.scale === "numeric" ? "numeric" : "pass_fail",
    requiresApproval: evaluacion.requiresApproval,
  }))) {
    return {
      ok: false,
      status: 422,
      code: "usar_correccion",
      message:
        "Esta evaluación tiene nota o requiere aprobación: se corrige desde el formulario de corrección, no desde la celda.",
    };
  }

  /**
   * 029 — Una sentencia por FORMA de fila, no una por alumno.
   *
   * Lo que se pisa depende de si la fila trae nota (ver abajo), y eso no se
   * puede decidir por fila dentro de un mismo ON CONFLICT: `excluded.notes`
   * vale `null` tanto para "bórrala" como para "no la toques". Entonces las
   * filas se parten en dos grupos —con nota y sin nota— y cada grupo es UN
   * insert multi-fila. A lo sumo dos viajes, sea la planilla del tamaño que sea.
   *
   * Una inscripción repetida se compacta antes (Postgres no deja tocar la
   * misma fila dos veces en un statement), y la compactación reproduce el
   * bucle de antes: `passed` es el del último, y la nota la del último que
   * la trajo.
   */
  const compactadas = new Map<string, (typeof entries)[number]>();
  for (const e of entries) {
    const previa = compactadas.get(e.enrollmentId);
    compactadas.set(
      e.enrollmentId,
      e.notes === undefined && previa?.notes !== undefined ? { ...e, notes: previa.notes } : e
    );
  }
  const conNota = [...compactadas.values()].filter((e) => e.notes !== undefined);
  const sinNota = [...compactadas.values()].filter((e) => e.notes === undefined);

  const now = new Date();
  for (const [grupo, pisaNota] of [
    [conNota, true],
    [sinNota, false],
  ] as const) {
    if (grupo.length === 0) continue;
    await db
      .insert(schema.assessmentResult)
      .values(
        grupo.map((e) => ({
          id: newId("assessmentResult"),
          organizationId,
          assessmentId,
          enrollmentId: e.enrollmentId,
          passed: e.passed,
          score: e.score ?? null,
          notes: e.notes ?? null,
          recordedBy: recordedBy ?? null,
        }))
      )
      .onConflictDoUpdate({
        target: [schema.assessmentResult.assessmentId, schema.assessmentResult.enrollmentId],
        set: {
          passed: sql`excluded.passed`,
          // 031 (DV-003) — `score` lo escribe SOLO la publicación de una
          // corrección. El atajo no lo trae y no lo toca: existe solo en
          // aprobado/no aprobado, donde no hay puntaje que pisar.
          ...(desdeCorreccion ? { score: sql`excluded.score` } : {}),
          /**
           * 016 — La nota interna sólo se pisa cuando quien llama la TRAE.
           *
           * Antes se escribía `e.notes ?? null` siempre, así que cualquier
           * llamada que no la mandara la borraba. Mientras el único camino era
           * la planilla —que manda las dos cosas juntas— no se notaba. Con la
           * corrección de una entrega (FR-006/DV-002) apareció un segundo
           * camino que escribe `passed` y NO tiene por qué saber nada de la
           * nota del staff: sin esto, corregir una entrega vaciaba en silencio
           * lo que la coordinación había anotado sobre esa persona.
           *
           * Mandar `null` explícito sigue borrándola, que es lo que la planilla
           * necesita para poder dejarla vacía a propósito.
           */
          ...(pisaNota ? { notes: sql`excluded.notes` } : {}),
          updatedAt: now,
        },
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
  /**
   * Las que hay que insertar, ya con su posición final y su plantilla (031,
   * DV-009). El plazo no viaja: la fecha de una camada no significa nada en la
   * siguiente.
   */
  aCopiar: ({ name: string; required: boolean; position: number; instructionsMd: string } & Template)[];
  /**
   * 0084 — De qué evaluación de origen sale cada copia, alineado con
   * `aCopiar`. Va APARTE y no adentro de cada fila: el insert nunca lleva un
   * id de origen. Sirve para copiar los adjuntos de la consigna.
   */
  origenIds: string[];
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
  destino: readonly AssessmentDto[],
  generarId?: () => string
): CopyPlan {
  if (origen.length === 0) {
    return {
      aCopiar: [],
      origenIds: [],
      omitidas: [],
      aviso: "El grupo de origen no tiene evaluaciones cargadas: no hay nada que copiar.",
    };
  }

  const yaEstan = new Set(destino.map((a) => claveDeNombre(a.name)));
  const aCopiar: CopyPlan["aCopiar"] = [];
  const origenIds: string[] = [];
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
    // Los ids de ejercicios y campos se REGENERAN: la copia es otra
    // evaluación, y compartirlos dejaría leer una corrección de una cohorte
    // contra la plantilla de la otra.
    const plantilla = plantillaDe(a);
    const nueva = completarIds(
      {
        ...plantilla,
        criteria: plantilla.criteria.map((c) => ({ ...c, id: "" })),
        textFields: plantilla.textFields.map((f) => ({ ...f, id: "" })),
      },
      generarId
    );
    // 0084 — Las frases de cada nivel viajan con el criterio (`...c`); la
    // consigna, como texto.
    aCopiar.push({
      name: a.name.trim(),
      required: a.required,
      position: position++,
      instructionsMd: a.instructionsMd ?? "",
      ...nueva,
    });
    origenIds.push(a.id);
  }

  return {
    aCopiar,
    origenIds,
    omitidas,
    aviso:
      aCopiar.length === 0
        ? "El grupo ya tenía todas esas evaluaciones: no se copió ninguna."
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
 * Copia las evaluaciones de una cohorte a otra: nombre, orden, si es
 * obligatoria y (031) su plantilla de corrección. **Nunca los resultados.**
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
      message: "El origen y el destino son la mismo grupo",
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
    return { ok: false, status: 404, code: "not_found", message: "Grupo no encontrado" };
  }
  if (!encontradas.has(desdeCohorteId)) {
    return {
      ok: false,
      status: 404,
      code: "origen_not_found",
      message: "El grupo de origen no existe",
    };
  }
  const sinEvaluaciones = await exigirEvaluacionesDeGrupo(organizationId, haciaCohorteId);
  if (sinEvaluaciones) return sinEvaluaciones;

  const [origen, destino] = await Promise.all([
    listAssessments(organizationId, desdeCohorteId),
    listAssessments(organizationId, haciaCohorteId),
  ]);

  const plan = planAssessmentCopy(origen, destino);
  await insertarCopias(organizationId, haciaCohorteId, plan, "assessment");

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

/**
 * Inserta lo que decidió el plan y copia los adjuntos de la consigna de cada
 * origen (0084): filas NUEVAS de `resource`, la copia no comparte nada.
 */
async function insertarCopias(
  organizationId: string,
  cohortId: string,
  plan: CopyPlan,
  origen: "assessment" | "courseAssessmentTemplate"
): Promise<void> {
  if (plan.aCopiar.length === 0) return;
  const filas = plan.aCopiar.map((a) => ({
    id: newId("assessment"),
    organizationId,
    cohortId,
    name: a.name,
    position: a.position,
    required: a.required,
    instructionsMd: a.instructionsMd,
    scale: a.scale,
    minScore: a.minScore,
    requiresApproval: a.requiresApproval,
    criteria: a.criteria,
    textFields: a.textFields,
  }));
  await getDb().insert(schema.assessment).values(filas);
  await copiarAdjuntos(
    organizationId,
    filas.map((f, i) => ({
      desde:
        origen === "assessment"
          ? { assessmentId: plan.origenIds[i]! }
          : { courseAssessmentTemplateId: plan.origenIds[i]! },
      hacia: { assessmentId: f.id },
    }))
  );
}

/**
 * 0084 — "Tomar del curso": copia las evaluaciones MODELO del curso del grupo
 * con la misma regla que copiar de otro grupo (nombre normalizado). Copiar,
 * nunca heredar: después de esto, cambiar el modelo no toca al grupo.
 */
export async function tomarEvaluacionesDelCurso(
  organizationId: string,
  cohortId: string
): Promise<GradingResult<CopyAssessmentsDto>> {
  const db = getDb();
  const [cohorte] = await db
    .select({ id: schema.cohort.id, courseId: schema.cohort.courseId })
    .from(schema.cohort)
    .where(scoped(schema.cohort.organizationId, organizationId, eq(schema.cohort.id, cohortId)))
    .limit(1);
  if (!cohorte) {
    return { ok: false, status: 404, code: "not_found", message: "Grupo no encontrado" };
  }
  const sinEvaluaciones = await exigirEvaluacionesDeGrupo(organizationId, cohortId);
  if (sinEvaluaciones) return sinEvaluaciones;

  const modelos = await db
    .select()
    .from(schema.courseAssessmentTemplate)
    .where(
      scoped(
        schema.courseAssessmentTemplate.organizationId,
        organizationId,
        eq(schema.courseAssessmentTemplate.courseId, cohorte.courseId)
      )
    )
    .orderBy(asc(schema.courseAssessmentTemplate.position));

  const origen = modelos.map((m) =>
    modeloComoEvaluacion({
      id: m.id,
      name: m.name,
      position: m.position,
      required: m.required,
      instructionsMd: m.instructionsMd,
      ...leerPlantilla(m),
    })
  );
  const plan = planAssessmentCopy(origen, await listAssessments(organizationId, cohortId));
  await insertarCopias(organizationId, cohortId, plan, "courseAssessmentTemplate");

  return {
    ok: true,
    data: {
      copiadas: plan.aCopiar.length,
      omitidas: plan.omitidas,
      aviso:
        origen.length === 0
          ? "El curso no tiene evaluaciones modelo: no hay nada que tomar."
          : plan.aCopiar.length === 0
            ? "El grupo ya tenía todas las evaluaciones del curso: no se tomó ninguna."
            : null,
      assessments: await listAssessments(organizationId, cohortId),
    },
  };
}

/* ============================================================
 * 0084 — La consigna de una evaluación del grupo
 * ============================================================ */

export type ConsignaDto = { instructionsMd: string; adjuntos: AdjuntoDto[] };

/** La consigna con sus adjuntos, para el editor del staff. `null` si no existe. */
export async function leerConsigna(
  organizationId: string,
  assessmentId: string
): Promise<ConsignaDto | null> {
  const [fila] = await getDb()
    .select({ instructionsMd: schema.assessment.instructionsMd })
    .from(schema.assessment)
    .where(
      scoped(schema.assessment.organizationId, organizationId, eq(schema.assessment.id, assessmentId))
    )
    .limit(1);
  if (!fila) return null;
  // Taller sin evaluaciones: ausencia (la ruta responde 404).
  if (!(await evaluacionEsDeGrupoConEvaluaciones(organizationId, assessmentId))) return null;
  const adjuntos = await adjuntosPorContenedor(organizationId, "assessment", [assessmentId]);
  return { instructionsMd: fila.instructionsMd, adjuntos: adjuntos.get(assessmentId) ?? [] };
}

/**
 * Guarda la consigna y reemplaza sus adjuntos. NO se congela (decisión del
 * dueño): aclarar qué hay que hacer no le mueve la nota a nadie; la rúbrica
 * sí se congela, y vive en `guardarPlantilla`.
 *
 * Lanza si los adjuntos no validan DESPUÉS de haber escrito: la validación de
 * cada enlace corre antes (`validarConsigna`), así que en la práctica no pasa.
 */
export async function guardarConsigna(
  organizationId: string,
  assessmentId: string,
  entrada: ConsignaInput
): Promise<GradingResult<ConsignaDto>> {
  const sinEvaluaciones = await exigirEvaluacionesDeEvaluacion(organizationId, assessmentId);
  if (sinEvaluaciones) return sinEvaluaciones;
  const valida = validarConsigna(entrada);
  if (!valida.ok) return { ok: false, status: 422, code: valida.code, message: valida.mensaje };

  const actualizada = await getDb()
    .update(schema.assessment)
    .set({ instructionsMd: valida.data.instructionsMd, updatedAt: new Date() })
    .where(
      scoped(schema.assessment.organizationId, organizationId, eq(schema.assessment.id, assessmentId))
    )
    .returning({ id: schema.assessment.id });
  if (!actualizada[0]) {
    return { ok: false, status: 404, code: "not_found", message: "Evaluación no encontrada" };
  }

  const r = await reemplazarAdjuntos(organizationId, { assessmentId }, valida.data.adjuntos);
  if (!r.ok) throw new Error(`0084: adjuntos inválidos tras validar (${r.code})`);
  return { ok: true, data: { instructionsMd: valida.data.instructionsMd, adjuntos: r.data } };
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
  /** 030 — `sin_datos` cuando nadie cargó evaluaciones ni asistencia. */
  state: ModuleState;
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

  const reloj = await relojDeAsistencia(organizationId);
  const [sesiones, marcas, evaluaciones, resultados] = await Promise.all([
    cohorteIds.length
      ? db
          .select({
            id: schema.classSession.id,
            cohortId: schema.classSession.cohortId,
            date: schema.classSession.date,
            endTime: schema.classSession.endTime,
            canceledAt: schema.classSession.canceledAt,
            tomada: asistenciaTomadaSql(),
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
    marcas,
    reloj
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
    const { state, reasons } = estadoDeModulo(evaluadas, pct, minPct, dispensa);
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
    compuesto.state === "reprobado" ? m.state === "reprobado" : m.state !== "aprobado"
  );

  return {
    enrollmentId: madre.id,
    cohortId: madre.cohortId,
    state: compuesto.state,
    reasons: [
      ...compuesto.reasons,
      ...culpables.map((m) => razonDeModulo(m.label, m.state)),
    ],
    modules,
  };
}

export type CohortGradingDto = {
  assessments: AssessmentDto[];
  minAttendancePct: number | null;
  /**
   * 016 (FR-005e) — La zona de la academia, para que la fecha límite se pinte
   * con ella y no con el reloj del navegador. Viaja con la planilla porque es
   * donde la pantalla del staff muestra el plazo.
   */
  timezone: string;
  /**
   * 0083 — La entrega final del grupo como instante ISO (23:59 de la zona de
   * la academia), o `null`. Las evaluaciones sin plazo propio la heredan.
   */
  entregaFinalAt?: string | null;
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
      deliveryDeadline: schema.cohort.deliveryDeadline,
      // 016 (FR-005e) — En la MISMA consulta: la zona no paga un viaje aparte.
      timezone: schema.organization.timezone,
      courseKind: schema.course.kind,
      registrationStatus: schema.cohort.registrationStatus,
      issuesCertificate: schema.cohort.issuesCertificate,
    })
    .from(schema.cohort)
    .innerJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .innerJoin(
      schema.organization,
      eq(schema.cohort.organizationId, schema.organization.id)
    )
    .where(scoped(schema.cohort.organizationId, organizationId, eq(schema.cohort.id, cohortId)))
    .limit(1);
  const cohort = cohortRows[0];
  if (!cohort) return null;

  const minPct = resolveMinAttendance(cohort.minAttendancePct, cohort.courseMinPct);
  const emiteCertificadoElGrupo = grupoEmiteCertificado(cohort);
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
        scoped(
          schema.assessmentResult.organizationId,
          organizationId,
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
        scoped(
          schema.attendance.organizationId,
          organizationId,
          eq(schema.classSession.cohortId, cohortId)
        )
      ),
    /*
      024 — El nombre de quien anuló sale del MISMO `select` que ya traía el
      certificado, con un `leftJoin` sobre `user`. Es `left` y no `inner`
      porque `revoked_by` es nullable con `on delete set null`: un certificado
      anulado por una cuenta que después se borró sigue estando anulado, y un
      `innerJoin` lo haría desaparecer de la planilla entera.
    */
    db
      .select({
        certificate: schema.certificate,
        revokedByName: schema.user.name,
      })
      .from(schema.certificate)
      .leftJoin(schema.user, eq(schema.certificate.revokedBy, schema.user.id))
      .where(scoped(schema.certificate.organizationId, organizationId)),
  ]);

  const resultsByEnrollment = new Map<string, Map<string, boolean | null>>();
  const scoresByEnrollment = new Map<string, Map<string, number | null>>();
  for (const r of results) {
    const row = r.assessment_result;
    const map = resultsByEnrollment.get(row.enrollmentId) ?? new Map();
    map.set(row.assessmentId, row.passed);
    resultsByEnrollment.set(row.enrollmentId, map);
    const notas = scoresByEnrollment.get(row.enrollmentId) ?? new Map();
    notas.set(row.assessmentId, row.score);
    scoresByEnrollment.set(row.enrollmentId, notas);
  }

  // Clases donde alguien pasó lista: solo esas cuentan para el %.
  const clasesConLista = new Set(marks.map((m) => m.attendance.classSessionId));
  const attendanceByEnrollment = new Map<string, Map<string, string>>();
  for (const m of marks) {
    const row = m.attendance;
    const map = attendanceByEnrollment.get(row.enrollmentId) ?? new Map();
    map.set(row.classSessionId, row.status);
    attendanceByEnrollment.set(row.enrollmentId, map);
  }

  const certByEnrollment = new Map(certs.map((c) => [c.certificate.enrollmentId, c]));
  const obligatorias = assessments.filter((a) => a.required);
  // Solo cuentan las clases ya dictadas (la misma regla que la planilla de asistencia).
  const relojDeLaPlanilla = { timeZone: cohort.timezone, now: new Date() };

  return {
    assessments,
    minAttendancePct: minPct,
    timezone: cohort.timezone,
    entregaFinalAt:
      instanteDeEntregaFinal(cohort.deliveryDeadline ?? null, cohort.timezone)?.toISOString() ?? null,
    students: enrollments.map((e) => {
      const mine = resultsByEnrollment.get(e.id) ?? new Map<string, boolean | null>();
      const asistencia = attendanceByEnrollment.get(e.id) ?? new Map<string, string>();

      const pct = attendancePercentage(
        sessions.map((s) => ({
          sessionDate: s.date,
          endTime: s.endTime,
          canceled: Boolean(s.canceledAt),
          tomada: clasesConLista.has(s.id),
          status: (asistencia.get(s.id) ?? null) as
            | "presente"
            | "tarde"
            | "ausente"
            | "justificado"
            | null,
        })),
        e.enrolledAt,
        relojDeLaPlanilla
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
        scores: Object.fromEntries(scoresByEnrollment.get(e.id) ?? new Map<string, number | null>()),
        attendancePct: pct,
        state,
        reasons,
        certificate: cert
          ? {
              code: cert.certificate.code,
              issuedAt: cert.certificate.issuedAt.toISOString(),
              revokedAt: cert.certificate.revokedAt?.toISOString() ?? null,
              revokeReason: cert.certificate.revokeReason,
              revokedByName: cert.revokedByName,
              suspended: !emiteCertificadoElGrupo,
            }
          : null,
      };
    }),
  };
}
