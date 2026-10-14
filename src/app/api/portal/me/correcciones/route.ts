import { z } from "zod";
import { apiError, parseQuery } from "@/lib/api";
import { requireStudentPortal } from "@/lib/portal-api";
import { correccionesPublicadasDeCursada } from "@/server/corrections";

export const dynamic = "force-dynamic";

/** La cursada de la que se piden las correcciones. Query, pero input externo igual. */
const cursadaSchema = z.object({
  cursada: z.string().min(1, "Falta elegir el curso."),
});

/**
 * 031 (T029, DV-010) — Las correcciones PUBLICADAS de una cursada del alumno.
 *
 * Solo GET: el alumno lee su corrección, no la toca. **404 y no 403** cuando la
 * inscripción es de otra persona: un 403 confirmaría que existe, y la decisión
 * no está acá — `correccionesPublicadasDeCursada` devuelve `null` tanto si no
 * existe como si no es suya.
 */
export const GET = requireStudentPortal(async (ctx, req: Request) => {
  const query = parseQuery(new URL(req.url), cursadaSchema);
  if (!query.ok) return query.response;

  const data = await correccionesPublicadasDeCursada(
    ctx.organizationId,
    ctx.contactId,
    query.data.cursada
  );
  if (!data) return apiError(404, "not_found", "Curso no encontrado");
  return Response.json(data);
});
