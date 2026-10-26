import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { ACADEMY_TIME_ZONE, classEndsAt } from "@/lib/schedule-time";
import { asignarAlGrupo, listarProgramasDelGrupo } from "@/server/group-licenses";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 035 (US1, FR-001) — Los programas asignados a todo el grupo de la cohorte,
 * con cuántos miembros los tienen y cuántos no (sin stock). `academico.ver`:
 * es lo que el roster ya muestra.
 */
export const GET = requireCapability(
  "academico.ver",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const programas = await listarProgramasDelGrupo(session.organizationId, id);
    if (!programas) return apiError(404, "not_found", "Grupo no encontrado");
    return Response.json({ programas });
  }
);

const postSchema = z.object({
  softwareId: z.string().min(1).max(64),
  /** "2027-03-31" — vence al final de ese día en la academia. Opcional. */
  expiresAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

/**
 * 035 (FR-001/FR-002/FR-010) — Asigna el programa a todo el grupo: una
 * licencia por miembro activo, todo o nada. Sin stock para todos, 409
 * `no_stock` diciendo cuántas faltan y no se asigna ninguna.
 *
 * `licencias.gestionar` (2026-10-26): la misma capacidad que asignar una
 * licencia por alumno (FR-021). Si quedara en `academico.editar`, coordinación
 * asignaría por el grupo lo que ya no puede asignar por alumno.
 */
export const POST = requireCapability(
  "licencias.gestionar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const body = await parseBody(req, postSchema);
    if (!body.ok) return body.response;

    const expiresAt = body.data.expiresAt
      ? classEndsAt(new Date(`${body.data.expiresAt}T00:00:00.000Z`), null, ACADEMY_TIME_ZONE)
      : null;
    const result = await asignarAlGrupo(
      session.organizationId,
      id,
      body.data.softwareId,
      expiresAt,
      session.userId
    );
    if (!result.ok) return apiError(result.status, result.code, result.message);
    return Response.json(result.data);
  }
);
