import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { diaDeAccesoSchema, NOTA_MAX } from "@/lib/offline-grants";
import {
  applyCompanyGrant,
  companiesWithPeople,
  previewCompanyGrant,
} from "@/server/offline-courses/grants";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Las empresas que tienen personas hoy (las únicas que tiene sentido elegir). */
export const GET = requireCapability("academico.ver", async (session) => {
  return Response.json({ companies: await companiesWithPeople(session.organizationId) });
});

const bodySchema = z
  .object({
    companyId: z.string().min(1),
    accessUntil: diaDeAccesoSchema,
    note: z.string().trim().max(NOTA_MAX).nullable().optional(),
    /** `false` = solo la vista previa; `true` = aplicar (re-planeado en el servidor). */
    confirm: z.boolean(),
  })
  .strict();

/**
 * 043 — Asignar el curso a toda una empresa: un acceso INDIVIDUAL por cada
 * persona que la empresa tiene hoy. Primero la vista previa (quién lo recibe,
 * a quién se le extiende, a quién no se toca); después, confirmado, se aplica.
 * Idempotente y nunca acorta.
 */
export const POST = requireCapability(
  "academico.editar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const body = await parseBody(req, bodySchema);
    if (!body.ok) return body.response;
    const note = body.data.note?.trim() ? body.data.note.trim() : null;

    if (!body.data.confirm) {
      const r = await previewCompanyGrant(session.organizationId, id, body.data.companyId, body.data.accessUntil);
      if (!r.ok) return apiError(r.status, r.code, r.message);
      return Response.json({ preview: r.data });
    }
    const r = await applyCompanyGrant(
      session.organizationId,
      { courseId: id, companyId: body.data.companyId, accessUntil: body.data.accessUntil, note },
      session.userId
    );
    if (!r.ok) return apiError(r.status, r.code, r.message);
    return Response.json({ applied: r.data });
  }
);
