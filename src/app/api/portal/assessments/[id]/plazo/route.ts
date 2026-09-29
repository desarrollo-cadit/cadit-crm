import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { requireTeacherPortal } from "@/lib/portal-api";
import {
  fijarPlazoDeGrupo,
  otorgarProrroga,
  plazoEditablePorProfesor,
  plazoSchema,
} from "@/server/submissions";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 016 (FR-005b) — El plazo, desde el portal del PROFESOR.
 *
 * La misma operación existe para el staff en `/api/assessments/[id]/plazo`,
 * detrás de su propia capacidad. Son dos rutas y no una con un parámetro a
 * propósito: es la regla de las tres puertas (014/015). Una ruta de portal con
 * un permiso de staff le exigiría al profesor algo que no tiene, y el día que
 * alguien se lo asigne para destrabarlo le abre el panel entero.
 *
 * El nombre del envoltorio del staff no se escribe acá ni siquiera en la
 * prosa: `route-capabilities.test.ts` mira el archivo entero, comentarios
 * incluidos, y nombrarlo haría fallar el guard que separa las dos puertas.
 *
 * Lo que las dos comparten es el MÓDULO —la regla y su esquema—, no el
 * envoltorio.
 */

const grupoSchema = z.object({
  /** `null` borra el plazo: una evaluación sin fecha es legítima (DV-001). */
  plazo: plazoSchema.nullable(),
});

const prorrogaSchema = z.object({
  enrollmentId: z.string().min(1),
  plazo: plazoSchema,
  /** FR-005b — sin motivo no hay prórroga. */
  motivo: z.string().trim().min(3, "Indicá el motivo de la prórroga"),
});

/** FR-005b — La fecha límite de toda la cohorte. */
export const PUT = requireTeacherPortal(
  async (ctx, req: Request, routeCtx: Params) => {
    const { id } = await routeCtx.params;
    const body = await parseBody(req, grupoSchema);
    if (!body.ok) return body.response;

    /**
     * El alcance y el estado de la cohorte los decide el módulo: una evaluación
     * que no es suya sale 404 —igual que una inventada— y una cohorte ya
     * finalizada sale 422 con su motivo, que es lo que la pantalla muestra.
     */
    const permiso = await plazoEditablePorProfesor(ctx.organizationId, ctx.teacherId, id);
    if (!permiso.ok) return apiError(permiso.status, permiso.code, permiso.message);

    const r = await fijarPlazoDeGrupo(ctx.organizationId, id, body.data.plazo);
    if (!r.ok) return apiError(r.status, r.code, r.message);
    return Response.json(r.data);
  }
);

/** FR-005b/FR-005c — La prórroga de UNA persona, con su motivo. */
export const POST = requireTeacherPortal(
  async (ctx, req: Request, routeCtx: Params) => {
    const { id } = await routeCtx.params;
    const body = await parseBody(req, prorrogaSchema);
    if (!body.ok) return body.response;

    const permiso = await plazoEditablePorProfesor(ctx.organizationId, ctx.teacherId, id);
    if (!permiso.ok) return apiError(permiso.status, permiso.code, permiso.message);

    const r = await otorgarProrroga(
      ctx.organizationId,
      id,
      body.data.enrollmentId,
      { plazo: body.data.plazo, motivo: body.data.motivo },
      ctx.userId
    );
    if (!r.ok) return apiError(r.status, r.code, r.message);
    return Response.json({ prorroga: r.data });
  }
);
