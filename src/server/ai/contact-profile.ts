import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { computeCohortStatus } from "@/lib/cohort-status";
import { effectiveCourseIdsForContact } from "@/server/offline-courses/access";

/**
 * 029 (DV-002) — Quién escribe, calculado por el SERVIDOR antes del modelo.
 *
 * El modelo recibe el perfil en el prompt y no lo puede cambiar: un cliente
 * que dice "soy alumno" no se vuelve alumno. Y lo que viaja es lo mínimo
 * —tipo, nombre de pila, nombres de cursos—: **nada financiero ni de
 * contacto**. Los datos personales solo entran por `lookup`, cuando se piden.
 */

export type ContactProfileKind = "alumno" | "profesor" | "lead" | "desconocido";

export type ContactProfile = {
  kind: ContactProfileKind;
  /** Un egresado o alumno que además da clases. */
  alsoTeacher: boolean;
  firstName: string;
  teacherId: string | null;
  /** Solo nombres, para el prompt. */
  activeCourses: string[];
};

/** Los hechos de la base que deciden el perfil (los junta `resolveContactProfile`). */
export type ProfileFacts = {
  contact: {
    firstName: string;
    archivedAt: Date | null;
    /** El staff le cargó datos (correo, cédula, notas): ya no es un desconocido. */
    hasStaffData: boolean;
  };
  /** Inscripciones EN COHORTE con el estado de su cohorte. */
  cohorts: { status: "planificada" | "en_curso" | "finalizada"; courseName: string }[];
  /** Tiene alguna inscripción, en cohorte o lead general. */
  hasAnyEnrollment: boolean;
  /** Cursos offline con acceso vigente. */
  offlineCourseNames: string[];
  /** Ficha de profesor cuya `wa_identity` es la del contacto. */
  teacherId: string | null;
};

/**
 * La regla, pura:
 *
 * - **alumno**: no archivado y con una cohorte que no terminó (planificada o
 *   en curso), o con acceso vigente a un curso offline;
 * - **profesor**: su ficha tiene la identidad de WhatsApp del contacto (un
 *   alumno que además es profesor queda `alumno` con `alsoTeacher`);
 * - **lead**: tiene alguna inscripción (un ex alumno es lead) o datos
 *   cargados por el staff;
 * - **desconocido**: el resto.
 */
export function classifyContactProfile(facts: ProfileFacts): ContactProfile {
  const firstName = facts.contact.firstName.trim().split(/\s+/)[0] ?? "";
  const archived = facts.contact.archivedAt !== null;
  const activeCourses = archived
    ? []
    : [
        ...new Set([
          ...facts.cohorts.filter((c) => c.status !== "finalizada").map((c) => c.courseName),
          ...facts.offlineCourseNames,
        ]),
      ];

  const teacherId = facts.teacherId;
  if (activeCourses.length > 0) {
    return { kind: "alumno", alsoTeacher: teacherId !== null, firstName, teacherId, activeCourses };
  }
  if (teacherId) {
    return { kind: "profesor", alsoTeacher: false, firstName, teacherId, activeCourses: [] };
  }
  const kind: ContactProfileKind =
    facts.hasAnyEnrollment || facts.contact.hasStaffData ? "lead" : "desconocido";
  return { kind, alsoTeacher: false, firstName, teacherId: null, activeCourses: [] };
}

/** Junta los hechos del contacto (todo por `scoped()`) y aplica la regla. */
export async function resolveContactProfile(
  organizationId: string,
  contactId: string,
  now: Date = new Date()
): Promise<ContactProfile> {
  const db = getDb();
  const contactRows = await db
    .select({
      firstName: schema.contact.firstName,
      archivedAt: schema.contact.archivedAt,
      waIdentity: schema.contact.waIdentity,
      email: schema.contact.email,
      nationalId: schema.contact.nationalId,
      notes: schema.contact.notes,
    })
    .from(schema.contact)
    .where(scoped(schema.contact.organizationId, organizationId, eq(schema.contact.id, contactId)))
    .limit(1);
  const contact = contactRows[0];
  if (!contact) {
    return { kind: "desconocido", alsoTeacher: false, firstName: "", teacherId: null, activeCourses: [] };
  }

  const enrollments = await db
    .select({
      cohortId: schema.enrollment.cohortId,
      startDate: schema.cohort.startDate,
      endDate: schema.cohort.endDate,
      courseName: schema.course.name,
    })
    .from(schema.enrollment)
    .leftJoin(schema.cohort, eq(schema.cohort.id, schema.enrollment.cohortId))
    .leftJoin(schema.course, eq(schema.course.id, schema.cohort.courseId))
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        eq(schema.enrollment.contactId, contactId)
      )
    );

  const offlineIds = contact.archivedAt ? [] : await effectiveCourseIdsForContact(organizationId, contactId);
  const offlineCourses =
    offlineIds.length > 0
      ? await db
          .select({ title: schema.offlineCourse.title })
          .from(schema.offlineCourse)
          .where(
            scoped(
              schema.offlineCourse.organizationId,
              organizationId,
              inArray(schema.offlineCourse.id, offlineIds)
            )
          )
      : [];

  const teacherRows = await db
    .select({ id: schema.teacher.id })
    .from(schema.teacher)
    .where(
      scoped(
        schema.teacher.organizationId,
        organizationId,
        eq(schema.teacher.waIdentity, contact.waIdentity)
      )
    )
    .limit(1);

  return classifyContactProfile({
    contact: {
      firstName: contact.firstName,
      archivedAt: contact.archivedAt,
      hasStaffData: Boolean(contact.email || contact.nationalId || contact.notes),
    },
    cohorts: enrollments
      .filter((e) => e.cohortId && e.startDate)
      .map((e) => ({
        status: computeCohortStatus(e.startDate!, e.endDate, now),
        courseName: e.courseName ?? "Curso",
      })),
    hasAnyEnrollment: enrollments.length > 0,
    offlineCourseNames: offlineCourses.map((c) => c.title),
    teacherId: teacherRows[0]?.id ?? null,
  });
}
