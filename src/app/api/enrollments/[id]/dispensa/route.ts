import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { otorgarDispensa, revocarDispensa } from "@/server/attendance-waiver";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * FR-023 — el motivo es la regla, no una validación de forma: sin motivo no
 * hay dispensa. El mínimo de 3 caracteres evita el "ok" que no explica nada;
 * el resto lo decide quien lo escribe.
 */
const bodySchema = z.object({
  motivo: z.string().trim().min(3, "Hay que decir por qué"),
});

/**
 * 028 fase 5 (US6, FR-022) — Otorga la dispensa de asistencia de un módulo.
 *
 * La gobierna `evaluacion.editar` (DV-003) y no una capacidad nueva: lo que
 * cambia es si el alumno aprueba, no quién pasó lista. La lista de
 * capacidades es CERRADA (`src/lib/capabilities.ts`) y esta fase no la toca.
 */
export const POST = requireCapability(
  "evaluacion.editar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const body = await parseBody(req, bodySchema);
    if (!body.ok) return body.response;

    const result = await otorgarDispensa(session.organizationId, id, {
      motivo: body.data.motivo,
      otorgadaPor: session.userId,
    });
    if (!result.ok) return apiError(result.status, result.code, result.message);

    return Response.json({ dispensa: result.data });
  }
);

/**
 * DV-004 — Revoca la dispensa. Es un acto propio y con su propio motivo, y
 * **no** arrastra la anulación del certificado: encadenarlos revocaría uno ya
 * entregado en la mano de una persona sin que nadie lo haya decidido.
 */
export const DELETE = requireCapability(
  "evaluacion.editar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const body = await parseBody(req, bodySchema);
    if (!body.ok) return body.response;

    const result = await revocarDispensa(session.organizationId, id, {
      motivo: body.data.motivo,
      revocadaPor: session.userId,
    });
    if (!result.ok) return apiError(result.status, result.code, result.message);

    return Response.json({ dispensa: result.data });
  }
);
