import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { sessionCapabilities } from "@/lib/capabilities";
import { changeMemberRole } from "@/server/team";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ memberId: string }> };

const patchSchema = z.object({ roleId: z.string().trim().min(1).max(64) });

/**
 * Crear-roles — Cambia el rol de una cuenta del equipo.
 *
 * Las reglas viven en `changeMemberRole` (sin escalada, no a uno mismo,
 * siempre alguien a cargo); la ruta solo elige el código de estado.
 */
export const PATCH = requireCapability(
  "accesos.gestionar",
  async (session, req: Request, ctx: Params) => {
    const { memberId } = await ctx.params;
    const body = await parseBody(req, patchSchema);
    if (!body.ok) return body.response;

    const result = await changeMemberRole(
      session.organizationId,
      { userId: session.userId, capabilities: sessionCapabilities(session) },
      memberId,
      body.data.roleId
    );
    if (!result.ok) return apiError(result.status, result.code, result.message);
    return Response.json({ member: result.data });
  }
);
