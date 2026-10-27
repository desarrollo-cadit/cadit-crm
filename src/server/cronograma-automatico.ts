import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import {
  confirmacionEfectiva,
  debeGenerarCronograma,
  resultadoDeCronogramaAutomatico,
  resumenDeModulos,
  SIN_HORARIO,
  type CronogramaAutomatico,
  type GrupoParaCronograma,
} from "@/lib/cronograma-automatico";
import { generateSchedule } from "@/server/attendance";
import { organizationTimezone } from "@/server/finanzas-periodo";

/**
 * 2026-10-27 — Genera el cronograma SOLO al confirmar un grupo (o al
 * completar los datos de uno confirmado). La regla vive en
 * `src/lib/cronograma-automatico.ts`; acá solo se lee y se llama a
 * `generateSchedule`, que sigue siendo la única que escribe clases.
 *
 * Corre en la transacción del pedido, no después del commit: si algo LANZA,
 * la confirmación (o la edición) revierte con las clases y el grupo queda
 * como estaba. Que falten datos NO lanza: `generateSchedule` devuelve un
 * motivo y la confirmación sigue.
 *
 * Especializaciones (decisión del dueño): la madre no tiene clases propias
 * (`camada_con_modulos`), pero confirmarla vale para sus módulos: cada uno
 * genera el suyo con las mismas reglas. Un módulo cuenta como confirmado si
 * lo está su madre (`confirmacionEfectiva`), también al editarlo después. No
 * se escribe confirmación en los módulos.
 */

/**
 * Los datos que deciden el cronograma, con la confirmación EFECTIVA (la de
 * la madre si es un módulo sin la suya); `null` si el grupo no existe.
 */
export async function datosDeCronograma(
  organizationId: string,
  cohortId: string
): Promise<GrupoParaCronograma | null> {
  const db = getDb();
  const [row] = await db
    .select({
      startDate: schema.cohort.startDate,
      endDate: schema.cohort.endDate,
      daysOfWeek: schema.cohort.daysOfWeek,
      startTime: schema.cohort.startTime,
      endTime: schema.cohort.endTime,
      confirmedAt: schema.cohort.confirmedAt,
      parentCohortId: schema.cohort.parentCohortId,
    })
    .from(schema.cohort)
    .where(scoped(schema.cohort.organizationId, organizationId, eq(schema.cohort.id, cohortId)))
    .limit(1);
  if (!row) return null;
  const { parentCohortId, ...datos } = row;
  if (datos.confirmedAt || !parentCohortId) return datos;
  const [madre] = await db
    .select({ confirmedAt: schema.cohort.confirmedAt })
    .from(schema.cohort)
    .where(scoped(schema.cohort.organizationId, organizationId, eq(schema.cohort.id, parentCohortId)))
    .limit(1);
  return { ...datos, confirmedAt: confirmacionEfectiva(datos.confirmedAt, madre?.confirmedAt ?? null) };
}

/** Un grupo: decide y, si corresponde, genera. */
async function generarUno(
  organizationId: string,
  cohortId: string,
  antes: GrupoParaCronograma | null,
  timeZone: string
): Promise<CronogramaAutomatico | null> {
  const despues = await datosDeCronograma(organizationId, cohortId);
  if (!despues) return null;
  const decision = debeGenerarCronograma(
    antes ? { disparo: "edicion", antes, despues } : { disparo: "confirmacion", despues },
    new Date(),
    timeZone
  );
  if (!decision.generar) {
    return decision.motivo === "sin_horario"
      ? resultadoDeCronogramaAutomatico({ ok: false, code: "sin_horario", message: SIN_HORARIO })
      : null;
  }
  const r = await generateSchedule(organizationId, cohortId);
  return resultadoDeCronogramaAutomatico(r.ok ? { ok: true, clases: r.data.length } : r);
}

/**
 * `antes` presente = edición (genera solo si los datos ESTABAN incompletos);
 * ausente = confirmación (y, en una especialización, la de cada módulo).
 * Devuelve lo que la pantalla tiene que decir, o `null` si no hay nada.
 */
export async function generarCronogramaAutomatico(
  organizationId: string,
  cohortId: string,
  antes?: GrupoParaCronograma | null
): Promise<CronogramaAutomatico | null> {
  const timeZone = await organizationTimezone(organizationId);
  const propio = await generarUno(organizationId, cohortId, antes ?? null, timeZone);
  if (antes) return propio;

  const modulos = await getDb()
    .select({ id: schema.cohort.id, name: schema.cohort.name, courseName: schema.course.name })
    .from(schema.cohort)
    .innerJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .where(scoped(schema.cohort.organizationId, organizationId, eq(schema.cohort.parentCohortId, cohortId)))
    .orderBy(asc(schema.cohort.position), asc(schema.cohort.startDate));
  if (modulos.length === 0) return propio;

  const resultados: { nombre: string; resultado: CronogramaAutomatico | null }[] = [];
  for (const m of modulos) {
    resultados.push({
      nombre: m.name ?? m.courseName,
      resultado: await generarUno(organizationId, m.id, null, timeZone),
    });
  }
  return resumenDeModulos(resultados);
}
