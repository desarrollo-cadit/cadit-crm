import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { requireTeacherPortal } from "@/lib/portal-api";
import { teacherAddCohortResource } from "@/server/teacher-portal";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  /** Es un ENLACE: el sistema no almacena archivos (decisión marco). */
  url: z.string().trim().url(),
  kind: z.enum(["guia", "ejemplo", "enlace", "video"]).default("enlace"),
});

/**
 * 023 — El profesor publica material para toda SU camada.
 *
 * No hay DELETE: sacar material que los alumnos ya vieron es una decisión de
 * coordinación, no del profesor que lo subió. Mismo criterio que el material
 * de clase.
 */
export const POST = requireTeacherPortal(
  async (ctx, req: Request, routeCtx: Params) => {
    const { id } = await routeCtx.params;
    const body = await parseBody(req, bodySchema);
    if (!body.ok) return body.response;

    const r = await teacherAddCohortResource(ctx.organizationId, ctx.teacherId, id, {
      title: body.data.title,
      url: body.data.url,
      kind: body.data.kind ?? "enlace",
    });
    if (!r.ok) return apiError(r.status, r.code, r.message);
    return Response.json({ resource: r.data }, { status: 201 });
  }
);
