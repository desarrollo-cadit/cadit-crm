import { asc, eq, gte, like, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { normalizePhoneOrRaw, phoneInputSchema } from "@/lib/phone";
import { normalizarCorreo } from "@/lib/contact-identity";
import { onLeadActivity } from "@/server/inbox/lead-activity";
import { avisarInteresadoNuevo } from "@/server/lead-notices-queue";
import { registrarEnvioDeFormulario } from "@/server/seguimiento";
import { condicionDeCatalogo, resolveSoleOrganizationId } from "@/server/public-catalog";
import { FORM_ARRIVAL_WINDOW_MS, FORM_SOURCE_PREFIX } from "@/lib/form-arrivals";

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

export type PublicLeadInput = {
  name: string;
  lastName?: string | null;
  phone: string;
  email?: string | null;
  notes?: string | null;
};

/**
 * 005 iteración 8 — contrato ÚNICO del body de captación pública, compartido
 * por las dos puertas (`/api/public/forms/<id>/submit` y
 * `/api/public/courses/<slug>/submit`). Vive acá y no en cada route para que
 * un sitio externo no tenga que aprenderse dos formas del mismo formulario.
 */
export const publicLeadSchema = z.object({
  name: z.string().trim().min(1).max(120),
  // 005 iteración 7 — apellido separado. OPCIONAL a propósito: los sitios
  // externos que ya tienen el snippet viejo embebido siguen funcionando y el
  // contacto queda como antes (todo en `name`).
  lastName: z.string().trim().max(120).optional(),
  phone: phoneInputSchema,
  email: z.string().trim().email().max(200).optional(),
  // 005 iteración 4 (feedback en vivo: "el campo mensaje que llena el
  // usuario en mi web") — nombre de cara al formulario externo; se guarda
  // en contact.notes (mismo campo que ya se ve en la tabla de contactos).
  message: z.string().max(4000).optional(),
});

/**
 * 005 iteración 3 — alta del contacto + lead a partir de una captación
 * pública. Busca/crea el contacto (reusa el criterio del alta manual:
 * waIdentity = teléfono normalizado, onConflictDoNothing en el índice
 * existente) y asegura el lead general reusando `onLeadActivity` (ya tiene
 * su lógica de crear/actualizar).
 *
 * 005 iteración 8 — extraída de `submitIntakeForm` para que la entrada por
 * curso del catálogo (`submitCourseInterest`) no duplique el alta. Lo único
 * que cambia entre las dos puertas es de dónde salen `source` e
 * `interestCourseId`.
 */
async function registerPublicLead(
  organizationId: string,
  source: string,
  interestCourseId: string | null,
  input: PublicLeadInput,
  aviso: { ref: string; courseName: string | null }
): Promise<IntakeFormSubmitResult> {
  const contacto = await findOrCreatePublicContactWithStatus(organizationId, source, input);
  const contactId = contacto?.contactId;
  if (!contacto || !contactId) {
    // Carrera extremadamente improbable: ni insert ni select encontraron fila.
    return {
      ok: false,
      status: 404,
      code: "not_found",
      message: "No se pudo registrar el contacto",
    };
  }

  await onLeadActivity(organizationId, contactId, new Date(), interestCourseId);

  // Aviso a "Nuevos interesados": se encola acá y sale después del commit.
  // Solo las puertas públicas llegan a esta función.
  let courseName = aviso.courseName;
  if (interestCourseId && !courseName) {
    const rows = await getDb()
      .select({ name: schema.course.name })
      .from(schema.course)
      .where(scoped(schema.course.organizationId, organizationId, eq(schema.course.id, interestCourseId)))
      .limit(1);
    courseName = rows[0]?.name ?? null;
  }
  // El MISMO instante para el envío y el aviso: el backfill de la 0066 los
  // reconoce como el mismo hecho y no lo copia dos veces.
  const now = new Date();
  // La pestaña «Seguimiento»: el envío tal como llegó (savepoint, no lanza).
  await registrarEnvioDeFormulario(organizationId, {
    contactId,
    source,
    ref: aviso.ref,
    interestKind: interestCourseId ? "curso" : "general",
    interestName: courseName,
    datos: input,
    now,
  });
  await avisarInteresadoNuevo(organizationId, {
    contactId,
    contactoNuevo: contacto.created,
    ref: aviso.ref,
    datos: input,
    origen: source,
    now,
    interes: {
      tipo: interestCourseId ? "curso" : "general",
      nombre: courseName,
      cohorte: null,
      inicio: null,
      horario: null,
    },
  });

  return { ok: true, contactId };
}

/**
 * El contacto de una captación pública: el existente con el mismo teléfono
 * normalizado, o uno nuevo. `null` solo en la carrera improbable en que ni el
 * insert ni el select encuentran la fila.
 *
 * 033 (FR-007) — extraída de `registerPublicLead` para que la inscripción a
 * un taller (`src/server/workshops.ts`) deduplique con el MISMO criterio que
 * los formularios de cursos: dos criterios de identidad son dos contactos
 * para la misma persona.
 */
export async function findOrCreatePublicContact(
  organizationId: string,
  source: string,
  input: PublicLeadInput
): Promise<string | null> {
  return (await findOrCreatePublicContactWithStatus(organizationId, source, input))?.contactId ?? null;
}

/**
 * Igual que `findOrCreatePublicContact`, diciendo además si el contacto se
 * CREÓ con este envío (el aviso de nuevos interesados lo cuenta).
 */
export async function findOrCreatePublicContactWithStatus(
  organizationId: string,
  source: string,
  input: PublicLeadInput
): Promise<{ contactId: string; created: boolean } | null> {
  const db = getDb();
  // 007 — misma normalización que la importación de planillas: si no, el
  // lead que entra por la web queda con "098574165" y el alumno ya cargado
  // con "59898574165", y son dos contactos para la misma persona.
  const phone = normalizePhoneOrRaw(input.phone);

  const inserted = await db
    .insert(schema.contact)
    .values({
      id: newId("contact"),
      organizationId,
      // 005 iteración 7 — la captación pública ya manda apellido aparte
      // (`lastName`, opcional para no romper los formularios ya embebidos):
      // cuando no viene, `name` va entero a firstName y lastName queda NULL,
      // igual que un contacto de WhatsApp.
      firstName: input.name,
      lastName: input.lastName ?? null,
      phone,
      waIdentity: phone,
      notes: input.notes ?? null,
      // 2026-10-21 — el correo de un contacto se guarda siempre en minúsculas.
      email: normalizarCorreo(input.email),
      source,
    })
    .onConflictDoNothing({
      target: [schema.contact.organizationId, schema.contact.waIdentity],
    })
    .returning();

  let contactId = inserted[0]?.id;
  const created = Boolean(contactId);
  if (!contactId) {
    // Ya existía (mismo teléfono): reutiliza el contacto, sin pisar su source.
    const existing = await db
      .select({ id: schema.contact.id })
      .from(schema.contact)
      .where(scoped(schema.contact.organizationId, organizationId, eq(schema.contact.waIdentity, phone)))
      .limit(1);
    contactId = existing[0]?.id;
  }
  return contactId ? { contactId, created } : null;
}

/**
 * 005 iteración 3 — resuelve el `intake_form` en la única organización de la
 * instancia (mismo criterio mono-tenant que `resolveSoleOrganizationId`,
 * DV-010) y registra el lead con `source: "formulario:<nombre>"`.
 *
 * 005 iteración 7 — el curso del formulario viaja al lead como FK
 * (`enrollment.interest_course_id`); `source` sigue existiendo pero como
 * texto informativo, no como la forma de saber de qué curso vino.
 */
export async function submitIntakeForm(
  formId: string,
  input: PublicLeadInput
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

  return registerPublicLead(
    organizationId,
    `formulario:${form.name}`,
    form.courseId,
    input,
    { ref: `form:${form.id}`, courseName: null }
  );
}

/**
 * 005 iteración 8 — captación DIRECTA por curso del catálogo, sin
 * `intake_form` de por medio: `POST /api/public/courses/<slug>/submit`. El
 * sitio comercial ya consume el catálogo público y tiene el `slug` de cada
 * curso, así que no hace falta provisionar ni mantener sincronizado un id de
 * formulario por curso — la clave ES el curso.
 *
 * Acepta slug o id interno, igual que `getPublicCourse`, para que las URLs
 * publicadas con id sigan resolviendo. Los formularios con nombre de
 * /settings/forms siguen existiendo para las campañas donde el origen tiene
 * que llamarse distinto ("Feria 2026").
 */
export async function submitCourseInterest(
  idOrSlug: string,
  input: PublicLeadInput
): Promise<IntakeFormSubmitResult> {
  const notFound = {
    ok: false,
    status: 404,
    code: "not_found",
    message: "Curso no encontrado",
  } as const;

  const organizationId = await resolveSoleOrganizationId();
  if (!organizationId) return notFound;

  const db = getDb();
  const courseRows = await db
    .select({ id: schema.course.id, name: schema.course.name })
    .from(schema.course)
    .where(
      scoped(
        schema.course.organizationId,
        organizationId,
        // 007 — mismo criterio que el catálogo público: si el curso no se
        // publica, su landing no existe y esta puerta tampoco. Los talleres
        // internos no reciben leads del sitio.
        condicionDeCatalogo(),
        or(eq(schema.course.slug, idOrSlug), eq(schema.course.id, idOrSlug))
      )
    )
    .limit(1);
  const course = courseRows[0];
  if (!course) return notFound;

  // Mismo prefijo `formulario:` que las otras captaciones públicas: así el
  // badge del sidebar (`countRecentFormArrivals`) y el tag de la tabla de
  // contactos siguen funcionando sin cambios. La atribución de verdad no es
  // este texto, es `enrollment.interest_course_id`.
  return registerPublicLead(
    organizationId,
    `formulario:${course.name}`,
    course.id,
    input,
    { ref: `curso:${course.id}`, courseName: course.name }
  );
}

// La ventana y el prefijo son los mismos que resaltan la tabla (`src/lib/form-arrivals.ts`).

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
        like(schema.contact.source, `${FORM_SOURCE_PREFIX}%`)
      )
    );
  return Number(rows[0]?.n ?? 0);
}
