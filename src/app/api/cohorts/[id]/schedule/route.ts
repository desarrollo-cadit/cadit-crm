import { apiError, requireCapability } from "@/lib/api";
import { generateSchedule } from "@/server/attendance";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 013 (T010, DV-006 opción B) — Genera el cronograma de UNA cohorte.
 *
 * Acción explícita y por cohorte, decidida en DV-006. La alternativa era
 * generarlo para las 41 en una migración, y se descartó: escribiría cientos de
 * clases PASADAS sobre datos reales, a partir de horarios que 6 cohortes no
 * tienen. Una migración así después nadie sabe deshacerla.
 *
 * **No se escribe lógica nueva**: reusa `generateSchedule()` del ciclo 009,
 * que existe desde entonces y nunca se había usado. Ese helper ya devuelve
 * motivos explicados (sin días, sin fecha de fin, rango vacío) y **rechaza
 * regenerar** sobre una cohorte que ya tiene cronograma, así que llamarlo dos
 * veces no duplica clases (constitución IV).
 *
 * 2026-10-27 — Ya no es el ÚNICO camino: confirmar un grupo (o completar los
 * datos de uno confirmado) llama a este mismo `generateSchedule` solo
 * (`src/server/cronograma-automatico.ts`). El botón sigue para los grupos
 * anteriores a esa regla, que nunca generan solos.
 *
 * `academico.editar`: dar de alta cuarenta clases es editar el curso, no
 * tomar asistencia.
 */
export const POST = requireCapability(
  "academico.editar",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const result = await generateSchedule(session.organizationId, id);
    if (!result.ok) return apiError(result.status, result.code, result.message);
    return Response.json({ classes: result.data }, { status: 201 });
  }
);
