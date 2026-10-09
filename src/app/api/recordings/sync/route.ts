import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { onAfterCommit } from "@/lib/db/tenant-context";
import { getSyncStatus } from "@/server/zoom/recordings";
import { executeSync, startSync, syncDeps } from "@/server/zoom/sync";

export const dynamic = "force-dynamic";

/** 030 US1 — Estado: corriendo desde…, última corrida por conexión, intervalo. */
export const GET = requireCapability("grabaciones.ver", async (session) => {
  return Response.json(await getSyncStatus(session.organizationId));
});

const bodySchema = z.object({ connectionId: z.string().min(1).optional() }).strict();

/**
 * 030 US1 — "Sincronizar".
 *
 * Toma el lease y crea las corridas DENTRO del pedido (transacción corta):
 * si ya hay una corrida, 409 sin haber escrito nada. La corrida en sí —HTTP a
 * Zoom, minutos quizás— se agenda con `onAfterCommit`: corre fuera de la
 * transacción, abre su propio alcance por página y NUNCA lanza hacia el
 * pedido, que ya respondió 202.
 */
export const POST = requireCapability("grabaciones.gestionar", async (session, req: Request) => {
  // Body opcional: sin cuerpo = todas las conexiones activas.
  const conCuerpo = (req.headers.get("content-length") ?? "0") !== "0";
  let connectionId: string | undefined;
  if (conCuerpo) {
    const body = await parseBody(req, bodySchema);
    if (!body.ok) return body.response;
    connectionId = body.data.connectionId;
  }

  const deps = syncDeps();
  const start = await startSync(
    session.organizationId,
    "manual",
    { connectionId, userId: session.userId },
    deps
  );
  if (!start.ok && start.error === "sin_conexiones") {
    return apiError(422, "sin_conexiones", "No hay ninguna conexión de Zoom activa para sincronizar.");
  }
  if (!start.ok) {
    return Response.json(
      {
        error: {
          code: "sync_en_curso",
          message: "Ya hay una sincronización corriendo.",
          startedAt: start.startedAt?.toISOString() ?? null,
        },
      },
      { status: 409 }
    );
  }

  const orgId = session.organizationId;
  const plan = start.plan;
  onAfterCommit(() => {
    void executeSync(orgId, plan, deps);
  });
  return Response.json({ runIds: plan.runs.map((r) => r.runId) }, { status: 202 });
});
