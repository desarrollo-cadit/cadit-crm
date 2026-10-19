import { z } from "zod";
import { parseQuery, requireCapability } from "@/lib/api";
import { listCalendarClasses, listCalendarTeachers } from "@/server/classes";
import { parseTeacherFilter } from "@/lib/teacher-load";
import { recesosEnRango } from "@/server/recesses";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  /**
   * 044 — Filtro por profesor: ids separados por coma, o `sin-profesor`.
   * Ausente o vacío = todos. Los ids son opacos (nanoid con prefijo).
   */
  teacherIds: z
    .string()
    .max(2000)
    .optional()
    .transform(parseTeacherFilter)
    .pipe(
      z
        .array(z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "Identificador de profesor inválido"))
        .max(50)
    ),
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
 *
 * 034 (FR-011) — Y los recesos que tocan la semana, para marcar esos días:
 * un día vacío por receso no es lo mismo que un día sin clases.
 *
 * 044 — Filtro por profesor en el servidor (`teacherIds`) y la lista de
 * profesores para armarlo. Sigue con `academico.ver`: Ventas ve nombres y
 * horas, que no son dinero.
 */
export const GET = requireCapability("academico.ver", async (session, req: Request) => {
  const query = parseQuery(new URL(req.url), querySchema);
  if (!query.ok) return query.response;

  const [classes, recesses, teachers] = await Promise.all([
    listCalendarClasses(
      session.organizationId,
      query.data.from,
      query.data.to,
      query.data.teacherIds
    ),
    recesosEnRango(session.organizationId, query.data.from, query.data.to),
    // 044 — Para el filtro: solo id y nombre, nunca la tarifa (040).
    listCalendarTeachers(session.organizationId),
  ]);
  return Response.json({ classes, recesses, teachers });
});
