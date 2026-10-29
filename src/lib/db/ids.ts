import { customAlphabet } from "nanoid";

const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
const nano = customAlphabet(alphabet, 20);

const prefixes = {
  organization: "org",
  member: "mem",
  contact: "ct",
  conversation: "cv",
  message: "msg",
  course: "crs",
  cohort: "coh",
  enrollment: "enr",
  license: "lic",
  automationRule: "arule",
  stage: "stg",
  credentials: "cred",
  agentProfile: "agp",
  kbEntry: "kb",
  template: "tpl",
  testRun: "run",
  testCase: "case",
  mediaAsset: "ma",
  // 005 — gestión académica operativa (research.md DV-011)
  software: "sw",
  teacher: "tch",
  company: "cia",
  // 005 iteración 3 — formularios personalizados de captación (intake).
  intakeForm: "frm",
  // 006 — contenido comercial del curso (catálogo público).
  courseCategory: "cat",
  courseModule: "mod",
  // 008 — cobranza: la cuota que se debe y el pago que entró.
  installment: "inst",
  payment: "pay",
  // 009 — clases dictadas y asistencia por alumno.
  classSession: "cls",
  attendance: "att",
  // 010 — evaluaciones, sus resultados y el certificado.
  assessment: "asm",
  assessmentResult: "res",
  certificate: "cert",
  // 012 — identidad de portal (alumno/profesor) y roles de staff configurables.
  accountLink: "alk",
  role: "rol",
  // 013 — material de cursada (enlaces, no archivos) y avisos por cohorte.
  resource: "res",
  announcement: "anc",
  // 023 — las salas de reunión de la academia (las cuentas de Zoom).
  virtualRoom: "aula",
  // 016 — la entrega del alumno (un ENLACE, nunca un archivo) y la prórroga
  // individual que le corre el plazo a UNA persona en UNA evaluación.
  submission: "sub",
  assessmentExtension: "ext",
  /** 0083 — el pedido de prórroga del alumno (Coordinación lo decide). */
  assessmentExtensionRequest: "exr",
  // cursos-offline — the LearnDash content library, its quizzes, the attempts
  // and who can read each course.
  offlineCourse: "ocrs",
  offlineLesson: "oles",
  offlineTopic: "otop",
  offlineQuiz: "oqz",
  offlineQuestion: "oqst",
  offlineAnswer: "oans",
  offlineQuizAttempt: "oatt",
  offlineCourseAccess: "oacc",
  // 043 — acceso directo de una persona a un curso offline (sin inscripción).
  offlineCourseGrant: "ogr",
  offlineTopicProgress: "otpg",
  // A course or lesson completed in the previous LMS, recognized by staff.
  offlineRecognition: "orec",
  // 2026-10-05 — envío masivo por cohorte: la corrida y cada destinatario.
  bulkSendRun: "bsr",
  bulkSendRecipient: "bsrr",
  // 2026-10-06 — quien vende, use o no el panel (comisiones).
  seller: "sel",
  // 2026-10-07 — el registro de actividad (hoy: ingresos al portal).
  activityLog: "act",
  // 029 — agente por áreas: configuración, caso derivado y cada correo del caso.
  areaConfig: "ac",
  areaHandoff: "ah",
  areaHandoffEmail: "ahe",
  // 030 — grabaciones de Zoom: la conexión, cada grabación y cada corrida.
  zoomConnection: "zc",
  zoomRecording: "zr",
  zoomSyncRun: "zsr",
  // 0080 — asistencia sugerida desde Zoom: la traída por clase, cada tramo
  // crudo y cada nombre aprendido.
  zoomAttendanceFetch: "zaf",
  zoomParticipantSegment: "zps",
  zoomParticipantAlias: "zal",
  // 031 — cada versión de la corrección de un alumno en una evaluación.
  correction: "cor",
  // 033 — lo propio de una persona anotada a un taller (1:1 con su inscripción).
  workshopRegistration: "wreg",
  // 034 — los recesos (días sin clase) y "esta persona no cursa este módulo".
  recess: "rcs",
  moduleExclusion: "mex",
  /** 035 — programa asignado a todo el grupo de una cohorte. */
  cohortGroupSoftware: "cgs",
  /** 039 — cada aviso interno por correo de una cohorte (Soporte, Administración). */
  staffNotice: "stn",
  /** 0066 — cada envío de un formulario público y cada nota o contacto del equipo. */
  contactFormSubmission: "cfs",
  contactActivity: "cact",
  /** 045 — campañas de marketing por correo (data-model, encabezado). */
  marketingSettings: "mks",
  marketingAudience: "mka",
  marketingCampaign: "mkc",
  marketingCampaignRecipient: "mkr",
  marketingCampaignLink: "mkl",
  marketingClick: "mkk",
  marketingUnsubscribe: "mku",
  marketingImage: "mki",
  /** 046 — rutas entre cursos (curso → cursos siguientes recomendados). */
  courseRoute: "crr",
  /** 046 US6 — importaciones de historial y cursadas históricas. */
  historicalImportBatch: "hib",
  historicalCourseTaking: "hct",
  /** 0084 — evaluaciones modelo de un curso y correos al alumno sobre sus evaluaciones. */
  courseAssessmentTemplate: "casm",
  assessmentNotice: "asn",
  /** 0086 — el resultado final de una cursada, confirmado por una persona. */
  enrollmentFinalResult: "efr",
} as const;

export type IdKind = keyof typeof prefixes;

export function newId(kind: IdKind): string {
  return `${prefixes[kind]}_${nano()}`;
}
