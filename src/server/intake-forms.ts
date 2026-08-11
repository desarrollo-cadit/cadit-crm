import { asc, eq, gte, like, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { normalizeMx } from "@/lib/meta/client";
import { onLeadActivity } from "@/server/inbox/lead-activity";
import { resolveSoleOrganizationId } from "@/server/public-catalog";

/**
 * 005 iteración 3 (formularios de captación) — CRUD autenticado de
 * formularios personalizados: el dueño los configura en
 * /settings/forms y pega el snippet de submit en su sitio externo.
 */

export type IntakeFormDto = {
  id: string;
  name: string;
  courseId: string | null;
  courseName: string | null;
  createdAt: string;
};

function serializeIntakeForm(
  row: typeof schema.intakeForm.$inferSelect,
  courseName: string | null
): IntakeFormDto {
  return {
    id: row.id,
    name: row.name,
    courseId: row.courseId,
    courseName,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listIntakeForms(
  organizationId: string
): Promise<IntakeFormDto[]> {
  const db = getDb();
  const rows = await db
    .select({ form: schema.intakeForm, course: schema.course })
    .from(schema.intakeForm)
    .leftJoin(schema.course, eq(schema.intakeForm.courseId, schema.course.id))
    .where(scoped(schema.intakeForm.organizationId, organizationId))
    .orderBy(asc(schema.intakeForm.createdAt));
  return rows.map((r) => serializeIntakeForm(r.form, r.course?.name ?? null));
}

export async function createIntakeForm(
  organizationId: string,
  input: { name: string; courseId?: string | null }
): Promise<IntakeFormDto> {
  const db = getDb();
  const id = newId("intakeForm");
  const inserted = await db
    .insert(schema.intakeForm)
    .values({
      id,
      organizationId,
      name: input.name,
      courseId: input.courseId ?? null,
    })
    .returning();
  const row = inserted[0]!;
  let courseName: string | null = null;
  if (row.courseId) {
    const courseRows = await db
      .select({ name: schema.course.name })
      .from(schema.course)
      .where(eq(schema.course.id, row.courseId))
      .limit(1);
    courseName = courseRows[0]?.name ?? null;
  }
  return serializeIntakeForm(row, courseName);
}

export type IntakeFormSubmitResult =
  | { ok: true; contactId: string }
  | { ok: false; status: 404; code: "not_found"; message: string };

/**
 * 005 iteración 3 — resuelve el `intake_form` en la única organización de la
 * instancia (mismo criterio mono-tenant que `resolveSoleOrganizationId`,
 * DV-010), busca/crea el contacto con `source: "formulario:<nombre>"`
 * (reusa el criterio de alta manual: waIdentity = normalizeMx(phone),
 * onConflictDoNothing en el índice existente) y asegura el lead general
 * reusando `onLeadActivity` (ya tiene su lógica de crear/actualizar).
 */
export async function submitIntakeForm(
  formId: string,
  input: { name: string; phone: string; email?: string | null; notes?: string | null }
): Promise<IntakeFormSubmitResult> {
  const organizationId = await resolveSoleOrganizationId();
  if (!organizationId) {
    return {
      ok: false,
      status: 404,
      code: "not_found",
      message: "Formulario no encontrado",
    };
  }

  const db = getDb();
  const formRows = await db
    .select()
    .from(schema.intakeForm)
    .where(
      scoped(
        schema.intakeForm.organizationId,
        organizationId,
        eq(schema.intakeForm.id, formId)
      )
    )
    .limit(1);
  const form = formRows[0];
  if (!form) {
    return {
      ok: false,
      status: 404,
      code: "not_found",
      message: "Formulario no encontrado",
    };
  }

  const phone = normalizeMx(input.phone);
  const source = `formulario:${form.name}`;

  const inserted = await db
    .insert(schema.contact)
    .values({
      id: newId("contact"),
      organizationId,
      name: input.name,
      phone,
      waIdentity: phone,
      notes: input.notes ?? null,
      email: input.email ?? null,
      source,
    })
    .onConflictDoNothing({
      target: [schema.contact.organizationId, schema.contact.waIdentity],
    })
    .returning();

  let contactId = inserted[0]?.id;
  if (!contactId) {
    // Ya existía (mismo teléfono): reutiliza el contacto, sin pisar su source.
    const existing = await db
      .select({ id: schema.contact.id })
      .from(schema.contact)
      .where(scoped(schema.contact.organizationId, organizationId, eq(schema.contact.waIdentity, phone)))
      .limit(1);
    contactId = existing[0]?.id;
  }
  if (!contactId) {
    // Carrera extremadamente improbable: ni insert ni select encontraron fila.
    return {
      ok: false,
      status: 404,
      code: "not_found",
      message: "No se pudo registrar el contacto",
    };
  }

  await onLeadActivity(organizationId, contactId, new Date());

  return { ok: true, contactId };
}

const FORM_ARRIVAL_WINDOW_MS = 48 * 60 * 60 * 1000;

/**
 * 005 iteración 3 — conteo de contactos que llegaron por formulario
 * (source LIKE 'formulario:%') en las últimas 48 h, para el badge del
 * sidebar (sin sistema de "visto/no visto" persistente — la ventana de
 * tiempo alcanza, ver decisión de diseño en el reporte de la tarea).
 */
export async function countRecentFormArrivals(
  organizationId: string
): Promise<number> {
  const db = getDb();
  const since = new Date(Date.now() - FORM_ARRIVAL_WINDOW_MS);
  const rows = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.contact)
    .where(
      scoped(
        schema.contact.organizationId,
        organizationId,
        gte(schema.contact.createdAt, since),
        like(schema.contact.source, "formulario:%")
      )
    );
  return Number(rows[0]?.n ?? 0);
}
