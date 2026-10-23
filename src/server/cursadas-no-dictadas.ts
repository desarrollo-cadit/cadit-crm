import { inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import type { CourseKind } from "@/lib/course-kind";
import { cursadaNuncaDictada } from "@/lib/cursadas-no-dictadas";

/**
 * 2026-10-22 — De las inscripciones de un contacto, las de grupos que nunca
 * salieron (`cursadaNuncaDictada`). El portal del alumno las deja afuera.
 *
 * Recibe las filas que el llamador YA leyó: solo consulta la base si alguna
 * es candidata (sin confirmar y terminada), así un alumno normal no paga ni
 * una consulta más.
 *
 * La actividad se mira en la inscripción Y en sus hijas: una especialización
 * con asistencia en un solo módulo se dictó. Una madre oculta arrastra a sus
 * hijas, para que no queden módulos sueltos de un programa que no existió.
 *
 * Solo lee: no borra ni cambia nada. El staff sigue viendo esas inscripciones.
 */
export type FilaDeCursada = {
  id: string;
  parentEnrollmentId: string | null;
  cohort: {
    confirmedAt: Date | null;
    startDate: Date;
    endDate: Date | null;
    parentCohortId: string | null;
  } | null;
  courseKind: CourseKind | null;
};

export async function inscripcionesNoDictadas(
  organizationId: string,
  filas: FilaDeCursada[],
  now: Date = new Date()
): Promise<Set<string>> {
  const candidatas = filas.filter(
    (f) =>
      f.cohort !== null &&
      cursadaNuncaDictada(
        {
          confirmedAt: f.cohort.confirmedAt ?? null,
          startDate: f.cohort.startDate,
          endDate: f.cohort.endDate,
          parentCohortId: f.cohort.parentCohortId,
          courseKind: f.courseKind,
          tuvoActividad: false,
        },
        now
      )
  );
  if (candidatas.length === 0) return new Set();

  const hijasDe = new Map<string, string[]>();
  for (const f of filas) {
    if (!f.parentEnrollmentId) continue;
    hijasDe.set(f.parentEnrollmentId, [...(hijasDe.get(f.parentEnrollmentId) ?? []), f.id]);
  }
  const ids = candidatas.flatMap((c) => [c.id, ...(hijasDe.get(c.id) ?? [])]);

  const db = getDb();
  const [asistencias, resultados, certificados] = await Promise.all([
    db
      .selectDistinct({ enrollmentId: schema.attendance.enrollmentId })
      .from(schema.attendance)
      .where(scoped(schema.attendance.organizationId, organizationId, inArray(schema.attendance.enrollmentId, ids))),
    db
      .selectDistinct({ enrollmentId: schema.assessmentResult.enrollmentId })
      .from(schema.assessmentResult)
      .where(
        scoped(
          schema.assessmentResult.organizationId,
          organizationId,
          inArray(schema.assessmentResult.enrollmentId, ids)
        )
      ),
    db
      .selectDistinct({ enrollmentId: schema.certificate.enrollmentId })
      .from(schema.certificate)
      .where(scoped(schema.certificate.organizationId, organizationId, inArray(schema.certificate.enrollmentId, ids))),
  ]);
  const conActividad = new Set([...asistencias, ...resultados, ...certificados].map((r) => r.enrollmentId));

  const ocultas = new Set<string>();
  for (const c of candidatas) {
    const todas = [c.id, ...(hijasDe.get(c.id) ?? [])];
    if (todas.some((id) => conActividad.has(id))) continue;
    for (const id of todas) ocultas.add(id);
  }
  return ocultas;
}
