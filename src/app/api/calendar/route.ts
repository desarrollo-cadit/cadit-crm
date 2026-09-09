import { z } from "zod";
import { parseQuery, requireCapability } from "@/lib/api";
import { listCalendarClasses } from "@/server/classes";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
});

/**
 * 013 (T012, FR-004) — Las clases de la semana que se está mirando.
 *
 * El calendario leía `/api/cohorts` y repetía los días de la semana
 * declarados. Con eso **una clase cancelada seguía apareciendo**: nadie miraba
 * `class_session`, así que cancelarla no cambiaba nada en pantalla (SC-002).
 *
 * Se pide el rango por query en vez de devolver todo: son 41 cohortes y, con
 * los cronogramas generados, miles de clases. Traer un año entero para dibujar
 * una semana es trabajo que nadie va a ver.
 */
export const GET = requireCapability("academico.ver", async (session, req: Request) => {
  const query = parseQuery(new URL(req.url), querySchema);
  if (!query.ok) return query.response;

  const classes = await listCalendarClasses(
    session.organizationId,
    query.data.from,
    query.data.to
  );
  return Response.json({ classes });
});
