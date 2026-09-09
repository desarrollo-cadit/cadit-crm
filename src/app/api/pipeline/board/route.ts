import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { parseQuery, requireCapability } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { fullName } from "@/lib/utils";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  cohortId: z.string().min(1).optional(),
});

/**
 * Datos completos del kanban: etapas ordenadas + tarjetas con su contacto.
 * 004 — sin `cohortId`: tablero GENERAL de ventas (enrollment.cohort_id
 * NULL). Con `cohortId`: tablero de esa cohorte puntual.
 */
export const GET = requireCapability(
  "inscripciones.ver",
  async (session, req: Request) => {
  const query = parseQuery(new URL(req.url), querySchema);
  if (!query.ok) return query.response;
  const cohortId = query.data.cohortId ?? null;
  const db = getDb();

  const stages = await db
    .select()
    .from(schema.pipelineStage)
    .where(scoped(schema.pipelineStage.organizationId, session.organizationId))
    .orderBy(asc(schema.pipelineStage.position));

  // Iteración 6 (feedback en vivo: "poder filtrar en pipeline, por cohorte,
  // por sin asignar cohorte") — sin param: sin cohorte (comportamiento
  // original, 004); `cohortId=<id>`: esa cohorte puntual; `cohortId=all`:
  // todas las inscripciones sin filtrar por cohorte (vista general nueva).
  const cohortFilter =
    cohortId === "all"
      ? undefined
      : cohortId
        ? eq(schema.enrollment.cohortId, cohortId)
        : isNull(schema.enrollment.cohortId);

  const enrollments = await db
    .select({
      enrollment: schema.enrollment,
      contact: schema.contact,
      conversationId: schema.conversation.id,
      // 005 iteración 7 — curso de interés del lead (de qué formulario vino).
      interestCourseName: schema.course.name,
    })
    .from(schema.enrollment)
    .innerJoin(schema.contact, eq(schema.enrollment.contactId, schema.contact.id))
    .leftJoin(
      schema.course,
      eq(schema.enrollment.interestCourseId, schema.course.id)
    )
    .leftJoin(
      schema.conversation,
      and(
        eq(schema.conversation.contactId, schema.contact.id),
        eq(schema.conversation.isTest, false)
      )
    )
    .where(
      scoped(schema.enrollment.organizationId, session.organizationId, cohortFilter)
    )
    .orderBy(asc(schema.enrollment.position));

  return Response.json({
    stages: stages.map((s) => ({
      id: s.id,
      name: s.name,
      position: s.position,
      kind: s.kind,
    })),
    enrollments: enrollments.map((r) => ({
      id: r.enrollment.id,
      stageId: r.enrollment.stageId,
      cohortId: r.enrollment.cohortId,
      position: r.enrollment.position,
      lastActivityAt: r.enrollment.lastActivityAt?.toISOString() ?? null,
      interestCourseId: r.enrollment.interestCourseId,
      interestCourseName: r.interestCourseName,
      contact: {
        id: r.contact.id,
        name: fullName(r.contact),
        phone: r.contact.phone,
      },
      conversationId: r.conversationId,
    })),
  });
});
