import { apiError, requireCapability } from "@/lib/api";
import { subirImagen } from "@/server/marketing/images";
import { respuestaDeFalla } from "@/server/marketing/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** 045 (FR-007a) — Sube una imagen a un borrador (multipart, campo `file`). */
export const POST = requireCapability("marketing.enviar", async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const form = await req.formData().catch(() => null);
  if (!form) return apiError(400, "invalid", "Se esperaba multipart/form-data");
  const file = form.get("file");
  if (!(file instanceof File)) return apiError(422, "invalid_body", "Falta el archivo (campo `file`)");
  const r = await subirImagen(session.organizationId, session.userId, id, {
    data: Buffer.from(await file.arrayBuffer()),
  });
  if (!r.ok) return respuestaDeFalla(r);
  return Response.json(r.image, { status: 201 });
});
