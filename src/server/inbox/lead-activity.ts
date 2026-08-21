import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";

/**
 * Actividad de lead general al recibir un mensaje (US2 / 004 FR-010): si el
 * contacto no tiene su lead general (enrollment sin cohort_id), se crea en
 * la primera etapa del pipeline; si lo tiene, se actualiza su última
 * actividad. Sin cambios de comportamiento respecto al `lead` de antes de
 * 004 — solo cambia la tabla destino y el conflict target (partial unique
 * `enrollment_contact_general_uq`, ver research.md DV-005).
 *
 * 005 iteración 7 — `interestCourseId` opcional: el formulario de captación
 * atado a un curso lo manda para que el lead sepa de qué curso viene. Es
 * atribución de PRIMER contacto: si el lead ya tiene un curso de interés no
 * se pisa (`coalesce`), porque el dato sirve justamente para saber por dónde
 * entró. La ingesta de WhatsApp no lo manda y se comporta igual que antes.
 */
export async function onLeadActivity(
  organizationId: string,
  contactId: string,
  at: Date,
  interestCourseId?: string | null
): Promise<void> {
  const db = getDb();

  const existing = await db
    .select({ id: schema.enrollment.id })
    .from(schema.enrollment)
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        eq(schema.enrollment.contactId, contactId),
        isNull(schema.enrollment.cohortId)
      )
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(schema.enrollment)
      .set({
        lastActivityAt: at,
        updatedAt: new Date(),
        // `coalesce` en SQL: rellena el curso solo si la tarjeta todavía no
        // tenía uno. Sin sobrescribir el primer origen.
        ...(interestCourseId
          ? {
              interestCourseId: sql`coalesce(${schema.enrollment.interestCourseId}, ${interestCourseId})`,
            }
          : {}),
      })
      .where(eq(schema.enrollment.id, existing[0].id));
    return;
  }

  const firstStage = await db
    .select({ id: schema.pipelineStage.id })
    .from(schema.pipelineStage)
    .where(
      and(
        eq(schema.pipelineStage.organizationId, organizationId),
        eq(schema.pipelineStage.kind, "open")
      )
    )
    .orderBy(asc(schema.pipelineStage.position))
    .limit(1);
  if (!firstStage[0]) return; // pipeline sin etapas abiertas: no hay dónde crear

  const maxPos = await db
    .select({
      max: sql<number>`coalesce(max(${schema.enrollment.position}), -1)`,
    })
    .from(schema.enrollment)
    .where(
      and(
        eq(schema.enrollment.organizationId, organizationId),
        eq(schema.enrollment.stageId, firstStage[0].id)
      )
    );

  await db
    .insert(schema.enrollment)
    .values({
      id: newId("enrollment"),
      organizationId,
      contactId,
      cohortId: null,
      stageId: firstStage[0].id,
      position: (maxPos[0]?.max ?? -1) + 1,
      lastActivityAt: at,
      interestCourseId: interestCourseId ?? null,
    })
    .onConflictDoNothing({
      target: [schema.enrollment.contactId],
      where: sql`${schema.enrollment.cohortId} IS NULL`,
    });
}
