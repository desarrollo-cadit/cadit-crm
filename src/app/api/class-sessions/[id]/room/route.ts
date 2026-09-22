import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { assignClassRoom } from "@/server/virtual-rooms";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** `null` quita la excepción: la clase vuelve a heredar el aula de su cohorte. */
const patchSchema = z.object({
  virtualRoomId: z.string().min(1).nullable(),
});

/**
 * 023 US5 (FR-003) — El aula de UNA clase.
 *
 * Existe separada de `/links` porque son dos cosas distintas y la 025 costó
 * caro confundirlas: el enlace es a dónde entra el alumno, y el aula es qué
 * cuenta de Zoom queda ocupada. Mezclarlas en una misma ruta es el primer paso
 * para que el aula vuelva a colarse en la cadena del enlace.
 *
 * `asistencia.editar` — la misma capacidad que el resto de
 * `/api/class-sessions/:id/*` (la cancelación y los enlaces): es la de quien
 * opera una clase. El aula de la COHORTE sigue siendo `academico.editar`,
 * porque eso edita la cohorte entera.
 *
 * Un aula dada de baja se rechaza también acá (FR-009): la regla está en
 * `assignClassRoom`, compartida con el alta y la edición de cohortes.
 */
export const PATCH = requireCapability(
  "asistencia.editar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const body = await parseBody(req, patchSchema);
    if (!body.ok) return body.response;

    const result = await assignClassRoom(
      session.organizationId,
      id,
      body.data.virtualRoomId
    );
    if (!result.ok) return apiError(result.status, result.code, result.message);

    return Response.json({ classSession: result.data });
  }
);
