import { z } from "zod";
import { parseBody, requireCapability } from "@/lib/api";
import { guardarAjustes, marketingSettingsDto } from "@/server/marketing/settings";
import { respuestaDeFalla } from "@/server/marketing/http";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    senderEmail: z.string().trim().email("Revisá el correo del buzón.").max(200),
    senderName: z.string().trim().min(1, "Poné el nombre del remitente.").max(80),
    footerAddress: z.string().trim().min(1, "Poné la dirección de la academia.").max(200),
    footerContact: z.string().trim().min(1, "Poné un dato de contacto.").max(200),
  })
  .strict();

/**
 * 045 (US5; contracts/marketing-settings.md) — Buzón de marketing, remitente
 * y pie. `marketing.configurar`: solo Dirección. La credencial de M365 no
 * viaja; el DTO dice si está configurada.
 */
export const GET = requireCapability("marketing.configurar", async (session) => {
  return Response.json(await marketingSettingsDto(session.organizationId));
});

export const PUT = requireCapability("marketing.configurar", async (session, req: Request) => {
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;
  const r = await guardarAjustes(session, body.data);
  if (!r.ok) return respuestaDeFalla(r);
  return Response.json(r.settings);
});
