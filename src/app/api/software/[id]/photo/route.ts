import { apiError, requireCapability } from "@/lib/api";
import { getSoftwarePhoto, saveSoftwarePhoto } from "@/server/software";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** 005 iteración 5 — sube la foto de un software (multipart, campo `file`). */
export const PUT = requireCapability(
  "academico.editar",
  async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const form = await req.formData().catch(() => null);
  if (!form) return apiError(400, "invalid", "Se esperaba multipart/form-data");
  const file = form.get("file");
  if (!(file instanceof File)) {
    return apiError(422, "invalid_body", "Falta el archivo (campo `file`)");
  }

  const data = Buffer.from(await file.arrayBuffer());
  const result = await saveSoftwarePhoto(session.organizationId, id, {
    mimeType: file.type || "application/octet-stream",
    sizeBytes: data.byteLength,
    data,
  });
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return Response.json({ ok: true });
});

/** Sirve la foto del volumen local; 404 si no tiene una cargada. */
export const GET = requireCapability(
  "academico.ver",
  async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const photo = await getSoftwarePhoto(session.organizationId, id);
  if (!photo) return apiError(404, "not_found", "Este software no tiene foto");
  return new Response(new Uint8Array(photo.data), {
    headers: {
      "content-type": photo.mimeType,
      "cache-control": "private, max-age=86400",
    },
  });
});
