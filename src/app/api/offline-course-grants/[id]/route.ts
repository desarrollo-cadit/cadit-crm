import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { diaDeAccesoSchema, NOTA_MAX } from "@/lib/offline-grants";
import { revokeGrant, updateGrant } from "@/server/offline-courses/grants";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z
  .object({
    accessUntil: diaDeAccesoSchema.optional(),
    note: z.string().trim().max(NOTA_MAX).nullable().optional(),
  })
  .strict()
  .refine((b) => b.accessUntil !== undefined || b.note !== undefined, {
    message: "Nada que cambiar",
  });

/** 043 — Cambiar la fecha (extender o acortar) o la nota de un acceso directo activo. */
export const PATCH = requireCapability(
  "academico.editar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const body = await parseBody(req, bodySchema);
    if (!body.ok) return body.response;
    const r = await updateGrant(
      session.organizationId,
      id,
      {
        accessUntil: body.data.accessUntil,
        note: body.data.note === undefined ? undefined : body.data.note?.trim() || null,
      },
      session.userId
    );
    if (!r.ok) return apiError(r.status, r.code, r.message);
    return Response.json(r.data);
  }
);

/** 043 — Quitar un acceso directo. Se marca quién y cuándo; no se borra. */
export const DELETE = requireCapability(
  "academico.editar",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const r = await revokeGrant(session.organizationId, id, session.userId);
    if (!r.ok) return apiError(r.status, r.code, r.message);
    return Response.json(r.data);
  }
);
