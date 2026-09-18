import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { requireTeacherPortal } from "@/lib/portal-api";
import { corregirEntrega } from "@/server/submissions";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const correccionSchema = z.object({
  /**
   * 010/DV-001 — La escala es aprobado / no aprobado: no hay nota numérica.
   * No es nullable como en la planilla porque corregir una entrega ES un acto:
   * "volver a sin corregir" se resuelve reabriéndola, no borrando el juicio.
   */
  passed: z.boolean(),
  /**
   * FR-007 — La devolución es obligatoria, y a propósito: **un «no aprobado»
   * sin explicación no le sirve de nada al alumno**, que es textualmente lo que
   * pide US4. El mínimo de 3 evita el "ok" que no explica nada.
   */
  feedback: z.string().trim().min(3, "Escribí la devolución").max(4000),
});

/**
 * 016 (US3, FR-006, DV-002) — El profesor corrige la entrega.
 *
 * En el MISMO movimiento se escribe el resultado en `assessment_result`: el
 * doble paso es la razón por la que hoy los datos no se cargan. Volver a
 * corregir sobreescribe y nunca duplica.
 *
 * La entrega de una cohorte ajena responde 404, igual que una inexistente.
 */
export const PATCH = requireTeacherPortal(
  async (ctx, req: Request, routeCtx: Params) => {
    const { id } = await routeCtx.params;
    const body = await parseBody(req, correccionSchema);
    if (!body.ok) return body.response;

    const r = await corregirEntrega(
      ctx.organizationId,
      ctx.teacherId,
      ctx.userId,
      id,
      body.data
    );
    if (!r.ok) return apiError(r.status, r.code, r.message);
    return Response.json(r.data);
  }
);
