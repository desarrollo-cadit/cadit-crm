import { and, asc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import {
  decidirBorradoDeClases,
  MOTIVO_PARA_CONSERVAR,
  validarReceso,
  type MotivoParaConservar,
  type Receso,
} from "@/lib/recess";

/**
 * 034 (US2/US3, FR-006..FR-012) — Recesos y borrado de clases.
 *
 * Las reglas (qué día es receso, qué clase se puede borrar) son PURAS y viven
 * en `src/lib/recess.ts`. Acá se leen los hechos y se escribe.
 *
 * Lo que este archivo NUNCA hace:
 * - mover la fecha de inicio o de fin de una cohorte (FR-009);
 * - recrear clases al borrar o acortar un receso (FR-010): el cronograma se
 *   regenera cuando una persona lo pide;
 * - borrar una clase con asistencia o grabación (FR-008/FR-012): se conserva
 *   y se lista para que alguien decida.
 */

type Db = ReturnType<typeof getDb>;

export type RecesoDto = Receso & { cohortName: string | null };

/** Una clase que NO se borró, dicha para la pantalla. */
export type ClaseConservadaDto = {
  id: string;
  cohortId: string;
  cohortName: string;
  date: string;
  motivo: MotivoParaConservar;
  detalle: string;
};

export type BorradoDeClasesDto = {
  deleted: number;
  kept: ClaseConservadaDto[];
};

export type RecessResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: 404 | 422; code: string; message: string };

/**
 * Todos los recesos de la organización (son pocos: decenas, no miles), o los
 * que alcanzan a ciertas cohortes. Quien proyecta o genera filtra después con
 * `recesosDeCohorte`.
 */
export async function leerRecesos(
  db: Db,
  organizationId: string,
  cohortIds?: readonly string[]
): Promise<Receso[]> {
  const filas = await db
    .select({
      id: schema.recess.id,
      name: schema.recess.name,
      fromDate: schema.recess.fromDate,
      toDate: schema.recess.toDate,
      cohortId: schema.recess.cohortId,
    })
    .from(schema.recess)
    .where(
      scoped(
        schema.recess.organizationId,
        organizationId,
        cohortIds
          ? cohortIds.length > 0
            ? or(isNull(schema.recess.cohortId), inArray(schema.recess.cohortId, [...cohortIds]))
            : isNull(schema.recess.cohortId)
          : undefined
      )
    )
    .orderBy(asc(schema.recess.fromDate));
  return filas;
}

/**
 * La lista para las pantallas: `cohortId` ausente = los de la academia; con
 * cohorte = los de la academia MÁS los de esa cohorte (lo que la alcanza).
 */
export async function listarRecesos(
  organizationId: string,
  cohortId?: string
): Promise<RecesoDto[]> {
  const db = getDb();
  const recesos = await leerRecesos(db, organizationId, cohortId ? [cohortId] : []);
  const ids = [...new Set(recesos.map((r) => r.cohortId).filter((c): c is string => !!c))];
  const nombres = await nombresDeCohortes(db, organizationId, ids);
  return recesos.map((r) => ({
    ...r,
    cohortName: r.cohortId ? (nombres.get(r.cohortId) ?? null) : null,
  }));
}

async function nombresDeCohortes(
  db: Db,
  organizationId: string,
  ids: readonly string[]
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const filas = await db
    .select({ id: schema.cohort.id, name: schema.cohort.name, courseName: schema.course.name })
    .from(schema.cohort)
    .innerJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .where(scoped(schema.cohort.organizationId, organizationId, inArray(schema.cohort.id, [...ids])));
  return new Map(filas.map((f) => [f.id, f.name ?? f.courseName]));
}

const desde = (dia: string) => new Date(`${dia}T00:00:00.000Z`);
const hasta = (dia: string) => new Date(`${dia}T23:59:59.999Z`);

/**
 * El corazón de FR-008 y FR-012: las clases de un rango (de una cohorte o de
 * todas), se borran las que no tienen historia y se devuelven las demás.
 *
 * Sólo mira `class_session`, que son las clases REALES. Una proyección es un
 * dibujo: no hay nada que borrar, y desaparece sola porque la proyección ya
 * saltea los días de receso.
 */
export async function borrarClasesSinHistoria(
  organizationId: string,
  filtro: {
    fromDate?: string;
    toDate?: string;
    cohortId: string | null;
    classIds?: readonly string[];
  }
): Promise<BorradoDeClasesDto> {
  const db = getDb();
  const clases = await db
    .select({
      id: schema.classSession.id,
      cohortId: schema.classSession.cohortId,
      date: schema.classSession.date,
      recordingUrl: schema.classSession.recordingUrl,
    })
    .from(schema.classSession)
    .where(
      scoped(
        schema.classSession.organizationId,
        organizationId,
        filtro.fromDate ? gte(schema.classSession.date, desde(filtro.fromDate)) : undefined,
        filtro.toDate ? lte(schema.classSession.date, hasta(filtro.toDate)) : undefined,
        filtro.cohortId ? eq(schema.classSession.cohortId, filtro.cohortId) : undefined,
        filtro.classIds ? inArray(schema.classSession.id, [...filtro.classIds]) : undefined
      )
    );
  if (clases.length === 0) return { deleted: 0, kept: [] };

  const conAsistencia = new Set(
    (
      await db
        .selectDistinct({ id: schema.attendance.classSessionId })
        .from(schema.attendance)
        .where(
          scoped(
            schema.attendance.organizationId,
            organizationId,
            inArray(
              schema.attendance.classSessionId,
              clases.map((c) => c.id)
            )
          )
        )
    ).map((r) => r.id)
  );

  const { borrar, conservar } = decidirBorradoDeClases(
    clases.map((c) => ({
      id: c.id,
      date: c.date,
      tieneAsistencia: conAsistencia.has(c.id),
      tieneGrabacion: Boolean(c.recordingUrl),
    }))
  );

  if (borrar.length > 0) {
    await db
      .delete(schema.classSession)
      .where(
        scoped(schema.classSession.organizationId, organizationId, inArray(schema.classSession.id, borrar))
      );
  }

  const cohorteDe = new Map(clases.map((c) => [c.id, c.cohortId]));
  const nombres = await nombresDeCohortes(db, organizationId, [
    ...new Set(conservar.map((c) => cohorteDe.get(c.id)!)),
  ]);
  return {
    deleted: borrar.length,
    kept: conservar.map((c) => {
      const cohortId = cohorteDe.get(c.id)!;
      return {
        id: c.id,
        cohortId,
        cohortName: nombres.get(cohortId) ?? "Cohorte",
        date: c.date.toISOString(),
        motivo: c.motivo,
        detalle: MOTIVO_PARA_CONSERVAR[c.motivo],
      };
    }),
  };
}

export type RecesoInput = {
  name: string;
  fromDate: string;
  toDate: string;
  cohortId: string | null;
};

async function cohorteExiste(db: Db, organizationId: string, cohortId: string): Promise<boolean> {
  const [fila] = await db
    .select({ id: schema.cohort.id })
    .from(schema.cohort)
    .where(scoped(schema.cohort.organizationId, organizationId, eq(schema.cohort.id, cohortId)))
    .limit(1);
  return Boolean(fila);
}

/**
 * FR-006/FR-008 — Carga un receso y saca del cronograma las clases que caen
 * en él y no tienen historia. Las que tienen se listan (escenario 3).
 *
 * Un receso de la academia alcanza a TODAS las cohortes; uno de cohorte, sólo
 * a ella (escenario 6). Las fechas de inicio y fin no se tocan (FR-009).
 */
export async function crearReceso(
  organizationId: string,
  input: RecesoInput,
  actorUserId: string | null
): Promise<RecessResult<{ recess: RecesoDto } & BorradoDeClasesDto>> {
  const error = validarReceso(input);
  if (error) return { ok: false, status: 422, code: "invalid_body", message: error };

  const db = getDb();
  if (input.cohortId && !(await cohorteExiste(db, organizationId, input.cohortId))) {
    return { ok: false, status: 404, code: "not_found", message: "Cohorte no encontrada" };
  }

  const id = newId("recess");
  await db.insert(schema.recess).values({
    id,
    organizationId,
    cohortId: input.cohortId,
    name: input.name.trim(),
    fromDate: input.fromDate,
    toDate: input.toDate,
    createdBy: actorUserId,
  });

  const borrado = await borrarClasesSinHistoria(organizationId, {
    fromDate: input.fromDate,
    toDate: input.toDate,
    cohortId: input.cohortId,
  });
  const nombre = input.cohortId
    ? ((await nombresDeCohortes(db, organizationId, [input.cohortId])).get(input.cohortId) ?? null)
    : null;

  return {
    ok: true,
    data: {
      recess: { id, name: input.name.trim(), fromDate: input.fromDate, toDate: input.toDate, cohortId: input.cohortId, cohortName: nombre },
      ...borrado,
    },
  };
}

/**
 * Cambia el nombre o las fechas. Acortar no recrea nada (FR-010); estirar
 * saca las clases sin historia del rango nuevo, igual que al cargarlo. El
 * alcance (academia o cohorte) no se cambia: para eso se borra y se carga otro.
 */
export async function actualizarReceso(
  organizationId: string,
  recessId: string,
  input: { name: string; fromDate: string; toDate: string }
): Promise<RecessResult<{ recess: RecesoDto } & BorradoDeClasesDto>> {
  const error = validarReceso(input);
  if (error) return { ok: false, status: 422, code: "invalid_body", message: error };

  const db = getDb();
  const [actual] = await db
    .update(schema.recess)
    .set({ name: input.name.trim(), fromDate: input.fromDate, toDate: input.toDate })
    .where(scoped(schema.recess.organizationId, organizationId, eq(schema.recess.id, recessId)))
    .returning();
  if (!actual) return { ok: false, status: 404, code: "not_found", message: "Receso no encontrado" };

  const borrado = await borrarClasesSinHistoria(organizationId, {
    fromDate: input.fromDate,
    toDate: input.toDate,
    cohortId: actual.cohortId,
  });
  const nombre = actual.cohortId
    ? ((await nombresDeCohortes(db, organizationId, [actual.cohortId])).get(actual.cohortId) ?? null)
    : null;
  return {
    ok: true,
    data: {
      recess: {
        id: actual.id,
        name: actual.name,
        fromDate: actual.fromDate,
        toDate: actual.toDate,
        cohortId: actual.cohortId,
        cohortName: nombre,
      },
      ...borrado,
    },
  };
}

/**
 * FR-010 — Borrar un receso NO recrea clases: los días vuelven a estar
 * disponibles y las clases aparecen cuando alguien regenere el cronograma.
 */
export async function borrarReceso(organizationId: string, recessId: string): Promise<boolean> {
  const borrados = await getDb()
    .delete(schema.recess)
    .where(scoped(schema.recess.organizationId, organizationId, eq(schema.recess.id, recessId)))
    .returning({ id: schema.recess.id });
  return borrados.length > 0;
}

/** Los recesos que se superponen con un rango, para marcar el calendario (FR-011). */
export async function recesosEnRango(
  organizationId: string,
  from: Date,
  to: Date
): Promise<RecesoDto[]> {
  const db = getDb();
  const filas = await db
    .select({
      id: schema.recess.id,
      name: schema.recess.name,
      fromDate: schema.recess.fromDate,
      toDate: schema.recess.toDate,
      cohortId: schema.recess.cohortId,
    })
    .from(schema.recess)
    .where(
      scoped(
        schema.recess.organizationId,
        organizationId,
        and(
          lte(schema.recess.fromDate, to.toISOString().slice(0, 10)),
          gte(schema.recess.toDate, from.toISOString().slice(0, 10))
        )
      )
    )
    .orderBy(asc(schema.recess.fromDate));
  const ids = [...new Set(filas.map((r) => r.cohortId).filter((c): c is string => !!c))];
  const nombres = await nombresDeCohortes(db, organizationId, ids);
  return filas.map((r) => ({
    ...r,
    cohortName: r.cohortId ? (nombres.get(r.cohortId) ?? null) : null,
  }));
}

