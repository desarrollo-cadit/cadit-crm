/** DTOs que viajan por la API interna (lado cliente). */
import type { CourseKind } from "@/lib/course-kind";
import type { CompanyFields } from "@/lib/company";
import type { ProgresoDeCursada } from "@/lib/cohort-progress";

export type ConversationDto = {
  id: string;
  contact: { id: string; name: string; phone: string | null };
  stageName: string | null;
  aiEnabled: boolean;
  handoffAt: string | null;
  handoffReason: string | null;
  lastInboundAt: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  windowOpen: boolean;
  windowRemainingMs: number;
  preview: string | null;
  /** 029 — la última derivación a un área (chip de la lista), o null. */
  lastAreaHandoff?: { area: "ventas" | "soporte"; status: string } | null;
};

/** 008 — Adjunto de un mensaje, para previsualización en el hilo. */
export type MessageMediaDto = {
  assetId: string;
  kind:
    | "image"
    | "video"
    | "audio"
    | "document"
    | "sticker"
    | "location"
    | "contacts";
  mimeType: string | null;
  fileName: string | null;
  fileSize: number | null;
  caption: string | null;
  fetchStatus: "available" | "pending" | "failed";
  /** location {latitude, longitude, name?, address?} / contacts (subset). */
  payload: unknown;
};

export type MessageDto = {
  id: string;
  conversationId: string;
  direction: "in" | "out";
  type: string;
  text: string | null;
  status: "pending" | "sent" | "delivered" | "read" | "failed";
  aiGenerated: boolean;
  /** 008 — Origen del saliente (en entrantes viene 'operator' y se ignora). */
  origin: "ai" | "operator" | "manual" | "template";
  media: MessageMediaDto | null;
  createdAt: string;
};

export type TemplateDto = {
  id: string;
  name: string;
  language: string;
  category: string;
  body: string;
  status: "draft" | "pending" | "approved" | "rejected";
  rejectionReason: string | null;
};

export type StageDto = {
  id: string;
  name: string;
  position: number;
  kind: "open" | "won" | "lost";
};

/** 005 — Catálogo de cursos (Fase 1, sin cambios de forma). */
/** 006 — categoría del catálogo, para filtrar en el sitio comercial. */
export type CourseCategoryDto = {
  id: string;
  name: string;
  slug: string;
};

/** Mismas uniones que el schema y que `courseContentSchema` (no `string`). */
export type CourseLevel = "inicial" | "intermedio" | "avanzado";
export type CourseModality = "en_vivo" | "asincronico" | "presencial";

export type CourseDto = {
  id: string;
  name: string;
  description: string | null;
  /* 006 — ficha comercial que consume el sitio externo vía /api/public/courses. */
  slug: string;
  tagline: string | null;
  categoryId: string | null;
  level: CourseLevel | null;
  modality: CourseModality | null;
  /** Duración del curso (`src/lib/course-duration.ts`); horas con decimales. */
  classCount: number | null;
  hoursPerClass: number | null;
  totalHours: number | null;
  imageUrl: string | null;
  learningObjectives: string[];
  targetAudience: string | null;
  syllabusUrl: string | null;
  /** 007 — si el curso sale en el catálogo público de la web. */
  published: boolean;
  /**
   * 028 fase 5 — si el curso ENTREGA certificado. Gobierna la emisión y nada
   * más: un curso que no certifica se cursa y se aprueba igual, y su
   * aprobación sigue contando para el certificado general de una
   * especialización.
   */
  grantsCertificate: boolean;
  /** 046 US8 (FR-029) — "Gratuito: no cuenta como venta". */
  isFree: boolean;
  /** 038 (FR-012) — el párrafo del certificado; `null` = sin párrafo. */
  certificateDescription: string | null;
  /** 032 (FR-001) — curso, módulo o taller. */
  kind: CourseKind;
  /** 009/010 — asistencia mínima por defecto de sus cohortes. */
  minAttendancePct: number | null;
};

/** 005 (DV-005) — profesor como entidad propia. */
export type TeacherDto = {
  id: string;
  name: string;
  /**
   * 005 iteración 2 — costo por hora opcional.
   * 040 (DV-009) — AUSENTE (no `null`) sin `academico.editar` ni
   * `cobranza.ver`: es plata y no viaja al rol Ventas.
   */
  hourlyRate?: number | null;
  /** 005 iteración 5 — email de contacto (identidad mínima; sin cuenta/login todavía). */
  email: string | null;
  /**
   * 023 — Título profesional ("Arquitecto"), texto libre. Va al catálogo
   * PÚBLICO junto con la foto: quien mira una cohorte en la web quiere saber
   * quién se la dicta.
   */
  title: string | null;
  /** 005 iteración 2 — cursos que dicta (teacher_course), para filtrar el selector de cohorte. */
  courseIds: string[];
  /** 005 iteración 5 — true si tiene foto en `/api/teachers/:id/photo`. */
  hasPhoto: boolean;
};

/** 005 (DV-004) — catálogo básico de software. 0089: el cupo es por equipo, no del programa. */
export type SoftwareDto = {
  id: string;
  name: string;
  /** 005 iteración 5 — true si tiene foto en `/api/software/:id/photo`. */
  hasPhoto: boolean;
};

/**
 * 005 (DV-009) — empresa para facturación B2B opcional.
 * 040 (FR-004) — con sus datos de facturación (`CompanyFields`).
 */
export type CompanyDto = { id: string } & CompanyFields;

/** 005 (T008) — cohorte con teacher/software resueltos. */
export type CohortDto = {
  id: string;
  courseId: string;
  courseName: string;
  /** 032 (FR-013) — el tipo del curso de la cohorte. */
  courseKind: CourseKind;
  /** 005 iteración 2 — nombre propio de la cohorte; null = usar courseName. */
  name: string | null;
  startDate: string;
  endDate: string | null;
  /** 0083 — La entrega final del grupo (día). `null` = sin entrega final. */
  deliveryDeadline?: string | null;
  /** 0087 — Valores efectivos (solo un taller cursable puede ser `false`). */
  hasAssessments?: boolean;
  issuesCertificate?: boolean;
  /** 005 iteración 2 — horario "HH:MM" para el calendario; frequency queda como texto libre. */
  startTime: string | null;
  endTime: string | null;
  /** 005 iteración 4 — CSV "0,2" (lunes=0..domingo=6); null = todos los días del rango. */
  daysOfWeek: string | null;
  /** Referencia mínima del profesor asignado (no el TeacherDto completo con courseIds/hourlyRate). */
  teacher: { id: string; name: string } | null;
  cost: number | null;
  /** 007 — de qué moneda es `cost`. */
  currency: "UYU" | "PYG" | "USD";
  /** 009/010 — asistencia mínima para aprobar; null = hereda del curso. */
  minAttendancePct: number | null;
  frequency: string | null;
  classroom: string | null;
  syllabusUrl: string | null;
  capacity: number | null;
  whatsappGroupLink: string | null;
  /**
   * 025 — El enlace de la reunión RECURRENTE de la cohorte, que es el que ve
   * el alumno. El aula NO lo aporta: es la cuenta de Zoom y su sala es
   * compartida entre las cohortes que la usan.
   */
  meetingUrl: string | null;
  /** 023 (FR-002) — Aula virtual de la cohorte; sus clases la heredan. */
  virtualRoomId: string | null;
  /**
   * 028 (FR-001) — La camada de la especialización de la que esta cohorte es
   * MÓDULO. `null` = cohorte suelta, que es el caso de las 33 simples.
   */
  parentCohortId: string | null;
  /**
   * 028 (FR-002) — El orden del módulo dentro de su programa. Es una CLAVE DE
   * ORDEN, no una etiqueta: viaja para poder editarla, y lo que se muestra es
   * el ordinal derivado del lugar en la lista. Sin padre no significa nada.
   */
  position: number | null;
  /**
   * 028 (seguimiento) — La cohorte ES una especialización (la madre de un
   * programa de módulos). Explícito: decide la pestaña, el formulario y quién
   * puede ser madre de quién.
   */
  isSpecialization: boolean;
  status: "planificada" | "en_curso" | "finalizada";
  /** 039 — Cuándo se confirmó ("la cohorte sale"); null = sin confirmar. */
  confirmedAt: string | null;
  /**
   * Lo que se dibuja de la confirmación (`marcaDeConfirmacion`):
   * `sin_confirmar_vencido` = llegó el día de inicio sin confirmar (rojo).
   */
  confirmationFlag: "confirmado" | "sin_confirmar" | "sin_confirmar_vencido";
  software: { id: string; name: string }[];
  /**
   * 2026-10-26 — Solo en el LISTADO (`listCohorts`), calculado en lote.
   * "Clase X de Y" (`progresoDeCursada`): `null` = sin cronograma generado.
   */
  progress?: ProgresoDeCursada | null;
  /**
   * 2026-10-26 — Solo en el listado: inscriptos activos (contacto sin dar de
   * baja), el mismo criterio con el que el roster marca a los dados de baja.
   */
  enrolledCount?: number;
};

export type ContactDto = {
  id: string;
  /** 005 iteración 6 — reemplaza el `name` único de antes. */
  firstName: string;
  /** null: contactos de WhatsApp/formulario público solo traen un string. */
  lastName: string | null;
  /** null en contactos que llegaron solo con BSUID (003). */
  phone: string | null;
  notes: string | null;
  /** 004 — de dónde llegó el contacto (texto libre), si se conoce. */
  source: string | null;
  /** 004 — campaña de origen (UTM), si se conoce. */
  utmCampaign: string | null;
  /** 005 — único por organización cuando no es null (DV-003). */
  email: string | null;
  /** 2026-10-26 — Segundo correo: se busca y se chequea, nunca es un destino. */
  secondaryEmail: string | null;
  /** 005 — cédula/identificación. */
  nationalId: string | null;
  /** 043 — La empresa de la persona (`contact.company_id`), no la de una venta. */
  companyId: string | null;
  /** 046 US7 — Derivado del historial comercial (solo en el listado). */
  tipo?: "lead" | "alumno_activo" | "exalumno";
  archivedAt: string | null;
  /** Iteración 3 — para la columna "Creado" de la tabla de contactos. */
  createdAt: string;
};

/** Iteración 3 — formulario personalizado de captación (settings/forms). */
export type IntakeFormDto = {
  id: string;
  name: string;
  courseId: string | null;
  courseName: string | null;
  createdAt: string;
};
