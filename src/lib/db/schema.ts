import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/* ============================================================
 * Auth (Better Auth + plugin organization)
 * ============================================================ */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  activeOrganizationId: text("active_organization_id"),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const organization = pgTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").unique(),
  logo: text("logo"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  metadata: text("metadata"),
});

export const member = pgTable("member", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const invitation = pgTable("invitation", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role"),
  status: text("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at").notNull(),
  inviterId: text("inviter_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

/* ============================================================
 * Dominio (toda tabla lleva organization_id NOT NULL + índice org-first)
 * ============================================================ */

export const contact = pgTable(
  "contact",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /**
     * Llave de resolución WhatsApp (003): teléfono normalizado (521→52) o
     * `bsuid:<id>` cuando Meta no manda wa_id. Estable de por vida.
     */
    waIdentity: text("wa_identity").notNull(),
    /** Teléfono como ATRIBUTO opcional (003): falta en contactos BSUID. */
    phone: text("phone"),
    /** Business-Scoped User ID si se conoce (003). */
    waUserId: text("wa_user_id"),
    name: text("name").notNull(),
    notes: text("notes"),
    /** 004 — de dónde llegó el contacto (texto libre, p. ej. "feria-2026"). */
    source: text("source"),
    /** 004 — campaña de origen (UTM), opcional. */
    utmCampaign: text("utm_campaign"),
    /** 005 — único por organización cuando no es NULL (DV-003). */
    email: text("email"),
    /** 005 — cédula/identificación, sin constraint de unicidad (spec.md). */
    nationalId: text("national_id"),
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("contact_org_wa_identity_uq").on(t.organizationId, t.waIdentity),
    index("contact_org_wa_user_id_idx").on(t.organizationId, t.waUserId),
    index("contact_org_name_idx").on(t.organizationId, t.name),
    // 005 (DV-003) — unicidad de email/celular por organización, cuando no es NULL.
    uniqueIndex("contact_org_email_uq")
      .on(t.organizationId, t.email)
      .where(sql`${t.email} IS NOT NULL`),
    uniqueIndex("contact_org_phone_uq")
      .on(t.organizationId, t.phone)
      .where(sql`${t.phone} IS NOT NULL`),
  ]
);

export const pipelineStage = pgTable(
  "pipeline_stage",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull(),
    /** open = etapa normal · won / lost = anclas no borrables */
    kind: text("kind", { enum: ["open", "won", "lost"] })
      .notNull()
      .default("open"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("stage_org_pos_idx").on(t.organizationId, t.position)]
);

/** 005 — Docente que dicta camadas (DV-005: entidad propia, no texto libre). */
export const teacher = pgTable(
  "teacher",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** 005 iteración 2 — costo por hora opcional (moneda entera, DV-008). */
    hourlyRate: integer("hourly_rate"),
    /**
     * 005 iteración 5 (feedback en vivo: "que los profesores sean usuarios")
     * — email de contacto, identidad mínima. NO crea cuenta/login: eso queda
     * explícitamente para más adelante ("pensaremos cómo verán el
     * dashboard"), decisión confirmada con el dueño del producto.
     */
    email: text("email"),
    /**
     * 005 iteración 5 — foto opcional, en disco local (MEDIA_DIR, mismo
     * patrón que los adjuntos de WhatsApp — constitución II: sin S3/R2).
     * `photoMimeType` NULL = sin foto.
     */
    photoMimeType: text("photo_mime_type"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("teacher_org_idx").on(t.organizationId)]
);

/**
 * 005 — Catálogo de software con licencias limitadas (Revit, Civil3D...).
 * Disponibles = total_licenses - count(license asignadas de este software).
 */
export const software = pgTable(
  "software",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    totalLicenses: integer("total_licenses").notNull().default(0),
    /** 005 iteración 5 — foto opcional del producto, mismo patrón que teacher. */
    photoMimeType: text("photo_mime_type"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("software_org_idx").on(t.organizationId)]
);

/** 005 — Empresa para facturación B2B opcional de una inscripción (DV-009). */
export const company = pgTable(
  "company",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    legalName: text("legal_name").notNull(),
    taxId: text("tax_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("company_org_idx").on(t.organizationId)]
);

/**
 * 004 — Catálogo de cursos que dicta el área de capacitaciones (p. ej. "Revit").
 */
export const course = pgTable(
  "course",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("course_org_idx").on(t.organizationId)]
);

/**
 * 005 iteración 2 — Puente N:N: qué curso(s) dicta un profesor. Sin `id`
 * propio, mismo patrón que `cohort_software`. Usado para filtrar el selector
 * de profesor de una camada por curso (feedback en vivo del dueño).
 */
export const teacherCourse = pgTable(
  "teacher_course",
  {
    teacherId: text("teacher_id")
      .notNull()
      .references(() => teacher.id, { onDelete: "cascade" }),
    courseId: text("course_id")
      .notNull()
      .references(() => course.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.teacherId, t.courseId] }),
    index("teacher_course_course_idx").on(t.courseId),
  ]
);

/**
 * 004 — Camada: una edición concreta de un `course`, con fechas y profesor
 * propios. Varias camadas pueden compartir curso.
 */
export const cohort = pgTable(
  "cohort",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    courseId: text("course_id")
      .notNull()
      .references(() => course.id, { onDelete: "restrict" }),
    /** 005 iteración 2 — nombre propio de la camada; NULL = usar course.name. */
    name: text("name"),
    startDate: timestamp("start_date").notNull(),
    endDate: timestamp("end_date"),
    /** 005 (DV-005) — reemplaza el `professor` texto libre de 004. */
    teacherId: text("teacher_id").references(() => teacher.id, {
      onDelete: "set null",
    }),
    /** 005 — moneda entera, mismo criterio que enrollment.amount (DV-008). */
    cost: integer("cost"),
    /** 005 — horario en texto libre, ej. "lunes y miércoles 18:30-20:30". */
    frequency: text("frequency"),
    /** 005 iteración 2 — horario de inicio/fin en texto "HH:MM", para el calendario. */
    startTime: text("start_time"),
    endTime: text("end_time"),
    /**
     * 005 iteración 4 — qué días de la semana dicta esta camada dentro de
     * [start_date, end_date], para poder dibujarla en el calendario semanal
     * (antes aparecía TODOS los días del rango, fines de semana incluidos).
     * CSV de índices 0=lunes..6=domingo (mismo orden que WEEKDAYS del
     * calendario); NULL = sin días específicos declarados (se sigue
     * mostrando en cada día del rango, comportamiento anterior).
     */
    daysOfWeek: text("days_of_week"),
    classroom: text("classroom"),
    syllabusUrl: text("syllabus_url"),
    capacity: integer("capacity"),
    whatsappGroupLink: text("whatsapp_group_link"),
    status: text("status", {
      enum: ["planificada", "en_curso", "finalizada"],
    })
      .notNull()
      .default("planificada"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("cohort_org_course_idx").on(t.organizationId, t.courseId),
    index("cohort_teacher_idx").on(t.teacherId),
  ]
);

/**
 * 005 — Puente N:N: qué software(s) declara usar una camada (DV-004,
 * FR-006). Sin `id` propio, es una tabla puente pura.
 */
export const cohortSoftware = pgTable(
  "cohort_software",
  {
    cohortId: text("cohort_id")
      .notNull()
      .references(() => cohort.id, { onDelete: "cascade" }),
    softwareId: text("software_id")
      .notNull()
      .references(() => software.id, { onDelete: "restrict" }),
  },
  (t) => [
    primaryKey({ columns: [t.cohortId, t.softwareId] }),
    index("cohort_software_software_idx").on(t.softwareId),
  ]
);

/**
 * 004 — Reemplaza a `lead`. `cohort_id` NULL = lead general de ventas de la
 * academia (mismo rol que el `lead` de antes, sin cambio de comportamiento);
 * con `cohort_id` asignada, es la inscripción a esa camada puntual. Un mismo
 * contacto puede tener su lead general Y N inscripciones a camadas distintas.
 */
export const enrollment = pgTable(
  "enrollment",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    contactId: text("contact_id")
      .notNull()
      .references(() => contact.id, { onDelete: "cascade" }),
    cohortId: text("cohort_id").references(() => cohort.id, {
      onDelete: "restrict",
    }),
    stageId: text("stage_id")
      .notNull()
      .references(() => pipelineStage.id),
    position: integer("position").notNull().default(0),
    enrolledAt: timestamp("enrolled_at"),
    lastActivityAt: timestamp("last_activity_at"),
    /** 005 — datos comerciales (DV-008, FR-009). */
    amount: integer("amount"),
    installments: integer("installments"),
    paymentNotes: text("payment_notes"),
    /** 005 — cédula del contacto al momento de inscribir. */
    nationalId: text("national_id"),
    invoiceNumber: text("invoice_number"),
    receiptNumber: text("receipt_number"),
    /** 005 — vendedor; validado en servidor como miembro de la org (DV-008). */
    sellerId: text("seller_id").references(() => user.id, {
      onDelete: "set null",
    }),
    /** 005 — facturación B2B opcional (DV-009). */
    companyId: text("company_id").references(() => company.id, {
      onDelete: "restrict",
    }),
    /** 005 — checklist de onboarding de soporte (DV-007, FR-013). */
    termsEmailSentAt: timestamp("terms_email_sent_at"),
    softwareInstalledAt: timestamp("software_installed_at"),
    hadOwnLicense: boolean("had_own_license").notNull().default(false),
    academiaOnlineAccessAt: timestamp("academia_online_access_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    // Una inscripción por contacto y camada (cuando hay camada asignada).
    uniqueIndex("enrollment_contact_cohort_uq")
      .on(t.contactId, t.cohortId)
      .where(sql`${t.cohortId} IS NOT NULL`),
    // Un solo lead general (sin camada) por contacto — reemplaza lead_contact_uq.
    uniqueIndex("enrollment_contact_general_uq")
      .on(t.contactId)
      .where(sql`${t.cohortId} IS NULL`),
    index("enrollment_org_stage_idx").on(t.organizationId, t.stageId, t.position),
    index("enrollment_org_cohort_idx").on(t.organizationId, t.cohortId),
    index("enrollment_seller_idx").on(t.sellerId),
    index("enrollment_company_idx").on(t.companyId),
  ]
);

/** 004 — Licencia de software asociada (0 o 1) a una inscripción. */
export const license = pgTable(
  "license",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    enrollmentId: text("enrollment_id")
      .notNull()
      .unique()
      .references(() => enrollment.id, { onDelete: "cascade" }),
    /** 005 (DV-004) — de qué software del catálogo es esta licencia. */
    softwareId: text("software_id")
      .notNull()
      .references(() => software.id, { onDelete: "restrict" }),
    assigned: boolean("assigned").notNull().default(false),
    assignedAt: timestamp("assigned_at"),
    expiresAt: timestamp("expires_at"),
  },
  (t) => [
    index("license_org_idx").on(t.organizationId),
    index("license_software_idx").on(t.softwareId),
  ]
);

/**
 * 004 — Regla de automatización (evento → canal → plantilla). Solo modelo en
 * esta fase; sin lógica de disparo (Fase 4/7).
 */
export const automationRule = pgTable(
  "automation_rule",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    triggerEvent: text("trigger_event", {
      enum: ["enrollment_created", "license_assigned", "cohort_starts_soon"],
    }).notNull(),
    channel: text("channel", { enum: ["email", "whatsapp"] }).notNull(),
    templateId: text("template_id"),
    templateBody: text("template_body"),
    active: boolean("active").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("automation_rule_org_idx").on(t.organizationId)]
);

export const conversation = pgTable(
  "conversation",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    contactId: text("contact_id")
      .notNull()
      .references(() => contact.id, { onDelete: "cascade" }),
    /** Conversación del Laboratorio: jamás toca la API de WhatsApp. */
    isTest: boolean("is_test").notNull().default(false),
    aiEnabled: boolean("ai_enabled").notNull().default(true),
    handoffAt: timestamp("handoff_at"),
    handoffReason: text("handoff_reason", {
      // 008: manual_reply = el dueño respondió desde la app del teléfono.
      enum: ["cliente", "modelo", "error", "ventana", "manual_reply"],
    }),
    lastInboundAt: timestamp("last_inbound_at"),
    lastMessageAt: timestamp("last_message_at"),
    unreadCount: integer("unread_count").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    // Una conversación real por contacto; las de prueba no compiten.
    uniqueIndex("conversation_org_contact_real_uq")
      .on(t.organizationId, t.contactId)
      .where(sql`${t.isTest} = false`),
    index("conversation_org_last_idx").on(t.organizationId, t.lastMessageAt),
  ]
);

export const message = pgTable(
  "message",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    /** ID de WhatsApp — UNIQUE (idempotencia). Nullable en salientes de prueba. */
    waMessageId: text("wa_message_id").unique(),
    direction: text("direction", { enum: ["in", "out"] }).notNull(),
    type: text("type").notNull().default("text"),
    text: text("text"),
    status: text("status", {
      enum: ["pending", "sent", "delivered", "read", "failed"],
    })
      .notNull()
      .default("pending"),
    error: text("error"),
    aiGenerated: boolean("ai_generated").notNull().default(false),
    /**
     * 008 — Origen del saliente: IA (bot), operador del CRM, manual desde la
     * app de WhatsApp Business del teléfono (echo), o plantilla. En entrantes
     * queda el default y la UI lo ignora.
     */
    origin: text("origin", {
      enum: ["ai", "operator", "manual", "template"],
    })
      .notNull()
      .default("operator"),
    /** 008 — Adjunto del mensaje (imagen, doc, ubicación…), si lo hay. */
    mediaAssetId: text("media_asset_id").references(() => mediaAsset.id, {
      onDelete: "set null",
    }),
    waTimestamp: timestamp("wa_timestamp"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("message_org_conv_idx").on(
      t.organizationId,
      t.conversationId,
      t.createdAt
    ),
  ]
);

/**
 * 008 — Adjuntos: archivo (imagen/video/audio/documento/sticker) copiado al
 * volumen local (`MEDIA_DIR`) o contenido estructurado (location/contacts) en
 * `payload`. Meta expira sus archivos (~30 días): el disco propio es la
 * fuente durable (constitución II: sin S3/R2).
 */
export const mediaAsset = pgTable(
  "media_asset",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    kind: text("kind", {
      enum: [
        "image",
        "video",
        "audio",
        "document",
        "sticker",
        "location",
        "contacts",
      ],
    }).notNull(),
    /** media id de Graph (entrantes/salientes subidos); NULL en location/contacts. */
    waMediaId: text("wa_media_id"),
    mimeType: text("mime_type"),
    fileName: text("file_name"),
    fileSize: integer("file_size"),
    caption: text("caption"),
    /** location {latitude, longitude, name?, address?} o contacts (subset). */
    payload: jsonb("payload"),
    /** Ruta relativa dentro de MEDIA_DIR; NULL si aún no descargado o no aplica. */
    storagePath: text("storage_path"),
    fetchStatus: text("fetch_status", {
      enum: ["available", "pending", "failed"],
    })
      .notNull()
      .default("pending"),
    fetchError: text("fetch_error"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("media_asset_org_idx").on(t.organizationId, t.createdAt),
    index("media_asset_wa_media_idx").on(t.waMediaId),
  ]
);

export const metaCredentials = pgTable(
  "meta_credentials",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    wabaId: text("waba_id").notNull(),
    phoneNumberId: text("phone_number_id").notNull(),
    displayPhoneNumber: text("display_phone_number"),
    verifiedName: text("verified_name"),
    tokenCipher: text("token_cipher").notNull(),
    tokenIv: text("token_iv").notNull(),
    tokenTag: text("token_tag").notNull(),
    status: text("status", { enum: ["connected", "reconnect_required"] })
      .notNull()
      .default("connected"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("meta_credentials_org_uq").on(t.organizationId),
    // El webhook enruta por phone_number_id: debe ser único en la instancia.
    uniqueIndex("meta_credentials_phone_uq").on(t.phoneNumberId),
  ]
);

export const agentProfile = pgTable(
  "agent_profile",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(false),
    name: text("name").notNull().default("Asistente"),
    tone: text("tone"),
    instructions: text("instructions"),
    escalationRules: text("escalation_rules"),
    greeting: text("greeting"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("agent_profile_org_uq").on(t.organizationId)]
);

export const kbEntry = pgTable(
  "kb_entry",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["qa", "block"] }).notNull(),
    question: text("question"),
    answer: text("answer"),
    content: text("content"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("kb_org_idx").on(t.organizationId)]
);

export const template = pgTable(
  "template",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    language: text("language").notNull(),
    category: text("category").notNull(),
    body: text("body").notNull(),
    status: text("status", {
      enum: ["draft", "pending", "approved", "rejected"],
    })
      .notNull()
      .default("draft"),
    rejectionReason: text("rejection_reason"),
    waTemplateId: text("wa_template_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("template_org_name_lang_uq").on(
      t.organizationId,
      t.name,
      t.language
    ),
  ]
);

export const agentTestRun = pgTable(
  "agent_test_run",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["running", "done", "failed"] })
      .notNull()
      .default("running"),
    score: integer("score"),
    error: text("error"),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    finishedAt: timestamp("finished_at"),
  },
  (t) => [
    // Lock de concurrencia en BD: máximo 1 corrida activa por organización.
    uniqueIndex("test_run_org_running_uq")
      .on(t.organizationId)
      .where(sql`${t.status} = 'running'`),
    index("test_run_org_idx").on(t.organizationId, t.startedAt),
  ]
);

export const agentTestCase = pgTable(
  "agent_test_case",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    runId: text("run_id")
      .notNull()
      .references(() => agentTestRun.id, { onDelete: "cascade" }),
    persona: text("persona").notNull(),
    conversationId: text("conversation_id").references(() => conversation.id, {
      onDelete: "set null",
    }),
    transcript: jsonb("transcript"),
    veredicto: text("veredicto", { enum: ["verde", "amarillo", "rojo"] }),
    hallazgos: jsonb("hallazgos"),
    status: text("status", {
      enum: ["pending", "running", "done", "judge_failed"],
    })
      .notNull()
      .default("pending"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("test_case_run_idx").on(t.runId)]
);

/**
 * 005 iteración 3 — Formulario personalizado de captación para embeber en el
 * sitio externo del dueño. `courseId` NULLABLE: puede ser genérico o estar
 * atado a un curso de interés puntual (contracts implícito: POST público
 * `/api/public/forms/[formId]/submit`, sin autenticación, mismo patrón que
 * `/api/public/courses`).
 */
export const intakeForm = pgTable(
  "intake_form",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    courseId: text("course_id").references(() => course.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("intake_form_org_idx").on(t.organizationId)]
);
