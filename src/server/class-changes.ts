import { eq, max } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { recesosDeCohorte, validarReceso, validarReprogramacion } from "@/lib/recess";
import { hoursFromTimes } from "@/server/attendance";
import { borrarClasesSinHistoria, leerRecesos, type BorradoDeClasesDto } from "@/server/recesses";

/**
 * 034 (US3, FR-012..FR-015) — Borrar y reprogramar clases.
 *
 * Las reglas son PURAS (`src/lib/recess.ts`): qué clase se puede borrar sin
 * perder historia y cuándo se puede reprogramar. Acá se averiguan los hechos.
 */

export type ClassChangeResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: 404 | 409 | 422; code: string; message: string; receso?: string };

/**
 * FR-012 — Borrar UNA clase. Con asistencia o grabación no se borra: se
 * responde 409 y la pantalla ofrece cancelarla (escenario 2), que es lo que
 * conserva la historia y la saca del cálculo de todos.
 */
export async function borrarClase(
  organizationId: string,
  classSessionId: string
): Promise<ClassChangeResult<BorradoDeClasesDto>> {
  const resultado = await borrarClasesSinHistoria(organizationId, {
    cohortId: null,
    classIds: [classSessionId],
  });
  if (resultado.deleted === 0 && resultado.kept.length === 0) {
    return { ok: false, status: 404, code: "not_found", message: "Clase no encontrada" };
  }
  const conservada = resultado.kept[0];
  if (conservada) {
    return {
      ok: false,
      status: 409,
      code: "clase_con_historia",
      message: `${conservada.detalle} No se puede borrar sin perder esa historia: cancelala en su lugar.`,
    };
  }
  return { ok: true, data: resultado };
}

/** FR-012 — Las clases de una cohorte en un rango: se borran las que no tienen historia. */
export async function borrarClasesDeRango(
  organizationId: string,
  cohortId: string,
  fromDate: string,
  toDate: string
): Promise<ClassChangeResult<BorradoDeClasesDto>> {
  // El nombre no importa acá: se reusa la validación del rango del receso.
  const error = validarReceso({ name: "rango", fromDate, toDate });
  if (error) return { ok: false, status: 422, code: "invalid_body", message: error };
  const [cohorte] = await getDb()
    .select({ id: schema.cohort.id })
    .from(schema.cohort)
    .where(scoped(schema.cohort.organizationId, organizationId, eq(schema.cohort.id, cohortId)))
    .limit(1);
  if (!cohorte) return { ok: false, status: 404, code: "not_found", message: "Cohorte no encontrada" };
  return {
    ok: true,
    data: await borrarClasesSinHistoria(organizationId, { cohortId, fromDate, toDate }),
  };
}

export type ReprogramacionInput = {
  /** "YYYY-MM-DD" — el DÍA de la clase nueva (se guarda como su medianoche UTC). */
  date: string;
  startTime: string | null;
  endTime: string | null;
  /** FR-014 — confirmación explícita de dar clase en un día de receso. */
  confirmRecess: boolean;
};

/**
 * FR-013 — Reprograma una clase CANCELADA: crea la clase nueva apuntando a la
 * cancelada (`rescheduled_from_id`). La cancelada no cambia: sigue cancelada y
 * sin contar (FR-015); la nueva es una clase normal —asistencia, enlace, aula
 * heredada y matcheo de grabaciones de Zoom incluidos— y cuenta como cualquiera.
 *
 * La fecha se guarda como el DÍA (medianoche UTC), igual que el cronograma; el
 * instante real lo sigue componiendo sólo `classInstant()` a partir de día +
 * hora + zona. Sin horario propio, hereda el de la clase cancelada.
 *
 * La numeración: va al final del cronograma (máximo + 1). El número ordena y
 * es único por cohorte; reescribir los de las clases siguientes movería la
 * "clase 7" de todo el mundo por un cambio de fecha.
 */
export async function reprogramarClase(
  organizationId: string,
  classSessionId: string,
  input: ReprogramacionInput
): Promise<ClassChangeResult<{ id: string; date: string }>> {
  const db = getDb();
  const [original] = await db
    .select()
    .from(schema.classSession)
    .where(
      scoped(
        schema.classSession.organizationId,
        organizationId,
        eq(schema.classSession.id, classSessionId)
      )
    )
    .limit(1);
  if (!original) {
    return { ok: false, status: 404, code: "not_found", message: "Clase no encontrada" };
  }

  if (validarReceso({ name: "x", fromDate: input.date, toDate: input.date })) {
    return { ok: false, status: 422, code: "invalid_body", message: "La fecha nueva no es válida." };
  }
  const nuevaFecha = new Date(`${input.date}T00:00:00.000Z`);

  const [yaReprogramada] = await db
    .select({ id: schema.classSession.id })
    .from(schema.classSession)
    .where(
      scoped(
        schema.classSession.organizationId,
        organizationId,
        eq(schema.classSession.rescheduledFromId, classSessionId)
      )
    )
    .limit(1);

  const recesos = recesosDeCohorte(
    await leerRecesos(db, organizationId, [original.cohortId]),
    original.cohortId
  );
  const error = validarReprogramacion(
    { canceled: original.canceledAt !== null, yaReprogramada: Boolean(yaReprogramada) },
    nuevaFecha,
    recesos,
    input.confirmRecess
  );
  if (error) {
    return {
      ok: false,
      status: error.code === "en_receso" ? 409 : 422,
      code: error.code,
      message: error.message,
      receso: error.code === "en_receso" ? error.receso : undefined,
    };
  }

  const [ultimo] = await db
    .select({ n: max(schema.classSession.number) })
    .from(schema.classSession)
    .where(
      scoped(
        schema.classSession.organizationId,
        organizationId,
        eq(schema.classSession.cohortId, original.cohortId)
      )
    );

  const startTime = input.startTime ?? original.startTime;
  const endTime = input.endTime ?? original.endTime;
  const id = newId("classSession");
  await db.insert(schema.classSession).values({
    id,
    organizationId,
    cohortId: original.cohortId,
    number: (ultimo?.n ?? 0) + 1,
    date: nuevaFecha,
    startTime,
    endTime,
    hours: hoursFromTimes(startTime, endTime) ?? original.hours,
    teacherId: original.teacherId,
    topic: original.topic,
    // El enlace y el aula propios de la cancelada no se copian: la nueva
    // hereda los de la cohorte, como cualquier clase del cronograma.
    rescheduledFromId: original.id,
  });

  return { ok: true, data: { id, date: nuevaFecha.toISOString() } };
}
