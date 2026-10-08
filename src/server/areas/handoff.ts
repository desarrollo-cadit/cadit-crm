import { and, asc, desc, eq, gt } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { customAlphabet } from "nanoid";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { currentTenantTx, onAfterCommit } from "@/lib/db/tenant-context";
import { withOrganizationScope } from "@/lib/db/with-tenant";
import type { SendMailResult } from "@/lib/m365/client";
import {
  AREA_LABELS,
  COLLECTED_FIELDS,
  type Area,
  type AreaConfigDto,
  type Collected,
  type HandoffEmailKind,
  type HandoffEmailStatus,
} from "@/lib/areas";
import type { DeriveAreaAction } from "@/server/ai/actions";
import { recordActivity } from "@/server/activity-log";
import { publish } from "@/server/events/bus";
import { SendError } from "@/server/inbox/send";
import { getAreaConfig, listSellers, resolveRecipients } from "@/server/areas/config";
import { buildHandoffEmail, buildHandoffSubject, sendHandoffEmail } from "@/server/areas/email";
import { describeOfficeHours, isWithinOfficeHours } from "@/server/areas/office-hours";

/**
 * 029 (DV-005) — Derivar una consulta a un área por correo.
 *
 * `deriveToArea` corre DENTRO de la transacción del turno del agente:
 *
 * 1. toma un advisory lock por (organización, contacto, área) para que dos
 *    turnos simultáneos no abran dos casos;
 * 2. busca un caso abierto (actividad en los últimos 7 días) → seguimiento;
 *    si no hay, abre uno nuevo;
 * 3. inserta la fila del correo en `pendiente` (o `simulado` si la
 *    conversación es del Laboratorio, o `sin_configurar` si el área no tiene
 *    casilla);
 * 4. agenda el envío con `onAfterCommit()`: la tarea abre su propio alcance
 *    (`system:derivacion`), llama a Graph y marca `enviado` / `fallido`.
 *    **Nunca lanza.** Si el proceso muere entre medio, la fila queda
 *    `pendiente` y visible — no se pierde en silencio.
 *
 * Las decisiones son funciones puras (`planDerivation`, `emailOutcome`,
 * `buildClosingText`) para poder probarlas sin base.
 */

export const CASE_WINDOW_DAYS = 7;
const DAY_MS = 86_400_000;

export function isCaseOpen(lastActivityAt: Date, now: Date): boolean {
  return lastActivityAt.getTime() > now.getTime() - CASE_WINDOW_DAYS * DAY_MS;
}

/** Sin 0/O ni 1/I: el staff lo dicta por teléfono. */
const caseRefSuffix = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 6);
export function newCaseRef(): string {
  return `AH-${caseRefSuffix()}`;
}

export type DerivationPlan = {
  kind: HandoffEmailKind | "already_open";
  /** `null` cuando no sale correo (sin datos nuevos). */
  emailStatus: HandoffEmailStatus | null;
  /** Snapshot fusionado que queda en el caso. */
  collected: Collected;
  /** Lo que agrega este correo (vacío en la apertura = todo). */
  delta: Collected;
  missing: string[];
};

function emailStatusFor(config: AreaConfigDto, isTest: boolean): HandoffEmailStatus {
  // El Laboratorio JAMÁS manda correo, aunque el área esté lista.
  if (isTest) return "simulado";
  if (!config.enabled || !config.mailbox) return "sin_configurar";
  return "pendiente";
}

/**
 * ¿Caso nuevo, seguimiento, o nada que avisar?
 *
 * "Datos nuevos" = algún campo de `collected` no vacío que difiere del
 * snapshot del caso, o una lista de faltantes que se achicó. Un `summary`
 * reescrito por sí solo NO es dato nuevo: el modelo parafrasea en cada turno.
 */
export function planDerivation(input: {
  open: { collected: Collected; missing: string[] } | null;
  action: DeriveAreaAction;
  config: AreaConfigDto;
  isTest: boolean;
}): DerivationPlan {
  const status = emailStatusFor(input.config, input.isTest);
  if (!input.open) {
    return {
      kind: "apertura",
      emailStatus: status,
      collected: { ...input.action.collected },
      delta: {},
      missing: input.action.missing,
    };
  }

  const delta: Collected = {};
  for (const field of COLLECTED_FIELDS) {
    const value = input.action.collected[field];
    if (value && value !== input.open.collected[field]) delta[field] = value;
  }
  const newMissing = input.action.missing;
  const missingShrank =
    newMissing.length < input.open.missing.length &&
    input.open.missing.some((m) => !newMissing.includes(m));

  const collected = { ...input.open.collected, ...delta };
  if (Object.keys(delta).length === 0 && !missingShrank) {
    return { kind: "already_open", emailStatus: null, collected, delta, missing: input.open.missing };
  }
  return { kind: "seguimiento", emailStatus: status, collected, delta, missing: newMissing };
}

/** Lo que queda en la fila del correo después de Graph. El motivo jamás lleva secretos. */
export function emailOutcome(
  result: SendMailResult,
  now: Date
): { status: "enviado" | "fallido"; sentAt: Date | null; error: string | null } {
  if (result.ok) return { status: "enviado", sentAt: now, error: null };
  if (result.code === "not_configured") {
    return { status: "fallido", sentAt: null, error: "M365 no configurado" };
  }
  return { status: "fallido", sentAt: null, error: result.message.slice(0, 500) };
}

/**
 * Cierre al cliente (FR-007): SIEMPRE, haya salido el correo o no. El texto
 * configurado del área, o uno genérico, más el horario si `now` cae fuera.
 */
export function buildClosingText(config: AreaConfigDto, now: Date, orgTimeZone: string): string {
  // Un área sin casilla no recibe ningún correo: el cierre no puede decir que
  // "se lo pasé". La academia ve el caso `sin_configurar` en el inbox.
  if (!config.enabled || !config.mailbox) {
    return `Tomé nota de tu consulta para el equipo de ${AREA_LABELS[config.area]}. Te van a contactar desde la academia.`;
  }
  const base =
    config.contactText?.trim() ||
    `Listo, le pasé tu consulta al equipo de ${AREA_LABELS[config.area]}: te van a contactar a la brevedad.`;
  if (config.officeHours && !isWithinOfficeHours(config.officeHours, now, orgTimeZone)) {
    return `${base}\n\nEl equipo responde ${describeOfficeHours(config.officeHours, orgTimeZone)}.`;
  }
  return base;
}

/** Cuando el caso ya está abierto y no hay nada nuevo que avisar. */
export function alreadyOpenText(area: Area, caseRef: string): string {
  return `El equipo de ${AREA_LABELS[area]} ya tiene tu consulta (caso ${caseRef}); te van a contactar por ahí.`;
}

/**
 * Entrega del cierre sin arriesgar el caso (riesgo R4).
 *
 * `deliverReply` re-lanza los errores de WhatsApp que no son de ventana, y
 * dentro de la transacción del turno eso revertiría el caso ya creado — el
 * correo sí saldría (post-commit) pero sin fila que lo registre. Acá se
 * traga y se loguea; solo `window_closed` sigue el camino de hoy.
 */
export async function deliverAreaClosing(
  send: () => Promise<void>,
  onWindowClosed: () => Promise<void> | void
): Promise<void> {
  try {
    await inSavepoint(send);
  } catch (err) {
    if (err instanceof SendError && err.code === "window_closed") {
      await onWindowClosed();
      return;
    }
    console.error("[derivacion] no se pudo entregar el cierre al cliente:", err);
  }
}

/**
 * Tragarse el error en JS no alcanza: si el que falló fue Postgres (p. ej. un
 * `wa_message_id` repetido al guardar el saliente), la transacción queda
 * ABORTADA y el commit del turno se convierte en rollback — caso incluido. Un
 * SAVEPOINT aísla el cierre: si falla, se vuelve a ese punto y el caso queda.
 * Fuera de una transacción (scripts) no hay nada que aislar.
 */
async function inSavepoint(fn: () => Promise<void>): Promise<void> {
  if (!currentTenantTx()) return fn();
  const db = getDb();
  await db.execute(sql`savepoint area_closing`);
  try {
    await fn();
    await db.execute(sql`release savepoint area_closing`);
  } catch (err) {
    await db.execute(sql`rollback to savepoint area_closing`);
    throw err;
  }
}

export type DeriveResult = {
  kind: HandoffEmailKind | "already_open";
  handoffId: string;
  caseRef: string;
  area: Area;
  emailStatus: HandoffEmailStatus | null;
  config: AreaConfigDto;
};

export async function deriveToArea(input: {
  organizationId: string;
  conversation: { id: string; contactId: string; isTest: boolean };
  sourceMessageId: string;
  action: DeriveAreaAction;
  now?: Date;
}): Promise<DeriveResult> {
  const { organizationId: orgId, conversation, action } = input;
  const now = input.now ?? new Date();
  const db = getDb();

  // Un solo caso abierto por contacto y área, aunque lleguen dos turnos juntos.
  await db.execute(
    sql`select pg_advisory_xact_lock(hashtext(${orgId} || ${conversation.contactId} || ${action.area}))`
  );

  const config = await getAreaConfig(orgId, action.area);
  const openRows = await db
    .select()
    .from(schema.areaHandoff)
    .where(
      scoped(
        schema.areaHandoff.organizationId,
        orgId,
        eq(schema.areaHandoff.contactId, conversation.contactId),
        eq(schema.areaHandoff.area, action.area),
        gt(schema.areaHandoff.lastActivityAt, new Date(now.getTime() - CASE_WINDOW_DAYS * DAY_MS))
      )
    )
    .orderBy(desc(schema.areaHandoff.lastActivityAt))
    .limit(1);
  const open = openRows[0] ?? null;

  const plan = planDerivation({
    open: open ? { collected: open.collected as Collected, missing: open.missing } : null,
    action,
    config,
    isTest: conversation.isTest,
  });

  if (plan.kind === "already_open" && open) {
    return {
      kind: "already_open",
      handoffId: open.id,
      caseRef: open.caseRef,
      area: action.area,
      emailStatus: null,
      config,
    };
  }
  const emailStatus = plan.emailStatus ?? "sin_configurar";

  let handoffId: string;
  let caseRef: string;
  let subject: string;
  if (open) {
    handoffId = open.id;
    caseRef = open.caseRef;
    subject = open.subject;
    await db
      .update(schema.areaHandoff)
      .set({
        collected: plan.collected,
        missing: plan.missing,
        status: emailStatus,
        lastActivityAt: now,
        updatedAt: now,
      })
      .where(scoped(schema.areaHandoff.organizationId, orgId, eq(schema.areaHandoff.id, open.id)));
  } else {
    const contactRows = await db
      .select({ firstName: schema.contact.firstName, lastName: schema.contact.lastName })
      .from(schema.contact)
      .where(scoped(schema.contact.organizationId, orgId, eq(schema.contact.id, conversation.contactId)))
      .limit(1);
    const c = contactRows[0];
    handoffId = newId("areaHandoff");
    caseRef = newCaseRef();
    subject = buildHandoffSubject({
      area: action.area,
      summary: action.summary,
      collected: plan.collected,
      contactName: [c?.firstName, c?.lastName].filter(Boolean).join(" "),
    });
    await db.insert(schema.areaHandoff).values({
      id: handoffId,
      organizationId: orgId,
      conversationId: conversation.id,
      contactId: conversation.contactId,
      area: action.area,
      caseRef,
      summary: action.summary,
      collected: plan.collected,
      missing: plan.missing,
      status: emailStatus,
      subject,
      isTest: conversation.isTest,
      lastActivityAt: now,
    });
  }

  const recipients = {
    ...resolveRecipients(config, await listSellers(orgId)),
    replyTo: plan.collected.email ?? null,
  };
  const kind: HandoffEmailKind = open ? "seguimiento" : "apertura";
  const emailId = newId("areaHandoffEmail");
  const inserted = await db
    .insert(schema.areaHandoffEmail)
    .values({
      id: emailId,
      organizationId: orgId,
      handoffId,
      kind,
      sourceMessageId: input.sourceMessageId,
      status: emailStatus,
      recipients,
      collectedDelta: plan.delta,
      renderedSubject: kind === "seguimiento" ? `RE: ${subject}` : subject,
      error: emailStatus === "sin_configurar" ? "El área no tiene casilla configurada" : null,
    })
    // Re-ejecutar el turno del MISMO entrante no duplica el correo (IV).
    .onConflictDoNothing({
      target: [schema.areaHandoffEmail.handoffId, schema.areaHandoffEmail.sourceMessageId],
    })
    .returning({ id: schema.areaHandoffEmail.id });

  if (inserted.length === 0) {
    return { kind: "already_open", handoffId, caseRef, area: action.area, emailStatus: null, config };
  }

  await recordActivity({
    organizationId: orgId,
    kind: "agente.derivacion",
    contactId: conversation.contactId,
    metadata: { area: action.area, caseRef, kind, status: emailStatus, conversationId: conversation.id },
  });

  await touchConversation(orgId, conversation.id);
  publish(orgId, { type: "conversation.updated", data: { conversation: { id: conversation.id } } });

  if (emailStatus === "pendiente") {
    // La tarea suelta no ve las filas de esta transacción hasta el commit.
    onAfterCommit(() => {
      void deliverHandoffEmail(orgId, emailId);
    });
  }

  return { kind, handoffId, caseRef, area: action.area, emailStatus, config };
}

/**
 * La lista del inbox se refresca con `since=` sobre `conversation.updated_at`:
 * sin esto, el chip de la derivación no cambia hasta recargar.
 */
async function touchConversation(organizationId: string, conversationId: string): Promise<void> {
  await getDb()
    .update(schema.conversation)
    .set({ updatedAt: new Date() })
    .where(
      scoped(schema.conversation.organizationId, organizationId, eq(schema.conversation.id, conversationId))
    );
}

/**
 * El envío, fuera del camino del turno. Lee en un alcance, manda SIN
 * transacción abierta (una latencia de Graph no retiene conexiones) y anota
 * el resultado en otro alcance. **Nunca lanza.**
 */
export async function deliverHandoffEmail(organizationId: string, emailId: string): Promise<void> {
  try {
    const prepared = await withOrganizationScope(organizationId, "system:derivacion", () =>
      loadEmailToSend(organizationId, emailId)
    );
    if (!prepared) return;

    let result: SendMailResult;
    try {
      result = await sendHandoffEmail(prepared.mail);
    } catch (err) {
      result = {
        ok: false,
        code: "send_failed",
        message: err instanceof Error ? err.message : "Error al enviar el correo",
      };
    }
    const outcome = emailOutcome(result, new Date());

    await withOrganizationScope(organizationId, "system:derivacion", async () => {
      const db = getDb();
      await db
        .update(schema.areaHandoffEmail)
        .set({ ...outcome, updatedAt: new Date() })
        .where(
          scoped(
            schema.areaHandoffEmail.organizationId,
            organizationId,
            eq(schema.areaHandoffEmail.id, emailId)
          )
        );
      await db
        .update(schema.areaHandoff)
        .set({ status: outcome.status, updatedAt: new Date() })
        .where(
          scoped(
            schema.areaHandoff.organizationId,
            organizationId,
            eq(schema.areaHandoff.id, prepared.handoffId)
          )
        );
      await touchConversation(organizationId, prepared.conversationId);
      publish(organizationId, {
        type: "conversation.updated",
        data: { conversation: { id: prepared.conversationId } },
      });
    });
  } catch (err) {
    console.error("[derivacion] la tarea de envío falló:", err instanceof Error ? err.message : err);
  }
}

async function loadEmailToSend(organizationId: string, emailId: string) {
  const db = getDb();
  const rows = await db
    .select({ email: schema.areaHandoffEmail, handoff: schema.areaHandoff })
    .from(schema.areaHandoffEmail)
    .innerJoin(schema.areaHandoff, eq(schema.areaHandoff.id, schema.areaHandoffEmail.handoffId))
    .where(
      scoped(
        schema.areaHandoffEmail.organizationId,
        organizationId,
        eq(schema.areaHandoffEmail.id, emailId)
      )
    )
    .limit(1);
  const row = rows[0];
  if (!row || row.email.status !== "pendiente") return null;
  // Doble cerrojo del sandbox: aunque alguien agendara un envío de prueba, acá no sale.
  if (row.handoff.isTest) return null;

  const [contactRows, orgRows, messages] = await Promise.all([
    db
      .select({
        firstName: schema.contact.firstName,
        lastName: schema.contact.lastName,
        phone: schema.contact.phone,
        waIdentity: schema.contact.waIdentity,
      })
      .from(schema.contact)
      .where(scoped(schema.contact.organizationId, organizationId, eq(schema.contact.id, row.handoff.contactId)))
      .limit(1),
    db
      .select({ name: schema.organization.name, timezone: schema.organization.timezone })
      .from(schema.organization)
      .where(eq(schema.organization.id, organizationId))
      .limit(1),
    db
      .select({
        direction: schema.message.direction,
        origin: schema.message.origin,
        type: schema.message.type,
        text: schema.message.text,
        createdAt: schema.message.createdAt,
        waTimestamp: schema.message.waTimestamp,
      })
      .from(schema.message)
      .where(
        scoped(
          schema.message.organizationId,
          organizationId,
          and(eq(schema.message.conversationId, row.handoff.conversationId))
        )
      )
      .orderBy(asc(schema.message.createdAt)),
  ]);
  const contact = contactRows[0];
  if (!contact) return null;
  const org = orgRows[0];

  const mail = buildHandoffEmail({
    kind: row.email.kind,
    area: row.handoff.area,
    caseRef: row.handoff.caseRef,
    subject: row.handoff.subject,
    summary: row.handoff.summary,
    collected: row.handoff.collected as Collected,
    collectedDelta: row.email.collectedDelta as Collected,
    missing: row.handoff.missing,
    replyTo: row.email.recipients.replyTo,
    contact,
    organizationName: org?.name ?? "la academia",
    timeZone: org?.timezone ?? "America/Montevideo",
    createdAt: row.email.createdAt,
    transcript: messages.map((m) => ({
      direction: m.direction,
      origin: m.origin,
      type: m.type,
      text: m.text,
      at: m.waTimestamp ?? m.createdAt,
    })),
  });

  return {
    handoffId: row.handoff.id,
    conversationId: row.handoff.conversationId,
    mail: { recipients: row.email.recipients, subject: mail.subject, html: mail.html },
  };
}
