import { z } from "zod";
import { apiError, parseBody, parseQuery, requireCapability } from "@/lib/api";
import {
  assignTeacherLicense,
  listTeacherLicenses,
  unassignTeacherLicense,
} from "@/server/licenses";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 0090 — Las licencias asignadas a un profesor. `academico.ver`, como la
 * vista de Licencias. Es de STAFF: el portal del profesor no tiene ninguna
 * ruta de licencias (`tests/unit/licencias-de-profesores.test.ts`).
 */
export const GET = requireCapability(
  "academico.ver",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    return Response.json({ licenses: await listTeacherLicenses(session.organizationId, id) });
  }
);

const putSchema = z.object({
  softwareId: z.string().min(1),
  /** El equipo de licencias del que sale el asiento. Obligatorio (422 sin él). */
  teamId: z.string().min(1),
});

/**
 * Asigna una licencia al profesor, del cupo del equipo elegido. Idempotente
 * para el mismo programa y equipo; sin stock, 409 `no_stock`.
 * `licencias.gestionar`, igual que asignarle una a un alumno.
 */
export const PUT = requireCapability(
  "licencias.gestionar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const body = await parseBody(req, putSchema);
    if (!body.ok) return body.response;
    const result = await assignTeacherLicense(
      session.organizationId,
      id,
      body.data.softwareId,
      body.data.teamId
    );
    if (!result.ok) return apiError(result.status, result.code, result.message);
    return Response.json({ license: result.license });
  }
);

const deleteQuerySchema = z.object({ softwareId: z.string().min(1).optional() });

/** Libera la licencia (`?softwareId=`) o todas las del profesor; vuelve al stock. */
export const DELETE = requireCapability(
  "licencias.gestionar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const query = parseQuery(new URL(req.url), deleteQuerySchema);
    if (!query.ok) return query.response;
    const result = await unassignTeacherLicense(session.organizationId, id, query.data.softwareId);
    return Response.json({ license: result.license });
  }
);
