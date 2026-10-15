import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { withOrganizationScope } from "@/lib/db/with-tenant";
import { currentTenantScope } from "@/lib/db/tenant-context";
import {
  PLANTILLA_DEL_AVISO,
  canalDelAviso,
  textoConfirmacion,
  textoRecordatorio,
  variableDelAviso,
  type TipoDeAviso,
} from "@/lib/workshops";
import { organizationTimezone } from "@/server/finanzas-periodo";
import { getOrCreateConversation } from "@/server/inbox/ingest";
import { sendText } from "@/server/inbox/send";
import { isWindowOpen } from "@/server/inbox/window";
import { getCredentialsByOrg } from "@/server/whatsapp/credentials";
import { sendTemplate } from "@/server/whatsapp/templates";

/**
 * 033 (US4, FR-019/FR-020) — Los avisos por WhatsApp de un taller.
 *
 * Corren FUERA del pedido que anotó a la persona (`onAfterCommit`) o desde el
 * temporizador del recordatorio, cada uno en su propio alcance corto. Salen
 * por el emisor de siempre (`sendText` / `sendTemplate`), así que el guard
 * del sandbox del Laboratorio y la ventana de 24 h siguen valiendo igual.
 *
 * **Como máximo un aviso de cada tipo por persona** (FR-020): antes de mandar
 * se RECLAMA la marca con un `UPDATE … WHERE <marca> IS NULL`. Dos procesos
 * (o un doble disparo) no pueden reclamarla los dos. Si el envío falla:
 *   - la confirmación libera la marca (no hay reintento automático; la marca
 *     dice "salió", y no salió),
 *   - el recordatorio la conserva: es un intento por persona y por edición,
 *     no un reintento cada pocos minutos durante todo el día anterior.
 * En los dos casos el motivo queda en `last_notify_error`, visible en la
 * lista del taller. Nada de esto toca ni revierte la inscripción.
 */

const ACTOR = "system:talleres";

function enAlcance<T>(organizationId: string, fn: () => Promise<T>): Promise<T> {
  if (currentTenantScope()?.organizationId === organizationId) return fn();
  return withOrganizationScope(organizationId, ACTOR, fn);
}

async function reclamar(
  organizationId: string,
  registrationId: string,
  tipo: TipoDeAviso,
  now: Date
): Promise<boolean> {
  const r = schema.workshopRegistration;
  const marca = tipo === "confirmacion" ? r.confirmationSentAt : r.reminderSentAt;
  const rows = await getDb()
    .update(r)
    .set(tipo === "confirmacion" ? { confirmationSentAt: now } : { reminderSentAt: now })
    .where(scoped(r.organizationId, organizationId, and(eq(r.id, registrationId), isNull(marca))))
    .returning({ id: r.id });
  return rows.length > 0;
}

async function registrarResultado(
  organizationId: string,
  registrationId: string,
  tipo: TipoDeAviso,
  error: string | null
): Promise<void> {
  const r = schema.workshopRegistration;
  const liberar = error !== null && tipo === "confirmacion";
  await getDb()
    .update(r)
    .set({
      lastNotifyError: error,
      ...(liberar ? { confirmationSentAt: null } : {}),
      updatedAt: new Date(),
    })
    .where(scoped(r.organizationId, organizationId, eq(r.id, registrationId)));
}

export type NoticeOutcome = "enviado" | "omitido" | "ya_enviado" | "no_encontrado";

/**
 * Manda (o intenta) un aviso a UN inscripto. Nunca lanza: devuelve qué pasó
 * y deja el motivo escrito si no salió.
 */
export async function notifyWorkshopAttendee(
  organizationId: string,
  registrationId: string,
  tipo: TipoDeAviso,
  now: Date = new Date()
): Promise<NoticeOutcome> {
  try {
    return await enAlcance(organizationId, async () => {
      const db = getDb();
      const rows = await db
        .select({
          registration: schema.workshopRegistration,
          contact: schema.contact,
          cohort: schema.cohort,
          course: schema.course,
        })
        .from(schema.workshopRegistration)
        .innerJoin(
          schema.enrollment,
          eq(schema.workshopRegistration.enrollmentId, schema.enrollment.id)
        )
        .innerJoin(schema.contact, eq(schema.enrollment.contactId, schema.contact.id))
        .innerJoin(schema.cohort, eq(schema.enrollment.cohortId, schema.cohort.id))
        .innerJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
        .where(
          scoped(
            schema.workshopRegistration.organizationId,
            organizationId,
            eq(schema.workshopRegistration.id, registrationId)
          )
        )
        .limit(1);
      const row = rows[0];
      if (!row) return "no_encontrado";
      // El recordatorio es solo para quien confirmó (FR-020), aunque lo pida el temporizador.
      if (tipo === "recordatorio" && row.registration.status !== "confirmado") return "omitido";

      if (!(await reclamar(organizationId, registrationId, tipo, now))) return "ya_enviado";

      const credentials = await getCredentialsByOrg(organizationId);
      const connected = Boolean(credentials) && credentials?.status !== "reconnect_required";
      const hasPhone = Boolean(row.contact.phone);

      // La conversación se abre recién cuando de verdad hay por dónde mandar.
      const conversation =
        hasPhone && connected ? await getOrCreateConversation(organizationId, row.contact.id) : null;
      const templates = await db
        .select({ id: schema.template.id })
        .from(schema.template)
        .where(
          scoped(
            schema.template.organizationId,
            organizationId,
            eq(schema.template.name, PLANTILLA_DEL_AVISO[tipo]),
            eq(schema.template.status, "approved")
          )
        )
        .limit(1);

      const canal = canalDelAviso({
        hasPhone,
        connected,
        windowOpen: conversation ? isWindowOpen(conversation.lastInboundAt, now) : false,
        templateApproved: Boolean(templates[0]),
      });
      if (canal.via === "ninguno" || !conversation) {
        const motivo = canal.via === "ninguno" ? canal.motivo : "No enviado.";
        await registrarResultado(organizationId, registrationId, tipo, etiqueta(tipo, motivo));
        return "omitido";
      }

      const timeZone = await organizationTimezone(organizationId);
      const edicion = {
        courseName: row.course.name,
        cohortName: row.cohort.name,
        startDate: row.cohort.startDate,
        startTime: row.cohort.startTime,
        endTime: row.cohort.endTime,
        modality: row.cohort.modality,
        classroom: row.cohort.classroom,
        meetingUrl: row.cohort.meetingUrl,
      };

      try {
        if (canal.via === "texto") {
          const datos = { nombre: row.contact.firstName, edicion };
          await sendText({
            organizationId,
            conversationId: conversation.id,
            text:
              tipo === "confirmacion"
                ? textoConfirmacion(datos, timeZone)
                : textoRecordatorio(datos, timeZone),
          });
        } else {
          await sendTemplate({
            organizationId,
            conversationId: conversation.id,
            templateId: templates[0]!.id,
            variable: variableDelAviso(tipo, edicion),
          });
        }
      } catch (err) {
        const motivo = err instanceof Error ? `No enviado: ${err.message}` : "No enviado.";
        await registrarResultado(organizationId, registrationId, tipo, etiqueta(tipo, motivo));
        return "omitido";
      }

      await registrarResultado(organizationId, registrationId, tipo, null);
      return "enviado";
    });
  } catch (err) {
    console.error(
      `[talleres] aviso ${tipo} de ${registrationId} falló:`,
      err instanceof Error ? err.name : "error"
    );
    return "omitido";
  }
}

function etiqueta(tipo: TipoDeAviso, motivo: string): string {
  return `${tipo === "confirmacion" ? "Confirmación" : "Recordatorio"} — ${motivo}`;
}
