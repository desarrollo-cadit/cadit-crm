import { z } from "zod";
import { apiError, parseBody, parseQuery } from "@/lib/api";
import { requireStudentPortal } from "@/lib/portal-api";
import { httpUrl } from "@/lib/url-schema";
import { entregasDeCursada, estudianteEntregar } from "@/server/submissions";

export const dynamic = "force-dynamic";

/** La cursada de la que se piden las entregas. Query, pero input externo igual. */
const cursadaSchema = z.object({
  cursada: z.string().min(1, "Falta la cursada"),
});

/**
 * 016 (US1, US4) — Las entregas de UNA cursada del alumno.
 *
 * **404 y no 403** cuando la inscripción es de otra persona (FR-009, SC-004):
 * un 403 confirmaría que existe. La decisión no está acá — `entregasDeCursada`
 * devuelve `null` tanto si no existe como si no es suya, y las dos salen
 * iguales.
 */
export const GET = requireStudentPortal(async (ctx, req: Request) => {
  const query = parseQuery(new URL(req.url), cursadaSchema);
  if (!query.ok) return query.response;

  const data = await entregasDeCursada(
    ctx.organizationId,
    ctx.contactId,
    query.data.cursada
  );
  if (!data) return apiError(404, "not_found", "Cursada no encontrada");
  return Response.json({ assessments: data });
});

const entregaSchema = z.object({
  assessmentId: z.string().min(1),
  /**
   * FR-003/DV-004 — Se valida la FORMA con `httpUrl`, la misma regla que todo
   * campo que termina en un `href`. No se verifica que el enlace abra: el
   * sistema no puede autenticarse contra el Drive del alumno, y un chequeo que
   * falla en falso es peor que ninguno.
   */
  url: httpUrl,
  title: z.string().trim().max(200).nullable().optional(),
});

/**
 * 016 (US1, FR-001..FR-004) — El alumno entrega.
 *
 * Es la primera escritura del portal del alumno, y por eso vive acá y no en
 * `student-portal.ts`: ese módulo es de solo lectura por construcción (015,
 * FR-003) y hay un test que falla si aparece un `.insert(` adentro. La lógica
 * está en `@/server/submissions`, que es el módulo que las tres audiencias
 * llaman desde su propia puerta.
 *
 * Una entrega fuera de plazo se ACEPTA marcada como tardía (DV-006): la
 * decisión de tomarla es del profesor, no de un `if` en esta ruta.
 */
export const POST = requireStudentPortal(async (ctx, req: Request) => {
  const body = await parseBody(req, entregaSchema);
  if (!body.ok) return body.response;

  const r = await estudianteEntregar(ctx.organizationId, ctx.contactId, body.data);
  if (!r.ok) return apiError(r.status, r.code, r.message);
  return Response.json({ entrega: r.data }, { status: 201 });
});
