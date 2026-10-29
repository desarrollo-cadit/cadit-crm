/**
 * Hook de arranque de Next. El trabajo real vive en instrumentation-node.ts
 * (import dinámico condicionado al runtime para que el bundler edge no
 * intente resolver dependencias de Node como `postgres`).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { warnIfWebhookSignatureDisabled } = await import(
      "@/server/inbox/webhook"
    );
    warnIfWebhookSignatureDisabled();
    const {
      cleanupOrphanRuns,
      startAssessmentRemindersOnBoot,
      startMarketingOnBoot,
      startStaffNoticesOnBoot,
      startWorkshopRemindersOnBoot,
      startZoomAttendanceOnBoot,
      startZoomSyncOnBoot,
    } = await import("./instrumentation-node");
    await cleanupOrphanRuns();
    await startZoomSyncOnBoot();
    await startZoomAttendanceOnBoot();
    await startWorkshopRemindersOnBoot();
    await startStaffNoticesOnBoot();
    await startAssessmentRemindersOnBoot();
    await startMarketingOnBoot();
  }
}
