import { z } from "zod";
import { apiError, parseBody, parseQuery, requireCapability } from "@/lib/api";
import { assignLicense, listEnrollmentLicenses, unassignLicense } from "@/server/licenses";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 034 (FR-020) — Las licencias asignadas de la inscripción: el paquete de una
 * especialización (madre) o las de un módulo (hija). `academico.ver`: es la
 * misma información que el roster ya muestra.
 */
export const GET = requireCapability(
  "academico.ver",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const licenses = await listEnrollmentLicenses(session.organizationId, id);
    return Response.json({ licenses });
  }
);

const putSchema = z.object({
  softwareId: z.string().min(1),
});

/**
 * 005 (T030, US4, FR-002/FR-003) — asigna una licencia a la inscripción.
 *
 * 034 (FR-020/FR-022) — AGREGA el programa a las licencias de la inscripción
 * (antes reemplazaba la única que había). El mismo programa dos veces es
 * idempotente; sin stock, 409 `no_stock`. `warnings` avisa —sin bloquear— si
 * el mismo programa queda en el paquete y en un módulo.
 *
 * 035 (FR-008) — Un programa asignado al grupo de la cohorte responde 409
 * `asignado_al_grupo`: se asigna desde la cohorte (`assignLicense` lo chequea).
 */
export const PUT = requireCapability(
  "academico.editar",
  async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, putSchema);
  if (!body.ok) return body.response;

  const result = await assignLicense(session.organizationId, id, body.data.softwareId);
  if (!result.ok) return apiError(result.status, result.code, result.message);

  return Response.json({ license: result.license, warnings: result.warnings });
});

const deleteQuerySchema = z.object({ softwareId: z.string().min(1).optional() });

/**
 * 005 (T030, US4, FR-002 escenario 3) — libera la licencia (vuelve al pool).
 *
 * 034 — `?softwareId=` libera sólo la de ese programa; sin él, todas las de
 * la inscripción, que es lo que hacía cuando había una sola.
 *
 * 035 (FR-008) — Sólo individuales: un programa del grupo responde 409
 * `asignado_al_grupo`, y "todas" deja las del grupo (`unassignLicense`).
 */
export const DELETE = requireCapability(
  "academico.editar",
  async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const query = parseQuery(new URL(req.url), deleteQuerySchema);
  if (!query.ok) return query.response;
  const result = await unassignLicense(session.organizationId, id, query.data.softwareId);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return Response.json({ license: result.license });
});
