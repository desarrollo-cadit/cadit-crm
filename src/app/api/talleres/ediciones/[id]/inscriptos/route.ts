import { apiError, parseBody, requireCapability } from "@/lib/api";
import {
  manualAttendeeSchema,
  registerManualAttendee,
  scheduleConfirmation,
} from "@/server/workshops";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 033 (FR-012, US2 escenario 5) — Anotar a alguien a mano: queda igual que si
 * hubiera venido de la web (mismo cupo, misma cuota), con origen `manual`.
 */
export const POST = requireCapability(
  "inscripciones.editar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const body = await parseBody(req, manualAttendeeSchema);
    if (!body.ok) return body.response;
    const result = await registerManualAttendee(session.organizationId, id, body.data);
    if (!result.ok) return apiError(result.status, result.code, result.message);
    if (result.data.created) {
      scheduleConfirmation(session.organizationId, result.data.registrationId);
    }
    return Response.json(result.data, { status: result.data.created ? 201 : 200 });
  }
);
