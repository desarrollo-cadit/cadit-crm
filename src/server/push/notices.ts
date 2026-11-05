import { eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { getDb, getRootDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { withOrganizationScope } from "@/lib/db/with-tenant";
import { getEnv } from "@/lib/env";
import { pushDisponible } from "@/lib/push";
import type { PushPayload } from "@/lib/push/payload";
import {
  claveDeClasePush,
  claveDeCorreccionPush,
  claveDeProrrogaPush,
  clasesQueTocan,
  contenidoClasePorEmpezar,
  contenidoCorreccionPublicada,
  contenidoProrroga,
} from "@/lib/push/notices";
import { esDePrueba } from "@/server/email/assessment-notices";
import { estadosDeAcceso, zonaDeLaOrganizacion } from "@/server/access-expiry";
import {
  cargarDestinos,
  enviarADestinos,
  registrarResultados,
  type Destino,
} from "@/server/push/subscriptions";

/**
 * Phase 4 — Real push triggers for the student portal.
 *
 * Same selectors and eligibility as the email equivalents (one rule, two
 * channels): archived, lost-stage, test (Laboratorio) contacts and expired
 * access are skipped. Guarantees, copied from `email/assessment-notices.ts`:
 *
 *  - **At most once per key**: the `push_notice` row is claimed BEFORE sending.
 *    A push is never retried; a stale notice arriving late is worse than none.
 *  - **Never inside a transaction**: the push service is called outside any DB
 *    scope (load → send → record, each step its own short scope).
 *  - **Never throws**: a push failure cannot undo a published correction, an
 *    approved extension or the periodic pass.
 *  - **Silent without devices / without VAPID keys**: nothing is claimed.
 */

const ACTOR = "system:push";

type Aviso = {
  kind: "correccion_publicada" | "prorroga_decidida" | "clase_por_empezar";
  contactId: string;
  dedupKey: string;
  payload: PushPayload;
};

type Resultado = "enviado" | "fallido" | "omitido" | "sin_dispositivos" | "repetido" | "apagado";

/** Student accounts linked to a contact (portal door `alumno`, not suspended). */
async function usuariosDelAlumno(organizationId: string, contactId: string): Promise<string[]> {
  const filas = await getDb()
    .select({ userId: schema.accountLink.userId })
    .from(schema.accountLink)
    .where(
      scoped(
        schema.accountLink.organizationId,
        organizationId,
        eq(schema.accountLink.kind, "alumno"),
        eq(schema.accountLink.contactId, contactId),
        isNull(schema.accountLink.suspendedAt)
      )
    );
  return [...new Set(filas.map((f) => f.userId))];
}

/** Contacts (among `contactIds`) that have at least one active device. */
async function contactosConDispositivos(
  organizationId: string,
  contactIds: string[]
): Promise<Set<string>> {
  if (contactIds.length === 0) return new Set();
  const filas = await getDb()
    .selectDistinct({ contactId: schema.accountLink.contactId })
    .from(schema.accountLink)
    .innerJoin(schema.pushSubscription, eq(schema.pushSubscription.userId, schema.accountLink.userId))
    .where(
      scoped(
        schema.accountLink.organizationId,
        organizationId,
        eq(schema.accountLink.kind, "alumno"),
        inArray(schema.accountLink.contactId, contactIds),
        isNull(schema.accountLink.suspendedAt),
        isNull(schema.pushSubscription.disabledAt)
      )
    );
  return new Set(filas.flatMap((f) => (f.contactId ? [f.contactId] : [])));
}

/** Claim → send → record. Never throws. */
async function enviarAviso(organizationId: string, a: Aviso): Promise<Resultado> {
  try {
    if (!pushDisponible()) return "apagado";

    const reclamado = await withOrganizationScope(organizationId, ACTOR, async () => {
      const destinos: Destino[] = [];
      for (const userId of await usuariosDelAlumno(organizationId, a.contactId)) {
        destinos.push(...(await cargarDestinos({ organizationId, userId })));
      }
      if (destinos.length === 0) return "sin_dispositivos" as const;

      const filas = await getDb()
        .insert(schema.pushNotice)
        .values({
          id: newId("pushNotice"),
          organizationId,
          kind: a.kind,
          contactId: a.contactId,
          dedupKey: a.dedupKey,
          status: "omitido", // until we know otherwise: at-most-once even if we crash
        })
        .onConflictDoNothing({
          target: [schema.pushNotice.organizationId, schema.pushNotice.dedupKey],
        })
        .returning({ id: schema.pushNotice.id });
      const fila = filas[0];
      return fila ? { id: fila.id, destinos } : ("repetido" as const);
    });
    if (reclamado === "sin_dispositivos" || reclamado === "repetido") return reclamado;

    // The push service is called OUTSIDE any transaction.
    const resultados = await enviarADestinos(reclamado.destinos, a.payload);
    const status = resultados.some((r) => r.ok) ? "enviado" : "fallido";

    await withOrganizationScope(organizationId, ACTOR, async () => {
      await registrarResultados(organizationId, resultados);
      await getDb()
        .update(schema.pushNotice)
        .set({ status })
        .where(scoped(schema.pushNotice.organizationId, organizationId, eq(schema.pushNotice.id, reclamado.id)));
    });
    return status;
  } catch (err) {
    console.error("[push] aviso falló:", err instanceof Error ? err.name : "error");
    return "fallido";
  }
}

/* ============================================================
 * 1. Corrección publicada  (called by `publicarCorreccion` via onAfterCommit)
 * ============================================================ */

export async function avisarPushCorreccionPublicada(
  organizationId: string,
  correctionId: string
): Promise<void> {
  try {
    const aviso = await withOrganizationScope(organizationId, ACTOR, async (): Promise<Aviso | null> => {
      const [f] = await getDb()
        .select({
          status: schema.correction.status,
          enrollmentId: schema.correction.enrollmentId,
          evaluacion: schema.assessment.name,
          curso: schema.course.name,
          contactId: schema.contact.id,
          archivedAt: schema.contact.archivedAt,
          prueba: sql<boolean>`${esDePrueba()}`,
        })
        .from(schema.correction)
        .innerJoin(schema.assessment, eq(schema.assessment.id, schema.correction.assessmentId))
        .innerJoin(schema.cohort, eq(schema.cohort.id, schema.assessment.cohortId))
        .innerJoin(schema.course, eq(schema.course.id, schema.cohort.courseId))
        .innerJoin(schema.enrollment, eq(schema.enrollment.id, schema.correction.enrollmentId))
        .innerJoin(schema.contact, eq(schema.contact.id, schema.enrollment.contactId))
        .where(scoped(schema.correction.organizationId, organizationId, eq(schema.correction.id, correctionId)))
        .limit(1);
      // Same rule as the email: only if it is still the published version.
      if (!f || f.status !== "published" || f.archivedAt || f.prueba === true) return null;
      return {
        kind: "correccion_publicada",
        contactId: f.contactId,
        dedupKey: claveDeCorreccionPush(correctionId),
        payload: contenidoCorreccionPublicada({
          evaluacion: f.evaluacion,
          curso: f.curso,
          enrollmentId: f.enrollmentId,
        }),
      };
    });
    if (aviso) await enviarAviso(organizationId, aviso);
  } catch (err) {
    console.error("[push] corrección publicada falló:", err instanceof Error ? err.name : "error");
  }
}

/* ============================================================
 * 3. Prórroga decidida  (called by `decidirPedido` via onAfterCommit)
 * ============================================================ */

export async function avisarPushProrroga(
  organizationId: string,
  requestId: string,
  decision: "aprobar" | "rechazar"
): Promise<void> {
  try {
    const aviso = await withOrganizationScope(organizationId, ACTOR, async (): Promise<Aviso | null> => {
      const r = schema.assessmentExtensionRequest;
      const [f] = await getDb()
        .select({
          enrollmentId: r.enrollmentId,
          evaluacion: schema.assessment.name,
          contactId: schema.contact.id,
          archivedAt: schema.contact.archivedAt,
          prueba: sql<boolean>`${esDePrueba()}`,
        })
        .from(r)
        .innerJoin(schema.assessment, eq(schema.assessment.id, r.assessmentId))
        .innerJoin(schema.enrollment, eq(schema.enrollment.id, r.enrollmentId))
        .innerJoin(schema.contact, eq(schema.contact.id, schema.enrollment.contactId))
        .where(scoped(r.organizationId, organizationId, eq(r.id, requestId)))
        .limit(1);
      if (!f || f.archivedAt || f.prueba === true) return null;
      return {
        kind: "prorroga_decidida",
        contactId: f.contactId,
        dedupKey: claveDeProrrogaPush(requestId),
        payload: contenidoProrroga({
          aprobada: decision === "aprobar",
          evaluacion: f.evaluacion,
          enrollmentId: f.enrollmentId,
        }),
      };
    });
    if (aviso) await enviarAviso(organizationId, aviso);
  } catch (err) {
    console.error("[push] prórroga falló:", err instanceof Error ? err.name : "error");
  }
}

/* ============================================================
 * 4. Clase por empezar  (periodic)
 * ============================================================ */

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * One pass for one organization. Returns how many notices it attempted.
 * Candidate classes start inside (now, now + leadMin]; the dedupe key
 * (class + contact) makes the many passes inside that window send ONCE.
 */
export async function runPushClassRemindersForOrg(
  organizationId: string,
  now = new Date(),
  leadMin = getEnv().PUSH_CLASS_REMINDER_LEAD_MIN
): Promise<number> {
  if (!pushDisponible()) return 0;
  try {
    const avisos = await withOrganizationScope(organizationId, ACTOR, async (): Promise<Aviso[]> => {
      const db = getDb();
      const timeZone = await zonaDeLaOrganizacion(organizationId);

      // `date` is a day (UTC midnight): a 3-day window covers any time zone.
      const clases = await db
        .select({
          id: schema.classSession.id,
          cohortId: schema.classSession.cohortId,
          date: schema.classSession.date,
          startTime: schema.classSession.startTime,
          canceledAt: schema.classSession.canceledAt,
          curso: schema.course.name,
        })
        .from(schema.classSession)
        .innerJoin(schema.cohort, eq(schema.cohort.id, schema.classSession.cohortId))
        .innerJoin(schema.course, eq(schema.course.id, schema.cohort.courseId))
        .where(
          scoped(
            schema.classSession.organizationId,
            organizationId,
            isNull(schema.classSession.canceledAt),
            gte(schema.classSession.date, new Date(now.getTime() - DIA_MS)),
            lte(schema.classSession.date, new Date(now.getTime() + 2 * DIA_MS))
          )
        );

      const toca = clasesQueTocan(clases, timeZone, now, leadMin);
      if (toca.length === 0) return [];
      const cursoDe = new Map(clases.map((c) => [c.id, c.curso]));
      const cohortIds = [...new Set(toca.map((c) => c.cohortId))];

      const inscripciones = await db
        .select({
          id: schema.enrollment.id,
          cohortId: schema.enrollment.cohortId,
          contactId: schema.contact.id,
          archivedAt: schema.contact.archivedAt,
          etapa: schema.pipelineStage.kind,
          prueba: sql<boolean>`${esDePrueba()}`,
        })
        .from(schema.enrollment)
        .innerJoin(schema.contact, eq(schema.contact.id, schema.enrollment.contactId))
        .innerJoin(schema.pipelineStage, eq(schema.pipelineStage.id, schema.enrollment.stageId))
        .where(scoped(schema.enrollment.organizationId, organizationId, inArray(schema.enrollment.cohortId, cohortIds)));

      const vigentes = inscripciones.filter(
        (i) => i.archivedAt === null && i.etapa !== "lost" && i.prueba !== true
      );
      if (vigentes.length === 0) return [];

      const [accesos, conDispositivo] = await Promise.all([
        estadosDeAcceso(organizationId, vigentes.map((i) => i.id), now),
        contactosConDispositivos(organizationId, [...new Set(vigentes.map((i) => i.contactId))]),
      ]);

      const out: Aviso[] = [];
      for (const c of toca) {
        for (const i of vigentes) {
          if (i.cohortId !== c.cohortId) continue;
          if (!conDispositivo.has(i.contactId)) continue;
          if (accesos.get(i.id)?.vencido === true) continue;
          out.push({
            kind: "clase_por_empezar",
            contactId: i.contactId,
            dedupKey: claveDeClasePush(c.id, i.contactId),
            payload: contenidoClasePorEmpezar({
              curso: cursoDe.get(c.id) ?? "Tu clase",
              hora: c.hora,
              enrollmentId: i.id,
            }),
          });
        }
      }
      return out;
    });

    let intentados = 0;
    for (const a of avisos) {
      const r = await enviarAviso(organizationId, a);
      if (r === "enviado" || r === "fallido") intentados++;
    }
    return intentados;
  } catch (err) {
    console.error("[push] recordatorio de clase: la pasada falló:", err instanceof Error ? err.name : "error");
    return 0;
  }
}

/* ============================================================
 * Scheduler (same design as the assessment reminders)
 * ============================================================ */

export type PushClassSchedulerDeps = {
  intervalMin: number;
  bootDelayMs: number;
  organizations: () => Promise<string[]>;
  runOrg: (orgId: string) => Promise<number>;
  log: (msg: string) => void;
};

const MIN = 60_000;
type State = { timeout: ReturnType<typeof setTimeout>; interval: ReturnType<typeof setInterval> };
// In globalThis: in dev Next re-evaluates modules and two copies would be two timers.
const g = globalThis as unknown as { __caditPushClassReminders?: State | null };

/**
 * `PUSH_CLASS_REMINDER_INTERVAL_MIN=0` turns it off (default). Started by
 * `startPushClassRemindersOnBoot` behind `shouldStartScheduler`: never in tests
 * nor in `next build`. Timers are `unref()`ed.
 */
export function startPushClassReminderScheduler(
  deps: PushClassSchedulerDeps = defaultPushClassSchedulerDeps()
): boolean {
  if (!(deps.intervalMin > 0)) return false;
  if (g.__caditPushClassReminders) return false;

  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      let orgs: string[];
      try {
        orgs = await deps.organizations();
      } catch (err) {
        deps.log(`[push] clases: no se pudo leer organizaciones (${err instanceof Error ? err.name : "error"})`);
        return;
      }
      for (const orgId of orgs) {
        try {
          const n = await deps.runOrg(orgId);
          if (n > 0) deps.log(`[push] clases: ${orgId} → ${n} aviso(s)`);
        } catch (err) {
          deps.log(`[push] clases: ${orgId} falló (${err instanceof Error ? err.name : "error"})`);
        }
      }
    } finally {
      busy = false;
    }
  };

  const timeout = setTimeout(() => void tick(), deps.bootDelayMs);
  timeout.unref?.();
  const interval = setInterval(() => void tick(), deps.intervalMin * MIN);
  interval.unref?.();
  g.__caditPushClassReminders = { timeout, interval };
  deps.log(`[push] recordatorio de clase encendido: cada ${deps.intervalMin} min`);
  return true;
}

export function stopPushClassReminderScheduler(): void {
  const s = g.__caditPushClassReminders;
  if (!s) return;
  clearTimeout(s.timeout);
  clearInterval(s.interval);
  g.__caditPushClassReminders = null;
}

export function defaultPushClassSchedulerDeps(): PushClassSchedulerDeps {
  return {
    intervalMin: getEnv().PUSH_CLASS_REMINDER_INTERVAL_MIN,
    bootDelayMs: 40_000,
    // `organization` has no RLS (not a domain table).
    organizations: async () =>
      (await getRootDb().select({ id: schema.organization.id }).from(schema.organization)).map((o) => o.id),
    runOrg: (orgId) => runPushClassRemindersForOrg(orgId),
    log: (m) => console.log(m),
  };
}
