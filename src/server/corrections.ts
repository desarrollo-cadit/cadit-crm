import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import {
  completarPuntosDeNivel,
  correctionInputSchema,
  leerPlantilla,
  modoDeCorreccion,
  validarCorreccion,
  type Nivel,
  type Template,
} from "@/lib/grading-template";
import { onAfterCommit } from "@/lib/db/tenant-context";
import { fullName } from "@/lib/utils";
import { avisarCorreccionPublicada } from "@/server/email/assessment-notices";
import { recordResults } from "@/server/grading";
import {
  evaluacionEsDeGrupoConEvaluaciones,
  exigirEvaluacionesDeEvaluacion,
  grupoConEvaluacionesSql,
  grupoTieneEvaluacionesPorId,
} from "@/server/taller-config";
import { teacherCohortDetail, teacherReachesCohort } from "@/server/teacher-portal";

/**
 * 031 (DV-001, DV-003) — La corrección versionada.
 *
 * Una corrección es una fila propia, con estado: `draft` → (`pending`) →
 * `published`, y la publicada anterior pasa a `superseded`. Lo que el alumno y
 * los once lectores de `assessment_result.passed` ven es SOLO lo publicado, y
 * la única función que lo escribe es `publicarCorreccion()`. Un borrador o una
 * corrección esperando aprobación no tocan ni el resultado oficial ni la
 * entrega: si lo hicieran, la nota sería visible antes de que nadie la
 * aprobara, que es justo la fuga que FR-012/FR-024 prohíben.
 *
 * Regla del archivo, heredada de 014/015/016: **ausencia = `null` o un
 * resultado tipado, jamás un código de autorización**. Quien elige el 404 es
 * la ruta; una inscripción de otra cohorte se contesta igual que una que no
 * existe.
 */

export type CorrectionStatus = "draft" | "pending" | "published" | "superseded";

/** 0084 — Puntos, comentario y (si se eligió) el nivel de la rúbrica de un criterio. */
export type PuntajeDeCriterio = {
  criterionId: string;
  points: number | null;
  comment: string | null;
  level: Nivel | null;
};

/** Las versiones viejas no traen `level`: se lee como `null`, nunca se inventa. */
function puntajesConNivel(
  s: readonly { criterionId: string; points: number | null; comment: string | null; level?: Nivel | null }[] | null | undefined
): PuntajeDeCriterio[] {
  return (s ?? []).map((c) => ({
    criterionId: c.criterionId,
    points: c.points,
    comment: c.comment ?? null,
    level: c.level ?? null,
  }));
}

export type CorrectionDto = {
  id: string;
  status: CorrectionStatus;
  submissionId: string | null;
  score: number | null;
  passed: boolean | null;
  feedback: string | null;
  criterionScores: PuntajeDeCriterio[];
  textValues: { fieldId: string; value: string }[];
  correctedByName: string | null;
  submittedAt: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  /** FR-019 — NUNCA viaja al portal del alumno (ver `StudentCorrectionDto`). */
  reviewComment: string | null;
  publishedAt: string | null;
};

export type CorrectionInput = z.infer<typeof correctionInputSchema>;

export type EntregaParaCorregir = {
  id: string;
  url: string;
  title: string | null;
  submittedAt: string;
};

export type LecturaDeCorreccion = {
  template: Template;
  published: CorrectionDto | null;
  inProgress: CorrectionDto | null;
  submissions: EntregaParaCorregir[];
  /** DV-014 — lo decide el servidor; la pantalla solo dibuja el botón. */
  mode: "publish" | "submit";
};

export type CorrectionResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: 404 | 409 | 422; code: string; message: string };

const NO_ENCONTRADA = {
  ok: false,
  status: 404,
  code: "not_found",
  message: "Evaluación o alumno no encontrado",
} as const;

/* ============================================================
 * Lecturas internas
 * ============================================================ */

type Contexto = { cohortId: string; template: Template };

/**
 * La evaluación y la inscripción, en UNA consulta: el join por cohorte es la
 * cerradura. Una inscripción de otra cohorte no devuelve fila y queda
 * indistinguible de una que no existe.
 */
async function contexto(
  organizationId: string,
  assessmentId: string,
  enrollmentId: string
): Promise<Contexto | null> {
  const filas = await getDb()
    .select({
      cohortId: schema.assessment.cohortId,
      scale: schema.assessment.scale,
      minScore: schema.assessment.minScore,
      requiresApproval: schema.assessment.requiresApproval,
      criteria: schema.assessment.criteria,
      textFields: schema.assessment.textFields,
    })
    .from(schema.enrollment)
    .innerJoin(schema.assessment, eq(schema.assessment.cohortId, schema.enrollment.cohortId))
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        and(
          eq(schema.enrollment.id, enrollmentId),
          eq(schema.assessment.id, assessmentId),
          eq(schema.assessment.organizationId, organizationId)
        )
      )
    )
    .limit(1);
  const fila = filas[0];
  if (!fila) return null;
  // 2026-10-29 — Taller sin evaluaciones: ausencia (404). El staff además
  // pasa por `exigirEvaluacionesDeEvaluacion` (409) en `guardarCorreccion`.
  if (!(await evaluacionEsDeGrupoConEvaluaciones(organizationId, assessmentId))) return null;
  return { cohortId: fila.cohortId, template: leerPlantilla(fila) };
}

type FilaDeCorreccion = typeof schema.correction.$inferSelect;

/**
 * Los nombres de quienes corrigieron y revisaron, en un solo viaje. `user` es
 * de Better Auth y no lleva organización: se llega a él SOLO con ids que ya
 * salieron de filas de esta organización.
 */
async function nombres(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  if (unicos.length === 0) return new Map();
  const filas = await getDb()
    .select({ id: schema.user.id, name: schema.user.name })
    .from(schema.user)
    .where(inArray(schema.user.id, unicos));
  return new Map(filas.map((f) => [f.id, f.name]));
}

const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;

function aDto(f: Partial<FilaDeCorreccion>, quienes: Map<string, string>): CorrectionDto {
  return {
    id: f.id ?? "",
    status: (f.status ?? "draft") as CorrectionStatus,
    submissionId: f.submissionId ?? null,
    score: f.score ?? null,
    passed: f.passed ?? null,
    feedback: f.feedback ?? null,
    criterionScores: puntajesConNivel(f.criterionScores),
    textValues: f.textValues ?? [],
    correctedByName: (f.correctedBy && quienes.get(f.correctedBy)) || null,
    submittedAt: iso(f.submittedAt),
    reviewedByName: (f.reviewedBy && quienes.get(f.reviewedBy)) || null,
    reviewedAt: iso(f.reviewedAt),
    reviewComment: f.reviewComment ?? null,
    publishedAt: iso(f.publishedAt),
  };
}

async function leerConContexto(
  organizationId: string,
  assessmentId: string,
  enrollmentId: string,
  ctx: Contexto,
  puedeAprobar: boolean
): Promise<LecturaDeCorreccion> {
  const db = getDb();
  const [versiones, entregas] = await Promise.all([
    db
      .select()
      .from(schema.correction)
      .where(
        scoped(
          schema.correction.organizationId,
          organizationId,
          and(
            eq(schema.correction.assessmentId, assessmentId),
            eq(schema.correction.enrollmentId, enrollmentId),
            // `superseded` no se lee: es historia, no lo que se corrige hoy.
            inArray(schema.correction.status, ["published", "draft", "pending"])
          )
        )
      ),
    db
      .select({
        id: schema.submission.id,
        url: schema.submission.url,
        title: schema.submission.title,
        submittedAt: schema.submission.submittedAt,
      })
      .from(schema.submission)
      .where(
        scoped(
          schema.submission.organizationId,
          organizationId,
          and(
            eq(schema.submission.assessmentId, assessmentId),
            eq(schema.submission.enrollmentId, enrollmentId)
          )
        )
      )
      .orderBy(desc(schema.submission.submittedAt)),
  ]);

  const quienes = await nombres(versiones.flatMap((v) => [v.correctedBy, v.reviewedBy]));
  const publicada = versiones.find((v) => v.status === "published");
  const enTramite = versiones.find((v) => v.status === "draft" || v.status === "pending");

  return {
    template: ctx.template,
    published: publicada ? aDto(publicada, quienes) : null,
    inProgress: enTramite ? aDto(enTramite, quienes) : null,
    submissions: entregas.map((e) => ({
      id: e.id,
      url: e.url,
      title: e.title,
      submittedAt: e.submittedAt.toISOString(),
    })),
    mode: modoDeCorreccion(ctx.template, puedeAprobar),
  };
}

/* ============================================================
 * La única puerta del resultado oficial (DV-003)
 * ============================================================ */

/**
 * 031 (DV-003) — **Publica una versión. Es la ÚNICA función que escribe el
 * resultado oficial de una corrección.**
 *
 * En la transacción del pedido, y en este orden:
 * 1. la publicada anterior pasa a `superseded` (antes, porque el índice único
 *    parcial no admite dos vigentes ni por un instante);
 * 2. ésta pasa a `published`, con quién y cuándo;
 * 3. `recordResults` escribe `passed` + `score` —el único llamador con origen
 *    `correccion`—;
 * 4. si hay entrega, se le espeja la devolución (compatibilidad con 016).
 *
 * **Lanza ante cualquier fallo, no devuelve.** Una `Response` de error NO
 * revierte la transacción (CLAUDE.md): quedaría una versión `published` sin
 * resultado oficial, o un resultado sin la entrega espejada. Lanzando, la
 * puerta del pedido revierte todo.
 */
export async function publicarCorreccion(
  organizationId: string,
  correctionId: string,
  userId: string
): Promise<FilaDeCorreccion> {
  const db = getDb();
  const filas = await db
    .select()
    .from(schema.correction)
    .where(
      scoped(schema.correction.organizationId, organizationId, eq(schema.correction.id, correctionId))
    )
    .limit(1);
  const version = filas[0];
  if (!version) {
    throw new Error(`031: no existe la corrección ${correctionId} que se quiso publicar`);
  }
  if (version.status !== "draft" && version.status !== "pending") {
    throw new Error(`031: la corrección ${correctionId} está ${version.status}, no se publica`);
  }
  if (version.passed === null) {
    throw new Error(`031: la corrección ${correctionId} no dice si aprobó; no se publica`);
  }

  const ahora = new Date();
  await db
    .update(schema.correction)
    .set({ status: "superseded", updatedAt: ahora })
    .where(
      scoped(
        schema.correction.organizationId,
        organizationId,
        and(
          eq(schema.correction.assessmentId, version.assessmentId),
          eq(schema.correction.enrollmentId, version.enrollmentId),
          eq(schema.correction.status, "published")
        )
      )
    );

  const publicadas = await db
    .update(schema.correction)
    .set({ status: "published", publishedBy: userId, publishedAt: ahora, updatedAt: ahora })
    .where(
      scoped(schema.correction.organizationId, organizationId, eq(schema.correction.id, correctionId))
    )
    .returning();

  const r = await recordResults(
    organizationId,
    version.assessmentId,
    [{ enrollmentId: version.enrollmentId, passed: version.passed, score: version.score }],
    userId,
    { origen: "correccion" }
  );
  if (!r.ok) {
    throw new Error(
      `031: no se pudo registrar el resultado oficial (${r.code}): ${r.message}`
    );
  }

  if (version.submissionId) {
    await db
      .update(schema.submission)
      .set({
        passed: version.passed,
        feedback: version.feedback,
        correctedAt: ahora,
        correctedBy: userId,
        // Corregir cierra la reapertura (FR-010 de 016): para volver a
        // entregar hace falta que la reabran otra vez.
        reopenedAt: null,
        reopenedBy: null,
        updatedAt: ahora,
      })
      .where(
        scoped(
          schema.submission.organizationId,
          organizationId,
          eq(schema.submission.id, version.submissionId)
        )
      );
  }

  /*
    0084 — "Tu corrección fue publicada", por correo y DESPUÉS del commit: si
    la transacción revierte, no se avisa nada, y un fallo del envío nunca
    rompe la publicación (`avisarCorreccionPublicada` no lanza).
  */
  onAfterCommit(() => void avisarCorreccionPublicada(organizationId, correctionId));

  return { ...version, ...publicadas[0], status: "published", publishedAt: ahora, publishedBy: userId };
}

/* ============================================================
 * Leer y guardar — compartido por las dos puertas
 * ============================================================ */

/** 031 (T018) — Lo que el formulario necesita para corregir a UN alumno. */
export async function leerCorreccion(
  organizationId: string,
  assessmentId: string,
  enrollmentId: string,
  puedeAprobar: boolean
): Promise<LecturaDeCorreccion | null> {
  const ctx = await contexto(organizationId, assessmentId, enrollmentId);
  if (!ctx) return null;
  return leerConContexto(organizationId, assessmentId, enrollmentId, ctx, puedeAprobar);
}

async function guardarConContexto(
  organizationId: string,
  assessmentId: string,
  enrollmentId: string,
  userId: string,
  input: CorrectionInput,
  ctx: Contexto,
  puedeAprobar: boolean
): Promise<CorrectionResult<CorrectionDto>> {
  const { template } = ctx;

  if (input.action === "publish" && modoDeCorreccion(template, puedeAprobar) !== "publish") {
    return {
      ok: false,
      status: 422,
      code: "requiere_aprobacion",
      message: "Esta evaluación requiere aprobación: enviá la corrección para que la aprueben.",
    };
  }

  const db = getDb();
  const enTramite = (
    await db
      .select({ id: schema.correction.id, status: schema.correction.status })
      .from(schema.correction)
      .where(
        scoped(
          schema.correction.organizationId,
          organizationId,
          and(
            eq(schema.correction.assessmentId, assessmentId),
            eq(schema.correction.enrollmentId, enrollmentId),
            inArray(schema.correction.status, ["draft", "pending"])
          )
        )
      )
      .limit(1)
  )[0];

  // Una versión esperando aprobación no se edita: o se aprueba o se devuelve.
  if (enTramite?.status === "pending") {
    return {
      ok: false,
      status: 409,
      code: "en_aprobacion",
      message: "Esta corrección está esperando aprobación: no se puede editar hasta que la aprueben o la devuelvan.",
    };
  }

  const submissionId = input.submissionId ?? null;
  if (submissionId) {
    // La entrega tiene que ser de ESTA evaluación y de ESTE alumno.
    const propia = await db
      .select({ id: schema.submission.id })
      .from(schema.submission)
      .where(
        scoped(
          schema.submission.organizationId,
          organizationId,
          and(
            eq(schema.submission.id, submissionId),
            eq(schema.submission.assessmentId, assessmentId),
            eq(schema.submission.enrollmentId, enrollmentId)
          )
        )
      )
      .limit(1);
    if (!propia[0]) return { ...NO_ENCONTRADA, message: "Entrega no encontrada" };
  }

  // 0084 — Un nivel elegido sin puntos toma los puntos del nivel; los cargados
  // a mano ganan. Se completa ANTES de validar: la nota sigue siendo la suma.
  const puntajes = completarPuntosDeNivel(template, input.criterionScores ?? []);
  const valida = validarCorreccion(template, { ...input, criterionScores: puntajes }, input.action);
  if (!valida.ok) {
    return { ok: false, status: 422, code: valida.code, message: valida.mensaje };
  }

  const ahora = new Date();
  const datos = {
    submissionId,
    // Lo que se guarda es lo DERIVADO: en numérica nadie carga `passed` a mano.
    score: valida.score,
    passed: valida.passed,
    feedback: input.feedback?.trim() ? input.feedback.trim() : null,
    criterionScores: puntajes.map((c) => ({
      criterionId: c.criterionId,
      points: c.points,
      comment: c.comment?.trim() ? c.comment.trim() : null,
      // 0084 — el nivel de la rúbrica (las correcciones viejas no lo traen).
      level: c.level ?? null,
    })),
    textValues: (input.textValues ?? []).map((v) => ({ fieldId: v.fieldId, value: v.value })),
    correctedBy: userId,
    updatedAt: ahora,
    ...(input.action === "submit"
      ? { status: "pending" as const, submittedBy: userId, submittedAt: ahora }
      : { status: "draft" as const }),
  };

  const guardada = enTramite
    ? (
        await db
          .update(schema.correction)
          .set(datos)
          .where(
            scoped(
              schema.correction.organizationId,
              organizationId,
              eq(schema.correction.id, enTramite.id)
            )
          )
          .returning()
      )[0]
    : (
        await db
          .insert(schema.correction)
          .values({
            id: newId("correction"),
            organizationId,
            assessmentId,
            enrollmentId,
            ...datos,
          })
          .returning()
      )[0];
  if (!guardada) {
    throw new Error("031: la corrección no se pudo guardar");
  }

  const final =
    input.action === "publish"
      ? await publicarCorreccion(organizationId, guardada.id, userId)
      : guardada;

  const quienes = await nombres([final.correctedBy, final.reviewedBy]);
  return { ok: true, data: aDto(final, quienes) };
}

/**
 * 031 (T018) — Guarda, envía o publica la corrección de UN alumno.
 *
 * Editar una corrección ya publicada crea (o actualiza) la versión en trámite:
 * la publicada sigue vigente hasta que la nueva se publique (FR-021).
 */
export async function guardarCorreccion(
  organizationId: string,
  assessmentId: string,
  enrollmentId: string,
  userId: string,
  input: CorrectionInput,
  puedeAprobar: boolean
): Promise<CorrectionResult<CorrectionDto>> {
  const sinEvaluaciones = await exigirEvaluacionesDeEvaluacion(organizationId, assessmentId);
  if (sinEvaluaciones) return sinEvaluaciones;
  const ctx = await contexto(organizationId, assessmentId, enrollmentId);
  if (!ctx) return NO_ENCONTRADA;
  return guardarConContexto(
    organizationId,
    assessmentId,
    enrollmentId,
    userId,
    input,
    ctx,
    puedeAprobar
  );
}

/* ============================================================
 * La puerta del profesor (DV-014)
 * ============================================================ */

/**
 * El profesor lee la corrección de una cohorte que alcanza (titular o
 * suplente). `null` si no la alcanza, igual que si no existiera.
 *
 * `puedeAprobar` es siempre `false`: el profesor no tiene capacidades de
 * staff, así que una evaluación con aprobación se le ofrece como "enviar".
 */
export async function leerCorreccionDelProfesor(
  organizationId: string,
  teacherId: string,
  assessmentId: string,
  enrollmentId: string
): Promise<LecturaDeCorreccion | null> {
  const ctx = await contexto(organizationId, assessmentId, enrollmentId);
  if (!ctx) return null;
  if (!(await teacherReachesCohort(organizationId, teacherId, ctx.cohortId))) return null;
  return leerConContexto(organizationId, assessmentId, enrollmentId, ctx, false);
}

/**
 * El profesor corrige. Fuera de alcance → 404; cohorte finalizada → 422
 * `cohorte_finalizada` (la misma regla y la misma frase que la asistencia y
 * las entregas: DV-005 de 014). El 422 va DESPUÉS del alcance: un "existe pero
 * terminó" ya le confirma a un profesor ajeno que existe.
 */
export async function guardarCorreccionDelProfesor(
  organizationId: string,
  teacherId: string,
  userId: string,
  assessmentId: string,
  enrollmentId: string,
  input: CorrectionInput
): Promise<CorrectionResult<CorrectionDto>> {
  const ctx = await contexto(organizationId, assessmentId, enrollmentId);
  if (!ctx) return NO_ENCONTRADA;
  const detalle = await teacherCohortDetail(organizationId, teacherId, ctx.cohortId);
  if (!detalle) return NO_ENCONTRADA;
  if (!detalle.editable) {
    return {
      ok: false,
      status: 422,
      code: "cohorte_finalizada",
      message: "Este grupo ya terminó, así que sus correcciones quedaron cerradas",
    };
  }
  return guardarConContexto(
    organizationId,
    assessmentId,
    enrollmentId,
    userId,
    input,
    ctx,
    false
  );
}

/* ============================================================
 * DV-008 — Qué plantillas ya no se pueden tocar
 * ============================================================ */

/**
 * Las evaluaciones de la cohorte con alguna corrección publicada (o publicada
 * y después reemplazada). El editor de la plantilla las abre congeladas para
 * que nadie arme un cambio entero y se entere del 409 al final.
 */
export async function evaluacionesCongeladas(
  organizationId: string,
  cohortId: string
): Promise<Set<string>> {
  const filas = await getDb()
    .selectDistinct({ assessmentId: schema.correction.assessmentId })
    .from(schema.correction)
    .innerJoin(schema.assessment, eq(schema.correction.assessmentId, schema.assessment.id))
    .where(
      scoped(
        schema.correction.organizationId,
        organizationId,
        and(
          eq(schema.assessment.cohortId, cohortId),
          inArray(schema.correction.status, ["published", "superseded"])
        )
      )
    );
  return new Set(filas.map((f) => f.assessmentId));
}

/* ============================================================
 * US4 (DV-012) — Aprobar o devolver antes de publicar
 * ============================================================
 * Enviar a aprobación no tiene función propia: es `guardarCorreccion` con
 * `action: "submit"` (draft → pending, con quién y cuándo), porque enviar ES
 * guardar —con la misma validación completa— y una segunda puerta de
 * escritura sería otro lugar donde olvidarse de validar.
 *
 * Estas funciones las llaman SOLO rutas con `correcciones.aprobar`. No
 * reciben la sesión ni preguntan capacidades: el permiso lo decide la ruta.
 */

export type PendienteDeAprobacion = {
  id: string;
  assessmentName: string;
  cohortId: string;
  cohortName: string;
  studentName: string;
  correctedByName: string | null;
  submittedAt: string | null;
  score: number | null;
  passed: boolean | null;
};

export type DetalleParaAprobar = {
  correction: CorrectionDto;
  template: Template;
  assessmentName: string;
  studentName: string;
  cohortName: string;
  published: CorrectionDto | null;
  submission: { url: string; title: string | null } | null;
};

/** Las columnas de la versión, más la plantilla de SU evaluación. */
const columnasDeVersion = {
  id: schema.correction.id,
  assessmentId: schema.correction.assessmentId,
  enrollmentId: schema.correction.enrollmentId,
  submissionId: schema.correction.submissionId,
  status: schema.correction.status,
  score: schema.correction.score,
  passed: schema.correction.passed,
  feedback: schema.correction.feedback,
  criterionScores: schema.correction.criterionScores,
  textValues: schema.correction.textValues,
  correctedBy: schema.correction.correctedBy,
  submittedBy: schema.correction.submittedBy,
  submittedAt: schema.correction.submittedAt,
  reviewedBy: schema.correction.reviewedBy,
  reviewedAt: schema.correction.reviewedAt,
  reviewComment: schema.correction.reviewComment,
  publishedAt: schema.correction.publishedAt,
  scale: schema.assessment.scale,
  minScore: schema.assessment.minScore,
  requiresApproval: schema.assessment.requiresApproval,
  criteria: schema.assessment.criteria,
  textFields: schema.assessment.textFields,
};

async function versionConPlantilla(organizationId: string, correctionId: string) {
  const filas = await getDb()
    .select(columnasDeVersion)
    .from(schema.correction)
    .innerJoin(schema.assessment, eq(schema.assessment.id, schema.correction.assessmentId))
    .where(
      scoped(schema.correction.organizationId, organizationId, eq(schema.correction.id, correctionId))
    )
    .limit(1);
  const fila = filas[0] ?? null;
  if (fila && !(await evaluacionEsDeGrupoConEvaluaciones(organizationId, fila.assessmentId))) return null;
  return fila;
}

const SOLO_PENDIENTE = {
  ok: false,
  status: 409,
  code: "estado_invalido",
  message: "Esta corrección ya no está esperando aprobación.",
} as const;

const CORRECCION_NO_ENCONTRADA = {
  ok: false,
  status: 404,
  code: "not_found",
  message: "Corrección no encontrada",
} as const;

/**
 * 031 (T032) — Aprueba una corrección pendiente: pending → published por
 * `publicarCorreccion()`, la única puerta del resultado oficial.
 *
 * Antes de publicar la vuelve a validar contra la plantilla de HOY. Mientras
 * esperaba, la plantilla pudo cambiar (no está congelada hasta la primera
 * publicación): si subió el mínimo, la nota ya no aprueba, y publicar el
 * `passed` que se calculó al enviar sería publicar una decisión vieja.
 */
export async function aprobarCorreccion(
  organizationId: string,
  correctionId: string,
  userId: string
): Promise<CorrectionResult<CorrectionDto>> {
  const v = await versionConPlantilla(organizationId, correctionId);
  if (!v) return CORRECCION_NO_ENCONTRADA;
  if (v.status !== "pending") return SOLO_PENDIENTE;

  const valida = validarCorreccion(
    leerPlantilla(v),
    {
      score: v.score,
      passed: v.passed,
      criterionScores: v.criterionScores,
      textValues: v.textValues,
    },
    "publish"
  );
  if (!valida.ok) {
    return { ok: false, status: 422, code: valida.code, message: valida.mensaje };
  }

  const ahora = new Date();
  await getDb()
    .update(schema.correction)
    .set({
      score: valida.score,
      passed: valida.passed,
      reviewedBy: userId,
      reviewedAt: ahora,
      updatedAt: ahora,
    })
    .where(
      scoped(schema.correction.organizationId, organizationId, eq(schema.correction.id, correctionId))
    );

  const publicada = await publicarCorreccion(organizationId, correctionId, userId);
  const quienes = await nombres([publicada.correctedBy, userId]);
  return {
    ok: true,
    data: aDto({ ...publicada, reviewedBy: userId, reviewedAt: ahora }, quienes),
  };
}

/**
 * 031 (T032, FR-019) — Devuelve una corrección pendiente al corrector:
 * pending → draft, con el porqué. Sin comentario no se devuelve: "te la
 * devolvieron" sin decir qué cambiar obliga a preguntar por fuera del sistema.
 */
export async function devolverCorreccion(
  organizationId: string,
  correctionId: string,
  userId: string,
  comentario: string
): Promise<CorrectionResult<CorrectionDto>> {
  const porque = comentario.trim();
  const v = await versionConPlantilla(organizationId, correctionId);
  if (!v) return CORRECCION_NO_ENCONTRADA;
  if (!porque) {
    return {
      ok: false,
      status: 422,
      code: "comentario_obligatorio",
      message: "Escribí por qué la devolvés: es lo que va a leer quien corrigió.",
    };
  }
  if (v.status !== "pending") return SOLO_PENDIENTE;

  const ahora = new Date();
  const filas = await getDb()
    .update(schema.correction)
    .set({
      status: "draft",
      reviewComment: porque,
      reviewedBy: userId,
      reviewedAt: ahora,
      updatedAt: ahora,
    })
    .where(
      scoped(
        schema.correction.organizationId,
        organizationId,
        // El estado va en el WHERE: si otro la aprobó entre la lectura y esta
        // escritura, no se "des-publica" una corrección ya vigente.
        and(eq(schema.correction.id, correctionId), eq(schema.correction.status, "pending"))
      )
    )
    .returning();
  const devuelta = filas[0];
  if (!devuelta) return SOLO_PENDIENTE;
  const quienes = await nombres([devuelta.correctedBy, userId]);
  return { ok: true, data: aDto(devuelta, quienes) };
}

/** El nombre que se muestra de una cohorte: el propio o, si no tiene, el del curso. */
const nombreDeCohorte = (f: { cohortName: string | null; courseName: string | null }) =>
  f.cohortName ?? f.courseName ?? "";

/** 031 (T032) — La bandeja: lo que espera aprobación, lo más viejo primero. */
export async function listarPendientes(
  organizationId: string,
  filtro: { cohortId: string | null }
): Promise<PendienteDeAprobacion[]> {
  const filas = await getDb()
    .select({
      id: schema.correction.id,
      assessmentName: schema.assessment.name,
      cohortId: schema.cohort.id,
      cohortName: schema.cohort.name,
      courseName: schema.course.name,
      firstName: schema.contact.firstName,
      lastName: schema.contact.lastName,
      correctedBy: schema.correction.correctedBy,
      submittedAt: schema.correction.submittedAt,
      score: schema.correction.score,
      passed: schema.correction.passed,
    })
    .from(schema.correction)
    .innerJoin(schema.assessment, eq(schema.assessment.id, schema.correction.assessmentId))
    .innerJoin(schema.cohort, eq(schema.cohort.id, schema.assessment.cohortId))
    .innerJoin(schema.course, eq(schema.course.id, schema.cohort.courseId))
    .innerJoin(schema.enrollment, eq(schema.enrollment.id, schema.correction.enrollmentId))
    .innerJoin(schema.contact, eq(schema.contact.id, schema.enrollment.contactId))
    .where(
      scoped(
        schema.correction.organizationId,
        organizationId,
        and(
          eq(schema.correction.status, "pending"),
          grupoConEvaluacionesSql(
            schema.course.kind,
            schema.cohort.registrationStatus,
            schema.cohort.hasAssessments
          ),
          filtro.cohortId ? eq(schema.cohort.id, filtro.cohortId) : undefined
        )
      )
    )
    .orderBy(schema.correction.submittedAt);

  const quienes = await nombres(filas.map((f) => f.correctedBy));
  return filas.map((f) => ({
    id: f.id,
    assessmentName: f.assessmentName,
    cohortId: f.cohortId,
    cohortName: nombreDeCohorte(f),
    studentName: fullName(f),
    correctedByName: (f.correctedBy && quienes.get(f.correctedBy)) || null,
    submittedAt: iso(f.submittedAt),
    score: f.score ?? null,
    passed: f.passed ?? null,
  }));
}

/**
 * 031 (T032) — Todo lo que quien aprueba necesita para decidir: la versión en
 * trámite, la plantilla, la vigente (si la hay, para comparar) y la entrega.
 */
export async function detalleParaAprobar(
  organizationId: string,
  correctionId: string
): Promise<DetalleParaAprobar | null> {
  const db = getDb();
  const v = (
    await db
      .select({
        ...columnasDeVersion,
        assessmentName: schema.assessment.name,
        cohortName: schema.cohort.name,
        courseName: schema.course.name,
        firstName: schema.contact.firstName,
        lastName: schema.contact.lastName,
      })
      .from(schema.correction)
      .innerJoin(schema.assessment, eq(schema.assessment.id, schema.correction.assessmentId))
      .innerJoin(schema.cohort, eq(schema.cohort.id, schema.assessment.cohortId))
      .innerJoin(schema.course, eq(schema.course.id, schema.cohort.courseId))
      .innerJoin(schema.enrollment, eq(schema.enrollment.id, schema.correction.enrollmentId))
      .innerJoin(schema.contact, eq(schema.contact.id, schema.enrollment.contactId))
      .where(
        scoped(
          schema.correction.organizationId,
          organizationId,
          eq(schema.correction.id, correctionId)
        )
      )
      .limit(1)
  )[0];
  if (!v) return null;
  if (!(await evaluacionEsDeGrupoConEvaluaciones(organizationId, v.assessmentId))) return null;

  const [vigentes, entregas] = await Promise.all([
    db
      .select()
      .from(schema.correction)
      .where(
        scoped(
          schema.correction.organizationId,
          organizationId,
          and(
            eq(schema.correction.assessmentId, v.assessmentId),
            eq(schema.correction.enrollmentId, v.enrollmentId),
            eq(schema.correction.status, "published")
          )
        )
      )
      .limit(1),
    v.submissionId
      ? db
          .select({ url: schema.submission.url, title: schema.submission.title })
          .from(schema.submission)
          .where(
            scoped(
              schema.submission.organizationId,
              organizationId,
              eq(schema.submission.id, v.submissionId)
            )
          )
          .limit(1)
      : Promise.resolve([]),
  ]);
  const vigente = vigentes[0];
  const quienes = await nombres([
    v.correctedBy,
    v.reviewedBy,
    vigente?.correctedBy,
    vigente?.reviewedBy,
  ]);

  return {
    correction: aDto(v, quienes),
    template: leerPlantilla(v),
    assessmentName: v.assessmentName,
    studentName: fullName(v),
    cohortName: nombreDeCohorte(v),
    published: vigente ? aDto(vigente, quienes) : null,
    submission: entregas[0] ? { url: entregas[0].url, title: entregas[0].title ?? null } : null,
  };
}

/* ============================================================
 * Lo que ve el ALUMNO (DV-010, US3)
 * ============================================================
 * Esta sección va al final y tiene su propio guard estructural
 * (`correcciones-guard.test.ts`): toda función recibe `contactId`, el estado se
 * filtra en el WHERE y el DTO no nombra el circuito de aprobación. No reusa
 * `aDto` del staff: ese armado trae el comentario de devolución, y reusarlo es
 * exactamente cómo termina en la pantalla equivocada.
 */

export type StudentCorrectionDto = {
  id: string;
  submissionId: string | null;
  score: number | null;
  passed: boolean | null;
  feedback: string | null;
  /** 0084 — por criterio: nivel, puntos y comentario. Solo de lo PUBLICADO. */
  criterionScores: PuntajeDeCriterio[];
  textValues: { fieldId: string; value: string }[];
  correctedByName: string | null;
  publishedAt: string | null;
};

export type CorreccionDelAlumnoDto = {
  assessmentId: string;
  scale: Template["scale"];
  minScore: number | null;
  criteria: Template["criteria"];
  textFields: Template["textFields"];
  correction: StudentCorrectionDto;
};

/**
 * 031 (T028, DV-010) — Las correcciones PUBLICADAS de una cursada del alumno.
 *
 * Arranca por el contacto (FR-001 de 015): una inscripción ajena devuelve
 * `null`, igual que una inexistente, y la ruta lo traduce a 404. Lo que no está
 * publicado no se consulta: un borrador o una corrección esperando aprobación
 * no existen para esta función (FR-024).
 *
 * Una evaluación sin corrección publicada no viaja: la pantalla la muestra
 * "Pendiente de corrección" con lo que ya sabe de la cursada.
 */
export async function correccionesPublicadasDeCursada(
  organizationId: string,
  contactId: string,
  enrollmentId: string
): Promise<{ assessments: CorreccionDelAlumnoDto[] } | null> {
  const db = getDb();
  const inscripcion = (
    await db
      .select({ id: schema.enrollment.id, cohortId: schema.enrollment.cohortId })
      .from(schema.enrollment)
      .where(
        scoped(
          schema.enrollment.organizationId,
          organizationId,
          and(
            eq(schema.enrollment.id, enrollmentId),
            // La cerradura: la inscripción tiene que ser de ESTA persona.
            eq(schema.enrollment.contactId, contactId)
          )
        )
      )
      .limit(1)
  )[0];
  if (!inscripcion?.cohortId) return null;
  // Taller sin evaluaciones: ausencia = 404 (jamás 403).
  if (!(await grupoTieneEvaluacionesPorId(organizationId, inscripcion.cohortId))) return null;

  const [evaluaciones, publicadas] = await Promise.all([
    db
      .select({
        id: schema.assessment.id,
        scale: schema.assessment.scale,
        minScore: schema.assessment.minScore,
        requiresApproval: schema.assessment.requiresApproval,
        criteria: schema.assessment.criteria,
        textFields: schema.assessment.textFields,
      })
      .from(schema.assessment)
      .where(
        scoped(
          schema.assessment.organizationId,
          organizationId,
          eq(schema.assessment.cohortId, inscripcion.cohortId)
        )
      ),
    db
      .select({
        id: schema.correction.id,
        assessmentId: schema.correction.assessmentId,
        submissionId: schema.correction.submissionId,
        score: schema.correction.score,
        passed: schema.correction.passed,
        feedback: schema.correction.feedback,
        criterionScores: schema.correction.criterionScores,
        textValues: schema.correction.textValues,
        correctedBy: schema.correction.correctedBy,
        publishedAt: schema.correction.publishedAt,
      })
      .from(schema.correction)
      .where(
        scoped(
          schema.correction.organizationId,
          organizationId,
          and(
            eq(schema.correction.enrollmentId, enrollmentId),
            eq(schema.correction.status, "published")
          )
        )
      ),
  ]);

  if (publicadas.length === 0) return { assessments: [] };
  const quienes = await nombres(publicadas.map((c) => c.correctedBy));

  const assessments: CorreccionDelAlumnoDto[] = [];
  for (const a of evaluaciones) {
    const c = publicadas.find((x) => x.assessmentId === a.id);
    if (!c) continue;
    const plantilla = leerPlantilla(a);
    assessments.push({
      assessmentId: a.id,
      scale: plantilla.scale,
      minScore: plantilla.minScore,
      criteria: plantilla.criteria,
      textFields: plantilla.textFields,
      correction: {
        id: c.id,
        submissionId: c.submissionId ?? null,
        score: c.score ?? null,
        passed: c.passed ?? null,
        feedback: c.feedback ?? null,
        criterionScores: puntajesConNivel(c.criterionScores),
        textValues: c.textValues ?? [],
        correctedByName: (c.correctedBy && quienes.get(c.correctedBy)) || null,
        publishedAt: c.publishedAt?.toISOString() ?? null,
      },
    });
  }
  return { assessments };
}
