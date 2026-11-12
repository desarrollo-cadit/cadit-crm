import { eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { withOrganizationScope } from "@/lib/db/with-tenant";
import { getEnv } from "@/lib/env";
import { hoyEnZona } from "@/lib/recordatorios";
import {
  armarAvisoRecordatorio,
  recordatorioIdDe,
  recordatorioQueToca,
  sujetoDeRecordatorio,
} from "@/lib/recordatorios-aviso";
import { claveDeAviso, puedeReclamar, type SujetoDeAviso } from "@/lib/staff-notices";
import { organizationTimezone } from "@/server/finanzas-periodo";
import {
  ACTOR_AVISOS,
  cerrarAviso,
  leerRegistroDeAviso,
  mandarAviso,
  reclamarAviso,
  type Envio,
  type ResultadoAviso,
} from "@/server/staff-notices";

/**
 * El correo del día de un recordatorio de seguimiento: a las 08:00 de la zona
 * de la organización, SOLO al autor. Mismo motor que los demás avisos internos
 * (`src/server/staff-notices.ts`): reclamo compare-and-swap en `staff_notice`
 * (una llave por recordatorio y día), correo FUERA de toda transacción,
 * resultado registrado solo si el reclamo sigue siendo el mismo. Nunca lanza,
 * y un fallo jamás toca el recordatorio. Lo dispara la periódica
 * (`runInternalNoticesForOrg`).
 *
 * Se omite (`skipped`, sin reintento): autor sin cuenta o sin correo, o
 * recordatorio resuelto antes de mandar. Un contacto archivado ni se reclama.
 */

type SujetoRecordatorio = Extract<SujetoDeAviso, { kind: "recordatorio_contacto" }>;

async function leerRecordatorio(organizationId: string, id: string) {
  const [fila] = await getDb()
    .select({
      id: schema.contactReminder.id,
      contactId: schema.contactReminder.contactId,
      reason: schema.contactReminder.reason,
      dueDate: schema.contactReminder.dueDate,
      doneAt: schema.contactReminder.doneAt,
      createdAt: schema.contactReminder.createdAt,
      firstName: schema.contact.firstName,
      lastName: schema.contact.lastName,
      archivedAt: schema.contact.archivedAt,
      authorEmail: schema.user.email,
    })
    .from(schema.contactReminder)
    .innerJoin(schema.contact, eq(schema.contactReminder.contactId, schema.contact.id))
    .leftJoin(schema.user, eq(schema.contactReminder.authorUserId, schema.user.id))
    .where(scoped(schema.contactReminder.organizationId, organizationId, eq(schema.contactReminder.id, id)))
    .limit(1);
  return fila ?? null;
}

async function prepararEnvio(
  organizationId: string,
  sujeto: SujetoRecordatorio,
  now: Date
): Promise<Envio | ResultadoAviso> {
  return withOrganizationScope(organizationId, ACTOR_AVISOS, async () => {
    const recordatorioId = recordatorioIdDe(sujeto);
    if (!recordatorioId) return "no_corresponde";
    const previo = await leerRegistroDeAviso(organizationId, sujeto);
    if (!puedeReclamar(previo, now, { reintentarOmitido: false })) return "no_corresponde";
    const id = await reclamarAviso(organizationId, sujeto, previo, now);
    if (!id) return "no_corresponde";

    const omitir = async (detail: string): Promise<ResultadoAviso> => {
      await cerrarAviso(organizationId, id, now, { status: "skipped", detail });
      return "skipped";
    };

    const r = await leerRecordatorio(organizationId, recordatorioId);
    if (!r || r.doneAt || r.archivedAt) return omitir("ya_no_corresponde");
    if (!r.authorEmail?.trim()) return omitir("autor_sin_correo");

    const correo = armarAvisoRecordatorio({
      contacto: [r.firstName, r.lastName].filter(Boolean).join(" ").trim(),
      contactId: r.contactId,
      motivo: r.reason,
      dueDate: r.dueDate,
      baseUrl: getEnv().APP_BASE_URL,
    });
    const destinatarios = { to: [r.authorEmail.trim()], cc: [] as string[] };
    await getDb()
      .update(schema.staffNotice)
      .set({ recipients: destinatarios, subject: correo.subject, updatedAt: now })
      .where(scoped(schema.staffNotice.organizationId, organizationId, eq(schema.staffNotice.id, id)));
    return { id, claimedAt: now, destinatarios, ...correo };
  });
}

/**
 * Manda UN recordatorio, si corresponde. Nunca lanza: devuelve en qué quedó
 * (`no_corresponde` si ya salió o lo tomó otro proceso).
 */
export async function enviarAvisoDeRecordatorio(
  organizationId: string,
  sujeto: SujetoRecordatorio,
  now = new Date()
): Promise<ResultadoAviso> {
  const etiqueta = claveDeAviso(sujeto);
  let envio: Envio | ResultadoAviso;
  try {
    envio = await prepararEnvio(organizationId, sujeto, now);
  } catch (err) {
    console.error(`[avisos] ${etiqueta}: no se pudo preparar (${err instanceof Error ? err.name : "error"})`);
    return "no_corresponde";
  }
  if (typeof envio === "string") return envio;
  const resultado = await mandarAviso(organizationId, envio, etiqueta);
  if (resultado === "sent") {
    const recordatorioId = recordatorioIdDe(sujeto);
    if (recordatorioId) {
      try {
        await withOrganizationScope(organizationId, ACTOR_AVISOS, () =>
          getDb()
            .update(schema.contactReminder)
            .set({ emailSentAt: new Date() })
            .where(
              scoped(
                schema.contactReminder.organizationId,
                organizationId,
                eq(schema.contactReminder.id, recordatorioId)
              )
            )
        );
      } catch {
        // Solo deja constancia: la idempotencia vive en `staff_notice`.
      }
    }
  }
  return resultado;
}

/**
 * Los recordatorios que tocan AHORA: pendientes que vencen hoy (zona de la
 * organización), ya pasadas las 08:00, de contactos sin archivar y cuyo aviso
 * de hoy todavía no salió.
 */
export async function avisosDeRecordatoriosPendientes(
  organizationId: string,
  now = new Date()
): Promise<SujetoRecordatorio[]> {
  return withOrganizationScope(organizationId, ACTOR_AVISOS, async () => {
    const timeZone = await organizationTimezone(organizationId);
    const hoy = hoyEnZona(now, timeZone);
    const filas = await getDb()
      .select({
        id: schema.contactReminder.id,
        contactId: schema.contactReminder.contactId,
        dueDate: schema.contactReminder.dueDate,
        doneAt: schema.contactReminder.doneAt,
        createdAt: schema.contactReminder.createdAt,
      })
      .from(schema.contactReminder)
      .innerJoin(schema.contact, eq(schema.contactReminder.contactId, schema.contact.id))
      .where(
        scoped(
          schema.contactReminder.organizationId,
          organizationId,
          isNull(schema.contactReminder.doneAt),
          isNull(schema.contact.archivedAt),
          eq(schema.contactReminder.dueDate, hoy)
        )
      );

    const out: SujetoRecordatorio[] = [];
    for (const f of filas) {
      if (!recordatorioQueToca(f, now, timeZone)) continue;
      const sujeto = sujetoDeRecordatorio(f.contactId, f.id, f.dueDate);
      const previo = await leerRegistroDeAviso(organizationId, sujeto);
      if (puedeReclamar(previo, now, { reintentarOmitido: false })) out.push(sujeto);
    }
    return out;
  });
}

export async function runReminderNoticesForOrg(organizationId: string, now = new Date()): Promise<number> {
  const pendientes = await avisosDeRecordatoriosPendientes(organizationId, now);
  // Uno por uno, cada uno en sus alcances cortos: un fallo no frena al siguiente.
  for (const s of pendientes) await enviarAvisoDeRecordatorio(organizationId, s, now);
  return pendientes.length;
}
