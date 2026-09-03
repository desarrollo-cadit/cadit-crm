import { and, count, gte, isNotNull, lte } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { listCalendarClasses, type CalendarClassDto } from "@/server/classes";

/**
 * 021 — El resumen que ve el dueño al entrar.
 *
 * Antes el inicio eran tres tarjetas de finanzas y licencias: información
 * correcta y completamente impersonal. Lo que falta ahí no es un número más,
 * es **una respuesta a "¿qué pasa hoy?"** — que es la pregunta con la que
 * cualquiera abre la plataforma a las nueve de la mañana.
 *
 * Todo en UNA consulta por dato y en un solo viaje: cuatro `fetch` desde el
 * navegador para pintar una fila de números es el tipo de cosa que hace que un
 * inicio tarde y que nadie lo quiera como página de arranque.
 */

export type DashboardSummary = {
  /** Alumnos activos: contactos no archivados con al menos una inscripción. */
  students: number;
  /** Cohortes que están cursando HOY. */
  activeCohorts: number;
  /** Cohortes que arrancan en los próximos 30 días. */
  upcomingCohorts: number;
  teachers: number;
  /** Las clases de hoy, ordenadas por hora. Puede venir vacía y está bien. */
  today: CalendarClassDto[];
};

export async function dashboardSummary(
  organizationId: string,
  now: Date = new Date()
): Promise<DashboardSummary> {
  const db = getDb();

  const inicioDelDia = new Date(now);
  inicioDelDia.setHours(0, 0, 0, 0);
  const finDelDia = new Date(inicioDelDia);
  finDelDia.setHours(23, 59, 59, 999);

  const en30dias = new Date(inicioDelDia);
  en30dias.setDate(en30dias.getDate() + 30);

  const [inscriptos, activas, proximas, docentes, clases] = await Promise.all([
    /**
     * Se cuentan INSCRIPCIONES con cohorte, no contactos: un contacto que
     * nunca se inscribió es un lead del CRM, no un alumno de la academia, y
     * mezclarlos infla el número que el dueño usa para tomar decisiones.
     */
    db
      .select({ n: count() })
      .from(schema.enrollment)
      .where(
        scoped(
          schema.enrollment.organizationId,
          organizationId,
          // `cohort_id` nulo es el LEAD GENERAL del pipeline: interés
          // comercial, no cursada. Contarlo infla el número.
          isNotNull(schema.enrollment.cohortId)
        )
      ),
    db
      .select({ n: count() })
      .from(schema.cohort)
      .where(
        scoped(
          schema.cohort.organizationId,
          organizationId,
          and(lte(schema.cohort.startDate, now), gte(schema.cohort.endDate, now))
        )
      ),
    db
      .select({ n: count() })
      .from(schema.cohort)
      .where(
        scoped(
          schema.cohort.organizationId,
          organizationId,
          and(
            gte(schema.cohort.startDate, inicioDelDia),
            lte(schema.cohort.startDate, en30dias)
          )
        )
      ),
    db
      .select({ n: count() })
      .from(schema.teacher)
      .where(scoped(schema.teacher.organizationId, organizationId)),
    listCalendarClasses(organizationId, inicioDelDia, finDelDia),
  ]);

  return {
    students: inscriptos[0]?.n ?? 0,
    activeCohorts: activas[0]?.n ?? 0,
    upcomingCohorts: proximas[0]?.n ?? 0,
    teachers: docentes[0]?.n ?? 0,
    today: [...clases]
      .filter((c) => !c.canceled)
      .sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? "")),
  };
}
