import { requireCapability } from "@/lib/api";
import { borrarImagen } from "@/server/marketing/images";
import { respuestaDeFalla } from "@/server/marketing/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; imageId: string }> };

/** 045 — Solo en borrador; si un bloque la usa, 409 `imagen_en_uso`. */
export const DELETE = requireCapability("marketing.enviar", async (session, _req: Request, ctx: Params) => {
  const { id, imageId } = await ctx.params;
  const r = await borrarImagen(session.organizationId, id, imageId);
  if (!r.ok) return respuestaDeFalla(r);
  return new Response(null, { status: 204 });
});
