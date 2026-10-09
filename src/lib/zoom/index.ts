/**
 * 030 — Punto de entrada del adaptador de Zoom. El dominio importa de acá y
 * nunca de los archivos internos.
 */
export { forgetToken, getAccessToken, listUserRecordings, listUsers, zoomBases } from "./client";
export { buildPlayUrl, extractMeetingId } from "./links";
export {
  ZoomError,
  type ZoomCredentials,
  type ZoomErrorCode,
  type ZoomRecordingMeeting,
  type ZoomUser,
} from "./types";
