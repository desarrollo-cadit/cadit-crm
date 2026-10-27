import { z } from "zod";
import { apiError, requireCapability } from "@/lib/api";
import { nombresAprendidos } from "@/server/zoom/attendance-settings";

export const dynamic = "force-dynamic";

/** Configuración › Zoom › Nombres aprendidos (`?q=` busca). */
const querySchema = z.object({ q: z.string().trim().max(100).optional() });

export const GET = requireCapability("configuracion.editar", async (session, req: Request) => {
  const parsed = querySchema.safeParse({ q: new URL(req.url).searchParams.get("q") ?? undefined });
  if (!parsed.success) return apiError(422, "invalid_query", "La búsqueda es demasiado larga.");
  return Response.json({ nombres: await nombresAprendidos(session.organizationId, { q: parsed.data.q }) });
});
