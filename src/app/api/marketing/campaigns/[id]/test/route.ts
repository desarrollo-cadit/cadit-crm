import { z } from "zod";
import { parseBody, requireCapability } from "@/lib/api";
import { enviarPrueba } from "@/server/marketing/campaigns";
import { respuestaDeFalla } from "@/server/marketing/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Sin campo de destinatario: la prueba va SIEMPRE a quien la pide. */
const bodySchema = z.object({ contactId: z.string().min(1).optional() }).strict();

/** 045 (FR-009, US2-3) — Envío de prueba al correo de la sesión, con `[PRUEBA]`. */
export const POST = requireCapability("marketing.enviar", async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;
  const r = await enviarPrueba(session, id, body.data);
  if (r.ok) return Response.json({ sentTo: r.sentTo });
  if (r.code === "buzon_no_listo") {
    return Response.json(
      {
        error: {
          code: "buzon_no_listo",
          message: "Falta configurar o probar el buzón de marketing en Ajustes › Marketing.",
          missing: r.missing,
        },
      },
      { status: 422 }
    );
  }
  return respuestaDeFalla(r);
});
