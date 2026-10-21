import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { correoNullable } from "@/lib/contact-identity";
import { fijarCorreoDeLicencia } from "@/server/licenses";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  /** `null` o `""` = usar el correo del alumno. */
  licenseEmail: correoNullable,
});

/**
 * 2026-10-21 — El correo para la licencia de una inscripción, editado desde
 * la sección de licencias. `academico.editar`, la misma capacidad que asigna
 * y libera licencias (`/api/enrollments/[id]/license`). Responde el correo
 * resuelto (`correoDeLicencia`), que quien edita ya veía en el roster.
 */
export const PATCH = requireCapability(
  "academico.editar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const body = await parseBody(req, patchSchema);
    if (!body.ok) return body.response;
    const result = await fijarCorreoDeLicencia(
      session.organizationId,
      id,
      body.data.licenseEmail ?? null
    );
    if (!result) return apiError(404, "not_found", "Inscripción no encontrada");
    return Response.json({ licenseEmail: result });
  }
);
