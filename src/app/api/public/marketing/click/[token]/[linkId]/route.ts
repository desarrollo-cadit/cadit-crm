import { withOrganization } from "@/lib/api";
import { registrarClic } from "@/server/marketing/unsubscribe";
import { resolveSoleOrganizationId } from "@/server/public-catalog";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string; linkId: string }> };

/** Neutro: no dice si la campaña o la persona existen. Nunca 403. */
const invalido = () =>
  new Response("Este enlace no es válido.", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });

/**
 * 045 (FR-023, DV-012) — Redirección de un clic del correo. Sin sesión, con
 * token firmado por destinatario (propósito "clic", distinto de la baja). Solo
 * redirige a la URL GUARDADA de la misma campaña: nunca a una del pedido, así
 * que no hay redirección abierta.
 */
export const GET = withOrganization(
  "public:marketing-clic",
  async (_req: Request, _ctx: Params) => resolveSoleOrganizationId(),
  invalido,
  async (organizationId: string, _req: Request, ctx: Params) => {
    const { token, linkId } = await ctx.params;
    const destino = await registrarClic(organizationId, token, linkId);
    if (!destino) return invalido();
    return new Response(null, {
      status: 302,
      headers: { location: destino, "cache-control": "no-store", "referrer-policy": "no-referrer" },
    });
  }
);
