import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { updateSeller } from "@/server/sellers";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(120).optional(),
  email: z.string().trim().email("El correo no tiene un formato válido").max(200).nullable().optional(),
  userId: z.string().min(1).nullable().optional(),
  /** `true` archiva, `false` reactiva. No hay borrado: ver `updateSeller`. */
  archived: z.boolean().optional(),
});

/** 2026-10-06 — Editar y archivar un vendedor. Misma capacidad que el alta (ver `../route.ts`). */
export const PATCH = requireCapability(
  "inscripciones.editar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const body = await parseBody(req, patchSchema);
    if (!body.ok) return body.response;

    const result = await updateSeller(session.organizationId, id, body.data);
    if (!result.ok) return apiError(result.status, result.code, result.message);
    return Response.json({ seller: result.seller });
  }
);
