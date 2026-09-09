import { apiError, requireCapability } from "@/lib/api";
import { cohortAttendance, generateSchedule } from "@/server/attendance";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 009 — Planilla de asistencia de la cohorte: clases, alumnos y porcentaje
 * derivado.
 *
 * `asistencia.*` y no una capacidad financiera: la asistencia no es dato financiero y
 * soporte la necesita tanto como coordinación (mismo criterio que el
 * checklist del roster, FR-014).
 */
export const GET = requireCapability(
  "asistencia.ver",
  async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const data = await cohortAttendance(session.organizationId, id);
  if (!data) return apiError(404, "not_found", "Cohorte no encontrada");
  return Response.json(data);
});

/**
 * 009 (DV-003) — Genera el cronograma. Acción EXPLÍCITA: dar de alta cuarenta
 * clases que nadie pidió es difícil de deshacer.
 */
export const POST = requireCapability(
  "asistencia.editar",
  async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const result = await generateSchedule(session.organizationId, id);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return Response.json({ sessions: result.data }, { status: 201 });
});
