import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

/**
 * Limpieza al arranque (FR-034): corridas del Laboratorio que quedaron
 * "running" tras un reinicio → fallidas. Solo corre en el runtime Node.
 */
export async function cleanupOrphanRuns(): Promise<void> {
  try {
    const db = getDb();
    const updated = await db
      .update(schema.agentTestRun)
      .set({
        status: "failed",
        error: "Interrumpida por un reinicio del servidor",
        finishedAt: new Date(),
      })
      .where(eq(schema.agentTestRun.status, "running"))
      .returning({ id: schema.agentTestRun.id });
    if (updated.length > 0) {
      console.log(
        `[boot] ${updated.length} corrida(s) del Laboratorio huérfana(s) marcada(s) como fallida(s)`
      );
    }
  } catch (err) {
    // La BD puede no estar lista aún (migraciones corren antes del server).
    console.error("[boot] limpieza de corridas huérfanas falló:", err);
  }
}

/**
 * 030 US5 — Grabaciones de Zoom al arrancar: corridas huérfanas → error,
 * leases vencidos liberados y, si `ZOOM_SYNC_INTERVAL_MIN > 0`, la
 * sincronización periódica. Nada de esto corre en tests ni en `next build`
 * (`shouldStartScheduler`), y nada puede tumbar el arranque.
 */
export async function startZoomSyncOnBoot(): Promise<void> {
  try {
    const { shouldStartScheduler, startZoomScheduler } = await import("@/server/zoom/scheduler");
    if (!shouldStartScheduler(process.env)) return;
    const { recoverZoomSyncOnBoot } = await import("@/server/zoom/sync");
    await recoverZoomSyncOnBoot();
    startZoomScheduler();
  } catch (err) {
    console.error("[boot] sincronización de Zoom no arrancó:", err instanceof Error ? err.name : "error");
  }
}

/**
 * Constitución 1.9.0 — Asistencia sugerida desde Zoom al arrancar: purga los
 * tramos crudos viejos (aun con la periódica apagada) y, si
 * `ZOOM_ATTENDANCE_INTERVAL_MIN > 0`, la periódica que trae los reportes
 * (incluido el relleno de clases pasadas sin asistencia). Misma guarda que
 * la periódica de grabaciones; nada puede tumbar el arranque.
 */
export async function startZoomAttendanceOnBoot(): Promise<void> {
  try {
    const { shouldStartScheduler } = await import("@/server/zoom/scheduler");
    if (!shouldStartScheduler(process.env)) return;
    const { purgarCrudosAlArrancar, startZoomAttendanceScheduler } = await import(
      "@/server/zoom/attendance-scheduler"
    );
    await purgarCrudosAlArrancar();
    startZoomAttendanceScheduler();
  } catch (err) {
    console.error("[boot] asistencia de Zoom no arrancó:", err instanceof Error ? err.name : "error");
  }
}

/**
 * 033 (FR-020) — El recordatorio de talleres por WhatsApp al arrancar, si
 * `WORKSHOP_REMINDER_INTERVAL_MIN > 0`. Usa la MISMA guarda que la periódica
 * de Zoom (`shouldStartScheduler`): el `process.env` del servidor standalone
 * no trae `NEXT_RUNTIME`, y exigirlo acá lo dejaría apagado en producción sin
 * ningún log (el bug que se corrigió en Zoom). Nada puede tumbar el arranque.
 */
export async function startWorkshopRemindersOnBoot(): Promise<void> {
  try {
    const { shouldStartScheduler } = await import("@/server/zoom/scheduler");
    if (!shouldStartScheduler(process.env)) return;
    const { startWorkshopReminderScheduler } = await import("@/server/workshop-reminders");
    startWorkshopReminderScheduler();
  } catch (err) {
    console.error("[boot] recordatorio de talleres no arrancó:", err instanceof Error ? err.name : "error");
  }
}

/**
 * 039 — Los avisos internos por correo (facturación a Administración a T-7 y
 * T-2, reintento del aviso a Soporte), si `STAFF_NOTICES_INTERVAL_MIN > 0`.
 * La MISMA guarda que la de Zoom y la de talleres (`shouldStartScheduler`):
 * nunca en tests ni en `next build`, y nada puede tumbar el arranque.
 */
export async function startStaffNoticesOnBoot(): Promise<void> {
  try {
    const { shouldStartScheduler } = await import("@/server/zoom/scheduler");
    if (!shouldStartScheduler(process.env)) return;
    const { startStaffNoticeScheduler } = await import("@/server/staff-notices");
    startStaffNoticeScheduler();
  } catch (err) {
    console.error("[boot] avisos internos no arrancaron:", err instanceof Error ? err.name : "error");
  }
}

/**
 * 0084 — El recordatorio por correo a los alumnos que no entregaron, si
 * `ASSESSMENT_REMINDER_INTERVAL_MIN > 0`. La MISMA guarda que las demás
 * (`shouldStartScheduler`): nunca en tests ni en `next build`, y nada puede
 * tumbar el arranque.
 */
export async function startAssessmentRemindersOnBoot(): Promise<void> {
  try {
    const { shouldStartScheduler } = await import("@/server/zoom/scheduler");
    if (!shouldStartScheduler(process.env)) return;
    const { startAssessmentReminderScheduler } = await import("@/server/email/assessment-notices");
    startAssessmentReminderScheduler();
  } catch (err) {
    console.error("[boot] recordatorio de evaluaciones no arrancó:", err instanceof Error ? err.name : "error");
  }
}

/**
 * 045 (DV-003; US3-5) — Campañas de marketing: retoma las que quedaron
 * `enviando` tras un reinicio y enciende la periódica (`MARKETING_TICK_SEC`;
 * 0 = solo al arrancar). La MISMA guarda que las demás (`shouldStartScheduler`,
 * adentro de `startMarketingOnBoot`): nunca en tests ni en `next build`, y
 * nada puede tumbar el arranque.
 */
export async function startMarketingOnBoot(): Promise<void> {
  try {
    const { startMarketingOnBoot: arrancar } = await import("@/server/marketing/runner");
    await arrancar();
  } catch (err) {
    console.error("[boot] campañas de marketing no arrancaron:", err instanceof Error ? err.name : "error");
  }
}
