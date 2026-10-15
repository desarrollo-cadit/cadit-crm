import { apiError, parseBody, requireCapability } from "@/lib/api";
import {
  createWorkshop,
  createWorkshopSchema,
  listWorkshopCourses,
  listWorkshopEditions,
} from "@/server/workshops";

export const dynamic = "force-dynamic";

/**
 * 033 (FR-001, US5) — Las ediciones de taller (próximas primero) y los
 * talleres existentes, para "agregar otra edición".
 */
export const GET = requireCapability("academico.ver", async (session) => {
  const [editions, courses] = await Promise.all([
    listWorkshopEditions(session.organizationId),
    listWorkshopCourses(session.organizationId),
  ]);
  return Response.json({ editions, courses });
});

/** 033 (FR-003) — Crear el taller y su primera edición en un solo paso. */
export const POST = requireCapability("academico.editar", async (session, req: Request) => {
  const body = await parseBody(req, createWorkshopSchema);
  if (!body.ok) return body.response;
  const result = await createWorkshop(session.organizationId, body.data);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return Response.json(result.data, { status: 201 });
});
