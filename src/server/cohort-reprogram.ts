import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { recesosDeCohorte } from "@/lib/recess";
import { planDeReprogramacion, type PlanDeReprogramacion } from "@/lib/reprogramacion";
import { buildClassSchedule, generateSchedule, hoursFromTimes } from "@/server/attendance";
import { updateCohort } from "@/server/courses";
import { borrarClasesSinHistoria, leerRecesos } from "@/server/recesses";

/**
 * "Reprogramar" un grupo que llegó a su fecha sin confirmarse: fechas nuevas,
 * mismos días y horario.
 *
 *  1. Cambia inicio y fin (por `updateCohort`, el mismo camino que «Editar grupo»).
 *  2. Borra las clases SIN historia (`borrarClasesSinHistoria`, la regla de 034).
 *  3. Si el grupo tenía cronograma, lo vuelve a generar (`generateSchedule`).
 *  4. Las inscripciones quedan.
 *
 * Todo se valida ANTES de la primera escritura con `planDeReprogramacion`
 * (puro): devolver un error no revierte la transacción del pedido. Si igual
 * algo falla a mitad de camino, se LANZA para que la transacción revierta y el
 * grupo quede como estaba.
 */

export type ReprogramacionInput = { startDate: Date; endDate: Date | null };

export type ReprogramacionResult =
  | { ok: true; plan: Extract<PlanDeReprogramacion, { accion: "reprogramar" }> }
  | { ok: false; status: 404 | 409 | 422; code: string; message: string };

async function planear(
  organizationId: string,
  cohortId: string,
  input: ReprogramacionInput
): Promise<PlanDeReprogramacion | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.cohort)
    .where(scoped(schema.cohort.organizationId, organizationId, eq(schema.cohort.id, cohortId)))
    .limit(1);
  const cohort = rows[0];
  if (!cohort) return null;

  const [modulos, clases] = await Promise.all([
    db
      .select({ id: schema.cohort.id })
      .from(schema.cohort)
      .where(
        scoped(schema.cohort.organizationId, organizationId, eq(schema.cohort.parentCohortId, cohortId))
      )
      .limit(1),
    db
      .select({ id: schema.classSession.id, recordingUrl: schema.classSession.recordingUrl })
      .from(schema.classSession)
      .where(
        scoped(schema.classSession.organizationId, organizationId, eq(schema.classSession.cohortId, cohortId))
      ),
  ]);

  const conAsistencia = new Set(
    clases.length === 0
      ? []
      : (
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

  let clasesNuevas = 0;
  if (clases.length > 0 && input.endDate && cohort.daysOfWeek) {
    const recesos = recesosDeCohorte(await leerRecesos(db, organizationId, [cohortId]), cohortId);
    clasesNuevas = buildClassSchedule(
      input.startDate,
      input.endDate,
      cohort.daysOfWeek,
      hoursFromTimes(cohort.startTime, cohort.endTime),
      recesos
    ).length;
  }

  return planDeReprogramacion({
    esEspecializacion: cohort.isSpecialization || modulos.length > 0,
    inicioActual: cohort.startDate,
    nuevoInicio: input.startDate,
    nuevoFin: input.endDate,
    diasDeCursada: cohort.daysOfWeek,
    clases: clases.map((c) => ({
      tieneAsistencia: conAsistencia.has(c.id),
      tieneGrabacion: Boolean(c.recordingUrl),
    })),
    clasesNuevas,
  });
}

/** Qué pasaría, sin tocar nada (el diálogo lo muestra antes de confirmar). */
export async function vistaPreviaReprogramacion(
  organizationId: string,
  cohortId: string,
  input: ReprogramacionInput
): Promise<PlanDeReprogramacion | null> {
  return planear(organizationId, cohortId, input);
}

export async function reprogramarCohorte(
  organizationId: string,
  cohortId: string,
  input: ReprogramacionInput
): Promise<ReprogramacionResult> {
  const plan = await planear(organizationId, cohortId, input);
  if (!plan) return { ok: false, status: 404, code: "not_found", message: "Grupo no encontrado" };
  if (plan.accion === "bloquear") {
    return {
      ok: false,
      status: plan.code === "clases_con_historia" ? 409 : 422,
      code: plan.code,
      message: plan.motivo,
    };
  }

  const actualizado = await updateCohort(organizationId, cohortId, {
    startDate: input.startDate,
    endDate: input.endDate,
  });
  if (!actualizado.ok) {
    // Todavía no se escribió nada: se puede devolver sin revertir.
    return { ok: false, status: actualizado.status === 404 ? 404 : 422, code: actualizado.code, message: actualizado.message };
  }

  if (plan.clasesABorrar > 0) {
    const borrado = await borrarClasesSinHistoria(organizationId, { cohortId });
    if (borrado.kept.length > 0) {
      // Alguien cargó asistencia entre la vista previa y este pedido: revertir todo.
      throw new Error("reprogramar: aparecieron clases con historia");
    }
  }

  if (plan.regenera) {
    const generado = await generateSchedule(organizationId, cohortId);
    if (!generado.ok) throw new Error(`reprogramar: no se pudo regenerar (${generado.code})`);
  }

  return { ok: true, plan };
}
