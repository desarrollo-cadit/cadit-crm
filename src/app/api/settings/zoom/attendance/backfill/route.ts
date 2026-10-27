import { requireCapability } from "@/lib/api";
import { onAfterCommit } from "@/lib/db/tenant-context";
import { zoomEnCursoResponse } from "@/server/zoom/http";
import { attendanceFetchDeps, procesarColaConLease, tomarLease } from "@/server/zoom/attendance-fetch";

export const dynamic = "force-dynamic";

/** Tope por corrida del botón: lo que quede lo sigue la periódica (o el botón otra vez). */
const MAX_POR_CORRIDA = 1000;

/**
 * "Buscar sugerencias para clases pasadas sin asistencia" (decisión del
 * dueño, 2026-10-27).
 *
 * Toma el lease y encola DENTRO del pedido (409 si hay una corrida de Zoom;
 * re-encolar no duplica: una fila por clase). Las clases de más de un año
 * quedan "fuera de plazo" sin llamar a Zoom; las que ya tienen asistencia
 * nunca se encolan. El HTTP a Zoom corre después del commit, de a una clase
 * y con pausa, y libera el lease al terminar.
 */
export const POST = requireCapability("configuracion.editar", async (session) => {
  const orgId = session.organizationId;
  const deps = attendanceFetchDeps();
  const lease = await tomarLease(orgId, deps);
  if (!lease.ok) {
    return zoomEnCursoResponse(lease.startedAt);
  }
  const encolado = await deps.store.encolar(orgId, deps.now(), deps.config.delayMin);
  onAfterCommit(() => {
    void procesarColaConLease(orgId, { max: MAX_POR_CORRIDA, encolar: false }, deps);
  });
  return Response.json(encolado, { status: 202 });
});
