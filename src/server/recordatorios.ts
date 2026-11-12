import { eq, isNull, lte } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import {
  fechaEnElPasado,
  hoyEnZona,
  ordenarRecordatorios,
  type RecordatorioAccion,
  type RecordatorioBody,
  type RecordatorioDto,
} from "@/lib/recordatorios";
import { organizationTimezone } from "@/server/finanzas-periodo";

/**
 * Recordatorios de seguimiento sobre un contacto (lectura y escritura). Las
 * reglas son puras y viven en `src/lib/recordatorios.ts`; acá solo se juntan y
 * escriben filas. Quién puede leer o escribir lo decide la ruta
 * (`contactos.ver` / `inscripciones.seguimiento`), no este módulo.
 */

/** Cuántos recordatorios YA resueltos viajan en la pestaña (los pendientes viajan todos). */
const HECHOS_VISIBLES = 20;

const autor = alias(schema.user, "recordatorio_autor");
const resolvio = alias(schema.user, "recordatorio_resolvio");

const columnas = {
  r: schema.contactReminder,
  authorName: autor.name,
  doneByName: resolvio.name,
};

type Fila = {
  r: typeof schema.contactReminder.$inferSelect;
  authorName: string | null;
  doneByName: string | null;
};

function aDto({ r, authorName, doneByName }: Fila): RecordatorioDto {
  return {
    id: r.id,
    contactId: r.contactId,
    reason: r.reason,
    dueDate: r.dueDate,
    createdAt: r.createdAt.toISOString(),
    authorName: authorName ?? null,
    doneAt: r.doneAt?.toISOString() ?? null,
    doneByName: doneByName ?? null,
  };
}

function base() {
  return getDb()
    .select(columnas)
    .from(schema.contactReminder)
    .leftJoin(autor, eq(schema.contactReminder.authorUserId, autor.id))
    .leftJoin(resolvio, eq(schema.contactReminder.doneByUserId, resolvio.id));
}

async function contactoExiste(organizationId: string, contactId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: schema.contact.id })
    .from(schema.contact)
    .where(scoped(schema.contact.organizationId, organizationId, eq(schema.contact.id, contactId)))
    .limit(1);
  return !!row;
}

/**
 * Todos los pendientes del contacto y los últimos resueltos, y `hoy` (el día
 * de la organización, para marcar los vencidos sin que el cliente adivine la
 * zona). `null` si el contacto no es de la organización.
 */
export async function recordatoriosDelContacto(
  organizationId: string,
  contactId: string,
  now: Date = new Date()
): Promise<{ reminders: RecordatorioDto[]; today: string } | null> {
  if (!(await contactoExiste(organizationId, contactId))) return null;
  const today = hoyEnZona(now, await organizationTimezone(organizationId));
  const filas = await base().where(
    scoped(
      schema.contactReminder.organizationId,
      organizationId,
      eq(schema.contactReminder.contactId, contactId)
    )
  );
  const todos = ordenarRecordatorios(filas.map(aDto));
  const pendientes = todos.filter((r) => r.doneAt === null);
  return { reminders: [...pendientes, ...todos.filter((r) => r.doneAt !== null).slice(0, HECHOS_VISIBLES)], today };
}

async function leerUno(organizationId: string, id: string): Promise<RecordatorioDto | null> {
  const [fila] = await base()
    .where(scoped(schema.contactReminder.organizationId, organizationId, eq(schema.contactReminder.id, id)))
    .limit(1);
  return fila ? aDto(fila) : null;
}

export type ResultadoDeCrear =
  | { ok: true; recordatorio: RecordatorioDto }
  | { ok: false; error: "not_found" | "fecha_en_el_pasado" };

export async function crearRecordatorio(
  organizationId: string,
  contactId: string,
  authorUserId: string,
  body: RecordatorioBody,
  now: Date = new Date()
): Promise<ResultadoDeCrear> {
  if (!(await contactoExiste(organizationId, contactId))) return { ok: false, error: "not_found" };
  const timeZone = await organizationTimezone(organizationId);
  if (fechaEnElPasado(body.dueDate, now, timeZone)) return { ok: false, error: "fecha_en_el_pasado" };

  const id = newId("contactReminder");
  await getDb().insert(schema.contactReminder).values({
    id,
    organizationId,
    contactId,
    authorUserId,
    reason: body.reason,
    dueDate: body.dueDate,
    createdAt: now,
  });
  const recordatorio = await leerUno(organizationId, id);
  return recordatorio ? { ok: true, recordatorio } : { ok: false, error: "not_found" };
}

export type ResultadoDeCambiar =
  | { ok: true; recordatorio: RecordatorioDto | null }
  | { ok: false; error: "not_found" };

/**
 * Marcar hecho, reabrir o borrar. Cualquiera con `inscripciones.seguimiento`
 * puede resolver el de otra persona; `done_by_user_id` deja constancia.
 * Devuelve `recordatorio: null` al borrar.
 */
export async function cambiarRecordatorio(
  organizationId: string,
  id: string,
  userId: string,
  accion: RecordatorioAccion,
  now: Date = new Date()
): Promise<ResultadoDeCambiar> {
  const db = getDb();
  const donde = scoped(schema.contactReminder.organizationId, organizationId, eq(schema.contactReminder.id, id));
  if (accion === "eliminar") {
    const borrados = await db.delete(schema.contactReminder).where(donde).returning({ id: schema.contactReminder.id });
    return borrados.length > 0 ? { ok: true, recordatorio: null } : { ok: false, error: "not_found" };
  }
  const cambios =
    accion === "hecho" ? { doneAt: now, doneByUserId: userId } : { doneAt: null, doneByUserId: null };
  const tocados = await db
    .update(schema.contactReminder)
    .set(cambios)
    .where(donde)
    .returning({ id: schema.contactReminder.id });
  if (tocados.length === 0) return { ok: false, error: "not_found" };
  return { ok: true, recordatorio: await leerUno(organizationId, id) };
}

/** Los recordatorios de un contacto como eventos de la línea de tiempo (creado y resuelto). */
export async function recordatoriosParaLinea(organizationId: string, contactId: string) {
  const filas = await base().where(
    scoped(
      schema.contactReminder.organizationId,
      organizationId,
      eq(schema.contactReminder.contactId, contactId)
    )
  );
  return filas.map(aDto);
}

/** Pendientes que vencen hoy o antes, de contactos sin archivar: la entrada de "Tareas de Hoy". */
export async function recordatoriosVencidos(organizationId: string, now: Date) {
  const timeZone = await organizationTimezone(organizationId);
  const hoy = hoyEnZona(now, timeZone);
  const filas = await getDb()
    .select({
      id: schema.contactReminder.id,
      contactId: schema.contactReminder.contactId,
      authorUserId: schema.contactReminder.authorUserId,
      reason: schema.contactReminder.reason,
      dueDate: schema.contactReminder.dueDate,
      firstName: schema.contact.firstName,
      lastName: schema.contact.lastName,
    })
    .from(schema.contactReminder)
    .innerJoin(schema.contact, eq(schema.contactReminder.contactId, schema.contact.id))
    .where(
      scoped(
        schema.contactReminder.organizationId,
        organizationId,
        isNull(schema.contactReminder.doneAt),
        isNull(schema.contact.archivedAt),
        lte(schema.contactReminder.dueDate, hoy)
      )
    );
  return filas;
}

