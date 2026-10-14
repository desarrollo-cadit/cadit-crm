import { apiError, requireCapability } from "@/lib/api";
import { saveCourseImage } from "@/server/course-image";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Sube la portada del curso (multipart, campo `file`). La sirve `/api/public/courses/[id]/image`. */
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
  const result = await saveCourseImage(session.organizationId, id, {
    mimeType: file.type || "application/octet-stream",
    sizeBytes: data.byteLength,
    data,
  });
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return Response.json({ imageUrl: result.imageUrl });
});
