import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { requireTeacherPortal } from "@/lib/portal-api";
import { teacherRecordResult } from "@/server/teacher-portal";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const resultsSchema = z.object({
  results: z
    .array(
      z.object({
        enrollmentId: z.string().min(1),
        /** `null` = pendiente de corrección, que NO es reprobado (FR-005). */
        passed: z.boolean().nullable(),
      })
    )
    .min(1),
});

/**
 * 014 (T028) — El profesor carga o corrige resultados de SU cohorte.
 *
 * Una evaluación de otra cohorte responde **404**, igual que una inexistente:
 * el profesor ajeno no puede deducir que existe.
 */
export const PATCH = requireTeacherPortal(
  async (ctx, req: Request, routeCtx: Params) => {
    const { id } = await routeCtx.params;
    const body = await parseBody(req, resultsSchema);
    if (!body.ok) return body.response;

    const r = await teacherRecordResult(
      ctx.organizationId,
      ctx.teacherId,
      ctx.userId,
      id,
      body.data.results
    );
    if (!r.ok) return apiError(r.status, r.code, r.message);
    return Response.json(r.data);
  }
);
