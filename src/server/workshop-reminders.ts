import { and, eq, gte, isNull, lte, ne } from "drizzle-orm";
import { getEnv } from "@/lib/env";
import { getDb, getRootDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { withOrganizationScope } from "@/lib/db/with-tenant";
import { seleccionarRecordatorios } from "@/lib/workshops";
import { organizationTimezone } from "@/server/finanzas-periodo";
import { notifyWorkshopAttendee } from "@/server/workshop-notices";

/**
 * 033 (FR-020) — El recordatorio del día anterior, in-process.
 *
 * Mismo diseño que la periódica de Zoom (`src/server/zoom/scheduler.ts`): la
 * constitución no admite colas ni cron externos, así que el servidor se
 * despierta solo.
 *
 *  - **Quién se recuerda lo decide la BASE**: `reminder_sent_at` NULL, estado
 *    *Confirmado*, taller mañana. Un reinicio no pierde ni repite nada, y la
 *    marca se reclama atómicamente antes de mandar (`workshop-notices.ts`).
 *  - **Nunca lanza** ni corre dentro de un pedido: cada organización abre su
 *    propio alcance corto.
 *  - **`WORKSHOP_REMINDER_INTERVAL_MIN=0` lo apaga** (default), y no arranca
 *    nunca en los tests ni durante `next build` (`shouldStartScheduler`).
 *  - Los temporizadores van con `unref()`: no retienen el proceso.
 */

export type ReminderSchedulerDeps = {
  intervalMin: number;
  bootDelayMs: number;
  organizations: () => Promise<string[]>;
  /** Devuelve cuántos recordatorios intentó en esa organización. */
  runOrg: (orgId: string) => Promise<number>;
  log: (msg: string) => void;
};

const MIN = 60_000;

type State = { timeout: ReturnType<typeof setTimeout>; interval: ReturnType<typeof setInterval> };

// En globalThis: en desarrollo Next reevalúa los módulos y dos copias serían
// dos temporizadores.
const globalForReminders = globalThis as unknown as { __caditWorkshopReminders?: State | null };

export function startWorkshopReminderScheduler(
  deps: ReminderSchedulerDeps = defaultReminderDeps()
): boolean {
  if (!(deps.intervalMin > 0)) return false;
  if (globalForReminders.__caditWorkshopReminders) return false;

  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      let orgs: string[];
      try {
        orgs = await deps.organizations();
      } catch (err) {
        deps.log(`[talleres] recordatorio: no se pudo leer organizaciones (${err instanceof Error ? err.name : "error"})`);
        return;
      }
      for (const orgId of orgs) {
        try {
          const n = await deps.runOrg(orgId);
          if (n > 0) deps.log(`[talleres] recordatorio: ${orgId} → ${n} intento(s)`);
        } catch (err) {
          deps.log(`[talleres] recordatorio: ${orgId} falló (${err instanceof Error ? err.name : "error"})`);
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
  globalForReminders.__caditWorkshopReminders = { timeout, interval };
  deps.log(`[talleres] recordatorio encendido: cada ${deps.intervalMin} min`);
  return true;
}

export function stopWorkshopReminderScheduler(): void {
  const s = globalForReminders.__caditWorkshopReminders;
  if (!s) return;
  clearTimeout(s.timeout);
  clearInterval(s.interval);
  globalForReminders.__caditWorkshopReminders = null;
}

/* ============================================================
 * Implementación sobre la base
 * ============================================================ */

const DIA = 24 * 60 * MIN;

/**
 * Los recordatorios que tocan AHORA en una organización: las ediciones de
 * taller no canceladas que empiezan entre hoy y pasado mañana (margen para
 * cualquier zona), y entre sus confirmados, los que elige
 * `seleccionarRecordatorios`. La selección fina —"mañana, desde las 10"— es
 * pura y está probada.
 */
export async function remindersDueInOrg(organizationId: string, now = new Date()): Promise<string[]> {
  return withOrganizationScope(organizationId, "system:talleres", async () => {
    const db = getDb();
    const timeZone = await organizationTimezone(organizationId);
    const rows = await db
      .select({
        cohortId: schema.cohort.id,
        startDate: schema.cohort.startDate,
        registrationStatus: schema.cohort.registrationStatus,
        registrationId: schema.workshopRegistration.id,
        status: schema.workshopRegistration.status,
        reminderSentAt: schema.workshopRegistration.reminderSentAt,
        phone: schema.contact.phone,
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
          and(
            eq(schema.course.kind, "taller"),
            eq(schema.workshopRegistration.status, "confirmado"),
            isNull(schema.workshopRegistration.reminderSentAt),
            ne(schema.cohort.registrationStatus, "cancelada"),
            gte(schema.cohort.startDate, new Date(now.getTime() - DIA)),
            lte(schema.cohort.startDate, new Date(now.getTime() + 2 * DIA))
          )
        )
      );

    const porEdicion = new Map<string, typeof rows>();
    for (const r of rows) {
      porEdicion.set(r.cohortId, [...(porEdicion.get(r.cohortId) ?? []), r]);
    }
    const elegidos: string[] = [];
    for (const filas of porEdicion.values()) {
      const primera = filas[0]!;
      elegidos.push(
        ...seleccionarRecordatorios(
          { startDate: primera.startDate, registrationStatus: primera.registrationStatus },
          filas.map((f) => ({
            id: f.registrationId,
            status: f.status,
            reminderSentAt: f.reminderSentAt,
            hasPhone: Boolean(f.phone),
          })),
          now,
          timeZone
        )
      );
    }
    return elegidos;
  });
}

export async function runRemindersForOrg(organizationId: string, now = new Date()): Promise<number> {
  const ids = await remindersDueInOrg(organizationId, now);
  // Uno por uno, cada uno en su alcance: un fallo no frena al siguiente.
  for (const id of ids) await notifyWorkshopAttendee(organizationId, id, "recordatorio", now);
  return ids.length;
}

export function defaultReminderDeps(): ReminderSchedulerDeps {
  return {
    intervalMin: getEnv().WORKSHOP_REMINDER_INTERVAL_MIN,
    bootDelayMs: 45_000,
    // `organization` no tiene RLS (no es tabla de dominio).
    organizations: async () =>
      (await getRootDb().select({ id: schema.organization.id }).from(schema.organization)).map(
        (o) => o.id
      ),
    runOrg: (orgId) => runRemindersForOrg(orgId),
    log: (m) => console.log(m),
  };
}
