import { requireCapability } from "@/lib/api";
import { materialPorAsignar } from "@/server/resources";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 0088 — El material que vino de las CLASES del grupo en que se basó el alta
 * y todavía no se asignó a una clase. Lo ve quien ve lo académico, igual que
 * el resto del material (`GET /api/resources`).
 */
export const GET = requireCapability(
  "academico.ver",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    return Response.json({ resources: await materialPorAsignar(session.organizationId, id) });
  }
);
