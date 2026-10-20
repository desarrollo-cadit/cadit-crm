import { and, asc, count, eq, inArray, isNotNull, isNull, lt } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { fullName } from "@/lib/utils";
import {
  accesoTerminaEn,
  diaCalendario,
  diaComoFecha,
  hoyEnZona,
  type OrigenDeAcceso,
} from "@/lib/access-expiry";
import {
  planAsignacionIndividual,
  planAsignacionPorEmpresa,
  resumenDeCursosDeEmpresa,
  type CursoDeEmpresa,
  type PlanEmpresa,
} from "@/lib/offline-grants";
import { estadosDeAcceso, zonaDeLaOrganizacion } from "@/server/access-expiry";

/**
 * 043 — Accesos DIRECTOS a cursos offline (de una persona, sin inscripción) y
 * la vista "Quiénes tienen acceso" de un curso.
 *
 * Las decisiones (crear / extender / no tocar) son puras y viven en
 * `src/lib/offline-grants.ts`; acá se leen filas y se escribe lo decidido.
 * Todo se valida ANTES de escribir: devolver una `Response` de error no
 * revierte la transacción del pedido.
 *
 * Lo gobierna `academico.editar` (la misma capacidad que asignar cursos a una
 * cohorte o a una inscripción). Ventas no la tiene.
 */

const { offlineCourse, offlineCourseAccess, offlineCourseGrant, enrollment, contact, cohort, course, company, user } =
  schema;

export type GrantResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: 404 | 409 | 422; code: string; message: string };

const NO_CURSO = { ok: false, status: 404, code: "not_found", message: "Curso no encontrado" } as const;
const NO_ACCESO = { ok: false, status: 404, code: "not_found", message: "Acceso no encontrado" } as const;

async function courseExists(orgId: string, courseId: string) {
  const [row] = await getDb()
    .select({ id: offlineCourse.id, title: offlineCourse.title })
    .from(offlineCourse)
    .where(scoped(offlineCourse.organizationId, orgId, eq(offlineCourse.id, courseId)))
    .limit(1);
  return row ?? null;
}

async function contactExists(orgId: string, contactId: string) {
  const [row] = await getDb()
    .select({ id: contact.id })
    .from(contact)
    .where(scoped(contact.organizationId, orgId, eq(contact.id, contactId)))
    .limit(1);
  return row ?? null;
}

function vencidoEl(hasta: string, now: Date, timeZone: string): boolean {
  return now.getTime() >= accesoTerminaEn(hasta, timeZone).getTime();
}

/* ============================================================
 * "Quiénes tienen acceso" (pantalla del curso)
 * ============================================================ */

export type CourseAccessRow = {
  contactId: string;
  contactName: string;
  source:
    | {
        kind: "cohorte";
        enrollmentId: string;
        cohortId: string;
        cohortName: string;
        /** `true` = otorgado a ESTA inscripción (no a todo el grupo). */
        individual: boolean;
      }
    | {
        kind: "directo";
        grantId: string;
        note: string | null;
        viaCompanyName: string | null;
        createdByName: string | null;
        createdAt: string;
      };
  /** Último día con acceso. `null` = no vence (cohorte sin fecha de fin). */
  hasta: string | null;
  vencido: boolean;
  origen: OrigenDeAcceso | "directo";
};

/**
 * Cada fuente de acceso al curso, una fila por fuente: una persona con el
 * curso por su cohorte Y por un acceso directo aparece dos veces, porque son
 * dos cosas que alguien puede querer cambiar por separado. Incluye las
 * vencidas (la pantalla las separa).
 */
export async function courseAccessList(
  orgId: string,
  courseId: string,
  now: Date = new Date()
): Promise<CourseAccessRow[] | null> {
  if (!(await courseExists(orgId, courseId))) return null;
  const db = getDb();

  const accessRows = await db
    .select({
      cohortId: offlineCourseAccess.cohortId,
      enrollmentId: offlineCourseAccess.enrollmentId,
      mode: offlineCourseAccess.mode,
    })
    .from(offlineCourseAccess)
    .where(scoped(offlineCourseAccess.organizationId, orgId, eq(offlineCourseAccess.offlineCourseId, courseId)));

  const cohortIds = accessRows.flatMap((r) => (r.cohortId ? [r.cohortId] : []));
  const revocadas = new Set(
    accessRows.flatMap((r) => (r.enrollmentId && r.mode === "revoke" ? [r.enrollmentId] : []))
  );
  const otorgadas = new Set(
    accessRows.flatMap((r) => (r.enrollmentId && r.mode === "grant" ? [r.enrollmentId] : []))
  );

  const columnas = {
    enrollmentId: enrollment.id,
    contactId: contact.id,
    firstName: contact.firstName,
    lastName: contact.lastName,
    cohortId: cohort.id,
    cohortName: cohort.name,
    courseName: course.name,
  };
  const delGrupo = cohortIds.length
    ? await db
        .select(columnas)
        .from(enrollment)
        .innerJoin(contact, eq(contact.id, enrollment.contactId))
        .innerJoin(cohort, eq(cohort.id, enrollment.cohortId))
        .leftJoin(course, eq(course.id, cohort.courseId))
        .where(scoped(enrollment.organizationId, orgId, inArray(enrollment.cohortId, cohortIds)))
    : [];
  const faltan = [...otorgadas].filter((id) => !delGrupo.some((e) => e.enrollmentId === id));
  const individuales = faltan.length
    ? await db
        .select(columnas)
        .from(enrollment)
        .innerJoin(contact, eq(contact.id, enrollment.contactId))
        .innerJoin(cohort, eq(cohort.id, enrollment.cohortId))
        .leftJoin(course, eq(course.id, cohort.courseId))
        .where(scoped(enrollment.organizationId, orgId, inArray(enrollment.id, faltan)))
    : [];

  const porCohorte = [
    ...delGrupo.filter((e) => !revocadas.has(e.enrollmentId) || otorgadas.has(e.enrollmentId)),
    ...individuales,
  ];
  const estados = await estadosDeAcceso(
    orgId,
    porCohorte.map((e) => e.enrollmentId),
    now
  );

  const filas: CourseAccessRow[] = porCohorte.map((e) => {
    const estado = estados.get(e.enrollmentId);
    return {
      contactId: e.contactId,
      contactName: fullName({ firstName: e.firstName, lastName: e.lastName }),
      source: {
        kind: "cohorte",
        enrollmentId: e.enrollmentId,
        cohortId: e.cohortId,
        cohortName: e.cohortName ?? e.courseName ?? "Cohorte",
        individual: otorgadas.has(e.enrollmentId),
      },
      hasta: estado?.hasta ?? null,
      vencido: estado?.vencido ?? false,
      origen: estado?.origen ?? "sin_fecha",
    };
  });

  const timeZone = await zonaDeLaOrganizacion(orgId);
  const directos = await db
    .select({
      grantId: offlineCourseGrant.id,
      contactId: contact.id,
      firstName: contact.firstName,
      lastName: contact.lastName,
      accessUntil: offlineCourseGrant.accessUntil,
      note: offlineCourseGrant.note,
      viaCompanyName: company.legalName,
      createdByName: user.name,
      createdAt: offlineCourseGrant.createdAt,
    })
    .from(offlineCourseGrant)
    .innerJoin(contact, eq(contact.id, offlineCourseGrant.contactId))
    .leftJoin(company, eq(company.id, offlineCourseGrant.viaCompanyId))
    .leftJoin(user, eq(user.id, offlineCourseGrant.createdBy))
    .where(
      scoped(
        offlineCourseGrant.organizationId,
        orgId,
        eq(offlineCourseGrant.offlineCourseId, courseId),
        isNull(offlineCourseGrant.revokedAt)
      )
    );
  for (const g of directos) {
    const hasta = diaCalendario(g.accessUntil);
    filas.push({
      contactId: g.contactId,
      contactName: fullName({ firstName: g.firstName, lastName: g.lastName }),
      source: {
        kind: "directo",
        grantId: g.grantId,
        note: g.note,
        viaCompanyName: g.viaCompanyName,
        createdByName: g.createdByName,
        createdAt: g.createdAt.toISOString(),
      },
      hasta,
      vencido: vencidoEl(hasta, now, timeZone),
      origen: "directo",
    });
  }

  return filas.sort((a, b) => a.contactName.localeCompare(b.contactName, "es"));
}

/* ============================================================
 * Los accesos directos de una persona (legajo)
 * ============================================================ */

export type ContactGrantDto = {
  id: string;
  courseId: string;
  courseTitle: string;
  hasta: string;
  vencido: boolean;
  note: string | null;
  viaCompanyName: string | null;
  createdAt: string;
  createdByName: string | null;
  revokedAt: string | null;
};

/** Los accesos directos de la persona, vigentes, vencidos y quitados. `null` = no existe. */
export async function contactGrants(
  orgId: string,
  contactId: string,
  now: Date = new Date()
): Promise<ContactGrantDto[] | null> {
  if (!(await contactExists(orgId, contactId))) return null;
  const rows = await getDb()
    .select({
      id: offlineCourseGrant.id,
      courseId: offlineCourse.id,
      courseTitle: offlineCourse.title,
      accessUntil: offlineCourseGrant.accessUntil,
      note: offlineCourseGrant.note,
      viaCompanyName: company.legalName,
      createdAt: offlineCourseGrant.createdAt,
      createdByName: user.name,
      revokedAt: offlineCourseGrant.revokedAt,
    })
    .from(offlineCourseGrant)
    .innerJoin(offlineCourse, eq(offlineCourse.id, offlineCourseGrant.offlineCourseId))
    .leftJoin(company, eq(company.id, offlineCourseGrant.viaCompanyId))
    .leftJoin(user, eq(user.id, offlineCourseGrant.createdBy))
    .where(scoped(offlineCourseGrant.organizationId, orgId, eq(offlineCourseGrant.contactId, contactId)))
    .orderBy(asc(offlineCourse.title));
  const timeZone = await zonaDeLaOrganizacion(orgId);
  return rows.map((r) => {
    const hasta = diaCalendario(r.accessUntil);
    return {
      id: r.id,
      courseId: r.courseId,
      courseTitle: r.courseTitle,
      hasta,
      vencido: vencidoEl(hasta, now, timeZone),
      note: r.note,
      viaCompanyName: r.viaCompanyName,
      createdAt: r.createdAt.toISOString(),
      createdByName: r.createdByName,
      revokedAt: r.revokedAt?.toISOString() ?? null,
    };
  });
}

/** ¿La persona tiene al menos un acceso directo sin quitar? (portal sin inscripción) */
export async function contactHasDirectGrant(orgId: string, contactId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: offlineCourseGrant.id })
    .from(offlineCourseGrant)
    .where(
      scoped(
        offlineCourseGrant.organizationId,
        orgId,
        eq(offlineCourseGrant.contactId, contactId),
        isNull(offlineCourseGrant.revokedAt)
      )
    )
    .limit(1);
  return Boolean(row);
}

/* ============================================================
 * Escrituras
 * ============================================================ */

const FECHA_PASADA = {
  ok: false,
  status: 422,
  code: "fecha_pasada",
  message: "La fecha de acceso ya pasó: un acceso nuevo tiene que llegar por lo menos hasta hoy.",
} as const;

/**
 * Da un curso a UNA persona hasta `accessUntil`. Si ya tenía un acceso
 * directo activo, le cambia la fecha (más tarde o más temprano: quien lo
 * carga a mano decide esa fecha). Un acceso NUEVO no puede nacer vencido.
 */
export async function assignGrant(
  orgId: string,
  input: { contactId: string; courseId: string; accessUntil: string; note: string | null },
  userId: string,
  now: Date = new Date()
): Promise<GrantResult<{ grantId: string; created: boolean }>> {
  if (!(await courseExists(orgId, input.courseId))) return NO_CURSO;
  if (!(await contactExists(orgId, input.contactId))) {
    return { ok: false, status: 422, code: "unknown_contact", message: "La persona no existe" };
  }

  const db = getDb();
  const [activo] = await db
    .select({ id: offlineCourseGrant.id, accessUntil: offlineCourseGrant.accessUntil })
    .from(offlineCourseGrant)
    .where(
      scoped(
        offlineCourseGrant.organizationId,
        orgId,
        eq(offlineCourseGrant.contactId, input.contactId),
        eq(offlineCourseGrant.offlineCourseId, input.courseId),
        isNull(offlineCourseGrant.revokedAt)
      )
    )
    .limit(1);

  const plan = planAsignacionIndividual(
    activo ? { id: activo.id, hasta: diaCalendario(activo.accessUntil) } : null,
    input.accessUntil
  );

  if (plan.kind === "insert") {
    const timeZone = await zonaDeLaOrganizacion(orgId);
    if (input.accessUntil < hoyEnZona(now, timeZone)) return FECHA_PASADA;
    const id = newId("offlineCourseGrant");
    const inserted = await db
      .insert(offlineCourseGrant)
      .values({
        id,
        organizationId: orgId,
        contactId: input.contactId,
        offlineCourseId: input.courseId,
        accessUntil: diaComoFecha(input.accessUntil),
        note: input.note,
        createdBy: userId,
        updatedBy: userId,
      })
      // Dos altas simultáneas: el índice único parcial deja pasar una.
      .onConflictDoNothing()
      .returning({ id: offlineCourseGrant.id });
    if (inserted.length === 0) {
      return {
        ok: false,
        status: 409,
        code: "ya_tiene_acceso",
        message: "Otra persona le dio acceso al mismo tiempo. Recargá para ver la fecha.",
      };
    }
    return { ok: true, data: { grantId: id, created: true } };
  }

  if (plan.kind === "update" || input.note !== null) {
    await db
      .update(offlineCourseGrant)
      .set({
        accessUntil: diaComoFecha(input.accessUntil),
        ...(input.note !== null ? { note: input.note } : {}),
        updatedAt: new Date(),
        updatedBy: userId,
      })
      .where(scoped(offlineCourseGrant.organizationId, orgId, eq(offlineCourseGrant.id, activo!.id)));
  }
  return { ok: true, data: { grantId: activo!.id, created: false } };
}

/** Cambia la fecha o la nota de un acceso directo activo. */
export async function updateGrant(
  orgId: string,
  grantId: string,
  input: { accessUntil?: string; note?: string | null },
  userId: string
): Promise<GrantResult<{ grantId: string }>> {
  const db = getDb();
  const [activo] = await db
    .select({ id: offlineCourseGrant.id })
    .from(offlineCourseGrant)
    .where(
      scoped(
        offlineCourseGrant.organizationId,
        orgId,
        eq(offlineCourseGrant.id, grantId),
        isNull(offlineCourseGrant.revokedAt)
      )
    )
    .limit(1);
  if (!activo) return NO_ACCESO;

  await db
    .update(offlineCourseGrant)
    .set({
      ...(input.accessUntil !== undefined ? { accessUntil: diaComoFecha(input.accessUntil) } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
      updatedAt: new Date(),
      updatedBy: userId,
    })
    .where(scoped(offlineCourseGrant.organizationId, orgId, eq(offlineCourseGrant.id, grantId)));
  return { ok: true, data: { grantId } };
}

/** Quita un acceso directo. Se MARCA (quién y cuándo), no se borra. */
export async function revokeGrant(
  orgId: string,
  grantId: string,
  userId: string
): Promise<GrantResult<{ grantId: string }>> {
  const updated = await getDb()
    .update(offlineCourseGrant)
    .set({ revokedAt: new Date(), revokedBy: userId, updatedAt: new Date(), updatedBy: userId })
    .where(
      scoped(
        offlineCourseGrant.organizationId,
        orgId,
        eq(offlineCourseGrant.id, grantId),
        isNull(offlineCourseGrant.revokedAt)
      )
    )
    .returning({ id: offlineCourseGrant.id });
  if (updated.length === 0) return NO_ACCESO;
  return { ok: true, data: { grantId } };
}

/* ============================================================
 * Toda una empresa
 * ============================================================ */

export type CompanyGrantPreview = {
  companyName: string;
  courseTitle: string;
  accessUntil: string;
  plan: PlanEmpresa;
};

async function planDeEmpresa(
  orgId: string,
  courseId: string,
  companyId: string,
  accessUntil: string
): Promise<GrantResult<CompanyGrantPreview>> {
  const curso = await courseExists(orgId, courseId);
  if (!curso) return NO_CURSO;
  const db = getDb();
  const [empresa] = await db
    .select({ id: company.id, legalName: company.legalName })
    .from(company)
    .where(scoped(company.organizationId, orgId, eq(company.id, companyId)))
    .limit(1);
  if (!empresa) {
    return { ok: false, status: 422, code: "unknown_company", message: "La empresa no existe" };
  }

  // Las personas que la empresa tiene HOY (archivadas afuera).
  const personas = await db
    .select({ id: contact.id, firstName: contact.firstName, lastName: contact.lastName })
    .from(contact)
    .where(
      scoped(contact.organizationId, orgId, eq(contact.companyId, companyId), isNull(contact.archivedAt))
    )
    .orderBy(asc(contact.firstName), asc(contact.lastName));
  const ids = personas.map((p) => p.id);

  const grants = ids.length
    ? await db
        .select({
          id: offlineCourseGrant.id,
          contactId: offlineCourseGrant.contactId,
          accessUntil: offlineCourseGrant.accessUntil,
          revokedAt: offlineCourseGrant.revokedAt,
        })
        .from(offlineCourseGrant)
        .where(
          scoped(
            offlineCourseGrant.organizationId,
            orgId,
            eq(offlineCourseGrant.offlineCourseId, courseId),
            inArray(offlineCourseGrant.contactId, ids)
          )
        )
    : [];
  const activos = grants
    .filter((g) => g.revokedAt === null)
    .map((g) => ({ id: g.id, contactId: g.contactId, hasta: diaCalendario(g.accessUntil) }));
  const quitados = grants.filter((g) => g.revokedAt !== null).map((g) => g.contactId);

  return {
    ok: true,
    data: {
      companyName: empresa.legalName,
      courseTitle: curso.title,
      accessUntil,
      plan: planAsignacionPorEmpresa(
        personas.map((p) => ({ id: p.id, name: fullName(p) })),
        activos,
        accessUntil,
        quitados
      ),
    },
  };
}

/** La vista previa: quién lo recibe, a quién se le extiende y a quién no se toca. */
export async function previewCompanyGrant(
  orgId: string,
  courseId: string,
  companyId: string,
  accessUntil: string,
  now: Date = new Date()
): Promise<GrantResult<CompanyGrantPreview>> {
  const timeZone = await zonaDeLaOrganizacion(orgId);
  if (accessUntil < hoyEnZona(now, timeZone)) return FECHA_PASADA;
  return planDeEmpresa(orgId, courseId, companyId, accessUntil);
}

/**
 * Aplica el plan: un acceso INDIVIDUAL por persona. Re-planea al confirmar
 * (no confía en la vista previa del navegador) y es idempotente: repetirlo no
 * duplica y nunca acorta.
 */
export async function applyCompanyGrant(
  orgId: string,
  input: { courseId: string; companyId: string; accessUntil: string; note: string | null },
  userId: string,
  now: Date = new Date()
): Promise<GrantResult<CompanyGrantPreview & { created: number; extended: number }>> {
  const preview = await previewCompanyGrant(orgId, input.courseId, input.companyId, input.accessUntil, now);
  if (!preview.ok) return preview;
  const { plan } = preview.data;
  const db = getDb();
  const hasta = diaComoFecha(input.accessUntil);

  let created = 0;
  if (plan.crear.length > 0) {
    const inserted = await db
      .insert(offlineCourseGrant)
      .values(
        plan.crear.map((p) => ({
          id: newId("offlineCourseGrant"),
          organizationId: orgId,
          contactId: p.contactId,
          offlineCourseId: input.courseId,
          accessUntil: hasta,
          note: input.note,
          viaCompanyId: input.companyId,
          createdBy: userId,
          updatedBy: userId,
        }))
      )
      .onConflictDoNothing()
      .returning({ id: offlineCourseGrant.id });
    created = inserted.length;
  }

  let extended = 0;
  if (plan.extender.length > 0) {
    const updated = await db
      .update(offlineCourseGrant)
      .set({ accessUntil: hasta, updatedAt: new Date(), updatedBy: userId })
      .where(
        scoped(
          offlineCourseGrant.organizationId,
          orgId,
          inArray(
            offlineCourseGrant.id,
            plan.extender.map((e) => e.grantId)
          ),
          isNull(offlineCourseGrant.revokedAt),
          // Nunca acorta, aunque alguien la haya extendido entre el plan y acá.
          lt(offlineCourseGrant.accessUntil, hasta)
        )
      )
      .returning({ id: offlineCourseGrant.id });
    extended = updated.length;
  }

  return { ok: true, data: { ...preview.data, created, extended } };
}

/** Las empresas con al menos una persona activa, con cuántas, para el selector. */
export async function companiesWithPeople(
  orgId: string
): Promise<Array<{ id: string; legalName: string; people: number }>> {
  const rows = await getDb()
    .select({ id: company.id, legalName: company.legalName, people: count(contact.id) })
    .from(company)
    .innerJoin(contact, and(eq(contact.companyId, company.id), isNull(contact.archivedAt)))
    .where(scoped(company.organizationId, orgId, isNotNull(contact.id)))
    .groupBy(company.id, company.legalName)
    .orderBy(asc(company.legalName));
  return rows.map((r) => ({ ...r, people: Number(r.people) }));
}

/* ============================================================
 * 045 — Desde la empresa (`/empresas`)
 * ============================================================ */

export type CompanyOfflineGrants = {
  /** Por curso: cuántas personas lo tienen HOY y entre qué fechas vence. */
  courses: CursoDeEmpresa[];
  /** La gente de la empresa hoy (archivadas afuera), cada una con sus accesos directos sin quitar. */
  people: Array<{
    contactId: string;
    name: string;
    grants: Array<{ id: string; courseId: string; courseTitle: string; hasta: string; vencido: boolean }>;
  }>;
};

/**
 * Los accesos directos de la gente de una empresa. Lo lee quien tiene
 * `contactos.ver` (Ventas incluida), así que solo viajan nombres, cursos y
 * fechas: ni datos de contacto, ni la nota, ni quién lo dio. `null` = la
 * empresa no es de la organización.
 */
export async function companyOfflineGrants(
  orgId: string,
  companyId: string,
  now: Date = new Date()
): Promise<CompanyOfflineGrants | null> {
  const db = getDb();
  const [empresa] = await db
    .select({ id: company.id })
    .from(company)
    .where(scoped(company.organizationId, orgId, eq(company.id, companyId)))
    .limit(1);
  if (!empresa) return null;

  const personas = await db
    .select({ id: contact.id, firstName: contact.firstName, lastName: contact.lastName })
    .from(contact)
    .where(
      scoped(contact.organizationId, orgId, eq(contact.companyId, companyId), isNull(contact.archivedAt))
    )
    .orderBy(asc(contact.firstName), asc(contact.lastName));
  const ids = personas.map((p) => p.id);

  const filas = ids.length
    ? await db
        .select({
          id: offlineCourseGrant.id,
          contactId: offlineCourseGrant.contactId,
          courseId: offlineCourse.id,
          courseTitle: offlineCourse.title,
          accessUntil: offlineCourseGrant.accessUntil,
        })
        .from(offlineCourseGrant)
        .innerJoin(offlineCourse, eq(offlineCourse.id, offlineCourseGrant.offlineCourseId))
        .where(
          scoped(
            offlineCourseGrant.organizationId,
            orgId,
            inArray(offlineCourseGrant.contactId, ids),
            isNull(offlineCourseGrant.revokedAt)
          )
        )
        .orderBy(asc(offlineCourse.title))
    : [];

  const timeZone = await zonaDeLaOrganizacion(orgId);
  const accesos = filas.map((g) => {
    const hasta = diaCalendario(g.accessUntil);
    return {
      id: g.id,
      contactId: g.contactId,
      courseId: g.courseId,
      courseTitle: g.courseTitle,
      hasta,
      vencido: vencidoEl(hasta, now, timeZone),
    };
  });

  return {
    courses: resumenDeCursosDeEmpresa(accesos),
    people: personas.map((p) => ({
      contactId: p.id,
      name: fullName(p),
      grants: accesos
        .filter((a) => a.contactId === p.id)
        .map(({ id, courseId, courseTitle, hasta, vencido }) => ({ id, courseId, courseTitle, hasta, vencido })),
    })),
  };
}
