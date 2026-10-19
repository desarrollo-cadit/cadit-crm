import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { grantPortalAccessToContact, portalAccessStateForContact } from "@/server/access";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 043 — El acceso al portal de una PERSONA, sin pasar por una inscripción.
 *
 * Existe para quien solo tiene un acceso directo a un curso offline (alguien
 * de una empresa que nunca cursó una cohorte). Misma capacidad y mismo
 * comportamiento que `/api/enrollments/[id]/access`: no reinvita sin `force`.
 */
export const GET = requireCapability(
  "accesos.gestionar",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const result = await portalAccessStateForContact(session.organizationId, id);
    if (!result.ok) return apiError(result.status, result.code, result.message);
    return Response.json(result.data);
  }
);

const bodySchema = z.object({ force: z.boolean().optional() }).strict();

export const POST = requireCapability(
  "accesos.gestionar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const raw = await req.text();
    let force = false;
    if (raw.trim()) {
      const body = await parseBody(new Request(req.url, { method: "POST", body: raw }), bodySchema);
      if (!body.ok) return body.response;
      force = body.data.force ?? false;
    }
    const result = await grantPortalAccessToContact(session.organizationId, id, {
      force,
      sentBy: session.userId,
    });
    if (!result.ok) return apiError(result.status, result.code, result.message);
    if (result.data.skipped) return Response.json(result.data);
    return Response.json(result.data, { status: 201 });
  }
);
