import { apiError, requireCapability } from "@/lib/api";
import { regularizarInscripciones, vistaPreviaDeInscripcion } from "@/server/module-enrollment";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 034 (FR-005a) — La vista previa de "Inscribir a todos los alumnos en sus
 * módulos": cuántas se crearían, cuántas ya existen y a quién se excluye y por
 * qué. Es la misma lectura que alimenta el aviso del faltante de la pantalla
 * de la especialización, así que el aviso y el botón no pueden discrepar.
 *
 * `academico.ver`, como `/api/cohorts/[id]/program`: dice quién cursa qué
 * módulo, que es la ficha académica de la camada. No lleva plata.
 */
export const GET = requireCapability(
  "academico.ver",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const preview = await vistaPreviaDeInscripcion(session.organizationId, id);
    if (!preview) return apiError(404, "not_found", "Especialización no encontrada");
    return Response.json(preview);
  }
);

/**
 * 034 (FR-005) — La regularización. Idempotente: crea sólo las inscripciones
 * a módulo que faltan, sin cuotas ni vendedor, en una transacción (o entran
 * todas o ninguna). La segunda vez no crea nada.
 *
 * `inscripciones.editar`: crea inscripciones, igual que `POST /api/enrollments`.
 * Nunca corre sola —ni al desplegar ni en una migración—: la decide una persona.
 */
export const POST = requireCapability(
  "inscripciones.editar",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const result = await regularizarInscripciones(session.organizationId, id);
    if (!result) return apiError(404, "not_found", "Especialización no encontrada");
    return Response.json(result, { status: 201 });
  }
);
