import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { estadoDeMarketingDelContacto } from "@/server/marketing/unsubscribe";
import {
  armarLineaDeTiempo,
  entradasDeMarketing,
  estadoDeMarketing,
  type EstadoDeMarketingDto,
  type ActividadDto,
  type EntradaDeSeguimiento,
  type EnvioDeFormularioDto,
  type SeguimientoBody,
} from "@/lib/seguimiento";

/**
 * La pestaña «Seguimiento» del contacto (lectura y escritura) y el registro
 * de cada envío de formulario público.
 *
 * Las reglas (enlaces, orden de la línea, pestaña inicial) son puras y viven
 * en `src/lib/seguimiento.ts`; acá solo se juntan y escriben filas.
 */

/* --------------------------------------------- envíos de formulario público */

export type EnvioParaRegistrar = {
  contactId: string;
  source: string;
  ref: string;
  interestKind: "curso" | "taller" | "general";
  interestName: string | null;
  cohortName?: string | null;
  datos: {
    name: string;
    lastName?: string | null;
    phone: string | null;
    email?: string | null;
    notes?: string | null;
    company?: string | null;
  };
  result?: string | null;
  now: Date;
};

/**
 * Guarda el envío tal como llegó, en un SAVEPOINT de la transacción del
 * formulario. NO LANZA: un envío que no se pudo guardar se pierde (y queda en
 * el log), pero el interesado entra al CRM igual. Perder el lead por culpa del
 * historial sería peor que perder una fila del historial.
 *
 * Lo llaman SOLO `registerPublicLead` (`intake-forms.ts`) y
 * `submitPublicWorkshopRegistration` (`workshops.ts`).
 */
export async function registrarEnvioDeFormulario(
  organizationId: string,
  envio: EnvioParaRegistrar
): Promise<void> {
  try {
    await getDb().transaction(async (sp) => {
      await sp.insert(schema.contactFormSubmission).values({
        id: newId("contactFormSubmission"),
        organizationId,
        contactId: envio.contactId,
        source: envio.source,
        ref: envio.ref,
        interestKind: envio.interestKind,
        interestName: envio.interestName,
        cohortName: envio.cohortName ?? null,
        firstName: envio.datos.name,
        lastName: envio.datos.lastName ?? null,
        phone: envio.datos.phone,
        email: envio.datos.email ?? null,
        message: envio.datos.notes ?? null,
        company: envio.datos.company ?? null,
        result: envio.result ?? null,
        createdAt: envio.now,
      });
    });
  } catch (err) {
    console.error(
      `[seguimiento] envío de ${envio.contactId}: no se pudo guardar (${err instanceof Error ? err.name : "error"})`
    );
  }
}

/* ------------------------------------------------------------- la pestaña */

export type SeguimientoDto = {
  contact: { email: string | null; phone: string | null };
  timeline: EntradaDeSeguimiento[];
  /**
   * 045 (FR-013, FR-015) — ¿Recibe campañas? Viaja con `contactos.ver` como
   * el resto de la pestaña: fecha y nombre de campaña no son plata ni datos
   * nuevos de la persona. `revertible` lo decide `marketing.configurar`.
   */
  marketing: EstadoDeMarketingDto;
};

async function contactoDeLaOrganizacion(organizationId: string, contactId: string) {
  const [row] = await getDb()
    .select({ email: schema.contact.email, phone: schema.contact.phone })
    .from(schema.contact)
    .where(scoped(schema.contact.organizationId, organizationId, eq(schema.contact.id, contactId)))
    .limit(1);
  return row ?? null;
}

/**
 * Lo que muestra la pestaña. `null` si el contacto no es de esta organización
 * (la ruta responde 404). Viaja con `contactos.ver`: el correo y el teléfono
 * ya los muestra el encabezado del legajo con esa misma capacidad.
 */
export async function seguimientoDelContacto(
  organizationId: string,
  contactId: string,
  opts: { puedeReactivarMarketing?: boolean } = {}
): Promise<SeguimientoDto | null> {
  const contacto = await contactoDeLaOrganizacion(organizationId, contactId);
  if (!contacto) return null;
  const db = getDb();

  const [envios, actividades] = await Promise.all([
    db
      .select()
      .from(schema.contactFormSubmission)
      .where(
        scoped(
          schema.contactFormSubmission.organizationId,
          organizationId,
          eq(schema.contactFormSubmission.contactId, contactId)
        )
      )
      .orderBy(desc(schema.contactFormSubmission.createdAt)),
    db
      .select({ activity: schema.contactActivity, authorName: schema.user.name })
      .from(schema.contactActivity)
      .leftJoin(schema.user, eq(schema.contactActivity.authorUserId, schema.user.id))
      .where(
        scoped(
          schema.contactActivity.organizationId,
          organizationId,
          eq(schema.contactActivity.contactId, contactId)
        )
      )
      .orderBy(desc(schema.contactActivity.createdAt)),
  ]);

  const enviosDto: EnvioDeFormularioDto[] = envios.map((e) => ({
    id: e.id,
    at: e.createdAt.toISOString(),
    source: e.source,
    interestKind: e.interestKind,
    interestName: e.interestName,
    cohortName: e.cohortName,
    firstName: e.firstName,
    lastName: e.lastName,
    phone: e.phone,
    email: e.email,
    message: e.message,
    company: e.company,
    result: e.result,
  }));
  const actividadesDto: ActividadDto[] = actividades.map(({ activity, authorName }) => ({
    id: activity.id,
    at: activity.createdAt.toISOString(),
    kind: activity.kind,
    body: activity.body,
    authorName: authorName ?? null,
  }));

  const bajas = await estadoDeMarketingDelContacto(organizationId, contactId);

  return {
    contact: { email: contacto.email, phone: contacto.phone },
    timeline: armarLineaDeTiempo(enviosDto, actividadesDto, entradasDeMarketing(bajas)),
    marketing: estadoDeMarketing(bajas, opts.puedeReactivarMarketing === true),
  };
}

/**
 * Una nota, o «le escribí por correo / por WhatsApp». `null` si el contacto no
 * es de esta organización. Quién puede escribir lo decide la ruta
 * (`inscripciones.seguimiento`), no este módulo.
 */
export async function registrarActividad(
  organizationId: string,
  contactId: string,
  authorUserId: string,
  body: SeguimientoBody,
  now: Date = new Date()
): Promise<ActividadDto | null> {
  const contacto = await contactoDeLaOrganizacion(organizationId, contactId);
  if (!contacto) return null;

  const [row] = await getDb()
    .insert(schema.contactActivity)
    .values({
      id: newId("contactActivity"),
      organizationId,
      contactId,
      authorUserId,
      kind: body.kind,
      body: body.kind === "nota" ? body.body : null,
      createdAt: now,
    })
    .returning();
  if (!row) return null;
  const [autor] = await getDb()
    .select({ name: schema.user.name })
    .from(schema.user)
    .where(eq(schema.user.id, authorUserId))
    .limit(1);
  return {
    id: row.id,
    at: row.createdAt.toISOString(),
    kind: row.kind,
    body: row.body,
    authorName: autor?.name ?? null,
  };
}
