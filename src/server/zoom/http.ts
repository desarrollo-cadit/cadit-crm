import type { ConnErrorCode, ConnResult } from "./connections";

/**
 * 030 — El status HTTP de cada resultado tipado de conexiones, dicho UNA vez
 * para las cuatro rutas de Configuración › Zoom.
 *
 * El cuerpo sigue la forma de error de la casa (`{ error: { code, message } }`,
 * `apiError` en `lib/api.ts`); `roomName` viaja junto al error cuando el
 * conflicto es "ese usuario ya hospeda otra aula", para que la pantalla diga cuál.
 */
const STATUS: Record<ConnErrorCode, number> = {
  no_existe: 404,
  cuenta_duplicada: 409,
  nombre_duplicado: 409,
  usuario_ya_vinculado: 409,
  conexion_archivada: 422,
  aula_archivada: 422,
  no_vinculada: 422,
  sin_pmi: 422,
  zoom_error: 502,
};

export function connErrorResponse(result: Extract<ConnResult<unknown>, { ok: false }>): Response {
  return Response.json(
    {
      error: {
        code: result.code,
        message: result.message,
        ...(result.roomName !== undefined ? { roomName: result.roomName } : {}),
      },
    },
    { status: STATUS[result.code] }
  );
}
