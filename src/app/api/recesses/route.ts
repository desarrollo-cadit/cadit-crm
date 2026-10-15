import { z } from "zod";
import { apiError, parseBody, parseQuery, requireCapability } from "@/lib/api";
import { crearReceso, listarRecesos } from "@/server/recesses";

export const dynamic = "force-dynamic";

const DIA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha en formato AAAA-MM-DD");

const listQuerySchema = z.object({ cohortId: z.string().min(1).optional() });

/**
 * 034 (FR-006) — Los recesos. Sin `cohortId`, los de la academia; con
 * `cohortId`, los que alcanzan a esa cohorte (los de la academia y los suyos).
 *
 * `academico.ver`: es el calendario de la academia, como `/api/calendar`.
 */
export const GET = requireCapability("academico.ver", async (session, req: Request) => {
  const query = parseQuery(new URL(req.url), listQuerySchema);
  if (!query.ok) return query.response;
  const recesses = await listarRecesos(session.organizationId, query.data.cohortId);
  return Response.json({ recesses });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  fromDate: DIA,
  toDate: DIA,
  /** `null`/ausente = receso de toda la academia. */
  cohortId: z.string().min(1).nullable().optional(),
});

/**
 * 034 (FR-006/FR-008) — Carga un receso y saca del cronograma las clases sin
 * historia que caen en él; las que tienen asistencia o grabación se listan en
 * la respuesta para que una persona decida. No cambia ninguna fecha de
 * cohorte (FR-009).
 *
 * `academico.editar`, la capacidad que genera el cronograma.
 */
export const POST = requireCapability("academico.editar", async (session, req: Request) => {
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;
  const result = await crearReceso(
    session.organizationId,
    { ...body.data, cohortId: body.data.cohortId ?? null },
    session.userId
  );
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return Response.json(result.data, { status: 201 });
});
