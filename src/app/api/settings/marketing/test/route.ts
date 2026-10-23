import { requireCapability } from "@/lib/api";
import { probarBuzon } from "@/server/marketing/settings";
import { respuestaDeFalla } from "@/server/marketing/http";

export const dynamic = "force-dynamic";

/**
 * 045 (US5-2) — Probar el buzón de marketing antes de usarlo: un correo
 * DESDE el buzón A quien prueba. Un rechazo de Exchange vuelve como 200 con
 * `ok: false` y el motivo en palabras (y queda guardado): no es un error del
 * pedido, es la respuesta que la persona vino a buscar.
 */
export const POST = requireCapability("marketing.configurar", async (session) => {
  const r = await probarBuzon(session);
  if ("code" in r) return respuestaDeFalla(r);
  return Response.json(r);
});
