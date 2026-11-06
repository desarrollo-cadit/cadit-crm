import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { cubrirConVenta, soltarDeVenta } from "@/server/venta-empresa";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.discriminatedUnion("action", [
  /** Suma esta inscripción a la venta de empresa de `titularId`. */
  z.object({ action: z.literal("cubrir"), titularId: z.string().min(1) }).strict(),
  /** La saca de la venta de empresa: vuelve a cobrarse por sí misma. */
  z.object({ action: z.literal("soltar") }).strict(),
]);

/**
 * 2026-11-06 — Sumar un alumno a la venta de su empresa, o sacarlo de ella.
 * `cobranza.registrar`, como el resto de las escrituras de la venta de empresa.
 */
export const POST = requireCapability("cobranza.registrar", async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;

  const r =
    body.data.action === "cubrir"
      ? await cubrirConVenta(session.organizationId, id, body.data.titularId)
      : await soltarDeVenta(session.organizationId, id);
  if (!r.ok) return apiError(r.status, r.code, r.message);
  return Response.json({ ok: true });
});
