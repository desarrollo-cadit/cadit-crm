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
