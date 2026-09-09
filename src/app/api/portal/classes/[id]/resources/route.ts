import { z } from "zod";
import { httpUrl } from "@/lib/url-schema";
import { apiError, parseBody } from "@/lib/api";
import { requireTeacherPortal } from "@/lib/portal-api";
import { teacherAddClassResource } from "@/server/teacher-portal";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  /** Es un ENLACE: el sistema no almacena archivos (decisión marco). */
  url: httpUrl,
  kind: z.enum(["guia", "ejemplo", "enlace", "video"]).default("enlace"),
});

/**
 * 023 — El profesor publica material de SU clase.
 *
 * Cuelga de la CLASE y no del curso a propósito: el material del curso es el
 * programa oficial que mantiene coordinación, y dejar que un profesor lo
 * reescriba afectaría a las otras seis cohortes que dictan otros. Lo que trae
 * el profesor es el ejercicio del día.
 *
 * No hay DELETE: borrar material que los alumnos ya vieron es una decisión de
 * coordinación, no del profesor que lo subió.
 */
export const POST = requireTeacherPortal(
  async (ctx, req: Request, routeCtx: Params) => {
    const { id } = await routeCtx.params;
    const body = await parseBody(req, bodySchema);
    if (!body.ok) return body.response;

    const r = await teacherAddClassResource(ctx.organizationId, ctx.teacherId, id, {
      title: body.data.title,
      url: body.data.url,
      // El `.default()` de Zod deja el tipo opcional en la INFERENCIA aunque
      // en runtime siempre venga: se fija acá en vez de aflojar la firma.
      kind: body.data.kind ?? "enlace",
    });
    if (!r.ok) return apiError(r.status, r.code, r.message);
    return Response.json({ resource: r.data }, { status: 201 });
  }
);
