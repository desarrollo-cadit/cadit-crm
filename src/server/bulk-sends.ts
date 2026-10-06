import { asc, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { BulkSendKind, BulkSendOutcome } from "@/lib/db/schema";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { onAfterCommit } from "@/lib/db/tenant-context";
import { withOrganizationScope } from "@/lib/db/with-tenant";
import { getEnv } from "@/lib/env";
import { fullName } from "@/lib/utils";
import {
  grantPortalAccess,
  type AccessResult,
  type GrantPortalAccessResult,
  type PortalAccessAlreadyGranted,
} from "@/server/access";
import {
  sendEnrollmentEmail,
  type SendEnrollmentEmailResult,
} from "@/server/email/enrollment-emails";
import { getCohortRoster, type RosterEntryDto } from "@/server/enrollments";

/**
 * 2026-10-05 — Envío masivo por cohorte: términos de la licencia ATC,
 * bienvenida al grupo de WhatsApp y acceso al portal, a los alumnos de la
 * cohorte de una vez. Revierte T017b de 012 con salvaguardas (ver
 * `specs/012-identidad-y-permisos/tasks.md`).
 *
 * **Sin cola externa** (constitución II): la corrida es un trabajo en segundo
 * plano dentro del proceso, como el agente y el Laboratorio. El pedido que la
 * arranca responde enseguida (202) y la pantalla sigue el avance consultando.
 *
 * **De a uno, con pausa.** Exchange Online limita un buzón a unos 30 correos
 * por minuto; la pausa (`BULK_SEND_PAUSE_MS`, 2 s por defecto) deja margen.
 *
 * **Reusa las funciones individuales** (`sendEnrollmentEmail`,
 * `grantPortalAccess`): plantillas, marca, copia oculta, el enlace del grupo
 * que falta… cada regla vive en un solo lugar.
 *
 * **Las marcas por persona son la fuente de verdad**, no esta corrida. Cada
 * marca se escribe apenas Graph acepta ESE correo, en su propia transacción.
 * Si el proceso se reinicia a mitad de camino, apretar de nuevo manda solo a
 * quien todavía no la tiene.
 *
 * **El acceso al portal saltea a quien ya tiene vínculo.** Reinvitar genera
 * una contraseña nueva y deja a la persona afuera de la cuenta que ya usa.
 * El reenvío individual sigue existiendo, con confirmación: así se resuelve
 * una contraseña perdida.
 */

/* ============================================================
 * Quién lo recibe — puro
 * ============================================================ */

export type BulkCandidate = {
  enrollmentId: string;
  hasEmail: boolean;
  termsEmailSentAt: Date | null;
  welcomeEmailSentAt: Date | null;
  portalLink: { suspended: boolean } | null;
  /** Dado de baja (contacto archivado): su inscripción sigue en el roster. */
  withdrawn: boolean;
};

export type BulkPartition = {
  /** Se les manda. */
  toSend: string[];
  /** Ya tienen la marca de este correo: no se reenvía. */
  alreadySent: string[];
  /** Solo acceso al portal: ya tienen vínculo, activo o suspendido. */
  hasAccess: string[];
  /** Sin correo cargado: la corrida los registra con el motivo. */
  withoutEmail: string[];
  /**
   * Dados de baja. Quedan FUERA de la corrida, sin registrarse: no es un
   * envío que falló, es una persona a la que no corresponde escribirle.
   */
  withdrawn: string[];
};

/**
 * Los candidatos salen del ROSTER de la cohorte (`getCohortRoster`): la misma
 * lista que el equipo ve en "Alumnos" —todas las inscripciones con
 * `cohort_id` = esta cohorte—. No se inventa otro criterio de "confirmado".
 */
export function candidatesFromRoster(entries: readonly RosterEntryDto[]): BulkCandidate[] {
  return entries.map((e) => ({
    enrollmentId: e.id,
    hasEmail: Boolean(e.contact.email),
    termsEmailSentAt: e.checklist.termsEmailSentAt ? new Date(e.checklist.termsEmailSentAt) : null,
    welcomeEmailSentAt: e.welcomeEmailSentAt ? new Date(e.welcomeEmailSentAt) : null,
    portalLink: e.portalAccess.granted ? { suspended: e.portalAccess.suspended } : null,
    withdrawn: e.contact.archived,
  }));
}

export function partitionRecipients(
  kind: BulkSendKind,
  candidates: readonly BulkCandidate[]
): BulkPartition {
  const p: BulkPartition = {
    toSend: [],
    alreadySent: [],
    hasAccess: [],
    withoutEmail: [],
    withdrawn: [],
  };
  for (const c of candidates) {
    // Antes que cualquier otra regla: a quien se fue no se le escribe.
    if (c.withdrawn) {
      p.withdrawn.push(c.enrollmentId);
      continue;
    }
    if (kind === "portal_access") {
      if (c.portalLink) p.hasAccess.push(c.enrollmentId);
      else if (!c.hasEmail) p.withoutEmail.push(c.enrollmentId);
      else p.toSend.push(c.enrollmentId);
      continue;
    }
    const marca = kind === "terms" ? c.termsEmailSentAt : c.welcomeEmailSentAt;
    if (marca) p.alreadySent.push(c.enrollmentId);
    else if (!c.hasEmail) p.withoutEmail.push(c.enrollmentId);
    else p.toSend.push(c.enrollmentId);
  }
  return p;
}

export type RecipientRow = {
  enrollmentId: string;
  position: number;
  outcome: "pending" | "skipped_already_sent" | "skipped_has_access";
  message: string | null;
};

/**
 * Las filas con que nace una corrida: a quién se le va a mandar y a quién se
 * salteó, y por qué. Los dados de baja no aparecen —no es un envío salteado,
 * es una persona a la que no corresponde escribirle—, y el lugar conserva el
 * orden del roster.
 */
export function recipientRows(
  candidates: readonly BulkCandidate[],
  p: BulkPartition
): RecipientRow[] {
  const destino = new Set([...p.toSend, ...p.withoutEmail]);
  const yaEnviado = new Set(p.alreadySent);
  const conAcceso = new Set(p.hasAccess);
  const filas: RecipientRow[] = [];
  candidates.forEach((c, position) => {
    const fila = { enrollmentId: c.enrollmentId, position };
    if (destino.has(c.enrollmentId)) {
      filas.push({ ...fila, outcome: "pending", message: null });
    } else if (yaEnviado.has(c.enrollmentId)) {
      filas.push({ ...fila, outcome: "skipped_already_sent", message: null });
    } else if (conAcceso.has(c.enrollmentId)) {
      filas.push({
        ...fila,
        outcome: "skipped_has_access",
        message: c.portalLink?.suspended ? ACCESO_SUSPENDIDO : YA_TIENE_ACCESO,
      });
    }
  });
  return filas;
}

/* ============================================================
 * Qué quedó registrado — puro
 * ============================================================ */

export type RecipientOutcome = {
  outcome: Exclude<BulkSendOutcome, "pending">;
  message: string | null;
  /** ¿Llegó al proveedor? Solo después de un intento real se hace la pausa. */
  attempted: boolean;
};

const YA_TIENE_ACCESO = "Ya tiene acceso al portal; no se le generó una contraseña nueva.";
const ACCESO_SUSPENDIDO = "Tiene el acceso al portal suspendido; no se le envió nada.";
const FALLO_INESPERADO =
  "No se pudo completar el envío por un error inesperado. Se puede volver a intentar más tarde.";

export function outcomeOfEmail(r: SendEnrollmentEmailResult): RecipientOutcome {
  if (!r.ok) return { outcome: "failed", message: r.message, attempted: r.status === 502 };
  if (r.skipped) return { outcome: "skipped_already_sent", message: null, attempted: false };
  return { outcome: "sent", message: null, attempted: true };
}

export function outcomeOfAccess(
  r: AccessResult<GrantPortalAccessResult | PortalAccessAlreadyGranted>
): RecipientOutcome {
  if (!r.ok) return { outcome: "failed", message: r.message, attempted: r.status === 502 };
  if (r.data.skipped) {
    return {
      outcome: "skipped_has_access",
      message: r.data.link.suspendedAt ? ACCESO_SUSPENDIDO : YA_TIENE_ACCESO,
      attempted: false,
    };
  }
  if (r.data.temporaryPassword === null) {
    // Alguien del staff que además cursa: se le habilitó el portal sin tocar
    // su contraseña y sin correo (ver `grantPortalAccess`).
    return {
      outcome: "skipped_has_access",
      message: "Ya tenía cuenta en el sistema: se le habilitó el portal y entra con su contraseña de siempre.",
      attempted: false,
    };
  }
  if (r.data.emailError) {
    // La contraseña temporal NO se registra: viajaría a la pantalla de la
    // corrida, que puede abrir cualquiera con la capacidad, días después.
    return {
      outcome: "failed",
      message: `Se creó el acceso, pero el correo no salió (${r.data.emailError}). Desde la fila del alumno se puede reenviar el acceso con una contraseña nueva.`,
      attempted: true,
    };
  }
  return { outcome: "sent", message: null, attempted: true };
}

/* ============================================================
 * La corrida — de a uno, con pausa, sin cortarse
 * ============================================================ */

export type RecipientRef = { id: string; enrollmentId: string };

export type ProcessDeps = {
  send: (enrollmentId: string) => Promise<RecipientOutcome>;
  record: (recipientId: string, outcome: RecipientOutcome) => Promise<void>;
  pause: () => Promise<void>;
};

/**
 * Secuencial a propósito: uno por vez, y el resultado de cada uno se registra
 * antes de pasar al siguiente. Un fallo —del envío o del registro— queda
 * anotado y la corrida sigue: un correo mal cargado no puede dejar sin
 * bienvenida al resto de la cohorte.
 */
export async function processRecipients(
  recipients: readonly RecipientRef[],
  deps: ProcessDeps
): Promise<void> {
  let pausar = false;
  for (const r of recipients) {
    if (pausar) await deps.pause();
    let resultado: RecipientOutcome;
    try {
      resultado = await deps.send(r.enrollmentId);
    } catch (err) {
      console.error("[envio-masivo] falló un envío:", err instanceof Error ? err.message : err);
      resultado = { outcome: "failed", message: FALLO_INESPERADO, attempted: true };
    }
    try {
      await deps.record(r.id, resultado);
    } catch (err) {
      console.error("[envio-masivo] no se pudo registrar:", err instanceof Error ? err.message : err);
    }
    pausar = resultado.attempted;
  }
}

/* ============================================================
 * Candado en proceso — una corrida por cohorte y tipo
 * ============================================================ */

// En globalThis: en desarrollo Next reevalúa los módulos y dos copias del
// candado serían dos candados que no se ven entre sí.
const globalForBulk = globalThis as unknown as {
  __caditBulkSends?: {
    locks: Map<string, number>;
    active: Set<string>;
    runByLock: Map<string, string>;
  };
};

function estado() {
  if (!globalForBulk.__caditBulkSends) {
    globalForBulk.__caditBulkSends = { locks: new Map(), active: new Set(), runByLock: new Map() };
  }
  return globalForBulk.__caditBulkSends;
}

/**
 * Un candado que nadie soltó y cuya corrida nunca arrancó (el commit del
 * pedido falló después de tomarlo) deja de valer pasado este plazo. Una
 * corrida que SÍ arrancó lo sostiene lo que dure, aunque sean 340 correos.
 */
const CANDADO_HUERFANO_MS = 60_000;

const claveDeCandado = (org: string, cohortId: string, kind: BulkSendKind) =>
  `${org}:${cohortId}:${kind}`;

export function tryAcquireRunLock(org: string, cohortId: string, kind: BulkSendKind): boolean {
  const { locks } = estado();
  const clave = claveDeCandado(org, cohortId, kind);
  const tomado = locks.get(clave);
  if (tomado !== undefined && Date.now() - tomado < CANDADO_HUERFANO_MS) return false;
  if (tomado !== undefined && corridaVivaDe(clave)) return false;
  locks.set(clave, Date.now());
  return true;
}

export function releaseRunLock(org: string, cohortId: string, kind: BulkSendKind): void {
  const clave = claveDeCandado(org, cohortId, kind);
  estado().locks.delete(clave);
  estado().runByLock.delete(clave);
}


function corridaVivaDe(clave: string): boolean {
  const runId = estado().runByLock.get(clave);
  return Boolean(runId && estado().active.has(runId));
}

export function markRunActive(runId: string): void {
  estado().active.add(runId);
}

export function markRunInactive(runId: string): void {
  estado().active.delete(runId);
}

export type BulkRunStatus = "en_curso" | "terminada" | "interrumpida";

/**
 * Se deriva, no se guarda: una corrida sin terminar cuyo proceso ya no existe
 * (reinicio, deploy) es "interrumpida", y apretar de nuevo retoma lo pendiente.
 */
export function runStatus(run: { id: string; finishedAt: Date | null }): BulkRunStatus {
  if (run.finishedAt) return "terminada";
  return estado().active.has(run.id) ? "en_curso" : "interrumpida";
}

/* ============================================================
 * Base de datos
 * ============================================================ */

export type BulkCounts = {
  toSend: number;
  alreadySent: number;
  hasAccess: number;
  withoutEmail: number;
  withdrawn: number;
};

export type BulkRunRecipientDto = {
  enrollmentId: string;
  name: string;
  outcome: BulkSendOutcome;
  message: string | null;
  processedAt: string | null;
};

export type BulkRunDto = {
  id: string;
  cohortId: string;
  kind: BulkSendKind;
  status: BulkRunStatus;
  startedAt: string;
  finishedAt: string | null;
  startedByName: string | null;
  totals: Record<BulkSendOutcome, number>;
  recipients: BulkRunRecipientDto[];
};

export type BulkKindOverview = {
  kind: BulkSendKind;
  counts: BulkCounts;
  /** Por qué no tiene sentido mandar ahora (p. ej. falta el enlace del grupo); null = se puede. */
  blockedReason: string | null;
  latestRun: BulkRunDto | null;
};

type Result<T> =
  | { ok: true; data: T }
  | { ok: false; status: 404 | 409 | 422; code: string; message: string };

const NADA_PARA_ENVIAR: Record<BulkSendKind, string> = {
  terms: "Todos los alumnos de la cohorte con correo ya recibieron los términos de la licencia.",
  welcome: "Todos los alumnos de la cohorte con correo ya recibieron la bienvenida.",
  portal_access:
    "No hay alumnos para invitar: quienes tienen correo cargado ya tienen acceso al portal.",
};

const SIN_ENLACE_DEL_GRUPO =
  "La cohorte no tiene enlace del grupo de WhatsApp. Cargalo en la edición de la cohorte para poder enviar la bienvenida.";

/** Vista previa por tipo, con la última corrida de cada uno. null = cohorte inexistente. */
export async function bulkSendOverview(
  organizationId: string,
  cohortId: string,
  kinds: readonly BulkSendKind[]
): Promise<BulkKindOverview[] | null> {
  const roster = await getCohortRoster(organizationId, cohortId, []);
  if (!roster) return null;
  const candidates = candidatesFromRoster(roster.enrollments);

  const salida: BulkKindOverview[] = [];
  for (const kind of kinds) {
    const p = partitionRecipients(kind, candidates);
    const ultima = await getDb()
      .select({ id: schema.bulkSendRun.id })
      .from(schema.bulkSendRun)
      .where(
        scoped(
          schema.bulkSendRun.organizationId,
          organizationId,
          eq(schema.bulkSendRun.cohortId, cohortId),
          eq(schema.bulkSendRun.kind, kind)
        )
      )
      .orderBy(desc(schema.bulkSendRun.startedAt))
      .limit(1);
    salida.push({
      kind,
      counts: {
        toSend: p.toSend.length,
        alreadySent: p.alreadySent.length,
        hasAccess: p.hasAccess.length,
        withoutEmail: p.withoutEmail.length,
        withdrawn: p.withdrawn.length,
      },
      blockedReason:
        kind === "welcome" && !roster.cohort.whatsappGroupLink ? SIN_ENLACE_DEL_GRUPO : null,
      latestRun: ultima[0] ? await getBulkRun(organizationId, ultima[0].id) : null,
    });
  }
  return salida;
}

/**
 * Arranca una corrida. Corre DENTRO del pedido: registra la corrida y sus
 * destinatarios, y agenda el trabajo para DESPUÉS del commit
 * (`onAfterCommit`) — una tarea suelta no ve las filas que la transacción
 * que la disparó todavía no confirmó.
 */
export async function startBulkSend(
  organizationId: string,
  cohortId: string,
  kind: BulkSendKind,
  startedBy: string
): Promise<Result<{ runId: string }>> {
  if (!tryAcquireRunLock(organizationId, cohortId, kind)) {
    return {
      ok: false,
      status: 409,
      code: "run_in_progress",
      message: "Ya hay un envío de este tipo en curso para esta cohorte. Su avance se ve en este mismo panel.",
    };
  }

  let agendada = false;
  try {
    const roster = await getCohortRoster(organizationId, cohortId, []);
    if (!roster) {
      return { ok: false, status: 404, code: "not_found", message: "Cohorte no encontrada" };
    }
    const candidates = candidatesFromRoster(roster.enrollments);
    const p = partitionRecipients(kind, candidates);
    if (p.toSend.length === 0) {
      return { ok: false, status: 422, code: "nothing_to_send", message: NADA_PARA_ENVIAR[kind] };
    }

    const db = getDb();
    const runId = newId("bulkSendRun");
    const ahora = new Date();
    await db.insert(schema.bulkSendRun).values({
      id: runId,
      organizationId,
      cohortId,
      kind,
      startedBy,
    });

    const filas = recipientRows(candidates, p).map((f) => ({
      ...f,
      id: newId("bulkSendRecipient"),
      organizationId,
      runId,
      processedAt: f.outcome === "pending" ? null : ahora,
    }));
    await db.insert(schema.bulkSendRecipient).values(filas);

    estado().runByLock.set(claveDeCandado(organizationId, cohortId, kind), runId);
    onAfterCommit(() => {
      void processRun(organizationId, cohortId, runId, kind, startedBy);
    });
    agendada = true;
    return { ok: true, data: { runId } };
  } finally {
    if (!agendada) releaseRunLock(organizationId, cohortId, kind);
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * El trabajo de fondo. Fuera de cualquier pedido, así que cada paso declara
 * su organización con `withOrganizationScope` (RLS): sin eso no ve ninguna
 * fila. Cada envío y cada registro van en su propia transacción, para que la
 * marca de un correo aceptado quede confirmada antes del siguiente.
 */
async function processRun(
  organizationId: string,
  cohortId: string,
  runId: string,
  kind: BulkSendKind,
  startedBy: string
): Promise<void> {
  markRunActive(runId);
  const actor = `bulk:${startedBy}`;
  const enAlcance = <T>(fn: () => Promise<T>) => withOrganizationScope(organizationId, actor, fn);
  try {
    const pendientes = await enAlcance(() => pendingRecipients(organizationId, runId));
    const pausaMs = getEnv().BULK_SEND_PAUSE_MS;
    await processRecipients(pendientes, {
      send: (enrollmentId) =>
        enAlcance(async () =>
          kind === "portal_access"
            ? outcomeOfAccess(
                await grantPortalAccess(organizationId, enrollmentId, { sentBy: startedBy })
              )
            : outcomeOfEmail(await sendEnrollmentEmail(organizationId, enrollmentId, kind))
        ),
      record: (recipientId, o) => enAlcance(() => recordOutcome(organizationId, recipientId, o)),
      pause: () => sleep(pausaMs),
    });
    await enAlcance(() => finishRun(organizationId, runId));
  } catch (err) {
    console.error("[envio-masivo] la corrida se cortó:", err instanceof Error ? err.message : err);
  } finally {
    markRunInactive(runId);
    releaseRunLock(organizationId, cohortId, kind);
  }
}

async function pendingRecipients(organizationId: string, runId: string): Promise<RecipientRef[]> {
  return getDb()
    .select({ id: schema.bulkSendRecipient.id, enrollmentId: schema.bulkSendRecipient.enrollmentId })
    .from(schema.bulkSendRecipient)
    .where(
      scoped(
        schema.bulkSendRecipient.organizationId,
        organizationId,
        eq(schema.bulkSendRecipient.runId, runId),
        eq(schema.bulkSendRecipient.outcome, "pending")
      )
    )
    .orderBy(asc(schema.bulkSendRecipient.position));
}

async function recordOutcome(
  organizationId: string,
  recipientId: string,
  o: RecipientOutcome
): Promise<void> {
  await getDb()
    .update(schema.bulkSendRecipient)
    .set({ outcome: o.outcome, message: o.message, processedAt: new Date() })
    .where(
      scoped(
        schema.bulkSendRecipient.organizationId,
        organizationId,
        eq(schema.bulkSendRecipient.id, recipientId)
      )
    );
}

async function finishRun(organizationId: string, runId: string): Promise<void> {
  await getDb()
    .update(schema.bulkSendRun)
    .set({ finishedAt: new Date() })
    .where(scoped(schema.bulkSendRun.organizationId, organizationId, eq(schema.bulkSendRun.id, runId)));
}

/** La corrida con cada destinatario, para la pantalla. null = no existe en esta organización. */
export async function getBulkRun(
  organizationId: string,
  runId: string
): Promise<BulkRunDto | null> {
  const db = getDb();
  const runs = await db
    .select({ run: schema.bulkSendRun, startedByName: schema.user.name })
    .from(schema.bulkSendRun)
    .leftJoin(schema.user, eq(schema.bulkSendRun.startedBy, schema.user.id))
    .where(scoped(schema.bulkSendRun.organizationId, organizationId, eq(schema.bulkSendRun.id, runId)))
    .limit(1);
  const fila = runs[0];
  if (!fila) return null;

  const destinatarios = await db
    .select({
      recipient: schema.bulkSendRecipient,
      firstName: schema.contact.firstName,
      lastName: schema.contact.lastName,
    })
    .from(schema.bulkSendRecipient)
    .innerJoin(schema.enrollment, eq(schema.bulkSendRecipient.enrollmentId, schema.enrollment.id))
    .innerJoin(schema.contact, eq(schema.enrollment.contactId, schema.contact.id))
    .where(
      scoped(
        schema.bulkSendRecipient.organizationId,
        organizationId,
        eq(schema.bulkSendRecipient.runId, runId)
      )
    )
    .orderBy(asc(schema.bulkSendRecipient.position));

  const totals: Record<BulkSendOutcome, number> = {
    pending: 0,
    sent: 0,
    skipped_already_sent: 0,
    skipped_has_access: 0,
    failed: 0,
  };
  for (const d of destinatarios) totals[d.recipient.outcome]++;

  return {
    id: fila.run.id,
    cohortId: fila.run.cohortId,
    kind: fila.run.kind,
    status: runStatus(fila.run),
    startedAt: fila.run.startedAt.toISOString(),
    finishedAt: fila.run.finishedAt?.toISOString() ?? null,
    startedByName: fila.startedByName ?? null,
    totals,
    recipients: destinatarios.map((d) => ({
      enrollmentId: d.recipient.enrollmentId,
      name: fullName({ firstName: d.firstName, lastName: d.lastName }),
      outcome: d.recipient.outcome,
      message: d.recipient.message,
      processedAt: d.recipient.processedAt?.toISOString() ?? null,
    })),
  };
}
