import { z } from "zod";
import { apiError, parseBody, parseQuery, requireCapability } from "@/lib/api";
import { RESOURCE_KINDS } from "@/lib/db/schema";
import { createResource, listResources } from "@/server/resources";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  courseId: z.string().min(1).optional(),
  classSessionId: z.string().min(1).optional(),
});

/**
 * 013 (T021, FR-006) — Material de un curso o de una clase.
 *
 * `academico.ver`: el material es contenido del curso, y quien puede ver
 * cursos puede ver su material. Soporte lo necesita para responder "¿dónde
 * está la guía?", que es media mesa de ayuda.
 */
export const GET = requireCapability("academico.ver", async (session, req: Request) => {
  const query = parseQuery(new URL(req.url), querySchema);
  if (!query.ok) return query.response;

  const resources = await listResources(session.organizationId, query.data);
  return Response.json({ resources });
});

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  url: z.string().trim().min(1).max(2000),
  kind: z.enum(RESOURCE_KINDS).optional(),
  courseId: z.string().min(1).nullable().optional(),
  classSessionId: z.string().min(1).nullable().optional(),
  courseModuleId: z.string().min(1).nullable().optional(),
});

/**
 * La URL se valida en el servidor (`validateResource`) y no acá con
 * `z.string().url()`: así el mensaje que lee el usuario es el mismo venga de
 * donde venga, y la regla del contenedor y la del enlace viven juntas.
 */
export const POST = requireCapability(
  "academico.editar",
  async (session, req: Request) => {
    const body = await parseBody(req, createSchema);
    if (!body.ok) return body.response;

    const result = await createResource(session.organizationId, body.data);
    if (!result.ok) return apiError(result.status, result.code, result.message);
    return Response.json({ resource: result.data }, { status: 201 });
  }
);
