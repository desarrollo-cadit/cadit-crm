/** DTOs que viajan por la API interna (lado cliente). */

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
  durationWeeks: number | null;
  hoursPerWeek: number | null;
  imageUrl: string | null;
  learningObjectives: string[];
  targetAudience: string | null;
  syllabusUrl: string | null;
  /** 007 — si el curso sale en el catálogo público de la web. */
  published: boolean;
};

/** 005 (DV-005) — profesor como entidad propia. */
export type TeacherDto = {
  id: string;
  name: string;
  /** 005 iteración 2 — costo por hora opcional. */
  hourlyRate: number | null;
  /** 005 iteración 5 — email de contacto (identidad mínima; sin cuenta/login todavía). */
  email: string | null;
  /** 005 iteración 2 — cursos que dicta (teacher_course), para filtrar el selector de cohorte. */
  courseIds: string[];
  /** 005 iteración 5 — true si tiene foto en `/api/teachers/:id/photo`. */
  hasPhoto: boolean;
};

/** 005 (DV-004) — catálogo básico de software (sin lógica de disponibilidad, US4). */
export type SoftwareDto = {
  id: string;
  name: string;
  totalLicenses: number;
  /** 005 iteración 5 — true si tiene foto en `/api/software/:id/photo`. */
  hasPhoto: boolean;
};

/** 005 (DV-009) — empresa para facturación B2B opcional. */
export type CompanyDto = {
  id: string;
  legalName: string;
  taxId: string | null;
};

/** 005 (T008) — cohorte con teacher/software resueltos. */
export type CohortDto = {
  id: string;
  courseId: string;
  courseName: string;
  /** 005 iteración 2 — nombre propio de la cohorte; null = usar courseName. */
  name: string | null;
  startDate: string;
  endDate: string | null;
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
  frequency: string | null;
  classroom: string | null;
  syllabusUrl: string | null;
  capacity: number | null;
  whatsappGroupLink: string | null;
  status: "planificada" | "en_curso" | "finalizada";
  software: { id: string; name: string }[];
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
  /** 005 — cédula/identificación. */
  nationalId: string | null;
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
