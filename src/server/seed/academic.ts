import { inArray } from "drizzle-orm";
import type { getDb } from "@/lib/db";
import { schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { createCohort, createCourse } from "@/server/courses";
import { ensureAcademicStages } from "@/server/seed/academic-stages";
import { createTeacher } from "@/server/teachers";

/**
 * 004 — Seed de ejemplo para el módulo académico (Fase 1). Independiente del
 * demo "Ferretería El Martillo" (`src/server/seed/demo.ts`), que sigue
 * siendo la demo genérica del CRM original. Idempotente: borra los datos
 * académicos demo previos de la organización (por teléfono) y reinserta.
 *
 * Cubre los 5 escenarios de `specs/004-modelo-academico/spec.md`:
 * - US1: un contacto con lead general (sin camada).
 * - US2: un curso con una camada.
 * - US3: un contacto con lead general + inscripciones en DOS camadas.
 * - US5: un contacto con `source`/`utm_campaign`.
 */

type Db = ReturnType<typeof getDb>;

const DEMO_PHONES = ["5215699990001", "5215699990002", "5215699990003"];

export async function seedAcademicDemo(
  db: Db,
  organizationId: string
): Promise<{
  courses: number;
  cohorts: number;
  enrollments: number;
}> {
  // --- Idempotencia: limpiar datos académicos demo previos ---
  const prevContacts = await db
    .select({ id: schema.contact.id })
    .from(schema.contact)
    .where(scoped(schema.contact.organizationId, organizationId, inArray(schema.contact.phone, DEMO_PHONES)));
  const prevIds = prevContacts.map((c) => c.id);
  if (prevIds.length > 0) {
    await db
      .delete(schema.enrollment)
      .where(inArray(schema.enrollment.contactId, prevIds));
    await db.delete(schema.contact).where(inArray(schema.contact.id, prevIds));
  }
  const prevCourses = await db
    .select({ id: schema.course.id })
    .from(schema.course)
    .where(scoped(schema.course.organizationId, organizationId));
  // Solo se limpian los cursos demo (por nombre) — no se toca un curso real.
  const demoCourseNames = ["Revit", "Civil 3D"];
  const demoCourses = await db
    .select({ id: schema.course.id, name: schema.course.name })
    .from(schema.course)
    .where(inArray(schema.course.id, prevCourses.map((c) => c.id)));
  const demoCourseIds = demoCourses
    .filter((c) => demoCourseNames.includes(c.name))
    .map((c) => c.id);
  if (demoCourseIds.length > 0) {
    const demoCohorts = await db
      .select({ id: schema.cohort.id })
      .from(schema.cohort)
      .where(inArray(schema.cohort.courseId, demoCourseIds));
    const demoCohortIds = demoCohorts.map((c) => c.id);
    if (demoCohortIds.length > 0) {
      await db
        .delete(schema.cohort)
        .where(inArray(schema.cohort.id, demoCohortIds));
    }
    await db.delete(schema.course).where(inArray(schema.course.id, demoCourseIds));
  }

  // --- Etapas académicas (US1/US2/US3) ---
  await ensureAcademicStages(db, organizationId);
  const stages = await db
    .select()
    .from(schema.pipelineStage)
    .where(scoped(schema.pipelineStage.organizationId, organizationId));
  const stageByName = new Map(stages.map((s) => [s.name, s.id]));
  const leadStageId = stageByName.get("lead");
  const contactadoStageId = stageByName.get("contactado");
  if (!leadStageId || !contactadoStageId) {
    throw new Error("Etapas académicas no sembradas");
  }

  // --- Curso + dos camadas (US2) ---
  const revitCourseId = await createCourse(organizationId, {
    name: "Revit",
    description: "Modelado BIM para arquitectura",
  });
  const civilCourseId = await createCourse(organizationId, {
    name: "Civil 3D",
    description: "Diseño e infraestructura civil",
  });
  // 005 (DV-005) — profesor como entidad propia, ya no texto libre.
  const paolaTeacherId = await createTeacher(organizationId, {
    name: "Ing. Paola Suárez",
  });
  const marcosTeacherId = await createTeacher(organizationId, {
    name: "Ing. Marcos Beltrán",
  });
  const revitCohortA = await createCohort(organizationId, {
    courseId: revitCourseId,
    startDate: new Date("2026-08-04"),
    teacherId: paolaTeacherId,
    capacity: 20,
    whatsappGroupLink: "https://chat.whatsapp.com/revit-agosto-2026-demo",
  });
  const revitCohortB = await createCohort(organizationId, {
    courseId: revitCourseId,
    startDate: new Date("2026-08-25"),
    teacherId: paolaTeacherId,
    capacity: 20,
    whatsappGroupLink: "https://chat.whatsapp.com/revit-agosto-25-2026-demo",
  });
  const civilCohort = await createCohort(organizationId, {
    courseId: civilCourseId,
    startDate: new Date("2026-10-15"),
    teacherId: marcosTeacherId,
    capacity: 15,
  });
  // Seed interno con ids recién creados arriba — si esto falla, es un bug del
  // propio seed, no un caso de negocio a manejar con gracia.
  if (!revitCohortA.ok || !revitCohortB.ok || !civilCohort.ok) {
    throw new Error("seedAcademicDemo: createCohort falló con ids propios del seed");
  }
  const revitCohortAId = revitCohortA.id;
  const revitCohortBId = revitCohortB.id;
  const civilCohortId = civilCohort.id;

  // --- Contacto A: solo lead general, sin camada (US1) ---
  const contactAId = newId("contact");
  await db.insert(schema.contact).values({
    id: contactAId,
    organizationId,
    phone: DEMO_PHONES[0],
    waIdentity: DEMO_PHONES[0]!,
    name: "Valentina Rojas (demo académico)",
    source: "whatsapp",
  });
  await db.insert(schema.enrollment).values({
    id: newId("enrollment"),
    organizationId,
    contactId: contactAId,
    cohortId: null,
    stageId: leadStageId,
    position: 0,
  });

  // --- Contacto B: lead general + inscripción a la camada A de Revit (US1+US2+US3) ---
  const contactBId = newId("contact");
  await db.insert(schema.contact).values({
    id: contactBId,
    organizationId,
    phone: DEMO_PHONES[1],
    waIdentity: DEMO_PHONES[1]!,
    name: "Diego Fernández (demo académico)",
    source: "feria-2026",
    utmCampaign: "feria_capacitaciones_agosto",
  });
  await db.insert(schema.enrollment).values({
    id: newId("enrollment"),
    organizationId,
    contactId: contactBId,
    cohortId: null,
    stageId: leadStageId,
    position: 1,
  });
  await db.insert(schema.enrollment).values({
    id: newId("enrollment"),
    organizationId,
    contactId: contactBId,
    cohortId: revitCohortAId,
    stageId: contactadoStageId,
    position: 0,
    enrolledAt: new Date("2026-07-20"),
  });

  // --- Contacto C: inscripto en DOS camadas distintas, sin lead general (US3) ---
  const contactCId = newId("contact");
  await db.insert(schema.contact).values({
    id: contactCId,
    organizationId,
    phone: DEMO_PHONES[2],
    waIdentity: DEMO_PHONES[2]!,
    name: "Renata Ibarra (demo académico)",
  });
  await db.insert(schema.enrollment).values({
    id: newId("enrollment"),
    organizationId,
    contactId: contactCId,
    cohortId: revitCohortBId,
    stageId: contactadoStageId,
    position: 1,
    enrolledAt: new Date("2026-08-01"),
  });
  await db.insert(schema.enrollment).values({
    id: newId("enrollment"),
    organizationId,
    contactId: contactCId,
    cohortId: civilCohortId,
    stageId: leadStageId,
    position: 0,
  });

  return { courses: 2, cohorts: 3, enrollments: 5 };
}

/** true si la organización aún no tiene datos académicos demo (para el CLI). */
export async function isAcademicDemoEmpty(
  db: Db,
  organizationId: string
): Promise<boolean> {
  const rows = await db
    .select({ id: schema.contact.id })
    .from(schema.contact)
    .where(scoped(schema.contact.organizationId, organizationId, inArray(schema.contact.phone, DEMO_PHONES)));
  return rows.length === 0;
}
