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

/**
 * Constitución 1.9.0 — Un tramo del reporte de participantes, MINIMIZADO:
 * sin IP, ubicación, dispositivo ni versión del cliente.
 */
export type ZoomParticipantSegment = {
  /** `id` del participante, o `anon:<nombre>` si Zoom no lo manda. */
  participantId: string;
  /** Vacío para invitados sin sesión y usuarios externos → null. */
  participantUserId: string | null;
  registrantId: string | null;
  name: string;
  /** En minúsculas; casi siempre null para quien no es de la cuenta. */
  email: string | null;
  joinTime: Date;
  leaveTime: Date;
  durationSec: number;
  /** En una sala de grupos (breakout). */
  breakout: boolean;
  /** En la sala de espera: no cuenta minutos. */
  waitingRoom: boolean;
};

/** Una reunión terminada que hospedó un usuario (reporte de reuniones). */
export type ZoomPastMeeting = {
  /** [U] Puede no venir en este reporte: entonces se buscan las instancias. */
  uuid: string | null;
  meetingId: string;
  topic: string | null;
  startTime: Date;
  endTime: Date | null;
  durationMin: number | null;
};

/** Una instancia terminada de un número de reunión. */
export type ZoomPastInstance = { uuid: string; startTime: Date };

export type ZoomErrorCode =
  | "credenciales_invalidas" // token 400/401 (invalid_client)
  | "sin_permiso" // 403 / scope faltante
  | "usuario_inexistente" // 404 / 1001
  | "limite_de_tasa" // 429 tras agotar reintentos
  | "zoom_caido" // 5xx / red tras agotar reintentos
  | "respuesta_invalida" // JSON que no valida
  | "no_terminada" // 404 / 3001: en curso o reporte sin procesar (1.9.0)
  | "fuera_de_plazo"; // 400 / 12702: más de un año (1.9.0)

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
