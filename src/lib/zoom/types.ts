/**
 * 030 (contrato zoom-adapter.md) — Los tipos PROPIOS con los que el dominio
 * habla de Zoom. Nada fuera de `src/lib/zoom` conoce la forma del JSON de Zoom:
 * el adaptador la traduce a esto.
 */

export type ZoomCredentials = {
  /** Llave del caché de token. */
  connectionId: string;
  accountId: string;
  clientId: string;
  /** Ya descifrado por el llamador; nunca se loguea. */
  clientSecret: string;
};

export type ZoomUser = {
  id: string;
  email: string;
  displayName: string;
  type: number;
  status: string;
  /**
   * Número de la sala personal (PMI), como texto: es un número de reunión, no
   * una cantidad. `null` si Zoom no lo informa.
   */
  pmi: string | null;
};

export type ZoomRecordingMeeting = {
  /** Instancia de la reunión — llave de idempotencia. */
  uuid: string;
  /** Número de reunión (`id`), como texto. */
  meetingId: string;
  hostId: string;
  hostEmail: string | null;
  topic: string | null;
  /** UTC. */
  startTime: Date;
  durationMin: number | null;
  totalSizeBytes: number | null;
  fileCount: number | null;
  shareUrl: string | null;
  /** `recording_play_passcode`. */
  playPasscode: string | null;
  /** `password`. */
  password: string | null;
  /** YYYY-MM-DD. */
  autoDeleteDate: string | null;
  /**
   * Tipos de archivo de la grabación (`MP4`, `TRANSCRIPT`, `CC`…), en
   * mayúsculas, sin repetir y ordenados. Son METADATOS: el CRM no descarga
   * ningún archivo (constitución 1.6.0).
   */
  fileTypes: string[];
};

export type ZoomErrorCode =
  | "credenciales_invalidas" // token 400/401 (invalid_client)
  | "sin_permiso" // 403 / scope faltante
  | "usuario_inexistente" // 404 / 1001
  | "limite_de_tasa" // 429 tras agotar reintentos
  | "zoom_caido" // 5xx / red tras agotar reintentos
  | "respuesta_invalida"; // JSON que no valida

/**
 * `message` es SIEMPRE un texto propio en castellano: nunca incluye el
 * secreto, el token, el header de autorización ni el cuerpo crudo de Zoom.
 */
export class ZoomError extends Error {
  constructor(
    readonly code: ZoomErrorCode,
    message: string
  ) {
    super(message);
    this.name = "ZoomError";
  }
}
