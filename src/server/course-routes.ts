import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { validarSiguientes } from "@/lib/rutas-de-cursos";

/**
 * 046 (US2; FR-005, FR-006) — Las rutas entre cursos: leer y guardar.
 *
 * Guardar es REEMPLAZO TOTAL de la lista de un curso, dentro de la
 * transacción del pedido: repetir el mismo pedido deja el mismo estado
 * (constitución IV). Quién puede guardar lo decide la ruta
 * (`academico.editar`), no este módulo.
 */

export type RutaDto = { fromCourseId: string; toCourseIds: string[] };

export type ResultadoDeGuardarRuta =
  | { ok: true; route: RutaDto }
  | { ok: false; code: "not_found" | "invalid_body"; message: string };

/** Todas las rutas de la organización, cada una con sus siguientes en orden. */
export async function listarRutas(organizationId: string): Promise<RutaDto[]> {
  const r = schema.courseRoute;
  const filas = await getDb()
    .select({ fromCourseId: r.fromCourseId, toCourseId: r.toCourseId, position: r.position })
    .from(r)
    .where(scoped(r.organizationId, organizationId))
    .orderBy(asc(r.fromCourseId), asc(r.position));
  const porOrigen = new Map<string, string[]>();
  for (const f of filas) {
    const lista = porOrigen.get(f.fromCourseId) ?? [];
    lista.push(f.toCourseId);
    porOrigen.set(f.fromCourseId, lista);
  }
  return [...porOrigen.entries()].map(([fromCourseId, toCourseIds]) => ({ fromCourseId, toCourseIds }));
}

/** Las rutas como mapa origen → siguientes en orden (sugerencias, audiencias). */
export async function rutasPorCurso(organizationId: string): Promise<Map<string, string[]>> {
  return new Map((await listarRutas(organizationId)).map((r) => [r.fromCourseId, r.toCourseIds]));
}

export async function guardarSiguientes(
  organizationId: string,
  userId: string,
  courseId: string,
  nextCourseIds: readonly string[]
): Promise<ResultadoDeGuardarRuta> {
  const db = getDb();
  const cursos = await db
    .select({ id: schema.course.id, kind: schema.course.kind })
    .from(schema.course)
    .where(scoped(schema.course.organizationId, organizationId));
  const valido = validarSiguientes(courseId, nextCourseIds, new Map(cursos.map((c) => [c.id, { kind: c.kind }])));
  if (!valido.ok) return valido;

  const r = schema.courseRoute;
  await db.delete(r).where(scoped(r.organizationId, organizationId, eq(r.fromCourseId, courseId)));
  if (valido.ids.length > 0) {
    await db.insert(r).values(
      valido.ids.map((toCourseId, position) => ({
        id: newId("courseRoute"),
        organizationId,
        fromCourseId: courseId,
        toCourseId,
        position,
        createdBy: userId,
      }))
    );
  }
  return { ok: true, route: { fromCourseId: courseId, toCourseIds: valido.ids } };
}
