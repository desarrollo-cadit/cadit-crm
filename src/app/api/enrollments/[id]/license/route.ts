import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { assignLicense, unassignLicense } from "@/server/licenses";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const putSchema = z.object({
  softwareId: z.string().min(1),
});

/** 005 (T030, US4, FR-002/FR-003) — asigna una licencia a la inscripción. */
export const PUT = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, putSchema);
  if (!body.ok) return body.response;

  const result = await assignLicense(session.organizationId, id, body.data.softwareId);
  if (!result.ok) return apiError(result.status, result.code, result.message);

  return Response.json({ license: result.license });
});

/** 005 (T030, US4, FR-002 escenario 3) — libera la licencia (vuelve al pool). */
export const DELETE = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const license = await unassignLicense(session.organizationId, id);
  return Response.json({ license });
});
