import { eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { publish } from "@/server/events/bus";
import { exigeVendedor } from "@/server/sellers";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  stageId: z.string().min(1).optional(),
  position: z.number().int().min(0).optional(),
  /** 004 — asigna/reasigna la cohorte de la inscripción; null = vuelve a lead general. */
  cohortId: z.string().min(1).nullable().optional(),
});

/**
 * 012 (T007) — `inscripciones.ver` y no `.editar`, aunque escriba.
 *
 * Mover un lead de etapa o asignarle cohorte es la operación diaria del
 * tablero, y hoy la hace CUALQUIER rol autenticado — soporte incluido.
 * `inscripciones.editar` es una de las tres capacidades financieras que
 * soporte NO tiene: ponerla acá le sacaría el tablero, y esta fase no cambia
 * comportamiento. Que "ver" habilite mover es una arruga del vocabulario, no
 * un descuido; la fase 4 puede partir la capacidad cuando los roles se editen
 * desde la pantalla. Mismo criterio que el checklist de inscripción.
 */
export const PATCH = requireCapability(
  "inscripciones.ver",
  async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;

  const db = getDb();

  if (body.data.stageId) {
    const stage = await db
      .select({ id: schema.pipelineStage.id })
      .from(schema.pipelineStage)
      .where(
        scoped(
          schema.pipelineStage.organizationId,
          session.organizationId,
          eq(schema.pipelineStage.id, body.data.stageId)
        )
      )
      .limit(1);
    if (!stage[0]) return apiError(422, "invalid_stage", "Etapa inexistente");
  }

  if (body.data.cohortId) {
    const cohort = await db
      .select({ id: schema.cohort.id })
      .from(schema.cohort)
      .where(
        scoped(
          schema.cohort.organizationId,
          session.organizationId,
          eq(schema.cohort.id, body.data.cohortId)
        )
      )
      .limit(1);
    if (!cohort[0]) return apiError(422, "invalid_cohort", "Cohorte inexistente");

    /**
     * 2026-10-06 — Pasar un lead a una cohorte lo convierte en una VENTA, y
     * toda venta lleva vendedor. Esta ruta no recibe vendedor (es la del
     * tablero, con `inscripciones.ver`): el camino para cargarlo es el
     * formulario de inscripción, que lo pide.
     */
    const leads = await db
      .select({
        sellerId: schema.enrollment.sellerId,
        parentEnrollmentId: schema.enrollment.parentEnrollmentId,
      })
      .from(schema.enrollment)
      .where(scoped(schema.enrollment.organizationId, session.organizationId, eq(schema.enrollment.id, id)))
      .limit(1);
    const lead = leads[0];
    if (!lead) return apiError(404, "not_found", "Inscripción no encontrada");
    const venta = { cohortId: body.data.cohortId, parentEnrollmentId: lead.parentEnrollmentId };
    if (exigeVendedor(venta) && !lead.sellerId) {
      return apiError(
        422,
        "seller_required",
        "Para pasar a esta persona a una cohorte hace falta saber quién hizo la venta. Se puede inscribir desde su ficha, con el formulario de inscripción, que pide el vendedor."
      );
    }
  }

  const updated = await db
    .update(schema.enrollment)
    .set({
      ...(body.data.stageId ? { stageId: body.data.stageId } : {}),
      ...(body.data.position !== undefined ? { position: body.data.position } : {}),
      ...(body.data.cohortId !== undefined ? { cohortId: body.data.cohortId } : {}),
      updatedAt: new Date(),
    })
    .where(
      scoped(
        schema.enrollment.organizationId,
        session.organizationId,
        eq(schema.enrollment.id, id)
      )
    )
    .returning();
  if (!updated[0]) return apiError(404, "not_found", "Inscripción no encontrada");

  // Notifica a la bandeja para que la etapa se refleje en vivo (panel de
  // detalles y punto de etapa de la lista) sin recargar.
  const convRows = await db
    .select({ id: schema.conversation.id })
    .from(schema.conversation)
    .where(
      scoped(
        schema.conversation.organizationId,
        session.organizationId,
        eq(schema.conversation.contactId, updated[0].contactId),
        eq(schema.conversation.isTest, false)
      )
    )
    .limit(1);
  if (convRows[0]) {
    publish(session.organizationId, {
      type: "conversation.updated",
      data: { conversation: { id: convRows[0].id } },
    });
  }

  return Response.json({ lead: updated[0] });
});
