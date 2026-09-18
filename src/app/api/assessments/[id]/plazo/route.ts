import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { fijarPlazoDeGrupo, otorgarProrroga, plazoSchema } from "@/server/submissions";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 016 (FR-005b) — El plazo, desde el panel del STAFF.
 *
 * `evaluacion.editar` y no una capacidad nueva: lo que se está tocando es la
 * evaluación, que es exactamente lo que esa capacidad ya gobierna. La lista de
 * capacidades es CERRADA (`src/lib/capabilities.ts`) y agregar una tiene
 * consecuencias en toda la aplicación —siembra de roles, `/settings/roles`, la
 * guía derivada de la 027—; esta fase no la toca.
 *
 * El profesor hace lo mismo por su propia puerta en
 * `/api/portal/assessments/[id]/plazo`. Las dos rutas comparten el MÓDULO, no
 * el envoltorio: las tres audiencias no comparten puerta (014/015).
 */

/**
 * FR-005e — Día y hora de PARED; el servidor compone el instante con la zona.
 * El esquema sale del módulo que las dos puertas comparten: con una copia por
 * ruta, apretar la validación en una dejaba la otra aceptando lo de antes.
 */
const grupoSchema = z.object({
  /** `null` borra el plazo (DV-001). */
  plazo: plazoSchema.nullable(),
});

const prorrogaSchema = z.object({
  enrollmentId: z.string().min(1),
  plazo: plazoSchema,
  motivo: z.string().trim().min(3, "Hay que decir por qué"),
});

/** FR-005b — La fecha límite de toda la cohorte. */
export const PUT = requireCapability(
  "evaluacion.editar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const body = await parseBody(req, grupoSchema);
    if (!body.ok) return body.response;

    const r = await fijarPlazoDeGrupo(session.organizationId, id, body.data.plazo);
    if (!r.ok) return apiError(r.status, r.code, r.message);
    return Response.json(r.data);
  }
);

/** FR-005b/FR-005c — La prórroga de una persona: nueva fecha, autor y motivo. */
export const POST = requireCapability(
  "evaluacion.editar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const body = await parseBody(req, prorrogaSchema);
    if (!body.ok) return body.response;

    const r = await otorgarProrroga(
      session.organizationId,
      id,
      body.data.enrollmentId,
      { plazo: body.data.plazo, motivo: body.data.motivo },
      session.userId
    );
    if (!r.ok) return apiError(r.status, r.code, r.message);
    return Response.json({ prorroga: r.data });
  }
);
