import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import {
  correctionInputSchema,
  leerPlantilla,
  modoDeCorreccion,
  validarCorreccion,
  type Template,
} from "@/lib/grading-template";
import { recordResults } from "@/server/grading";
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

export type CorrectionDto = {
  id: string;
  status: CorrectionStatus;
  submissionId: string | null;
  score: number | null;
  passed: boolean | null;
  feedback: string | null;
  criterionScores: { criterionId: string; points: number | null; comment: string | null }[];
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
    criterionScores: f.criterionScores ?? [],
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

  const valida = validarCorreccion(template, input, input.action);
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
    criterionScores: (input.criterionScores ?? []).map((c) => ({
      criterionId: c.criterionId,
      points: c.points,
      comment: c.comment?.trim() ? c.comment.trim() : null,
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
      message: "Esta cohorte ya terminó, así que sus correcciones quedaron cerradas",
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
