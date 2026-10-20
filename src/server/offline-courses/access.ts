import { and, asc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import type { OfflineAccessMode } from "@/lib/db/schema";
import { accesoTerminaEn, diaCalendario } from "@/lib/access-expiry";
import { estadosDeAcceso, zonaDeLaOrganizacion } from "@/server/access-expiry";
import {
  accesoOfflineDeContacto,
  courseStatesFor,
  MENSAJE_CURSO_DEL_GRUPO,
  overrideIndividualPermitido,
  pickVigentes,
  planCohortCourses,
  planOverride,
  studentCourseIds,
  type CourseState,
  type DirectGrantSource,
  type EnrollmentAccessInput,
  type EnrollmentAccessSource,
  type OverrideAction,
} from "./logic";

/**
 * cursos-offline (T4) — Who reads which library course: the queries.
 *
 * The rules (inherit / grant / revoke, union across enrollments) live in
 * `logic.ts` and are tested there; this file only feeds them rows and writes
 * what they decide.
 *
 * Validation runs BEFORE any write: a route that returns an error Response
 * does not roll back the tenant transaction, so a half-applied set must be
 * impossible by construction, not by rollback.
 */

export type AccessResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: 404 | 409 | 422; code: string; message: string };

const { offlineCourse, offlineCourseAccess, offlineCourseGrant, cohort, enrollment } = schema;

/* ============================================================
 * Cohort level
 * ============================================================ */

export async function cohortExists(orgId: string, cohortId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: cohort.id })
    .from(cohort)
    .where(scoped(cohort.organizationId, orgId, eq(cohort.id, cohortId)))
    .limit(1);
  return Boolean(row);
}

async function cohortCourseRows(orgId: string, cohortIds: string[]) {
  if (cohortIds.length === 0) return [];
  return getDb()
    .select({
      id: offlineCourseAccess.id,
      cohortId: offlineCourseAccess.cohortId,
      courseId: offlineCourseAccess.offlineCourseId,
    })
    .from(offlineCourseAccess)
    .where(
      scoped(
        offlineCourseAccess.organizationId,
        orgId,
        inArray(offlineCourseAccess.cohortId, cohortIds)
      )
    );
}

/** The course ids assigned to a cohort; `null` when the cohort is not in this org. */
export async function cohortCourses(orgId: string, cohortId: string): Promise<string[] | null> {
  if (!(await cohortExists(orgId, cohortId))) return null;
  const rows = await cohortCourseRows(orgId, [cohortId]);
  return rows.map((r) => r.courseId);
}

/**
 * Replaces the cohort's set with `courseIds`. Every id must be a library
 * course of this organization (422 otherwise — nothing is written).
 */
export async function setCohortCourses(
  orgId: string,
  cohortId: string,
  courseIds: string[],
  userId: string
): Promise<AccessResult<{ courseIds: string[] }>> {
  if (!(await cohortExists(orgId, cohortId))) {
    return { ok: false, status: 404, code: "not_found", message: "Grupo no encontrado" };
  }

  const desired = [...new Set(courseIds)];
  if (desired.length > 0) {
    const known = await getDb()
      .select({ id: offlineCourse.id })
      .from(offlineCourse)
      .where(scoped(offlineCourse.organizationId, orgId, inArray(offlineCourse.id, desired)));
    if (known.length !== desired.length) {
      return {
        ok: false,
        status: 422,
        code: "unknown_course",
        message: "Alguno de los cursos no existe en la biblioteca",
      };
    }
  }

  const current = await cohortCourseRows(orgId, [cohortId]);
  const plan = planCohortCourses(
    current.map((r) => r.courseId),
    desired
  );
  const db = getDb();

  if (plan.toDelete.length > 0) {
    await db
      .delete(offlineCourseAccess)
      .where(
        scoped(
          offlineCourseAccess.organizationId,
          orgId,
          eq(offlineCourseAccess.cohortId, cohortId),
          inArray(offlineCourseAccess.offlineCourseId, plan.toDelete)
        )
      );
  }
  if (plan.toInsert.length > 0) {
    await db.insert(offlineCourseAccess).values(
      plan.toInsert.map((courseId) => ({
        id: newId("offlineCourseAccess"),
        organizationId: orgId,
        offlineCourseId: courseId,
        cohortId,
        enrollmentId: null,
        mode: null,
        createdBy: userId,
      }))
    )
      // Two concurrent saves of the same set both plan the same insert; the
      // (cohort, course) unique index turns the second into a no-op instead
      // of a 500. With no target it also covers the partial index.
      .onConflictDoNothing();

    /**
     * 035 (FR-009, SC-002) — Un curso que pasa a ser del grupo vuelve
     * redundante el otorgamiento individual del mismo curso: se borra (el
     * alumno lo sigue leyendo por el grupo). Las quitas individuales NO se
     * tocan: quedan como "Excepción anterior" para que una persona decida.
     */
    const delGrupo = await getDb()
      .select({ id: enrollment.id })
      .from(enrollment)
      .where(scoped(enrollment.organizationId, orgId, eq(enrollment.cohortId, cohortId)));
    if (delGrupo.length > 0) {
      await db
        .delete(offlineCourseAccess)
        .where(
          scoped(
            offlineCourseAccess.organizationId,
            orgId,
            eq(offlineCourseAccess.mode, "grant"),
            inArray(
              offlineCourseAccess.enrollmentId,
              delGrupo.map((e) => e.id)
            ),
            inArray(offlineCourseAccess.offlineCourseId, plan.toInsert)
          )
        );
    }
  }

  return { ok: true, data: { courseIds: desired } };
}

/* ============================================================
 * Enrollment level
 * ============================================================ */

async function findEnrollment(orgId: string, enrollmentId: string) {
  const [row] = await getDb()
    .select({ id: enrollment.id, cohortId: enrollment.cohortId })
    .from(enrollment)
    .where(scoped(enrollment.organizationId, orgId, eq(enrollment.id, enrollmentId)))
    .limit(1);
  return row ?? null;
}

async function overrideRows(orgId: string, enrollmentIds: string[]) {
  if (enrollmentIds.length === 0) return [];
  return getDb()
    .select({
      id: offlineCourseAccess.id,
      enrollmentId: offlineCourseAccess.enrollmentId,
      courseId: offlineCourseAccess.offlineCourseId,
      mode: offlineCourseAccess.mode,
    })
    .from(offlineCourseAccess)
    .where(
      scoped(
        offlineCourseAccess.organizationId,
        orgId,
        inArray(offlineCourseAccess.enrollmentId, enrollmentIds),
        isNotNull(offlineCourseAccess.mode)
      )
    );
}

/** Every library course with this enrollment's state; `null` → 404. */
export async function enrollmentCourseStates(
  orgId: string,
  enrollmentId: string
): Promise<CourseState[] | null> {
  const found = await findEnrollment(orgId, enrollmentId);
  if (!found) return null;

  const [courses, cohortRows, overrides] = await Promise.all([
    getDb()
      .select({ id: offlineCourse.id, title: offlineCourse.title })
      .from(offlineCourse)
      .where(scoped(offlineCourse.organizationId, orgId))
      .orderBy(asc(offlineCourse.title)),
    cohortCourseRows(orgId, found.cohortId ? [found.cohortId] : []),
    overrideRows(orgId, [enrollmentId]),
  ]);

  return courseStatesFor(courses, {
    cohortCourseIds: cohortRows.map((r) => r.courseId),
    overrides: overrides.flatMap((o) => (o.mode ? [{ courseId: o.courseId, mode: o.mode }] : [])),
  });
}

/**
 * grant / revoke upsert the single (enrollment, course) row; "clear" removes
 * it so the enrollment goes back to what its cohort says.
 */
export async function setEnrollmentOverride(
  orgId: string,
  enrollmentId: string,
  courseId: string,
  action: OverrideAction,
  userId: string
): Promise<AccessResult<{ override: OfflineAccessMode | null }>> {
  const found = await findEnrollment(orgId, enrollmentId);
  if (!found) {
    return { ok: false, status: 404, code: "not_found", message: "Inscripción no encontrada" };
  }
  const [course] = await getDb()
    .select({ id: offlineCourse.id })
    .from(offlineCourse)
    .where(scoped(offlineCourse.organizationId, orgId, eq(offlineCourse.id, courseId)))
    .limit(1);
  if (!course) {
    return {
      ok: false,
      status: 422,
      code: "unknown_course",
      message: "El curso no existe en la biblioteca",
    };
  }

  // 035 (FR-009) — Con el curso en el grupo de la cohorte, ni otorgar ni
  // quitar por alumno; sólo borrar una excepción anterior (`clear`).
  const cohortHas = (await cohortCourseRows(orgId, found.cohortId ? [found.cohortId] : [])).some(
    (r) => r.courseId === courseId
  );
  if (!overrideIndividualPermitido(cohortHas, action)) {
    return { ok: false, status: 409, code: "asignado_al_grupo", message: MENSAJE_CURSO_DEL_GRUPO };
  }

  const [existing] = (await overrideRows(orgId, [enrollmentId])).filter(
    (r) => r.courseId === courseId
  );
  const plan = planOverride(
    existing?.mode ? { id: existing.id, mode: existing.mode } : null,
    action
  );
  const db = getDb();

  switch (plan.kind) {
    case "insert":
      await db.insert(offlineCourseAccess).values({
        id: newId("offlineCourseAccess"),
        organizationId: orgId,
        offlineCourseId: courseId,
        cohortId: null,
        enrollmentId,
        mode: plan.mode,
        createdBy: userId,
      });
      break;
    case "update":
      await db
        .update(offlineCourseAccess)
        .set({ mode: plan.mode, createdBy: userId, createdAt: new Date() })
        .where(scoped(offlineCourseAccess.organizationId, orgId, eq(offlineCourseAccess.id, plan.id)));
      break;
    case "delete":
      await db
        .delete(offlineCourseAccess)
        .where(scoped(offlineCourseAccess.organizationId, orgId, eq(offlineCourseAccess.id, plan.id)));
      break;
    case "none":
      break;
  }

  return { ok: true, data: { override: action === "clear" ? null : action } };
}

/* ============================================================
 * Contact level (the student portal, T5)
 * ============================================================ */

/**
 * 043 — What a contact can read NOW, and until when (`null` = no end): the
 * UNION of their NON-EXPIRED cohort enrollments — (cohort assigned AND NOT
 * revoked) OR granted, the 035 rules unchanged — and their NON-EXPIRED direct
 * grants. Expiry is computed here, at read time: nothing revokes anything.
 */
export async function offlineAccessForContact(
  orgId: string,
  contactId: string,
  now: Date = new Date()
): Promise<Map<string, string | null>> {
  const [enrollments, directos] = await Promise.all([
    accessSourcesForContact(orgId, contactId, now),
    directGrantSourcesForContact(orgId, contactId, now),
  ]);
  return accesoOfflineDeContacto(enrollments, directos);
}

/** The library courses a contact can read now (see `offlineAccessForContact`). */
export async function effectiveCourseIdsForContact(
  orgId: string,
  contactId: string,
  now: Date = new Date()
): Promise<string[]> {
  return [...(await offlineAccessForContact(orgId, contactId, now)).keys()];
}

/**
 * Every course the contact was EVER given (expired or not, revoked direct
 * grants excluded) — for the staff's activity view, which reports what the
 * person did, not what they can open today.
 */
export async function everCourseIdsForContact(orgId: string, contactId: string): Promise<string[]> {
  const [inputs, grants] = await Promise.all([
    accessInputsForContact(orgId, contactId),
    activeGrantRows(orgId, { contactId }),
  ]);
  return [
    ...new Set([...studentCourseIds(inputs.map((e) => e.input)), ...grants.map((g) => g.courseId)]),
  ];
}

/**
 * Per NON-EXPIRED enrollment of the contact, the courses it effectively
 * grants, plus the courses that come from a non-expired direct grant. The
 * portal needs it per enrollment to decide which enrollment an attempt is
 * recorded against; a course reachable ONLY by a direct grant records the
 * attempt without one.
 */
export async function effectiveAccessByEnrollment(
  orgId: string,
  contactId: string,
  now: Date = new Date()
): Promise<{
  enrollments: Array<{ id: string; createdAt: Date; courseIds: string[] }>;
  directCourseIds: string[];
}> {
  const [sources, directos] = await Promise.all([
    accessSourcesForContact(orgId, contactId, now),
    directGrantSourcesForContact(orgId, contactId, now),
  ]);
  return {
    enrollments: pickVigentes(sources).map(({ id, createdAt, courseIds }) => ({ id, createdAt, courseIds })),
    directCourseIds: directos.filter((g) => !g.vencido).map((g) => g.courseId),
  };
}

async function accessSourcesForContact(
  orgId: string,
  contactId: string,
  now: Date
): Promise<EnrollmentAccessSource[]> {
  const inputs = await accessInputsForContact(orgId, contactId);
  if (inputs.length === 0) return [];
  const estados = await estadosDeAcceso(
    orgId,
    inputs.map((e) => e.id),
    now
  );
  return inputs.map((e) => {
    const estado = estados.get(e.id);
    return {
      ...e,
      // Sin estado (no debería pasar) = sin fecha: no se le quita nada a nadie
      // por un dato que falta.
      acceso: { vencido: estado?.vencido ?? false, hasta: estado?.hasta ?? null },
    };
  });
}

async function directGrantSourcesForContact(
  orgId: string,
  contactId: string,
  now: Date
): Promise<DirectGrantSource[]> {
  const rows = await activeGrantRows(orgId, { contactId });
  if (rows.length === 0) return [];
  const timeZone = await zonaDeLaOrganizacion(orgId);
  return rows.map((g) => {
    const hasta = diaCalendario(g.accessUntil);
    return {
      courseId: g.courseId,
      hasta,
      vencido: now.getTime() >= accesoTerminaEn(hasta, timeZone).getTime(),
    };
  });
}

/** The non-revoked direct grants of a contact or of a course. */
export async function activeGrantRows(
  orgId: string,
  by: { contactId: string } | { courseId: string }
) {
  return getDb()
    .select({
      id: offlineCourseGrant.id,
      contactId: offlineCourseGrant.contactId,
      courseId: offlineCourseGrant.offlineCourseId,
      accessUntil: offlineCourseGrant.accessUntil,
    })
    .from(offlineCourseGrant)
    .where(
      scoped(
        offlineCourseGrant.organizationId,
        orgId,
        "contactId" in by
          ? eq(offlineCourseGrant.contactId, by.contactId)
          : eq(offlineCourseGrant.offlineCourseId, by.courseId),
        isNull(offlineCourseGrant.revokedAt)
      )
    );
}

async function accessInputsForContact(
  orgId: string,
  contactId: string
): Promise<Array<{ id: string; createdAt: Date; input: EnrollmentAccessInput }>> {
  const enrollments = await getDb()
    .select({ id: enrollment.id, cohortId: enrollment.cohortId, createdAt: enrollment.createdAt })
    .from(enrollment)
    .where(
      scoped(
        enrollment.organizationId,
        orgId,
        and(eq(enrollment.contactId, contactId), isNotNull(enrollment.cohortId))
      )
    );
  if (enrollments.length === 0) return [];

  const cohortIds = [...new Set(enrollments.flatMap((e) => (e.cohortId ? [e.cohortId] : [])))];
  const [cohortRows, overrides] = await Promise.all([
    cohortCourseRows(orgId, cohortIds),
    overrideRows(
      orgId,
      enrollments.map((e) => e.id)
    ),
  ]);

  return enrollments.map((e) => ({
    id: e.id,
    createdAt: e.createdAt,
    input: {
      cohortCourseIds: cohortRows.filter((r) => r.cohortId === e.cohortId).map((r) => r.courseId),
      overrides: overrides.flatMap((o) =>
        o.enrollmentId === e.id && o.mode ? [{ courseId: o.courseId, mode: o.mode }] : []
      ),
    },
  }));
}
