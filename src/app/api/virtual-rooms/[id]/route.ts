import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { updateVirtualRoom } from "@/server/virtual-rooms";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  url: z.string().trim().url().optional(),
  accountEmail: z.string().trim().email().nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  /** 023 (FR-009) — baja LÓGICA: la fila se conserva como evidencia. */
  archived: z.boolean().optional(),
});

/**
 * 023 (US1) — Editar un aula o darla de baja.
 *
 * **No hay DELETE, y es deliberado.** Una clase pasada que se dictó acá
 * conserva la evidencia de dónde fue; borrar la fila reescribiría esa
 * historia. La baja se pide con `archived: true`.
 */
export const PATCH = requireCapability(
  "academico.editar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const body = await parseBody(req, patchSchema);
    if (!body.ok) return body.response;

    const result = await updateVirtualRoom(session.organizationId, id, body.data);
    if (!result.ok) return apiError(result.status, result.code, result.message);
    return Response.json({ ok: true });
  }
);
