/**
 * 030 — Punto de entrada del adaptador de Zoom. El dominio importa de acá y
 * nunca de los archivos internos.
 */
export {
  encodeMeetingUuid,
  forgetToken,
  getAccessToken,
  listMeetingParticipants,
  listPastInstances,
  listUserPastMeetings,
  listUserRecordings,
  listUsers,
  recordingRangeChunks,
  SCOPES_POR_FAMILIA,
  type ZoomPermisos,
  zoomBases,
} from "./client";
export { buildPlayUrl, extractMeetingId } from "./links";
export {
  ZoomError,
  type ZoomCredentials,
  type ZoomErrorCode,
  type ZoomPastInstance,
  type ZoomPastMeeting,
  type ZoomParticipantSegment,
  type ZoomRecordingMeeting,
  type ZoomUser,
} from "./types";
