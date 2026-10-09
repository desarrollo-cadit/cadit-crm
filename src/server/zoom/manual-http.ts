import { apiError } from "@/lib/api";
import type { ManualResult } from "./assignment";
import { getRecordingRowDto } from "./recordings";

/**
 * 030 US3 — Del resultado tipado de una operación manual a la respuesta HTTP,
 * dicho una vez para asignar, desasignar y volver a automático. Con éxito se
 * devuelve la fila actualizada (la pantalla la reemplaza sin recargar todo).
 */
export async function manualResponse(orgId: string, recordingId: string, r: ManualResult): Promise<Response> {
  if (r.ok) {
    const row = await getRecordingRowDto(orgId, recordingId);
    return row ? Response.json(row) : apiError(404, "no_existe", "Grabación no encontrada.");
  }
  switch (r.reason) {
    case "no_existe":
      return apiError(404, "no_existe", "No encontramos la grabación o la clase.");
    case "clase_cancelada":
      return apiError(422, "clase_cancelada", "La clase está cancelada: no lleva grabación.");
    case "sin_enlace":
      return apiError(422, "sin_enlace", "Zoom todavía no dio el enlace de esta grabación.");
    case "ya_automatica":
      return apiError(422, "ya_automatica", "La grabación ya se adjudica automáticamente.");
    case "requiere_reemplazo":
      return Response.json(
        {
          error: {
            code: "requiere_reemplazo",
            message:
              r.current.kind === "manual"
                ? "La clase ya tiene un enlace de grabación cargado a mano."
                : "La clase ya tiene otra grabación de Zoom.",
            current: r.current,
          },
        },
        { status: 409 }
      );
  }
}
