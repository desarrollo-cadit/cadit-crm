import { apiError, requireCapability } from "@/lib/api";
import { onAfterCommit } from "@/lib/db/tenant-context";
import { executeVerify, startVerify, verifyDeps } from "@/server/zoom/verify";

export const dynamic = "force-dynamic";

/**
 * "Verificar en Zoom" — la verificación diaria, a pedido.
 *
 * Igual que "Sincronizar": toma el lease (el MISMO: no corre a la vez que una
 * sincronización) dentro del pedido y responde 409 si está tomado; la corrida
 * —meses de listados de Zoom— se agenda con `onAfterCommit`, fuera de la
 * transacción, y nunca lanza hacia el pedido, que ya respondió 202.
 */
export const POST = requireCapability("grabaciones.gestionar", async (session) => {
  const deps = verifyDeps();
  const start = await startVerify(session.organizationId, {}, deps);
  if (!start.ok && start.error === "sin_conexiones") {
    return apiError(422, "sin_conexiones", "No hay ninguna conexión de Zoom activa para verificar.");
  }
  if (!start.ok && start.error === "sin_aulas") {
    return apiError(422, "sin_aulas", "No hay aulas vinculadas a Zoom: vinculalas en Configuración › Zoom");
  }
  if (!start.ok) {
    return Response.json(
      {
        error: {
          code: "sync_en_curso",
          message: "Ya hay una sincronización o verificación corriendo.",
          startedAt: start.startedAt?.toISOString() ?? null,
        },
      },
      { status: 409 }
    );
  }

  const orgId = session.organizationId;
  const plan = start.plan;
  onAfterCommit(() => {
    void executeVerify(orgId, plan, deps);
  });
  return Response.json({ window: plan.window.fetch }, { status: 202 });
});
