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
