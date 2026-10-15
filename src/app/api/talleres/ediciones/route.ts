import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { addWorkshopEdition, workshopEditionSchema } from "@/server/workshops";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  courseId: z.string().min(1),
  edition: workshopEditionSchema,
});

/** 033 (FR-003) — Otra edición de un taller que ya existe (una reedición). */
export const POST = requireCapability("academico.editar", async (session, req: Request) => {
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;
  const result = await addWorkshopEdition(
    session.organizationId,
    body.data.courseId,
    body.data.edition
  );
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return Response.json(result.data, { status: 201 });
});
