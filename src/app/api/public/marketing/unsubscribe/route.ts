import { z } from "zod";
import { apiError, parseBody, withOrganization } from "@/lib/api";
import { checkRateLimit, clientIp, publicFormRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { registrarBaja } from "@/server/marketing/unsubscribe";
import { resolveSoleOrganizationId } from "@/server/public-catalog";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ token: z.string().min(1).max(200) }).strict();

/** Mismo cuerpo para todo motivo: no revela de quién es el enlace (US4-2). */
const invalido = () => apiError(404, "not_found", "Este enlace no es válido.");

/**
 * 045 (FR-012, FR-013; DV-010) — El segundo paso de la baja: el botón
 * "Confirmar la baja" de `/baja/[token]`. Sin sesión, con token firmado por
 * destinatario y rate limit por IP. Idempotente: si ya estaba de baja, 200.
 */
export const POST = withOrganization(
  "public:marketing-baja",
  async (_req: Request) => resolveSoleOrganizationId(),
  invalido,
  async (organizationId: string, req: Request) => {
    const limite = publicFormRateLimit();
    if (!checkRateLimit(`marketing-baja:${clientIp(req)}`, limite).allowed) {
      return tooManyRequests(limite.windowMs);
    }
    const body = await parseBody(req, bodySchema);
    if (!body.ok) return invalido();
    const r = await registrarBaja(organizationId, body.data.token);
    if (!r.ok) return invalido();
    return Response.json({ ok: true });
  }
);
