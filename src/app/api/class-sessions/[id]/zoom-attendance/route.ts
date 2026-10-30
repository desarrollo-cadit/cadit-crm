import { apiError, parseBody, requireCapability } from "@/lib/api";
import { onAfterCommit } from "@/lib/db/tenant-context";
import { traerSchema } from "@/lib/zoom-attendance-api";
import { zoomEnCursoResponse } from "@/server/zoom/http";
import { attendanceFetchDeps, tomarLease, traerConLease } from "@/server/zoom/attendance-fetch";
import { sugerenciaDeZoom } from "@/server/zoom/attendance-review";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Asistencia sugerida desde Zoom (constitución 1.9.0) — el estado de la
 * traída y la sugerencia de UNA clase. Misma capacidad que pasar lista: la
 * sugerencia es para quien la confirma. Nada de esto viaja a los portales.
 */
export const GET = requireCapability("asistencia.editar", async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const dto = await sugerenciaDeZoom(session.organizationId, id);
  if (!dto) return apiError(404, "not_found", "Clase no encontrada");
  return Response.json(dto);
});

/**
 * "Traer de Zoom" (también para clases pasadas), o elegir la reunión de una
 * traída "ambigua" (`instanceUuid`).
 *
 * Valida y toma el lease DENTRO del pedido (si hay una corrida, 409 sin haber
 * escrito nada); el HTTP a Zoom corre después del commit (`onAfterCommit`),
 * fuera de toda transacción, y nunca toca `attendance`. La pantalla consulta
 * el GET hasta que deja de estar "pendiente".
 */
export const POST = requireCapability("asistencia.editar", async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const conCuerpo = (req.headers.get("content-length") ?? "0") !== "0";
  let instanceUuid: string | undefined;
  if (conCuerpo) {
    const body = await parseBody(req, traerSchema);
    if (!body.ok) return body.response;
    instanceUuid = body.data.instanceUuid;
  }

  const orgId = session.organizationId;
  const deps = attendanceFetchDeps();
  const clase = await deps.store.clase(orgId, id);
  if (!clase) return apiError(404, "not_found", "Clase no encontrada");
  if (clase.canceled) return apiError(422, "clase_cancelada", "La clase está suspendida: no lleva asistencia.");
  if (clase.fetch?.reviewedAt) {
    return apiError(409, "ya_confirmada", "La sugerencia de Zoom de esta clase ya se confirmó.");
  }
  const fin = clase.endsAt ?? new Date(clase.startsAt.getTime() + deps.config.afterFallbackMin * 60_000);
  if (fin.getTime() > deps.now().getTime()) {
    return apiError(
      422,
      "no_termino",
      "La clase todavía no terminó: Zoom tiene el reporte cuando la reunión termina."
    );
  }
  if (instanceUuid && !clase.fetch?.candidates.some((c) => c.uuid === instanceUuid)) {
    return apiError(422, "candidata_invalida", "Esa reunión no es una de las opciones de esta clase.");
  }

  const lease = await tomarLease(orgId, deps);
  if (!lease.ok) {
    return zoomEnCursoResponse(lease.startedAt);
  }
  await deps.store.marcarPendiente(orgId, id, deps.now());
  onAfterCommit(() => {
    void traerConLease(orgId, id, { uuidElegido: instanceUuid }, deps);
  });
  return Response.json({ estado: "pendiente" }, { status: 202 });
});
