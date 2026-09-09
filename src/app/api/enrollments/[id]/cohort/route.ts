import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { moverModuloDeRecorrido } from "@/server/program-staff";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const putSchema = z.object({ cohortId: z.string().min(1) });

/**
 * 028 fase 4 (US4, regla 3) — La BAJA VOLUNTARIA de un módulo.
 *
 * Alguien se baja del módulo 3 por falta de tiempo o por enfermedad y lo cursa
 * con la camada siguiente: la inscripción hija que ya existe pasa a apuntar a
 * la cohorte de ese módulo en la otra camada. La madre no se toca y el plan de
 * cuotas del paquete tampoco: ya está pago.
 *
 * `inscripciones.editar` y no `academico.editar`: lo que cambia acá no es la
 * estructura del programa sino **de qué corrida cursa una persona**, que es
 * exactamente la superficie que FR-016 le veda a soporte. El otro camino de
 * US4 —la recursada tras reprobar, con su propio monto— entra por
 * `POST /api/enrollments` con `parentEnrollmentId` y pide la misma capacidad.
 *
 * PUT y no PATCH porque el pedido reemplaza el valor entero: `cohortId` es uno
 * solo y no hay nada que fusionar.
 */
export const PUT = requireCapability(
  "inscripciones.editar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const body = await parseBody(req, putSchema);
    if (!body.ok) return body.response;

    const result = await moverModuloDeRecorrido(
      session.organizationId,
      id,
      body.data.cohortId
    );
    if (!result.ok) return apiError(result.status, result.code, result.message);

    return Response.json({ enrollment: result });
  }
);
