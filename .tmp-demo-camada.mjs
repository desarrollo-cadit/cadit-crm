var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// scripts/demo-camada.ts
import { and as and8, eq as eq16, inArray as inArray4, like as like3 } from "drizzle-orm";

// src/lib/db/index.ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

// src/lib/env.ts
import { z } from "zod";
var envSchema = z.object({
  APP_BASE_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(16),
  ENCRYPTION_KEY: z.string().refine((v) => Buffer.from(v, "base64").length === 32, {
    message: "ENCRYPTION_KEY debe ser 32 bytes en base64 (genera con: openssl rand -base64 32)"
  }),
  META_WEBHOOK_VERIFY_TOKEN: z.string().min(8),
  META_APP_SECRET: z.string().optional(),
  META_GRAPH_API_VERSION: z.string().default("v25.0"),
  META_GRAPH_BASE_URL: z.string().url().default("https://graph.facebook.com"),
  OPENROUTER_API_TOKEN: z.string().optional(),
  OPENROUTER_BASE_URL: z.string().url().default("https://openrouter.ai/api"),
  OPENROUTER_MODEL: z.string().optional(),
  OPENROUTER_JUDGE_MODEL: z.string().optional(),
  ALLOW_SIGNUP: z.string().optional(),
  AGENT_COALESCE_MS: z.coerce.number().int().min(0).default(6e3),
  WA_MOCK_ENABLED: z.string().optional(),
  // API key de un cerebro externo que conduzca la conversación por /api/bot/*.
  // Sin ella, toda esa superficie responde 401.
  BOT_API_KEY: z.string().optional(),
  // 008: volumen local de adjuntos (constitución II: sin S3/R2).
  MEDIA_DIR: z.string().default("./.dev-media"),
  /**
   * 007 — Orígenes autorizados a llamar `/api/public/*` desde el NAVEGADOR,
   * separados por coma (ej. "https://cadit.com.uy,https://www.cadit.com.uy").
   * `*` (default) permite cualquiera: esos endpoints ya son públicos y sin
   * auth, así que restringirlos no agrega seguridad real —un bot con curl
   * ni pasa por CORS—, solo evita que otro sitio los use desde su front.
   */
  PUBLIC_CORS_ORIGINS: z.string().default("*"),
  /**
   * 007 — Microsoft Graph para el correo transaccional a alumnos
   * (constitución 1.3.0, principio II). Sin estas cuatro, la app arranca
   * igual y las acciones de correo responden "no configurado" en vez de
   * romperse. El buzón `M365_SENDER` debe estar acotado por
   * ApplicationAccessPolicy en Exchange Online (ver src/lib/m365/client.ts).
   */
  M365_TENANT_ID: z.string().optional(),
  M365_CLIENT_ID: z.string().optional(),
  M365_CLIENT_SECRET: z.string().optional(),
  M365_SENDER: z.string().email().optional(),
  /** Copia oculta de cada correo enviado, para registro del equipo. */
  M365_BCC: z.string().email().optional(),
  /** 007 — Envíos del formulario público permitidos por IP y ventana. */
  PUBLIC_FORM_RATE_LIMIT: z.coerce.number().int().min(1).default(5),
  PUBLIC_FORM_RATE_WINDOW_MS: z.coerce.number().int().min(1e3).default(6e5),
  NODE_ENV: z.string().default("development")
});
var BUILD_PLACEHOLDERS = {
  APP_BASE_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://build:build@localhost:5432/build",
  BETTER_AUTH_SECRET: "placeholder-build-secret",
  ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
  META_WEBHOOK_VERIFY_TOKEN: "placeholder-verify-token"
};
var cached = null;
function getEnv() {
  if (cached) return cached;
  const isBuild = process.env.NEXT_PHASE === "phase-production-build";
  const source = isBuild ? { ...BUILD_PLACEHOLDERS, ...stripEmpty(process.env) } : stripEmpty(process.env);
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n  ");
    throw new Error(
      `Variables de entorno inv\xE1lidas o faltantes:
  ${missing}
Revisa .env.example para la gu\xEDa de cada variable.`
    );
  }
  cached = parsed.data;
  return cached;
}
function stripEmpty(env) {
  const out = {};
  for (const [k, v] of Object.entries(env)) {
    if (v !== void 0 && v !== "") out[k] = v;
  }
  return out;
}

// src/lib/db/tenant-context.ts
import { AsyncLocalStorage } from "node:async_hooks";
var globalForTenant = globalThis;
function storage() {
  if (!globalForTenant.__caditTenantScope) {
    globalForTenant.__caditTenantScope = new AsyncLocalStorage();
  }
  return globalForTenant.__caditTenantScope;
}
function currentTenantTx() {
  return storage().getStore()?.tx;
}
function runWithTenantScope(scope, fn) {
  return storage().run(scope, fn);
}

// src/lib/db/schema.ts
var schema_exports = {};
__export(schema_exports, {
  ACCOUNT_LINK_KINDS: () => ACCOUNT_LINK_KINDS,
  CURRENCIES: () => CURRENCIES,
  RESOURCE_KINDS: () => RESOURCE_KINDS,
  account: () => account,
  accountLink: () => accountLink,
  agentProfile: () => agentProfile,
  agentTestCase: () => agentTestCase,
  agentTestRun: () => agentTestRun,
  announcement: () => announcement,
  assessment: () => assessment,
  assessmentResult: () => assessmentResult,
  attendance: () => attendance,
  automationRule: () => automationRule,
  certificate: () => certificate,
  classSession: () => classSession,
  cohort: () => cohort,
  cohortSoftware: () => cohortSoftware,
  company: () => company,
  contact: () => contact,
  conversation: () => conversation,
  course: () => course,
  courseCategory: () => courseCategory,
  courseModule: () => courseModule,
  enrollment: () => enrollment,
  installment: () => installment,
  intakeForm: () => intakeForm,
  invitation: () => invitation,
  kbEntry: () => kbEntry,
  license: () => license,
  mediaAsset: () => mediaAsset,
  member: () => member,
  message: () => message,
  metaCredentials: () => metaCredentials,
  organization: () => organization,
  payment: () => payment,
  pipelineStage: () => pipelineStage,
  resource: () => resource,
  role: () => role,
  session: () => session,
  software: () => software,
  teacher: () => teacher,
  teacherCourse: () => teacherCourse,
  template: () => template,
  user: () => user,
  verification: () => verification,
  virtualRoom: () => virtualRoom
});
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
var CURRENCIES = ["UYU", "PYG", "USD"];
var user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});
var session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  activeOrganizationId: text("active_organization_id")
});
var account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});
var verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});
var organization = pgTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").unique(),
  logo: text("logo"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  metadata: text("metadata"),
  /**
   * 013 (DV-005) — Zona horaria de la academia, en formato IANA.
   *
   * Hasta acá los horarios de clase eran texto (`"18:30"`) sin zona, y mientras
   * los miraba coordinación desde Montevideo daba igual. Con **42 alumnos en
   * Paraguay y 45 en otros países**, una clase "18:30" tiene que poder
   * mostrarse bien a quien la mira desde Asunción o Madrid.
   *
   * Vive en la organización y no en la cohorte porque CAD IT dicta desde un
   * solo lugar: ponerla en la cohorte sería modelar una flexibilidad que nadie
   * pidió y que habría que llenar 41 veces.
   */
  timezone: text("timezone").notNull().default("America/Montevideo"),
  /** 013 (DV-001/FR-003) — minutos antes del inicio en que aparece el enlace. */
  meetingOpenBeforeMin: integer("meeting_open_before_min").notNull().default(15),
  /** 013 (DV-001/FR-003) — minutos después del fin en que deja de aparecer. */
  meetingOpenAfterMin: integer("meeting_open_after_min").notNull().default(30)
});
var member = pgTable("member", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"),
  createdAt: timestamp("created_at").notNull().defaultNow()
});
var invitation = pgTable("invitation", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role"),
  status: text("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at").notNull(),
  inviterId: text("inviter_id").notNull().references(() => user.id, { onDelete: "cascade" })
});
var contact = pgTable(
  "contact",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    /**
     * Llave de resolución WhatsApp (003): teléfono normalizado (521→52) o
     * `bsuid:<id>` cuando Meta no manda wa_id. Estable de por vida.
     */
    waIdentity: text("wa_identity").notNull(),
    /** Teléfono como ATRIBUTO opcional (003): falta en contactos BSUID. */
    phone: text("phone"),
    /** Business-Scoped User ID si se conoce (003). */
    waUserId: text("wa_user_id"),
    /**
     * 005 iteración 6 (feedback en vivo: "quiero que contacto tenga nombre y
     * apellido por separado") — reemplaza el `name` único de antes (ya
     * migrado y eliminado). Los contactos de origen WhatsApp solo traen UN
     * string (el perfil de WhatsApp): ese string entero va a `firstName` y
     * `lastName` queda NULL. El formulario público SÍ acepta apellido
     * separado (iteración 7) y sigue siendo opcional para no romper los
     * formularios ya embebidos en sitios externos.
     */
    firstName: text("first_name").notNull(),
    lastName: text("last_name"),
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
    updatedAt: timestamp("updated_at").notNull().defaultNow()
  },
  (t) => [
    uniqueIndex("contact_org_wa_identity_uq").on(t.organizationId, t.waIdentity),
    index("contact_org_wa_user_id_idx").on(t.organizationId, t.waUserId),
    index("contact_org_name_idx").on(t.organizationId, t.firstName),
    // 005 (DV-003) — unicidad de email/celular por organización, cuando no es NULL.
    uniqueIndex("contact_org_email_uq").on(t.organizationId, t.email).where(sql`${t.email} IS NOT NULL`),
    uniqueIndex("contact_org_phone_uq").on(t.organizationId, t.phone).where(sql`${t.phone} IS NOT NULL`)
  ]
);
var pipelineStage = pgTable(
  "pipeline_stage",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull(),
    /** open = etapa normal · won / lost = anclas no borrables */
    kind: text("kind", { enum: ["open", "won", "lost"] }).notNull().default("open"),
    createdAt: timestamp("created_at").notNull().defaultNow()
  },
  (t) => [index("stage_org_pos_idx").on(t.organizationId, t.position)]
);
var teacher = pgTable(
  "teacher",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
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
    /**
     * 023 — Título profesional, como texto libre: "Arquitecto", "Ingeniero
     * Civil", "Técnico en Construcción".
     *
     * Libre y no una lista cerrada a propósito: los títulos varían por país
     * y por carrera, y una lista siempre le queda corta a alguien — que
     * entonces queda sin título, que es peor que uno escrito a mano.
     *
     * Va al catálogo PÚBLICO junto con la foto: el alumno que mira una
     * cohorte en la web quiere saber quién se la dicta.
     */
    title: text("title"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow()
  },
  (t) => [index("teacher_org_idx").on(t.organizationId)]
);
var software = pgTable(
  "software",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    totalLicenses: integer("total_licenses").notNull().default(0),
    /** 005 iteración 5 — foto opcional del producto, mismo patrón que teacher. */
    photoMimeType: text("photo_mime_type"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow()
  },
  (t) => [index("software_org_idx").on(t.organizationId)]
);
var company = pgTable(
  "company",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    legalName: text("legal_name").notNull(),
    taxId: text("tax_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow()
  },
  (t) => [index("company_org_idx").on(t.organizationId)]
);
var courseCategory = pgTable(
  "course_category",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Identificador para URLs del sitio comercial (`/cursos?categoria=ia`). */
    slug: text("slug").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow()
  },
  (t) => [uniqueIndex("course_category_org_slug_uq").on(t.organizationId, t.slug)]
);
var course = pgTable(
  "course",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    /* --- 006: contenido de la página pública del curso ---
     * El sitio comercial arma la landing del curso consumiendo
     * `/api/public/courses`; hasta 005 solo existían `name`/`description`, que
     * no alcanzan para una ficha de curso real. Todo lo de acá abajo es
     * OPCIONAL: un curso sin cargar sigue sirviéndose igual que antes. */
    /** URL pública del curso (`/cursos/<slug>`) — evita exponer el id interno. */
    slug: text("slug").notNull(),
    /** Descripción corta para tarjetas del catálogo; `description` es el cuerpo largo. */
    tagline: text("tagline"),
    categoryId: text("category_id").references(() => courseCategory.id, {
      onDelete: "set null"
    }),
    level: text("level", { enum: ["inicial", "intermedio", "avanzado"] }),
    modality: text("modality", { enum: ["en_vivo", "asincronico", "presencial"] }),
    durationWeeks: integer("duration_weeks"),
    hoursPerWeek: integer("hours_per_week"),
    imageUrl: text("image_url"),
    /** Bullets de "qué vas a aprender" — jsonb, mismo criterio que lab.transcript. */
    learningObjectives: jsonb("learning_objectives").$type(),
    /** A quién está dirigido / conocimientos previos, en texto libre. */
    targetAudience: text("target_audience"),
    /**
     * 006 — el temario en PDF vive acá y NO en `cohort`: es del curso, no de
     * una edición puntual. Hasta 005 estaba en `cohort.syllabus_url`, lo que
     * obligaba a repetirlo en cada cohorte; la migración 0015 lo subió acá y la
     * cohorte ahora lo hereda al serializarse.
     */
    syllabusUrl: text("syllabus_url"),
    /**
     * 007 — si el curso sale o no en el catálogo público. Hay cursos que
     * existen solo puertas adentro (talleres a medida, capacitaciones
     * in-company, ediciones combinadas): necesitan cohortes e inscripciones
     * en el CRM, pero NO deben aparecer en cadit.com.uy. Default `true`
     * para que los cursos ya cargados sigan publicándose igual que antes.
     */
    published: boolean("published").notNull().default(true),
    /**
     * 009 (DV-001) — mínimo de asistencia por defecto para las cohortes de este
     * curso, 0-100. La cohorte puede pisarlo con `cohort.min_attendance_pct`.
     */
    minAttendancePct: integer("min_attendance_pct"),
    /**
     * 011 (US3) — Precio de LISTA del curso, del que heredan sus cohortes.
     *
     * Existe porque medir mostró que el precio no vivía en ningún lado: 0 de
     * las 41 cohortes tenía `cost`, y por eso cada inscripción se cargaba a
     * mano — con el resultado de **191 inscripciones sin monto**, la mitad,
     * imposibles de facturar.
     *
     * Va en el CURSO y no solo en la cohorte porque el precio se decide una
     * vez por producto y cambia poco; la cohorte lo pisa cuando hay una
     * promoción puntual, igual que ya hace con `min_attendance_pct`.
     */
    listPrice: integer("list_price"),
    /** La moneda del precio de lista. Hay UYU y PYG conviviendo (007). */
    listCurrency: text("list_currency", { enum: CURRENCIES }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow()
  },
  (t) => [
    index("course_org_idx").on(t.organizationId),
    index("course_category_idx").on(t.categoryId),
    uniqueIndex("course_org_slug_uq").on(t.organizationId, t.slug)
  ]
);
var courseModule = pgTable(
  "course_module",
  {
    id: text("id").primaryKey(),
    // Multi-tenancy (constitución III): organization_id explícito aunque se
    // pueda derivar de course_id — toda query pasa por `scoped()`.
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    courseId: text("course_id").notNull().references(() => course.id, { onDelete: "cascade" }),
    /** Orden de aparición en la web; contiguo desde 0, lo reasigna el server. */
    position: integer("position").notNull(),
    title: text("title").notNull(),
    /** Temas del módulo, en orden. */
    topics: jsonb("topics").$type().notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow()
  },
  // Org-first, como el resto de las tablas de dominio: toda lectura del temario
  // filtra por organización y curso antes de ordenar por posición.
  (t) => [
    index("course_module_course_idx").on(t.organizationId, t.courseId, t.position)
  ]
);
var teacherCourse = pgTable(
  "teacher_course",
  {
    // Multi-tenancy (constitución III): explícito aunque se pueda derivar de
    // `teacher_id`, mismo criterio que `course_module`. Sin esta columna la
    // seguridad dependía de que CADA llamador filtrara el padre por
    // organización antes de tocar el puente: hoy todos lo hacen, pero una
    // call site nueva que se olvide filtra en silencio y sin error de
    // compilación. Con la columna, `scoped()` lo vuelve inexpresable.
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    teacherId: text("teacher_id").notNull().references(() => teacher.id, { onDelete: "cascade" }),
    courseId: text("course_id").notNull().references(() => course.id, { onDelete: "cascade" })
  },
  (t) => [
    primaryKey({ columns: [t.teacherId, t.courseId] }),
    index("teacher_course_course_idx").on(t.courseId),
    index("teacher_course_org_idx").on(t.organizationId)
  ]
);
var cohort = pgTable(
  "cohort",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    courseId: text("course_id").notNull().references(() => course.id, { onDelete: "restrict" }),
    /** 005 iteración 2 — nombre propio de la cohorte; NULL = usar course.name. */
    name: text("name"),
    startDate: timestamp("start_date").notNull(),
    endDate: timestamp("end_date"),
    /** 005 (DV-005) — reemplaza el `professor` texto libre de 004. */
    teacherId: text("teacher_id").references(() => teacher.id, {
      onDelete: "set null"
    }),
    /** 005 — moneda entera, mismo criterio que enrollment.amount (DV-008). */
    cost: integer("cost"),
    /** 007 — de qué moneda es `cost`. Ver CURRENCIES. */
    currency: text("currency", { enum: CURRENCIES }).notNull().default("UYU"),
    /**
     * 009 (DV-001) — porcentaje mínimo de asistencia para aprobar, 0-100.
     * NULL = hereda `course.min_attendance_pct`. Vive en la cohorte porque la
     * edición in-company puede pactar un criterio propio, pero el caso normal
     * se carga una vez en el curso y no 41 veces.
     */
    minAttendancePct: integer("min_attendance_pct"),
    /** 005 — horario en texto libre, ej. "lunes y miércoles 18:30-20:30". */
    frequency: text("frequency"),
    /** 005 iteración 2 — horario de inicio/fin en texto "HH:MM", para el calendario. */
    startTime: text("start_time"),
    endTime: text("end_time"),
    /**
     * 005 iteración 4 — qué días de la semana dicta esta cohorte dentro de
     * [start_date, end_date], para poder dibujarla en el calendario semanal
     * (antes aparecía TODOS los días del rango, fines de semana incluidos).
     * CSV de índices 0=lunes..6=domingo (mismo orden que WEEKDAYS del
     * calendario); NULL = sin días específicos declarados (se sigue
     * mostrando en cada día del rango, comportamiento anterior).
     */
    daysOfWeek: text("days_of_week"),
    classroom: text("classroom"),
    // 006 — `syllabus_url` se movió a `course`: el temario es del curso, no de
    // la edición. La cohorte lo sigue exponiendo en su DTO, heredado del curso.
    capacity: integer("capacity"),
    whatsappGroupLink: text("whatsapp_group_link"),
    /**
     * 013 (FR-001) — Enlace de reunión por defecto de la cohorte.
     *
     * Las clases lo HEREDAN; no se les copia al generar el cronograma. Copiarlo
     * dejaría 41 cohortes con enlaces muertos el día que se cambie el de Zoom.
     */
    meetingUrl: text("meeting_url"),
    /**
     * 023 (FR-002) — El aula virtual de la camada. Sus clases la HEREDAN.
     *
     * No se les copia al generar el cronograma, por el mismo motivo que
     * `meeting_url`: copiarla dejaría 41 camadas con aulas congeladas el día
     * que se reasigne una.
     *
     * `set null` y no `restrict`: dar de baja un aula no puede trabar la
     * camada. Sin aula, el enlace cae al `meeting_url` de siempre (FR-004).
     */
    virtualRoomId: text("virtual_room_id").references(() => virtualRoom.id, {
      onDelete: "set null"
    }),
    status: text("status", {
      enum: ["planificada", "en_curso", "finalizada"]
    }).notNull().default("planificada"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow()
  },
  (t) => [
    index("cohort_org_course_idx").on(t.organizationId, t.courseId),
    index("cohort_teacher_idx").on(t.teacherId)
  ]
);
var cohortSoftware = pgTable(
  "cohort_software",
  {
    /** Multi-tenancy (constitución III) — ver el comentario de `teacherCourse`. */
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    cohortId: text("cohort_id").notNull().references(() => cohort.id, { onDelete: "cascade" }),
    softwareId: text("software_id").notNull().references(() => software.id, { onDelete: "restrict" })
  },
  (t) => [
    primaryKey({ columns: [t.cohortId, t.softwareId] }),
    index("cohort_software_software_idx").on(t.softwareId),
    index("cohort_software_org_idx").on(t.organizationId)
  ]
);
var enrollment = pgTable(
  "enrollment",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    contactId: text("contact_id").notNull().references(() => contact.id, { onDelete: "cascade" }),
    cohortId: text("cohort_id").references(() => cohort.id, {
      onDelete: "restrict"
    }),
    stageId: text("stage_id").notNull().references(() => pipelineStage.id),
    position: integer("position").notNull().default(0),
    enrolledAt: timestamp("enrolled_at"),
    lastActivityAt: timestamp("last_activity_at"),
    /** 005 — datos comerciales (DV-008, FR-009). */
    amount: integer("amount"),
    /**
     * 007 — de qué moneda es `amount`. Dos alumnos de la MISMA cohorte
     * pueden pagar en monedas distintas (Uruguay/Paraguay), así que la
     * moneda es del pago, no de la cohorte. Ver CURRENCIES.
     */
    currency: text("currency", { enum: CURRENCIES }).notNull().default("UYU"),
    installments: integer("installments"),
    paymentNotes: text("payment_notes"),
    /** 005 — cédula del contacto al momento de inscribir. */
    nationalId: text("national_id"),
    invoiceNumber: text("invoice_number"),
    receiptNumber: text("receipt_number"),
    /** 005 — vendedor; validado en servidor como miembro de la org (DV-008). */
    sellerId: text("seller_id").references(() => user.id, {
      onDelete: "set null"
    }),
    /** 005 — facturación B2B opcional (DV-009). */
    companyId: text("company_id").references(() => company.id, {
      onDelete: "restrict"
    }),
    /**
     * 005 iteración 7 — curso que le interesa al lead, como FK y no como el
     * texto de `contact.source`: el lead general (cohortId NULL) es la unidad
     * de interés comercial, así que el origen tiene que vivir acá y no en el
     * contacto (un contacto puede tener N leads) ni en el nombre del
     * formulario (renombrarlo dejaría huérfanas las tarjetas viejas).
     * Cuando el lead se convierte, `cohortId` ya trae su curso vía cohorte.
     */
    interestCourseId: text("interest_course_id").references(() => course.id, {
      onDelete: "set null"
    }),
    /** 005 — checklist de onboarding de soporte (DV-007, FR-013). */
    termsEmailSentAt: timestamp("terms_email_sent_at"),
    softwareInstalledAt: timestamp("software_installed_at"),
    hadOwnLicense: boolean("had_own_license").notNull().default(false),
    academiaOnlineAccessAt: timestamp("academia_online_access_at"),
    /**
     * 007 — cuándo se le mandó el correo de bienvenida + invitación al grupo
     * de WhatsApp. Un correo no se puede "desenviar": esta marca es lo que
     * evita mandarlo dos veces por un doble click. El de términos de licencia
     * usa `termsEmailSentAt`, que ya existía.
     */
    welcomeEmailSentAt: timestamp("welcome_email_sent_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow()
  },
  (t) => [
    // Una inscripción por contacto y cohorte (cuando hay cohorte asignada).
    uniqueIndex("enrollment_contact_cohort_uq").on(t.contactId, t.cohortId).where(sql`${t.cohortId} IS NOT NULL`),
    // Un solo lead general (sin cohorte) por contacto — reemplaza lead_contact_uq.
    uniqueIndex("enrollment_contact_general_uq").on(t.contactId).where(sql`${t.cohortId} IS NULL`),
    index("enrollment_org_stage_idx").on(t.organizationId, t.stageId, t.position),
    index("enrollment_org_cohort_idx").on(t.organizationId, t.cohortId),
    index("enrollment_seller_idx").on(t.sellerId),
    index("enrollment_company_idx").on(t.companyId),
    index("enrollment_org_interest_course_idx").on(
      t.organizationId,
      t.interestCourseId
    )
  ]
);
var license = pgTable(
  "license",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    enrollmentId: text("enrollment_id").notNull().unique().references(() => enrollment.id, { onDelete: "cascade" }),
    /** 005 (DV-004) — de qué software del catálogo es esta licencia. */
    softwareId: text("software_id").notNull().references(() => software.id, { onDelete: "restrict" }),
    assigned: boolean("assigned").notNull().default(false),
    assignedAt: timestamp("assigned_at"),
    expiresAt: timestamp("expires_at")
  },
  (t) => [
    index("license_org_idx").on(t.organizationId),
    index("license_software_idx").on(t.softwareId)
  ]
);
var automationRule = pgTable(
  "automation_rule",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    triggerEvent: text("trigger_event", {
      enum: ["enrollment_created", "license_assigned", "cohort_starts_soon"]
    }).notNull(),
    channel: text("channel", { enum: ["email", "whatsapp"] }).notNull(),
    templateId: text("template_id"),
    templateBody: text("template_body"),
    active: boolean("active").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow()
  },
  (t) => [index("automation_rule_org_idx").on(t.organizationId)]
);
var conversation = pgTable(
  "conversation",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    contactId: text("contact_id").notNull().references(() => contact.id, { onDelete: "cascade" }),
    /** Conversación del Laboratorio: jamás toca la API de WhatsApp. */
    isTest: boolean("is_test").notNull().default(false),
    aiEnabled: boolean("ai_enabled").notNull().default(true),
    handoffAt: timestamp("handoff_at"),
    handoffReason: text("handoff_reason", {
      // 008: manual_reply = el dueño respondió desde la app del teléfono.
      enum: ["cliente", "modelo", "error", "ventana", "manual_reply"]
    }),
    lastInboundAt: timestamp("last_inbound_at"),
    lastMessageAt: timestamp("last_message_at"),
    unreadCount: integer("unread_count").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow()
  },
  (t) => [
    // Una conversación real por contacto; las de prueba no compiten.
    uniqueIndex("conversation_org_contact_real_uq").on(t.organizationId, t.contactId).where(sql`${t.isTest} = false`),
    index("conversation_org_last_idx").on(t.organizationId, t.lastMessageAt)
  ]
);
var message = pgTable(
  "message",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id").notNull().references(() => conversation.id, { onDelete: "cascade" }),
    /** ID de WhatsApp — UNIQUE (idempotencia). Nullable en salientes de prueba. */
    waMessageId: text("wa_message_id").unique(),
    direction: text("direction", { enum: ["in", "out"] }).notNull(),
    type: text("type").notNull().default("text"),
    text: text("text"),
    status: text("status", {
      enum: ["pending", "sent", "delivered", "read", "failed"]
    }).notNull().default("pending"),
    error: text("error"),
    aiGenerated: boolean("ai_generated").notNull().default(false),
    /**
     * 008 — Origen del saliente: IA (bot), operador del CRM, manual desde la
     * app de WhatsApp Business del teléfono (echo), o plantilla. En entrantes
     * queda el default y la UI lo ignora.
     */
    origin: text("origin", {
      enum: ["ai", "operator", "manual", "template"]
    }).notNull().default("operator"),
    /** 008 — Adjunto del mensaje (imagen, doc, ubicación…), si lo hay. */
    mediaAssetId: text("media_asset_id").references(() => mediaAsset.id, {
      onDelete: "set null"
    }),
    waTimestamp: timestamp("wa_timestamp"),
    createdAt: timestamp("created_at").notNull().defaultNow()
  },
  (t) => [
    index("message_org_conv_idx").on(
      t.organizationId,
      t.conversationId,
      t.createdAt
    )
  ]
);
var mediaAsset = pgTable(
  "media_asset",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    kind: text("kind", {
      enum: [
        "image",
        "video",
        "audio",
        "document",
        "sticker",
        "location",
        "contacts"
      ]
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
      enum: ["available", "pending", "failed"]
    }).notNull().default("pending"),
    fetchError: text("fetch_error"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow()
  },
  (t) => [
    index("media_asset_org_idx").on(t.organizationId, t.createdAt),
    index("media_asset_wa_media_idx").on(t.waMediaId)
  ]
);
var metaCredentials = pgTable(
  "meta_credentials",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    wabaId: text("waba_id").notNull(),
    phoneNumberId: text("phone_number_id").notNull(),
    displayPhoneNumber: text("display_phone_number"),
    verifiedName: text("verified_name"),
    tokenCipher: text("token_cipher").notNull(),
    tokenIv: text("token_iv").notNull(),
    tokenTag: text("token_tag").notNull(),
    status: text("status", { enum: ["connected", "reconnect_required"] }).notNull().default("connected"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow()
  },
  (t) => [
    uniqueIndex("meta_credentials_org_uq").on(t.organizationId),
    // El webhook enruta por phone_number_id: debe ser único en la instancia.
    uniqueIndex("meta_credentials_phone_uq").on(t.phoneNumberId)
  ]
);
var agentProfile = pgTable(
  "agent_profile",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(false),
    name: text("name").notNull().default("Asistente"),
    tone: text("tone"),
    instructions: text("instructions"),
    escalationRules: text("escalation_rules"),
    greeting: text("greeting"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow()
  },
  (t) => [uniqueIndex("agent_profile_org_uq").on(t.organizationId)]
);
var kbEntry = pgTable(
  "kb_entry",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["qa", "block"] }).notNull(),
    question: text("question"),
    answer: text("answer"),
    content: text("content"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow()
  },
  (t) => [index("kb_org_idx").on(t.organizationId)]
);
var template = pgTable(
  "template",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    language: text("language").notNull(),
    category: text("category").notNull(),
    body: text("body").notNull(),
    status: text("status", {
      enum: ["draft", "pending", "approved", "rejected"]
    }).notNull().default("draft"),
    rejectionReason: text("rejection_reason"),
    waTemplateId: text("wa_template_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow()
  },
  (t) => [
    uniqueIndex("template_org_name_lang_uq").on(
      t.organizationId,
      t.name,
      t.language
    )
  ]
);
var agentTestRun = pgTable(
  "agent_test_run",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["running", "done", "failed"] }).notNull().default("running"),
    score: integer("score"),
    error: text("error"),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    finishedAt: timestamp("finished_at")
  },
  (t) => [
    // Lock de concurrencia en BD: máximo 1 corrida activa por organización.
    uniqueIndex("test_run_org_running_uq").on(t.organizationId).where(sql`${t.status} = 'running'`),
    index("test_run_org_idx").on(t.organizationId, t.startedAt)
  ]
);
var agentTestCase = pgTable(
  "agent_test_case",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    runId: text("run_id").notNull().references(() => agentTestRun.id, { onDelete: "cascade" }),
    persona: text("persona").notNull(),
    conversationId: text("conversation_id").references(() => conversation.id, {
      onDelete: "set null"
    }),
    transcript: jsonb("transcript"),
    veredicto: text("veredicto", { enum: ["verde", "amarillo", "rojo"] }),
    hallazgos: jsonb("hallazgos"),
    status: text("status", {
      enum: ["pending", "running", "done", "judge_failed"]
    }).notNull().default("pending"),
    createdAt: timestamp("created_at").notNull().defaultNow()
  },
  (t) => [index("test_case_run_idx").on(t.runId)]
);
var intakeForm = pgTable(
  "intake_form",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    courseId: text("course_id").references(() => course.id, {
      onDelete: "set null"
    }),
    createdAt: timestamp("created_at").notNull().defaultNow()
  },
  (t) => [index("intake_form_org_idx").on(t.organizationId)]
);
var installment = pgTable(
  "installment",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    enrollmentId: text("enrollment_id").notNull().references(() => enrollment.id, { onDelete: "cascade" }),
    /** Orden dentro del plan, 1..N. */
    number: integer("number").notNull(),
    dueDate: timestamp("due_date").notNull(),
    /** Entero sin centavos, mismo criterio que `enrollment.amount` (DV-008 de 005). */
    amount: integer("amount").notNull(),
    /** Hereda de `enrollment.currency` al generar el plan. */
    currency: text("currency", { enum: CURRENCIES }).notNull().default("UYU"),
    /**
     * Cuota anulada al rearmar el plan. NO se borra: si se borrara, un plan
     * refinanciado perdería la evidencia de lo que se había pactado antes.
     */
    canceledAt: timestamp("canceled_at"),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow()
  },
  (t) => [
    uniqueIndex("installment_enrollment_number_uq").on(
      t.organizationId,
      t.enrollmentId,
      t.number
    ),
    // Vista de morosidad: "qué venció y sigue sin pagarse".
    index("installment_org_due_idx").on(t.organizationId, t.dueDate)
  ]
);
var payment = pgTable(
  "payment",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    /** Denormalizado desde la cuota: permite la caja del mes sin join. */
    enrollmentId: text("enrollment_id").notNull().references(() => enrollment.id, { onDelete: "cascade" }),
    /** NULL = pago a cuenta, todavía sin cuota asignada. */
    installmentId: text("installment_id").references(() => installment.id, {
      onDelete: "set null"
    }),
    amount: integer("amount").notNull(),
    /** DEBE coincidir con la moneda de su cuota (FR-004). */
    currency: text("currency", { enum: CURRENCIES }).notNull().default("UYU"),
    /** Fecha REAL del pago, no la de carga: la caja del mes depende de esto. */
    paidAt: timestamp("paid_at").notNull(),
    method: text("method", {
      enum: ["efectivo", "transferencia", "tarjeta", "otro"]
    }).notNull(),
    /** 008 (DV-006) — el recibo es del PAGO; la factura sigue en `enrollment`. */
    receiptNumber: text("receipt_number"),
    notes: text("notes"),
    recordedBy: text("recorded_by").references(() => user.id, {
      onDelete: "set null"
    }),
    /** Anulación: el registro NO se borra (FR-006), deja de contar para saldos. */
    voidedAt: timestamp("voided_at"),
    voidedBy: text("voided_by").references(() => user.id, { onDelete: "set null" }),
    voidReason: text("void_reason"),
    /**
     * FR-011 / constitución IV — el formulario manda una clave por intento y
     * un segundo POST con la misma devuelve el pago ya creado en vez de
     * duplicarlo. Sin clave, el comportamiento es el de siempre.
     */
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at").notNull().defaultNow()
  },
  (t) => [
    index("payment_org_paid_idx").on(t.organizationId, t.paidAt),
    index("payment_org_enrollment_idx").on(t.organizationId, t.enrollmentId),
    uniqueIndex("payment_org_idempotency_uq").on(t.organizationId, t.idempotencyKey).where(sql`${t.idempotencyKey} IS NOT NULL`)
  ]
);
var classSession = pgTable(
  "class_session",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    cohortId: text("cohort_id").notNull().references(() => cohort.id, { onDelete: "cascade" }),
    /** Orden dentro del cronograma, 1..N. */
    number: integer("number").notNull(),
    date: timestamp("date").notNull(),
    startTime: text("start_time"),
    endTime: text("end_time"),
    /** Horas dictadas: lo que multiplica `teacher.hourly_rate`. */
    hours: integer("hours"),
    /**
     * Profesor que la dictó, que puede NO ser el titular de la cohorte (una
     * suplencia). Por eso vive en la clase y no se lee de `cohort.teacher_id`.
     */
    teacherId: text("teacher_id").references(() => teacher.id, {
      onDelete: "set null"
    }),
    topic: text("topic"),
    /** Clase caída (feriado, paro, suplencia sin cubrir). No cuenta para asistencia. */
    canceledAt: timestamp("canceled_at"),
    cancelReason: text("cancel_reason"),
    /**
     * 013 (FR-002) — Enlace propio de ESTA clase; pisa el de la cohorte.
     * NULL = usa el de la cohorte.
     */
    meetingUrl: text("meeting_url"),
    /**
     * 023 (FR-003) — Aula propia de ESTA clase; pisa la de la camada.
     * NULL = usa la de la camada. Existe porque los choques se resuelven de a
     * una: mover una clase a otra sala no debería tocar las otras treinta y
     * nueve.
     */
    virtualRoomId: text("virtual_room_id").references(() => virtualRoom.id, {
      onDelete: "set null"
    }),
    /**
     * 013 (FR-005b/FR-005f) — La grabación es un ENLACE: el sistema no
     * almacena video (decisión marco de archivos). Una clase cancelada NO
     * ofrece grabación (FR-005e), aunque la columna tenga valor.
     */
    recordingUrl: text("recording_url"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow()
  },
  (t) => [
    uniqueIndex("class_session_cohort_number_uq").on(
      t.organizationId,
      t.cohortId,
      t.number
    ),
    index("class_session_org_date_idx").on(t.organizationId, t.date)
  ]
);
var attendance = pgTable(
  "attendance",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    classSessionId: text("class_session_id").notNull().references(() => classSession.id, { onDelete: "cascade" }),
    enrollmentId: text("enrollment_id").notNull().references(() => enrollment.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: ["presente", "tarde", "ausente", "justificado"]
    }).notNull(),
    notes: text("notes"),
    /**
     * 014 (DV-001) — Quién puso esta marca. Con el portal, la asistencia deja
     * de tocarla solo la coordinación: el profesor puede corregir una clase
     * pasada, y una corrección sin autor es una corrección que nadie puede
     * revisar. El "cuándo" ya lo da `updated_at`.
     *
     * Nullable porque las marcas anteriores al portal no tienen autor, y
     * inventarles uno sería peor que admitir que no se sabe.
     */
    recordedBy: text("recorded_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow()
  },
  (t) => [
    // Una marca por alumno y clase: volver a marcar CORRIGE, no duplica.
    uniqueIndex("attendance_session_enrollment_uq").on(
      t.classSessionId,
      t.enrollmentId
    ),
    index("attendance_org_enrollment_idx").on(t.organizationId, t.enrollmentId)
  ]
);
var assessment = pgTable(
  "assessment",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    cohortId: text("cohort_id").notNull().references(() => cohort.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull().default(0),
    /**
     * Una evaluación opcional no bloquea la aprobación. Sirve para prácticas
     * que se registran pero no definen si el alumno se recibe.
     */
    required: boolean("required").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow()
  },
  (t) => [index("assessment_org_cohort_idx").on(t.organizationId, t.cohortId, t.position)]
);
var assessmentResult = pgTable(
  "assessment_result",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    assessmentId: text("assessment_id").notNull().references(() => assessment.id, { onDelete: "cascade" }),
    enrollmentId: text("enrollment_id").notNull().references(() => enrollment.id, { onDelete: "cascade" }),
    /** NULL = pendiente de corrección (FR-005). true/false = aprobó o no. */
    passed: boolean("passed"),
    notes: text("notes"),
    recordedBy: text("recorded_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow()
  },
  (t) => [
    // Un resultado por alumno y evaluación: recargar CORRIGE, no duplica.
    uniqueIndex("assessment_result_uq").on(t.assessmentId, t.enrollmentId),
    index("assessment_result_org_enrollment_idx").on(t.organizationId, t.enrollmentId)
  ]
);
var certificate = pgTable(
  "certificate",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    enrollmentId: text("enrollment_id").notNull().unique().references(() => enrollment.id, { onDelete: "cascade" }),
    /** Código público de verificación, aleatorio y no secuencial (FR-010). */
    code: text("code").notNull().unique(),
    issuedAt: timestamp("issued_at").notNull().defaultNow(),
    issuedBy: text("issued_by").references(() => user.id, { onDelete: "set null" }),
    /** Asistencia al momento de emitir; no se recalcula después. */
    attendancePct: integer("attendance_pct"),
    /**
     * 010 (DV-004) — emisión histórica: se saltea el requisito de notas y
     * asistencia porque la cohorte es anterior al sistema. Queda marcado para
     * que nadie lo confunda con una aprobación verificada.
     */
    historical: boolean("historical").notNull().default(false),
    revokedAt: timestamp("revoked_at"),
    revokedBy: text("revoked_by").references(() => user.id, { onDelete: "set null" }),
    revokeReason: text("revoke_reason"),
    createdAt: timestamp("created_at").notNull().defaultNow()
  },
  (t) => [index("certificate_org_idx").on(t.organizationId)]
);
var ACCOUNT_LINK_KINDS = ["alumno", "profesor"];
var accountLink = pgTable(
  "account_link",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ACCOUNT_LINK_KINDS }).notNull(),
    /** Obligatorio si `kind = alumno`, prohibido si no (ver el CHECK). */
    contactId: text("contact_id").references(() => contact.id, { onDelete: "cascade" }),
    /** Obligatorio si `kind = profesor`, prohibido si no (ver el CHECK). */
    teacherId: text("teacher_id").references(() => teacher.id, { onDelete: "cascade" }),
    /** DV-007 — acceso suspendido. La fila NO se borra. */
    suspendedAt: timestamp("suspended_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow()
  },
  (t) => [
    // Una persona puede ser alumno Y profesor; no dos veces lo mismo.
    uniqueIndex("account_link_org_user_kind_uq").on(t.organizationId, t.userId, t.kind),
    // Los dos caminos por los que se resuelve una sesión de portal.
    index("account_link_org_contact_idx").on(t.organizationId, t.contactId),
    index("account_link_org_teacher_idx").on(t.organizationId, t.teacherId),
    check(
      "account_link_kind_coherente",
      sql`(${t.kind} = 'alumno' and ${t.contactId} is not null and ${t.teacherId} is null)
       or (${t.kind} = 'profesor' and ${t.teacherId} is not null and ${t.contactId} is null)`
    )
  ]
);
var role = pgTable(
  "role",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    /** `direccion`, `coordinacion`, `soporte`… — la llave estable. */
    key: text("key").notNull(),
    /** Rótulo visible; este sí se puede renombrar sin romper nada. */
    name: text("name").notNull(),
    capabilities: jsonb("capabilities").$type().notNull().default(sql`'[]'::jsonb`),
    /** Los de sistema no se borran desde la pantalla. */
    system: boolean("system").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow()
  },
  (t) => [uniqueIndex("role_org_key_uq").on(t.organizationId, t.key)]
);
var RESOURCE_KINDS = ["guia", "ejemplo", "enlace", "video"];
var resource = pgTable(
  "resource",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    /** Material del CURSO: aplica a todas sus cohortes. */
    courseId: text("course_id").references(() => course.id, { onDelete: "cascade" }),
    /** Material de una CLASE puntual. */
    classSessionId: text("class_session_id").references(() => classSession.id, {
      onDelete: "cascade"
    }),
    /** Referencia opcional al temario; no es el contenedor. */
    courseModuleId: text("course_module_id").references(() => courseModule.id, {
      onDelete: "set null"
    }),
    title: text("title").notNull(),
    /** El enlace. El sistema NO almacena el archivo (FR-007). */
    url: text("url").notNull(),
    kind: text("kind", { enum: RESOURCE_KINDS }).notNull().default("enlace"),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow()
  },
  (t) => [
    index("resource_org_course_idx").on(t.organizationId, t.courseId),
    index("resource_org_class_idx").on(t.organizationId, t.classSessionId),
    check(
      "resource_contenedor_unico",
      sql`(${t.courseId} is not null and ${t.classSessionId} is null)
       or (${t.classSessionId} is not null and ${t.courseId} is null)`
    )
  ]
);
var announcement = pgTable(
  "announcement",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    cohortId: text("cohort_id").notNull().references(() => cohort.id, { onDelete: "cascade" }),
    authorUserId: text("author_user_id").references(() => user.id, {
      onDelete: "set null"
    }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow()
  },
  (t) => [
    // La consulta real es "los últimos avisos de esta cohorte".
    index("announcement_org_cohort_idx").on(t.organizationId, t.cohortId, t.createdAt)
  ]
);
var virtualRoom = pgTable(
  "virtual_room",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    /** Lo que ve coordinación: "Zoom 1", "Sala Revit". */
    name: text("name").notNull(),
    /** Lo que abre el alumno. Es el PMI de la cuenta. */
    url: text("url").notNull(),
    /**
     * La cuenta a la que pertenece, para saber cuál renovar o a quién pedirle
     * la grabación. Es un rótulo administrativo: **no viaja a los portales**.
     */
    accountEmail: text("account_email"),
    notes: text("notes"),
    /**
     * 023 (FR-009) — Baja lógica. No se borra: una clase pasada que se dictó
     * acá conserva la evidencia de dónde fue. Borrar el aula reescribiría esa
     * historia, igual que borrar un aviso (013).
     */
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow()
  },
  (t) => [
    index("virtual_room_org_idx").on(t.organizationId),
    // Dos aulas con el mismo nombre son imposibles de asignar sin equivocarse.
    uniqueIndex("virtual_room_org_name_uq").on(t.organizationId, t.name)
  ]
);

// src/lib/db/index.ts
var globalForDb = globalThis;
function createClient() {
  const env = getEnv();
  return postgres(env.DATABASE_URL, {
    max: 10,
    onnotice: () => {
    }
  });
}
function getSql() {
  if (!globalForDb.__voceroSql) globalForDb.__voceroSql = createClient();
  return globalForDb.__voceroSql;
}
var cachedDb = null;
function getRootDb() {
  if (!cachedDb) cachedDb = drizzle(getSql(), { schema: schema_exports });
  return cachedDb;
}
function getDb() {
  const tx = currentTenantTx();
  if (tx) return tx;
  return getRootDb();
}

// src/lib/db/with-tenant.ts
import { sql as sql2 } from "drizzle-orm";
async function withOrganizationScope(organizationId, actor, fn) {
  const afterCommit = [];
  const result = await getRootDb().transaction(async (tx) => {
    await tx.execute(
      sql2`select set_config('app.current_org', ${organizationId}, true)`
    );
    await tx.execute(sql2`select set_config('app.current_actor', ${actor}, true)`);
    return runWithTenantScope(
      { tx, organizationId, actorId: actor, afterCommit },
      fn
    );
  });
  for (const task of afterCommit) {
    try {
      task();
    } catch (err) {
      console.error("[tenant] tarea post-commit fall\xF3:", err);
    }
  }
  return result;
}

// src/lib/db/tenant.ts
import { and, eq } from "drizzle-orm";
function scoped(organizationColumn, organizationId, ...conditions) {
  if (!organizationId) {
    throw new Error("scoped(): organizationId vac\xEDo \u2014 query sin tenant");
  }
  const base = eq(organizationColumn, organizationId);
  const rest = conditions.filter((c) => c !== void 0);
  return rest.length > 0 ? and(base, ...rest) : base;
}

// src/server/courses.ts
import { asc as asc4, desc, eq as eq7, inArray as inArray2, like as like2, ne as ne2 } from "drizzle-orm";
import { z as z3 } from "zod";

// src/lib/db/ids.ts
import { customAlphabet } from "nanoid";
var alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
var nano = customAlphabet(alphabet, 20);
var prefixes = {
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
  virtualRoom: "aula"
};
function newId(kind) {
  return `${prefixes[kind]}_${nano()}`;
}

// src/lib/utils.ts
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
function fullName(c) {
  return c.lastName ? `${c.firstName} ${c.lastName}` : c.firstName;
}
function slugify(value) {
  const slug = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "curso";
}
function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// src/server/licenses.ts
import { asc, eq as eq2 } from "drizzle-orm";
async function availableLicenses(organizationId, softwareId) {
  const db = getDb();
  const softwareRows = await db.select({ name: schema_exports.software.name, totalLicenses: schema_exports.software.totalLicenses }).from(schema_exports.software).where(
    scoped(schema_exports.software.organizationId, organizationId, eq2(schema_exports.software.id, softwareId))
  ).limit(1);
  const sw = softwareRows[0];
  if (!sw) return null;
  const assignedCount = (await contarOcupadas(organizationId, softwareId)).get(softwareId) ?? 0;
  return {
    softwareId,
    softwareName: sw.name,
    total: sw.totalLicenses,
    assignedCount,
    available: sw.totalLicenses - assignedCount
  };
}
function serializeLicense(l) {
  return {
    id: l.id,
    enrollmentId: l.enrollmentId,
    softwareId: l.softwareId,
    assigned: l.assigned,
    assignedAt: l.assignedAt?.toISOString() ?? null
  };
}
async function assignLicense(organizationId, enrollmentId, softwareId) {
  const db = getDb();
  const enrollmentRows = await db.select({ id: schema_exports.enrollment.id }).from(schema_exports.enrollment).where(
    scoped(
      schema_exports.enrollment.organizationId,
      organizationId,
      eq2(schema_exports.enrollment.id, enrollmentId)
    )
  ).limit(1);
  if (!enrollmentRows[0]) {
    return { ok: false, status: 404, code: "not_found", message: "Inscripci\xF3n no encontrada" };
  }
  const availability = await availableLicenses(organizationId, softwareId);
  if (!availability) {
    return { ok: false, status: 422, code: "invalid_body", message: "Software inexistente" };
  }
  const existingRows = await db.select().from(schema_exports.license).where(
    scoped(
      schema_exports.license.organizationId,
      organizationId,
      eq2(schema_exports.license.enrollmentId, enrollmentId)
    )
  ).limit(1);
  const existing = existingRows[0] ?? null;
  const alreadyThisOne = Boolean(existing?.assigned && existing.softwareId === softwareId);
  if (!alreadyThisOne && availability.available <= 0) {
    return {
      ok: false,
      status: 409,
      code: "no_stock",
      message: `No hay licencias disponibles de ${availability.softwareName}`
    };
  }
  if (alreadyThisOne) {
    return { ok: true, license: serializeLicense(existing) };
  }
  const now = /* @__PURE__ */ new Date();
  if (existing) {
    const updated = await db.update(schema_exports.license).set({ softwareId, assigned: true, assignedAt: now }).where(eq2(schema_exports.license.id, existing.id)).returning();
    return { ok: true, license: serializeLicense(updated[0]) };
  }
  const inserted = await db.insert(schema_exports.license).values({
    id: newId("license"),
    organizationId,
    enrollmentId,
    softwareId,
    assigned: true,
    assignedAt: now
  }).returning();
  return { ok: true, license: serializeLicense(inserted[0]) };
}
function licenciaOcupada(licencia, cohorte, now = /* @__PURE__ */ new Date()) {
  if (!licencia.assigned) return false;
  if (licencia.expiresAt && licencia.expiresAt <= now) return false;
  if (!cohorte) return false;
  return computeCohortStatus(cohorte.startDate, cohorte.endDate, now) !== "finalizada";
}
async function contarOcupadas(organizationId, softwareId) {
  const db = getDb();
  const licencias = await db.select({
    softwareId: schema_exports.license.softwareId,
    assigned: schema_exports.license.assigned,
    expiresAt: schema_exports.license.expiresAt,
    startDate: schema_exports.cohort.startDate,
    endDate: schema_exports.cohort.endDate
  }).from(schema_exports.license).innerJoin(schema_exports.enrollment, eq2(schema_exports.license.enrollmentId, schema_exports.enrollment.id)).leftJoin(schema_exports.cohort, eq2(schema_exports.enrollment.cohortId, schema_exports.cohort.id)).where(
    scoped(
      schema_exports.license.organizationId,
      organizationId,
      softwareId ? eq2(schema_exports.license.softwareId, softwareId) : void 0
    )
  );
  const ahora = /* @__PURE__ */ new Date();
  const salida = /* @__PURE__ */ new Map();
  for (const l of licencias) {
    const ocupada = licenciaOcupada(
      { assigned: l.assigned, expiresAt: l.expiresAt },
      l.startDate ? { startDate: l.startDate, endDate: l.endDate } : null,
      ahora
    );
    if (ocupada) salida.set(l.softwareId, (salida.get(l.softwareId) ?? 0) + 1);
  }
  return salida;
}

// src/server/course-content.ts
import { asc as asc2, eq as eq3, like, ne } from "drizzle-orm";
import { z as z2 } from "zod";
var courseModulesSchema = z2.array(
  z2.object({
    title: z2.string().trim().min(1).max(200),
    topics: z2.array(z2.string().trim().min(1).max(300)).max(50)
  })
).max(60);

// src/server/teachers.ts
import { asc as asc3, eq as eq6, inArray } from "drizzle-orm";

// src/server/whatsapp/media.ts
import { eq as eq5 } from "drizzle-orm";

// src/server/whatsapp/credentials.ts
import { eq as eq4 } from "drizzle-orm";

// src/server/whatsapp/media.ts
var MEDIA_LIMITS = {
  image: {
    maxBytes: 5 * 1024 * 1024,
    mimes: /^image\/(jpeg|png|webp)$/,
    label: "imagen (jpeg/png/webp, m\xE1x. 5 MB)"
  },
  sticker: {
    maxBytes: 100 * 1024,
    mimes: /^image\/webp$/,
    label: "sticker (webp, m\xE1x. 100 KB)"
  },
  audio: {
    maxBytes: 16 * 1024 * 1024,
    mimes: /^audio\/(aac|mp4|mpeg|amr|ogg|opus)/,
    label: "audio (aac/mp4/mpeg/amr/ogg, m\xE1x. 16 MB)"
  },
  video: {
    maxBytes: 16 * 1024 * 1024,
    mimes: /^video\/(mp4|3gpp)$/,
    label: "video (mp4/3gpp, m\xE1x. 16 MB)"
  },
  document: {
    maxBytes: 100 * 1024 * 1024,
    mimes: /^[\w.-]+\/[\w.+-]+$/,
    label: "documento (m\xE1x. 100 MB)"
  }
};

// src/server/teachers.ts
async function createTeacher(organizationId, input) {
  const db = getDb();
  const id = newId("teacher");
  await db.insert(schema_exports.teacher).values({
    id,
    organizationId,
    name: input.name,
    email: input.email ?? null,
    title: input.title?.trim() || null
  });
  return id;
}
var FAR_FUTURE = /* @__PURE__ */ new Date(864e13);
function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  const aEndOrOngoing = aEnd ?? FAR_FUTURE;
  const bEndOrOngoing = bEnd ?? FAR_FUTURE;
  return aStart <= bEndOrOngoing && aEndOrOngoing >= bStart;
}
async function findScheduleConflicts(organizationId, teacherId, startDate, endDate, excludeCohortId) {
  const db = getDb();
  const rows = await db.select({ cohort: schema_exports.cohort, course: schema_exports.course }).from(schema_exports.cohort).innerJoin(schema_exports.course, eq6(schema_exports.cohort.courseId, schema_exports.course.id)).where(
    scoped(
      schema_exports.cohort.organizationId,
      organizationId,
      eq6(schema_exports.cohort.teacherId, teacherId)
    )
  );
  return rows.filter((r) => r.cohort.id !== excludeCohortId).filter((r) => rangesOverlap(r.cohort.startDate, r.cohort.endDate, startDate, endDate)).map((r) => ({
    cohortId: r.cohort.id,
    courseId: r.course.id,
    courseName: r.course.name,
    startDate: r.cohort.startDate.toISOString(),
    endDate: r.cohort.endDate?.toISOString() ?? null
  }));
}

// src/server/courses.ts
async function resolveUniqueCourseSlug(db, organizationId, desired, excludeCourseId) {
  const base = slugify(desired);
  const rows = await db.select({ slug: schema_exports.course.slug }).from(schema_exports.course).where(
    scoped(
      schema_exports.course.organizationId,
      organizationId,
      like2(schema_exports.course.slug, `${base}%`),
      excludeCourseId ? ne2(schema_exports.course.id, excludeCourseId) : void 0
    )
  );
  const taken = new Set(rows.map((r) => r.slug));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
async function validateCategory(db, organizationId, categoryId) {
  if (!categoryId) return null;
  const rows = await db.select({ id: schema_exports.courseCategory.id }).from(schema_exports.courseCategory).where(
    scoped(
      schema_exports.courseCategory.organizationId,
      organizationId,
      eq7(schema_exports.courseCategory.id, categoryId)
    )
  ).limit(1);
  return rows[0] ? null : "Categor\xEDa inexistente";
}
var httpUrl = z3.string().trim().max(2e3).refine((v) => /^https?:\/\//i.test(v), "Debe ser una URL que empiece con http:// o https://");
var courseContentSchema = {
  description: z3.string().max(8e3).nullable().optional(),
  slug: z3.string().trim().min(1).max(140).optional(),
  tagline: z3.string().max(300).nullable().optional(),
  categoryId: z3.string().min(1).nullable().optional(),
  level: z3.enum(["inicial", "intermedio", "avanzado"]).nullable().optional(),
  modality: z3.enum(["en_vivo", "asincronico", "presencial"]).nullable().optional(),
  durationWeeks: z3.number().int().min(1).max(520).nullable().optional(),
  hoursPerWeek: z3.number().int().min(1).max(168).nullable().optional(),
  imageUrl: httpUrl.nullable().optional(),
  learningObjectives: z3.array(z3.string().trim().min(1).max(300)).max(30).nullable().optional(),
  targetAudience: z3.string().max(4e3).nullable().optional(),
  syllabusUrl: httpUrl.nullable().optional(),
  published: z3.boolean().optional(),
  minAttendancePct: z3.number().int().min(0).max(100).nullable().optional()
};
async function createCourse(organizationId, input, tx) {
  const db = tx ?? getDb();
  const categoryError = await validateCategory(db, organizationId, input.categoryId);
  if (categoryError) {
    return { ok: false, status: 422, code: "invalid_body", message: categoryError };
  }
  const id = newId("course");
  const slug = await resolveUniqueCourseSlug(
    db,
    organizationId,
    input.slug?.trim() || input.name
  );
  const inserted = await db.insert(schema_exports.course).values({
    id,
    organizationId,
    name: input.name,
    description: input.description ?? null,
    slug,
    tagline: input.tagline ?? null,
    categoryId: input.categoryId ?? null,
    level: input.level ?? null,
    modality: input.modality ?? null,
    durationWeeks: input.durationWeeks ?? null,
    hoursPerWeek: input.hoursPerWeek ?? null,
    imageUrl: input.imageUrl ?? null,
    learningObjectives: input.learningObjectives ?? null,
    targetAudience: input.targetAudience ?? null,
    syllabusUrl: input.syllabusUrl ?? null,
    // 007 — un curso nuevo se publica salvo que se diga lo contrario:
    // el caso normal es el curso del catálogo.
    published: input.published ?? true,
    minAttendancePct: input.minAttendancePct ?? null
  }).returning();
  return { ok: true, id, course: inserted[0] };
}
var timeHHMM = z3.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Formato de hora inv\xE1lido (HH:MM)").nullable();
var cohortInputSchema = {
  name: z3.string().trim().max(200).nullable().optional(),
  endDate: z3.coerce.date().nullable().optional(),
  teacherId: z3.string().min(1).nullable().optional(),
  cost: z3.number().int().min(0).nullable().optional(),
  currency: z3.enum(CURRENCIES).optional(),
  minAttendancePct: z3.number().int().min(0).max(100).nullable().optional(),
  frequency: z3.string().max(200).nullable().optional(),
  startTime: timeHHMM.optional(),
  endTime: timeHHMM.optional(),
  // 005 iteración 4 — CSV "0,2" (lunes=0..domingo=6); vacío/null = sin días específicos.
  daysOfWeek: z3.string().regex(/^[0-6](,[0-6])*$/, "CSV de \xEDndices de d\xEDa 0-6").nullable().optional(),
  classroom: z3.string().max(120).nullable().optional(),
  capacity: z3.number().int().min(0).nullable().optional(),
  whatsappGroupLink: z3.string().max(2e3).nullable().optional(),
  virtualRoomId: z3.string().min(1).nullable().optional(),
  softwareIds: z3.array(z3.string().min(1)).optional()
};
async function computeLicenseWarnings(organizationId, softwareIds, capacity) {
  if (!capacity || softwareIds.length === 0) return [];
  const warnings = [];
  for (const softwareId of softwareIds) {
    const availability = await availableLicenses(organizationId, softwareId);
    if (!availability) continue;
    if (capacity > availability.available) {
      warnings.push({
        softwareId,
        softwareName: availability.softwareName,
        capacity,
        available: availability.available
      });
    }
  }
  return warnings;
}
async function validateCohortForeignKeys(db, organizationId, input) {
  if (input.courseId !== void 0) {
    const rows = await db.select({ id: schema_exports.course.id }).from(schema_exports.course).where(scoped(schema_exports.course.organizationId, organizationId, eq7(schema_exports.course.id, input.courseId))).limit(1);
    if (!rows[0]) return "Curso inexistente";
  }
  if (input.teacherId) {
    const rows = await db.select({ id: schema_exports.teacher.id }).from(schema_exports.teacher).where(scoped(schema_exports.teacher.organizationId, organizationId, eq7(schema_exports.teacher.id, input.teacherId))).limit(1);
    if (!rows[0]) return "Profesor inexistente";
  }
  if (input.softwareIds && input.softwareIds.length > 0) {
    const rows = await db.select({ id: schema_exports.software.id }).from(schema_exports.software).where(
      scoped(
        schema_exports.software.organizationId,
        organizationId,
        inArray2(schema_exports.software.id, input.softwareIds)
      )
    );
    if (rows.length !== new Set(input.softwareIds).size) return "Software inexistente";
  }
  return null;
}
async function createCohort(organizationId, input) {
  const db = getDb();
  const fkError = await validateCohortForeignKeys(db, organizationId, input);
  if (fkError) return { ok: false, status: 422, code: "invalid_body", message: fkError };
  const id = newId("cohort");
  await db.insert(schema_exports.cohort).values({
    id,
    organizationId,
    courseId: input.courseId,
    name: input.name ?? null,
    startDate: input.startDate,
    endDate: input.endDate ?? null,
    teacherId: input.teacherId ?? null,
    cost: input.cost ?? null,
    currency: input.currency ?? "UYU",
    minAttendancePct: input.minAttendancePct ?? null,
    frequency: input.frequency ?? null,
    startTime: input.startTime ?? null,
    endTime: input.endTime ?? null,
    daysOfWeek: input.daysOfWeek ?? null,
    classroom: input.classroom ?? null,
    capacity: input.capacity ?? null,
    whatsappGroupLink: input.whatsappGroupLink ?? null,
    virtualRoomId: input.virtualRoomId ?? null
  });
  if (input.softwareIds && input.softwareIds.length > 0) {
    await db.insert(schema_exports.cohortSoftware).values(
      input.softwareIds.map((softwareId) => ({ organizationId, cohortId: id, softwareId }))
    );
  }
  const licenseWarnings = await computeLicenseWarnings(
    organizationId,
    input.softwareIds ?? [],
    input.capacity
  );
  const scheduleWarnings = input.teacherId ? await findScheduleConflicts(
    organizationId,
    input.teacherId,
    input.startDate,
    input.endDate ?? null,
    id
  ) : [];
  return { ok: true, id, licenseWarnings, scheduleWarnings };
}
function computeCohortStatus(startDate, endDate, now = /* @__PURE__ */ new Date()) {
  if (now < startDate) return "planificada";
  if (endDate && now > endDate) return "finalizada";
  return "en_curso";
}

// src/server/enrollments.ts
import { and as and2, asc as asc5, eq as eq8 } from "drizzle-orm";

// src/lib/phone.ts
var DEFAULT_COUNTRY = "598";
function normalizePhoneInput(raw) {
  const s = (raw || "").trim();
  if (!s) return null;
  const international = s.startsWith("+") || /^00\d/.test(s);
  let d = s.replace(/\D/g, "");
  if (international) d = d.replace(/^0+/, "");
  if (!d) return null;
  if (/^521\d{10}$/.test(d)) return `52${d.slice(3)}`;
  if (d.startsWith("598") && d.length >= 11) return d;
  if (d.startsWith("595") && d.length >= 12) return d;
  if (international && d.length >= 8) return d;
  if (d.startsWith("0") && d.length === 9) return `${DEFAULT_COUNTRY}${d.slice(1)}`;
  if (d.length === 8) return `${DEFAULT_COUNTRY}${d}`;
  if (d.length === 9) return `${DEFAULT_COUNTRY}${d.slice(1)}`;
  if (d.length >= 10) return d;
  return null;
}
function normalizePhoneOrRaw(raw) {
  return normalizePhoneInput(raw) ?? raw.replace(/\D/g, "");
}

// src/lib/portal-access.ts
var PORTAL_NO_EMAIL_REASON = "No tiene correo cargado. Agregale un correo al contacto y vas a poder invitarlo.";

// src/server/enrollments.ts
async function createEnrollment(organizationId, input) {
  const db = getDb();
  if (!input.contactId && !input.contact) {
    return {
      ok: false,
      status: 422,
      code: "invalid_body",
      message: "Falta contactId o los datos de contacto (contact)"
    };
  }
  const cohortRows = await db.select({ id: schema_exports.cohort.id }).from(schema_exports.cohort).where(
    scoped(
      schema_exports.cohort.organizationId,
      organizationId,
      eq8(schema_exports.cohort.id, input.cohortId)
    )
  ).limit(1);
  if (!cohortRows[0]) {
    return { ok: false, status: 422, code: "invalid_body", message: "Cohorte inexistente" };
  }
  if (input.sellerId) {
    const memberRows = await db.select({ id: schema_exports.member.id }).from(schema_exports.member).where(
      scoped(
        schema_exports.member.organizationId,
        organizationId,
        eq8(schema_exports.member.userId, input.sellerId)
      )
    ).limit(1);
    if (!memberRows[0]) {
      return {
        ok: false,
        status: 422,
        code: "invalid_body",
        message: "sellerId no es miembro de la organizaci\xF3n"
      };
    }
  }
  if (input.companyId) {
    const companyRows = await db.select({ id: schema_exports.company.id }).from(schema_exports.company).where(
      scoped(schema_exports.company.organizationId, organizationId, eq8(schema_exports.company.id, input.companyId))
    ).limit(1);
    if (!companyRows[0]) {
      return { ok: false, status: 422, code: "invalid_body", message: "Empresa inexistente" };
    }
  }
  let contactId;
  let nationalIdForRecord;
  if (input.contactId) {
    const contactRows = await db.select({ id: schema_exports.contact.id, nationalId: schema_exports.contact.nationalId }).from(schema_exports.contact).where(
      scoped(
        schema_exports.contact.organizationId,
        organizationId,
        eq8(schema_exports.contact.id, input.contactId)
      )
    ).limit(1);
    if (!contactRows[0]) {
      return { ok: false, status: 422, code: "invalid_body", message: "Contacto inexistente" };
    }
    contactId = contactRows[0].id;
    nationalIdForRecord = contactRows[0].nationalId;
  } else {
    const phone = normalizePhoneOrRaw(input.contact.phone);
    const inserted2 = await db.insert(schema_exports.contact).values({
      id: newId("contact"),
      organizationId,
      firstName: input.contact.firstName,
      lastName: input.contact.lastName ?? null,
      phone,
      waIdentity: phone,
      email: input.contact.email ?? null,
      nationalId: input.contact.nationalId ?? null
    }).returning();
    contactId = inserted2[0].id;
    nationalIdForRecord = input.contact.nationalId ?? null;
  }
  const stageRows = await db.select({ id: schema_exports.pipelineStage.id }).from(schema_exports.pipelineStage).where(
    and2(
      eq8(schema_exports.pipelineStage.organizationId, organizationId),
      eq8(schema_exports.pipelineStage.kind, "open")
    )
  ).orderBy(asc5(schema_exports.pipelineStage.position)).limit(1);
  const stageId = stageRows[0]?.id;
  if (!stageId) {
    return {
      ok: false,
      status: 422,
      code: "invalid_body",
      message: "La organizaci\xF3n no tiene etapas abiertas"
    };
  }
  const inserted = await db.insert(schema_exports.enrollment).values({
    id: newId("enrollment"),
    organizationId,
    contactId,
    cohortId: input.cohortId,
    stageId,
    enrolledAt: /* @__PURE__ */ new Date(),
    amount: input.amount ?? null,
    currency: input.currency ?? "UYU",
    installments: input.installments ?? null,
    paymentNotes: input.paymentNotes ?? null,
    nationalId: nationalIdForRecord,
    invoiceNumber: input.invoiceNumber ?? null,
    receiptNumber: input.receiptNumber ?? null,
    sellerId: input.sellerId ?? null,
    companyId: input.companyId ?? null
  }).returning();
  return { ok: true, enrollment: serializeEnrollmentCommercial(inserted[0]) };
}
function serializeEnrollmentCommercial(e) {
  return {
    id: e.id,
    contactId: e.contactId,
    cohortId: e.cohortId,
    stageId: e.stageId,
    amount: e.amount,
    currency: e.currency,
    installments: e.installments,
    paymentNotes: e.paymentNotes,
    nationalId: e.nationalId,
    invoiceNumber: e.invoiceNumber,
    receiptNumber: e.receiptNumber,
    sellerId: e.sellerId,
    companyId: e.companyId,
    createdAt: e.createdAt.toISOString()
  };
}

// src/server/attendance.ts
import { and as and3, asc as asc6, eq as eq9, isNull } from "drizzle-orm";
function buildClassSchedule(startDate, endDate, daysOfWeek, hoursPerClass) {
  if (!daysOfWeek) return [];
  const days = new Set(
    daysOfWeek.split(",").map((d) => Number(d.trim())).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
  );
  if (days.size === 0) return [];
  if (endDate < startDate) return [];
  const out = [];
  const cursor = new Date(startDate);
  cursor.setHours(0, 0, 0, 0);
  const last = new Date(endDate);
  last.setHours(23, 59, 59, 999);
  while (cursor <= last) {
    const index2 = (cursor.getDay() + 6) % 7;
    if (days.has(index2)) {
      out.push({ number: out.length + 1, date: new Date(cursor), hours: hoursPerClass });
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}
async function generateSchedule(organizationId, cohortId) {
  const db = getDb();
  const rows = await db.select().from(schema_exports.cohort).where(scoped(schema_exports.cohort.organizationId, organizationId, eq9(schema_exports.cohort.id, cohortId))).limit(1);
  const cohort2 = rows[0];
  if (!cohort2) {
    return { ok: false, status: 404, code: "not_found", message: "Cohorte no encontrada" };
  }
  if (!cohort2.endDate) {
    return {
      ok: false,
      status: 422,
      code: "no_end_date",
      message: "La cohorte no tiene fecha de fin: no se puede generar el cronograma"
    };
  }
  if (!cohort2.daysOfWeek) {
    return {
      ok: false,
      status: 422,
      code: "no_days",
      message: "La cohorte no declara d\xEDas de cursada. Cargalos y volv\xE9 a generar."
    };
  }
  const existing = await db.select({ id: schema_exports.classSession.id }).from(schema_exports.classSession).where(
    scoped(
      schema_exports.classSession.organizationId,
      organizationId,
      eq9(schema_exports.classSession.cohortId, cohortId)
    )
  );
  if (existing.length > 0) {
    return {
      ok: false,
      status: 409,
      code: "schedule_exists",
      message: "La cohorte ya tiene cronograma. Borralo antes de regenerarlo."
    };
  }
  const hoursPerClass = hoursFromTimes(cohort2.startTime, cohort2.endTime);
  const plan = buildClassSchedule(
    cohort2.startDate,
    cohort2.endDate,
    cohort2.daysOfWeek,
    hoursPerClass
  );
  if (plan.length === 0) {
    return {
      ok: false,
      status: 422,
      code: "empty_schedule",
      message: "El rango de fechas y los d\xEDas de cursada no producen ninguna clase"
    };
  }
  await db.insert(schema_exports.classSession).values(
    plan.map((p) => ({
      id: newId("classSession"),
      organizationId,
      cohortId,
      number: p.number,
      date: p.date,
      startTime: cohort2.startTime,
      endTime: cohort2.endTime,
      hours: p.hours,
      teacherId: cohort2.teacherId
    }))
  );
  return { ok: true, data: await listSessions(organizationId, cohortId) };
}
function hoursFromTimes(start, end) {
  if (!start || !end) return null;
  const toMinutes = (t) => {
    const m = t.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  };
  const a = toMinutes(start);
  const b = toMinutes(end);
  if (a === null || b === null || b <= a) return null;
  return Math.round((b - a) / 60);
}
async function listSessions(organizationId, cohortId) {
  const rows = await getDb().select().from(schema_exports.classSession).where(
    scoped(
      schema_exports.classSession.organizationId,
      organizationId,
      eq9(schema_exports.classSession.cohortId, cohortId)
    )
  ).orderBy(asc6(schema_exports.classSession.number));
  return rows.map((s) => ({
    id: s.id,
    number: s.number,
    date: s.date.toISOString(),
    startTime: s.startTime,
    endTime: s.endTime,
    hours: s.hours,
    teacherId: s.teacherId,
    topic: s.topic,
    canceledAt: s.canceledAt?.toISOString() ?? null,
    cancelReason: s.cancelReason
  }));
}
async function markAttendance(organizationId, classSessionId, entries, recordedBy) {
  const db = getDb();
  const sessionRows = await db.select({ id: schema_exports.classSession.id, canceledAt: schema_exports.classSession.canceledAt }).from(schema_exports.classSession).where(
    scoped(
      schema_exports.classSession.organizationId,
      organizationId,
      eq9(schema_exports.classSession.id, classSessionId)
    )
  ).limit(1);
  const session2 = sessionRows[0];
  if (!session2) {
    return { ok: false, status: 404, code: "not_found", message: "Clase no encontrada" };
  }
  if (session2.canceledAt) {
    return {
      ok: false,
      status: 422,
      code: "session_canceled",
      message: "La clase est\xE1 cancelada: no se puede tomar asistencia"
    };
  }
  if (entries.length === 0) return { ok: true, data: { marked: 0 } };
  const now = /* @__PURE__ */ new Date();
  for (const e of entries) {
    await db.insert(schema_exports.attendance).values({
      id: newId("attendance"),
      organizationId,
      classSessionId,
      enrollmentId: e.enrollmentId,
      status: e.status,
      notes: e.notes ?? null,
      recordedBy: recordedBy ?? null
    }).onConflictDoUpdate({
      target: [schema_exports.attendance.classSessionId, schema_exports.attendance.enrollmentId],
      set: {
        status: e.status,
        notes: e.notes ?? null,
        // La corrección pisa al autor anterior: quien vale es quien dejó el
        // dato como está ahora, no quien lo puso mal la primera vez.
        recordedBy: recordedBy ?? null,
        updatedAt: now
      }
    });
  }
  return { ok: true, data: { marked: entries.length } };
}

// src/server/grading.ts
import { and as and4, asc as asc7, eq as eq10, inArray as inArray3 } from "drizzle-orm";
async function listAssessments(organizationId, cohortId) {
  const rows = await getDb().select().from(schema_exports.assessment).where(
    scoped(
      schema_exports.assessment.organizationId,
      organizationId,
      eq10(schema_exports.assessment.cohortId, cohortId)
    )
  ).orderBy(asc7(schema_exports.assessment.position));
  return rows.map((a) => ({
    id: a.id,
    name: a.name,
    position: a.position,
    required: a.required
  }));
}
async function createAssessment(organizationId, cohortId, input) {
  const db = getDb();
  const cohortRows = await db.select({ id: schema_exports.cohort.id }).from(schema_exports.cohort).where(scoped(schema_exports.cohort.organizationId, organizationId, eq10(schema_exports.cohort.id, cohortId))).limit(1);
  if (!cohortRows[0]) {
    return { ok: false, status: 404, code: "not_found", message: "Cohorte no encontrada" };
  }
  const existing = await listAssessments(organizationId, cohortId);
  const inserted = await db.insert(schema_exports.assessment).values({
    id: newId("assessment"),
    organizationId,
    cohortId,
    name: input.name,
    position: existing.length,
    required: input.required ?? true
  }).returning();
  const a = inserted[0];
  return {
    ok: true,
    data: { id: a.id, name: a.name, position: a.position, required: a.required }
  };
}
async function recordResults(organizationId, assessmentId, entries, recordedBy) {
  const db = getDb();
  const rows = await db.select({ id: schema_exports.assessment.id }).from(schema_exports.assessment).where(
    scoped(
      schema_exports.assessment.organizationId,
      organizationId,
      eq10(schema_exports.assessment.id, assessmentId)
    )
  ).limit(1);
  if (!rows[0]) {
    return { ok: false, status: 404, code: "not_found", message: "Evaluaci\xF3n no encontrada" };
  }
  const now = /* @__PURE__ */ new Date();
  for (const e of entries) {
    await db.insert(schema_exports.assessmentResult).values({
      id: newId("assessmentResult"),
      organizationId,
      assessmentId,
      enrollmentId: e.enrollmentId,
      passed: e.passed,
      notes: e.notes ?? null,
      recordedBy: recordedBy ?? null
    }).onConflictDoUpdate({
      target: [schema_exports.assessmentResult.assessmentId, schema_exports.assessmentResult.enrollmentId],
      set: { passed: e.passed, notes: e.notes ?? null, updatedAt: now }
    });
  }
  return { ok: true, data: { recorded: entries.length } };
}

// src/server/billing.ts
import { asc as asc8, eq as eq11, gte, isNull as isNull2, lt, sum } from "drizzle-orm";
function buildInstallmentPlan(amount, count3, firstDueDate) {
  if (count3 < 1) throw new Error("El plan necesita al menos una cuota");
  if (amount < 0) throw new Error("El monto no puede ser negativo");
  const base = Math.floor(amount / count3);
  const remainder = amount - base * count3;
  return Array.from({ length: count3 }, (_, i) => {
    const dueDate = new Date(firstDueDate);
    dueDate.setMonth(dueDate.getMonth() + i);
    return {
      number: i + 1,
      amount: i === 0 ? base + remainder : base,
      dueDate
    };
  });
}
function installmentStatus(amount, paid, dueDate, now = /* @__PURE__ */ new Date()) {
  if (paid >= amount) return "pagada";
  if (dueDate < now) return "vencida";
  if (paid > 0) return "parcial";
  return "pendiente";
}
async function generateInstallmentPlan(organizationId, enrollmentId, input) {
  const db = getDb();
  const rows = await db.select({
    id: schema_exports.enrollment.id,
    amount: schema_exports.enrollment.amount,
    currency: schema_exports.enrollment.currency
  }).from(schema_exports.enrollment).where(
    scoped(
      schema_exports.enrollment.organizationId,
      organizationId,
      eq11(schema_exports.enrollment.id, enrollmentId)
    )
  ).limit(1);
  const enrollment2 = rows[0];
  if (!enrollment2) {
    return { ok: false, status: 404, code: "not_found", message: "Inscripci\xF3n no encontrada" };
  }
  if (enrollment2.amount === null) {
    return {
      ok: false,
      status: 422,
      code: "no_amount",
      message: "La inscripci\xF3n no tiene monto cargado: no hay qu\xE9 repartir en cuotas"
    };
  }
  const existing = await db.select({ id: schema_exports.installment.id }).from(schema_exports.installment).where(
    scoped(
      schema_exports.installment.organizationId,
      organizationId,
      eq11(schema_exports.installment.enrollmentId, enrollmentId)
    )
  );
  if (existing.length > 0) {
    return {
      ok: false,
      status: 409,
      code: "plan_exists",
      message: "La inscripci\xF3n ya tiene un plan de cuotas. Anul\xE1 el actual antes de rearmarlo."
    };
  }
  const plan = buildInstallmentPlan(enrollment2.amount, input.count, input.firstDueDate);
  await db.insert(schema_exports.installment).values(
    plan.map((p) => ({
      id: newId("installment"),
      organizationId,
      enrollmentId,
      number: p.number,
      dueDate: p.dueDate,
      amount: p.amount,
      currency: enrollment2.currency
    }))
  );
  const listed = await listInstallments(organizationId, enrollmentId);
  return { ok: true, data: listed };
}
async function listInstallments(organizationId, enrollmentId, now = /* @__PURE__ */ new Date()) {
  const db = getDb();
  const [installments, payments] = await Promise.all([
    db.select().from(schema_exports.installment).where(
      scoped(
        schema_exports.installment.organizationId,
        organizationId,
        eq11(schema_exports.installment.enrollmentId, enrollmentId)
      )
    ).orderBy(asc8(schema_exports.installment.number)),
    db.select().from(schema_exports.payment).where(
      scoped(
        schema_exports.payment.organizationId,
        organizationId,
        eq11(schema_exports.payment.enrollmentId, enrollmentId)
      )
    )
  ]);
  const paidByInstallment = /* @__PURE__ */ new Map();
  for (const p of payments) {
    if (p.voidedAt || !p.installmentId) continue;
    paidByInstallment.set(
      p.installmentId,
      (paidByInstallment.get(p.installmentId) ?? 0) + p.amount
    );
  }
  return installments.map((i) => {
    const paid = paidByInstallment.get(i.id) ?? 0;
    return {
      id: i.id,
      number: i.number,
      dueDate: i.dueDate.toISOString(),
      amount: i.amount,
      currency: i.currency,
      paid,
      balance: Math.max(0, i.amount - paid),
      status: i.canceledAt ? "pagada" : installmentStatus(i.amount, paid, i.dueDate, now),
      canceledAt: i.canceledAt?.toISOString() ?? null,
      notes: i.notes
    };
  });
}
async function recordPayment(organizationId, enrollmentId, input) {
  const db = getDb();
  if (input.amount <= 0) {
    return { ok: false, status: 422, code: "invalid_amount", message: "El monto debe ser mayor a cero" };
  }
  if (input.idempotencyKey) {
    const dup = await db.select().from(schema_exports.payment).where(
      scoped(
        schema_exports.payment.organizationId,
        organizationId,
        eq11(schema_exports.payment.idempotencyKey, input.idempotencyKey)
      )
    ).limit(1);
    if (dup[0]) return { ok: true, data: serializePayment(dup[0]) };
  }
  const enrollmentRows = await db.select({ id: schema_exports.enrollment.id, currency: schema_exports.enrollment.currency }).from(schema_exports.enrollment).where(
    scoped(
      schema_exports.enrollment.organizationId,
      organizationId,
      eq11(schema_exports.enrollment.id, enrollmentId)
    )
  ).limit(1);
  const enrollment2 = enrollmentRows[0];
  if (!enrollment2) {
    return { ok: false, status: 404, code: "not_found", message: "Inscripci\xF3n no encontrada" };
  }
  let currency = enrollment2.currency;
  if (input.installmentId) {
    const instRows = await db.select().from(schema_exports.installment).where(
      scoped(
        schema_exports.installment.organizationId,
        organizationId,
        eq11(schema_exports.installment.id, input.installmentId)
      )
    ).limit(1);
    const inst = instRows[0];
    if (!inst || inst.enrollmentId !== enrollmentId) {
      return {
        ok: false,
        status: 422,
        code: "invalid_installment",
        message: "La cuota no pertenece a esta inscripci\xF3n"
      };
    }
    currency = inst.currency;
  }
  const inserted = await db.insert(schema_exports.payment).values({
    id: newId("payment"),
    organizationId,
    enrollmentId,
    installmentId: input.installmentId ?? null,
    amount: input.amount,
    currency,
    paidAt: input.paidAt,
    method: input.method,
    receiptNumber: input.receiptNumber ?? null,
    notes: input.notes ?? null,
    idempotencyKey: input.idempotencyKey ?? null,
    recordedBy: input.recordedBy ?? null
  }).returning();
  return { ok: true, data: serializePayment(inserted[0]) };
}
function serializePayment(p) {
  return {
    id: p.id,
    installmentId: p.installmentId,
    amount: p.amount,
    currency: p.currency,
    paidAt: p.paidAt.toISOString(),
    method: p.method,
    receiptNumber: p.receiptNumber,
    notes: p.notes,
    voidedAt: p.voidedAt?.toISOString() ?? null,
    voidReason: p.voidReason
  };
}

// src/server/resources.ts
import { asc as asc9, eq as eq12 } from "drizzle-orm";
function validateResource(input) {
  const tieneCurso = Boolean(input.courseId);
  const tieneClase = Boolean(input.classSessionId);
  if (tieneCurso === tieneClase) {
    return {
      ok: false,
      status: 422,
      code: "invalid_container",
      message: tieneCurso ? "Un material va en el curso o en una clase, no en los dos" : "Un material tiene que ir en un curso o en una clase"
    };
  }
  if (!input.title.trim()) {
    return { ok: false, status: 422, code: "invalid_title", message: "Falta el t\xEDtulo" };
  }
  try {
    const u = new URL(input.url.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error();
  } catch {
    return {
      ok: false,
      status: 422,
      code: "invalid_url",
      message: "El enlace tiene que empezar con http:// o https://"
    };
  }
  if (input.kind && !RESOURCE_KINDS.includes(input.kind)) {
    return { ok: false, status: 422, code: "invalid_kind", message: "Tipo desconocido" };
  }
  return { ok: true, data: input };
}
function serialize(row) {
  return {
    id: row.id,
    title: row.title,
    url: row.url,
    kind: row.kind,
    position: row.position,
    courseId: row.courseId,
    classSessionId: row.classSessionId,
    courseModuleId: row.courseModuleId
  };
}
async function createResource(organizationId, input) {
  const valid = validateResource(input);
  if (!valid.ok) return valid;
  const inserted = await getDb().insert(schema_exports.resource).values({
    id: newId("resource"),
    organizationId,
    courseId: input.courseId ?? null,
    classSessionId: input.classSessionId ?? null,
    courseModuleId: input.courseModuleId ?? null,
    title: input.title.trim(),
    url: input.url.trim(),
    kind: input.kind ?? "enlace"
  }).returning();
  const row = inserted[0];
  if (!row) {
    return { ok: false, status: 422, code: "not_created", message: "No se pudo guardar" };
  }
  return { ok: true, data: serialize(row) };
}
async function createAnnouncement(organizationId, cohortId, authorUserId, input) {
  if (!input.title.trim() || !input.body.trim()) {
    return {
      ok: false,
      status: 422,
      code: "invalid_body",
      message: "El aviso necesita t\xEDtulo y cuerpo"
    };
  }
  const cohorte = await getDb().select({ id: schema_exports.cohort.id }).from(schema_exports.cohort).where(scoped(schema_exports.cohort.organizationId, organizationId, eq12(schema_exports.cohort.id, cohortId))).limit(1);
  if (!cohorte[0]) {
    return { ok: false, status: 404, code: "not_found", message: "Cohorte no encontrada" };
  }
  const inserted = await getDb().insert(schema_exports.announcement).values({
    id: newId("announcement"),
    organizationId,
    cohortId,
    authorUserId,
    title: input.title.trim(),
    body: input.body.trim()
  }).returning();
  const row = inserted[0];
  return {
    ok: true,
    data: {
      id: row.id,
      title: row.title,
      body: row.body,
      authorName: null,
      createdAt: row.createdAt.toISOString()
    }
  };
}

// src/server/access.ts
import { and as and6, eq as eq14 } from "drizzle-orm";
import { customAlphabet as customAlphabet2 } from "nanoid";

// src/lib/auth/index.ts
import { AsyncLocalStorage as AsyncLocalStorage2 } from "node:async_hooks";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization as organization2 } from "better-auth/plugins";

// src/lib/rate-limit.ts
var globalForRl = globalThis;
function store() {
  if (!globalForRl.__voceroRateLimit) {
    globalForRl.__voceroRateLimit = /* @__PURE__ */ new Map();
  }
  return globalForRl.__voceroRateLimit;
}
function checkRateLimit(key, opts, now = Date.now()) {
  const buckets = store();
  const cutoff = now - opts.windowMs;
  const bucket = (buckets.get(key) ?? []).filter((t) => t > cutoff);
  if (bucket.length >= opts.max) {
    buckets.set(key, bucket);
    return { allowed: false, remaining: 0 };
  }
  bucket.push(now);
  buckets.set(key, bucket);
  return { allowed: true, remaining: opts.max - bucket.length };
}
var AUTH_RATE_LIMIT = { windowMs: 10 * 60 * 1e3, max: 10 };

// src/server/auth/on-signup.ts
import { and as and5, count, eq as eq13, sql as sql3 } from "drizzle-orm";

// src/lib/capabilities.ts
var CAPABILITIES = [
  // Académico
  "academico.ver",
  "academico.editar",
  "asistencia.ver",
  "asistencia.editar",
  "evaluacion.ver",
  "evaluacion.editar",
  "certificados.emitir",
  // Comercial y financiero
  "contactos.ver",
  "contactos.editar",
  "inscripciones.ver",
  "inscripciones.editar",
  "cobranza.ver",
  "cobranza.editar",
  // Conversaciones
  "inbox.ver",
  "inbox.responder",
  // Plataforma
  "configuracion.editar",
  "accesos.gestionar"
];
var FINANCIAL_CAPABILITIES = [
  "inscripciones.editar",
  "cobranza.ver",
  "cobranza.editar"
];
var ROLE_CAPABILITIES = {
  owner: CAPABILITIES,
  member: CAPABILITIES,
  soporte: CAPABILITIES.filter((c) => !FINANCIAL_CAPABILITIES.includes(c))
};
var SYSTEM_ROLES = [
  { key: "direccion", name: "Direcci\xF3n", capabilities: CAPABILITIES },
  {
    key: "coordinacion",
    name: "Coordinaci\xF3n",
    capabilities: CAPABILITIES.filter((c) => c !== "configuracion.editar")
  },
  {
    key: "soporte",
    name: "Soporte",
    capabilities: CAPABILITIES.filter((c) => !FINANCIAL_CAPABILITIES.includes(c))
  }
];

// src/server/auth/on-signup.ts
var SEED_STAGES = [
  { name: "Nuevo", kind: "open" },
  { name: "En conversaci\xF3n", kind: "open" },
  { name: "Interesado", kind: "open" },
  { name: "Cliente", kind: "won" },
  { name: "Perdido", kind: "lost" }
];
async function onUserCreated(userId, userName) {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.execute(sql3`select pg_advisory_xact_lock(874201)`);
    const [orgs2] = await tx.select({ n: count() }).from(schema_exports.organization);
    if ((orgs2?.n ?? 0) > 0) return;
    const orgId = newId("organization");
    await tx.insert(schema_exports.organization).values({
      id: orgId,
      name: userName ? `Negocio de ${userName}` : "Mi negocio",
      slug: "principal"
    });
    await tx.execute(sql3`select set_config('app.current_org', ${orgId}, true)`);
    await tx.execute(sql3`select set_config('app.current_actor', ${userId}, true)`);
    await tx.insert(schema_exports.member).values({
      id: newId("member"),
      organizationId: orgId,
      userId,
      role: "direccion"
    });
    await tx.insert(schema_exports.pipelineStage).values(
      SEED_STAGES.map((s, i) => ({
        id: newId("stage"),
        organizationId: orgId,
        name: s.name,
        position: i,
        kind: s.kind
      }))
    );
    await tx.insert(schema_exports.agentProfile).values({
      id: newId("agentProfile"),
      organizationId: orgId
    });
    await tx.insert(schema_exports.role).values(
      SYSTEM_ROLES.map((r) => ({
        id: newId("role"),
        organizationId: orgId,
        key: r.key,
        name: r.name,
        capabilities: [...r.capabilities],
        system: true
      }))
    );
  });
}
async function resolveActiveOrganizationId(userId) {
  return (await resolveMembership(userId))?.organizationId ?? null;
}
async function resolveMembership(userId) {
  const db = getDb();
  const rows = await db.select({
    organizationId: schema_exports.member.organizationId,
    role: schema_exports.member.role,
    capabilities: schema_exports.role.capabilities
  }).from(schema_exports.member).leftJoin(
    schema_exports.role,
    and5(
      eq13(schema_exports.role.organizationId, schema_exports.member.organizationId),
      eq13(schema_exports.role.key, schema_exports.member.role)
    )
  ).where(eq13(schema_exports.member.userId, userId)).limit(1);
  return rows[0] ?? null;
}

// src/server/auth/registration.ts
import { count as count2 } from "drizzle-orm";
async function isPublicSignupAllowed() {
  if (process.env.ALLOW_SIGNUP === "true") return true;
  const db = getDb();
  const rows = await db.select({ n: count2() }).from(schema_exports.organization);
  return (rows[0]?.n ?? 0) === 0;
}

// src/lib/auth/index.ts
var globalForSignup = globalThis;
function internalSignupContext() {
  if (!globalForSignup.__voceroInternalSignup) {
    globalForSignup.__voceroInternalSignup = new AsyncLocalStorage2();
  }
  return globalForSignup.__voceroInternalSignup;
}
function runInternalSignup(fn) {
  return internalSignupContext().run(true, fn);
}
function isInternalSignup() {
  return internalSignupContext().getStore() === true;
}
var RATE_LIMITED_PATHS = /* @__PURE__ */ new Set(["/sign-in/email", "/sign-up/email"]);
function createAuth() {
  const env = getEnv();
  return betterAuth({
    baseURL: env.APP_BASE_URL,
    secret: env.BETTER_AUTH_SECRET,
    /**
     * Better Auth valida el header `Origin` contra `baseURL` y responde 403
     * si no coinciden. En desarrollo eso muerde por una razón tonta: si el
     * 3000 está ocupado, Next arranca en 3001 y el login deja de funcionar
     * con un "Invalid origin" que no dice nada sobre puertos. Se habilita
     * localhost en cualquier puerto SOLO fuera de producción.
     *
     * En producción la lista queda vacía a propósito: el único origen válido
     * es `APP_BASE_URL`, que es justamente la protección que hace que un
     * sitio ajeno no pueda postear al login de esta instancia.
     */
    trustedOrigins: (request) => {
      if (env.NODE_ENV === "production") return [];
      const origin = request?.headers.get("origin");
      if (!origin) return [];
      return /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin) ? [origin] : [];
    },
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: {
        user: schema_exports.user,
        session: schema_exports.session,
        account: schema_exports.account,
        verification: schema_exports.verification,
        organization: schema_exports.organization,
        member: schema_exports.member,
        invitation: schema_exports.invitation
      }
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      minPasswordLength: 8
    },
    plugins: [organization2({ creatorRole: "owner" })],
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (RATE_LIMITED_PATHS.has(ctx.path)) {
          const ip = ctx.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() || ctx.headers?.get("x-real-ip") || "local";
          const result = checkRateLimit(`${ctx.path}:${ip}`, AUTH_RATE_LIMIT);
          if (!result.allowed) {
            throw new APIError("TOO_MANY_REQUESTS", {
              message: "Demasiados intentos; espera unos minutos"
            });
          }
        }
        if (ctx.path === "/sign-up/email") {
          if (!isInternalSignup() && !await isPublicSignupAllowed()) {
            throw new APIError("FORBIDDEN", {
              message: "El registro est\xE1 cerrado: esta instancia ya tiene su organizaci\xF3n"
            });
          }
        }
      })
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user2) => {
            await onUserCreated(user2.id, user2.name);
          }
        }
      },
      session: {
        create: {
          before: async (session2) => {
            const organizationId = await resolveActiveOrganizationId(
              session2.userId
            );
            return {
              data: { ...session2, activeOrganizationId: organizationId }
            };
          }
        }
      }
    }
  });
}
var globalForAuth = globalThis;
function getAuth() {
  if (!globalForAuth.__voceroAuth) globalForAuth.__voceroAuth = createAuth();
  return globalForAuth.__voceroAuth;
}

// src/lib/m365/client.ts
var GRAPH = "https://graph.microsoft.com/v1.0";
var TOKEN_ENDPOINT = (tenantId) => `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
var cachedToken = null;
function getM365Config() {
  const env = getEnv();
  if (!env.M365_TENANT_ID || !env.M365_CLIENT_ID || !env.M365_CLIENT_SECRET || !env.M365_SENDER) {
    return null;
  }
  return {
    tenantId: env.M365_TENANT_ID,
    clientId: env.M365_CLIENT_ID,
    clientSecret: env.M365_CLIENT_SECRET,
    sender: env.M365_SENDER
  };
}
async function getAccessToken(config) {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 6e4) {
    return cachedToken.value;
  }
  const res = await fetch(TOKEN_ENDPOINT(config.tenantId), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials"
    })
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(
      `M365: no se pudo obtener el token (${res.status}). ${body?.error_description ?? ""}`.trim()
    );
  }
  const data = await res.json();
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1e3
  };
  return data.access_token;
}
async function sendMail(input) {
  const config = getM365Config();
  if (!config) {
    return {
      ok: false,
      code: "not_configured",
      message: "M365 no est\xE1 configurado en esta instancia"
    };
  }
  let token;
  try {
    token = await getAccessToken(config);
  } catch (e) {
    return {
      ok: false,
      code: "send_failed",
      message: e instanceof Error ? e.message : "Error de autenticaci\xF3n con M365"
    };
  }
  const res = await fetch(
    `${GRAPH}/users/${encodeURIComponent(config.sender)}/sendMail`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        message: {
          subject: input.subject,
          body: { contentType: "HTML", content: input.html },
          toRecipients: [{ emailAddress: { address: input.to } }],
          ...input.bcc ? { bccRecipients: [{ emailAddress: { address: input.bcc } }] } : {}
        },
        saveToSentItems: true
      })
    }
  ).catch(() => null);
  if (res?.status === 202) return { ok: true };
  const body = await res?.json().catch(() => null);
  return {
    ok: false,
    code: "send_failed",
    message: body?.error?.message ?? `M365 rechaz\xF3 el env\xEDo${res ? ` (${res.status})` : " (sin respuesta)"}`
  };
}

// src/server/email/templates.ts
import { readFileSync } from "node:fs";
import path from "node:path";
var TEMPLATE_DIR = path.join(process.cwd(), "docs", "email-templates");
var cache = /* @__PURE__ */ new Map();
function loadTemplate(name) {
  const cached2 = cache.get(name);
  if (cached2 && process.env.NODE_ENV === "production") return cached2;
  const html = readFileSync(path.join(TEMPLATE_DIR, `${name}.html`), "utf8");
  cache.set(name, html);
  return html;
}
function renderTemplate(name, values) {
  const html = loadTemplate(name);
  return html.replace(
    /\{\{(\w+)\}\}/g,
    (_match, key) => escapeHtml(values[key] ?? "")
  );
}

// src/server/access.ts
function validateAccountLink(input, facts) {
  const incoherente = input.kind === "alumno" ? !input.contactId || Boolean(input.teacherId) : !input.teacherId || Boolean(input.contactId);
  if (incoherente) {
    return {
      ok: false,
      status: 422,
      code: "incoherent_link",
      message: input.kind === "alumno" ? "Un acceso de alumno necesita un contacto, y solo un contacto" : "Un acceso de profesor necesita un profesor, y solo un profesor"
    };
  }
  if (input.kind === "alumno" && !facts.contactHasEnrollment) {
    return {
      ok: false,
      status: 422,
      code: "not_enrolled",
      message: "El contacto no tiene ninguna inscripci\xF3n; el acceso de alumno nace de la inscripci\xF3n"
    };
  }
  return { ok: true, data: input };
}
async function contactHasEnrollment(organizationId, contactId) {
  const rows = await getDb().select({ id: schema_exports.enrollment.id }).from(schema_exports.enrollment).where(
    scoped(
      schema_exports.enrollment.organizationId,
      organizationId,
      eq14(schema_exports.enrollment.contactId, contactId)
    )
  ).limit(1);
  return Boolean(rows[0]);
}
async function createAccountLink(organizationId, input) {
  const facts = {
    contactHasEnrollment: input.kind === "alumno" && input.contactId ? await contactHasEnrollment(organizationId, input.contactId) : false
  };
  const valid = validateAccountLink(input, facts);
  if (!valid.ok) return valid;
  const db = getDb();
  const existing = await db.select().from(schema_exports.accountLink).where(
    scoped(
      schema_exports.accountLink.organizationId,
      organizationId,
      and6(
        eq14(schema_exports.accountLink.userId, input.userId),
        eq14(schema_exports.accountLink.kind, input.kind)
      )
    )
  ).limit(1);
  if (existing[0]) return { ok: true, data: serializeAccountLink(existing[0]) };
  const inserted = await db.insert(schema_exports.accountLink).values({
    id: newId("accountLink"),
    organizationId,
    userId: input.userId,
    kind: input.kind,
    contactId: input.contactId ?? null,
    teacherId: input.teacherId ?? null
  }).returning();
  const row = inserted[0];
  if (!row) {
    return { ok: false, status: 409, code: "not_created", message: "No se pudo crear el acceso" };
  }
  return { ok: true, data: serializeAccountLink(row) };
}
function serializeAccountLink(row) {
  return {
    id: row.id,
    userId: row.userId,
    kind: row.kind,
    contactId: row.contactId,
    teacherId: row.teacherId,
    suspendedAt: row.suspendedAt?.toISOString() ?? null
  };
}
var nanoPassword = customAlphabet2("23456789ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz", 14);
function generateTemporaryPassword() {
  return nanoPassword();
}
var SIN_CORREO = PORTAL_NO_EMAIL_REASON;
async function loadEnrollmentContact(organizationId, enrollmentId) {
  const rows = await getDb().select({ enrollment: schema_exports.enrollment, contact: schema_exports.contact }).from(schema_exports.enrollment).innerJoin(schema_exports.contact, eq14(schema_exports.enrollment.contactId, schema_exports.contact.id)).where(
    scoped(
      schema_exports.enrollment.organizationId,
      organizationId,
      eq14(schema_exports.enrollment.id, enrollmentId)
    )
  ).limit(1);
  return rows[0] ?? null;
}
async function grantPortalAccess(organizationId, enrollmentId) {
  const ctx = await loadEnrollmentContact(organizationId, enrollmentId);
  if (!ctx) {
    return { ok: false, status: 404, code: "not_found", message: "Inscripci\xF3n no encontrada" };
  }
  const { contact: contact2 } = ctx;
  if (!contact2.email) {
    return { ok: false, status: 422, code: "no_email", message: SIN_CORREO };
  }
  const db = getDb();
  const email = contact2.email.toLowerCase();
  const existingUsers = await db.select({ id: schema_exports.user.id }).from(schema_exports.user).where(eq14(schema_exports.user.email, email)).limit(1);
  const existing = existingUsers[0];
  if (existing) {
    const linked2 = await createAccountLink(organizationId, {
      userId: existing.id,
      kind: "alumno",
      contactId: contact2.id
    });
    if (!linked2.ok) return linked2;
    const membership = await resolveMembership(existing.id);
    if (membership) {
      return {
        ok: true,
        data: {
          link: linked2.data,
          existingAccount: true,
          temporaryPassword: null,
          emailSentAt: null,
          // No se mandó nada porque no hacía falta: entra con la que ya usa.
          emailError: null
        }
      };
    }
    return inviteExisting(existing.id, contact2, linked2.data);
  }
  const temporaryPassword = generateTemporaryPassword();
  let userId;
  try {
    const created = await runInternalSignup(
      () => getAuth().api.signUpEmail({
        body: { name: fullName(contact2), email, password: temporaryPassword }
      })
    );
    userId = created.user.id;
  } catch (err) {
    const message2 = err instanceof Error ? err.message : "No se pudo crear la cuenta";
    return { ok: false, status: 422, code: "signup_failed", message: message2 };
  }
  const linked = await createAccountLink(organizationId, {
    userId,
    kind: "alumno",
    contactId: contact2.id
  });
  if (!linked.ok) return linked;
  const envio = await sendInvitationEmail(contact2, temporaryPassword);
  return {
    ok: true,
    data: { link: linked.data, existingAccount: false, temporaryPassword, ...envio }
  };
}
async function grantTeacherPortalAccess(organizationId, teacherId) {
  const db = getDb();
  const rows = await db.select().from(schema_exports.teacher).where(scoped(schema_exports.teacher.organizationId, organizationId, eq14(schema_exports.teacher.id, teacherId))).limit(1);
  const teacher2 = rows[0];
  if (!teacher2) {
    return { ok: false, status: 404, code: "not_found", message: "Profesor no encontrado" };
  }
  if (!teacher2.email) {
    return {
      ok: false,
      status: 422,
      code: "no_email",
      message: "El profesor no tiene correo cargado. Agreg\xE1selo en su ficha y vas a poder invitarlo."
    };
  }
  const email = teacher2.email.toLowerCase();
  const existingUsers = await db.select({ id: schema_exports.user.id }).from(schema_exports.user).where(eq14(schema_exports.user.email, email)).limit(1);
  const existing = existingUsers[0];
  const comoContacto = {
    firstName: teacher2.name,
    email: teacher2.email
  };
  if (existing) {
    const linked2 = await createAccountLink(organizationId, {
      userId: existing.id,
      kind: "profesor",
      teacherId
    });
    if (!linked2.ok) return linked2;
    const membership = await resolveMembership(existing.id);
    if (membership) {
      return {
        ok: true,
        data: {
          link: linked2.data,
          existingAccount: true,
          temporaryPassword: null,
          emailSentAt: null,
          // No se mandó nada porque no hacía falta: entra con la que ya usa.
          emailError: null
        }
      };
    }
    return inviteExisting(existing.id, comoContacto, linked2.data);
  }
  const temporaryPassword = generateTemporaryPassword();
  let userId;
  try {
    const created = await runInternalSignup(
      () => getAuth().api.signUpEmail({
        body: { name: teacher2.name, email, password: temporaryPassword }
      })
    );
    userId = created.user.id;
  } catch (err) {
    const message2 = err instanceof Error ? err.message : "No se pudo crear la cuenta";
    return { ok: false, status: 422, code: "signup_failed", message: message2 };
  }
  const linked = await createAccountLink(organizationId, {
    userId,
    kind: "profesor",
    teacherId
  });
  if (!linked.ok) return linked;
  const envio = await sendInvitationEmail(comoContacto, temporaryPassword);
  return {
    ok: true,
    data: { link: linked.data, existingAccount: false, temporaryPassword, ...envio }
  };
}
async function inviteExisting(userId, contact2, link) {
  const temporaryPassword = generateTemporaryPassword();
  const authCtx = await getAuth().$context;
  await authCtx.internalAdapter.updatePassword(
    userId,
    await authCtx.password.hash(temporaryPassword)
  );
  const envio = await sendInvitationEmail(contact2, temporaryPassword);
  return {
    ok: true,
    data: { link, existingAccount: true, temporaryPassword, ...envio }
  };
}
async function sendInvitationEmail(contact2, temporaryPassword) {
  const env = getEnv();
  const sent = await sendMail({
    to: contact2.email ?? "",
    subject: "Tu acceso al portal \u2014 CAD IT",
    html: renderTemplate("acceso-portal", {
      nombre: contact2.firstName,
      academia: "CAD IT",
      urlPortal: env.APP_BASE_URL,
      usuario: (contact2.email ?? "").toLowerCase(),
      contrasenaTemporal: temporaryPassword,
      contactoSoporte: env.M365_SENDER ?? ""
    }),
    bcc: env.M365_BCC
  });
  if (!sent.ok) {
    return { emailSentAt: null, emailError: sent.message };
  }
  return { emailSentAt: (/* @__PURE__ */ new Date()).toISOString(), emailError: null };
}

// src/server/virtual-rooms.ts
import { and as and7, asc as asc10, eq as eq15, isNull as isNull3, ne as ne3 } from "drizzle-orm";
async function createVirtualRoom(organizationId, input) {
  const db = getDb();
  const repetida = await db.select({ id: schema_exports.virtualRoom.id }).from(schema_exports.virtualRoom).where(
    scoped(
      schema_exports.virtualRoom.organizationId,
      organizationId,
      eq15(schema_exports.virtualRoom.name, input.name.trim())
    )
  ).limit(1);
  if (repetida.length > 0) {
    return {
      ok: false,
      status: 409,
      code: "duplicate_name",
      message: `Ya existe un aula llamada "${input.name.trim()}"`
    };
  }
  const [fila] = await db.insert(schema_exports.virtualRoom).values({
    id: newId("virtualRoom"),
    organizationId,
    name: input.name.trim(),
    url: input.url.trim(),
    accountEmail: input.accountEmail?.trim() || null,
    notes: input.notes?.trim() || null
  }).returning();
  return {
    ok: true,
    data: {
      id: fila.id,
      name: fila.name,
      url: fila.url,
      accountEmail: fila.accountEmail,
      notes: fila.notes,
      archivedAt: null,
      cohortCount: 0
    }
  };
}

// scripts/demo-camada.ts
var MARCA = "[DEMO]";
var CORREO_ALUMNO = "alumno.demo@ejemplo.test";
var CORREO_PROFESOR = "profesor.demo@ejemplo.test";
var TEL_ALUMNO = "59899000001";
var accion = process.argv.slice(2).filter((a) => a !== "--")[0] ?? "estado";
if (!["crear", "borrar", "estado"].includes(accion)) {
  console.error("Uso: pnpm demo-camada -- <crear|borrar|estado>");
  process.exit(1);
}
var orgs = await getDb().select({ id: schema_exports.organization.id, name: schema_exports.organization.name }).from(schema_exports.organization).limit(1);
var org = orgs[0];
if (!org) {
  console.error("[demo] No hay organizaci\xF3n en esta base.");
  await getSql().end();
  process.exit(1);
}
var dias = (n) => new Date(Date.now() + n * 864e5);
var soloFecha = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
async function estado() {
  const db = getDb();
  const cohorts = await db.select({ id: schema_exports.cohort.id, name: schema_exports.cohort.name }).from(schema_exports.cohort).where(scoped(schema_exports.cohort.organizationId, org.id, like3(schema_exports.cohort.name, `${MARCA}%`)));
  if (cohorts.length === 0) {
    console.log("\n  No hay camada de demostraci\xF3n cargada.\n");
    return { cohorts: [] };
  }
  for (const c of cohorts) {
    const [clases, insc, evals, cuotas, pagos, lic, mat, avisos] = await Promise.all([
      db.select({ id: schema_exports.classSession.id }).from(schema_exports.classSession).where(scoped(schema_exports.classSession.organizationId, org.id, eq16(schema_exports.classSession.cohortId, c.id))),
      db.select({ id: schema_exports.enrollment.id }).from(schema_exports.enrollment).where(scoped(schema_exports.enrollment.organizationId, org.id, eq16(schema_exports.enrollment.cohortId, c.id))),
      db.select({ id: schema_exports.assessment.id }).from(schema_exports.assessment).where(scoped(schema_exports.assessment.organizationId, org.id, eq16(schema_exports.assessment.cohortId, c.id))),
      db.select({ id: schema_exports.installment.id }).from(schema_exports.installment).where(scoped(schema_exports.installment.organizationId, org.id)),
      db.select({ id: schema_exports.payment.id }).from(schema_exports.payment).where(scoped(schema_exports.payment.organizationId, org.id)),
      db.select({ id: schema_exports.license.id }).from(schema_exports.license).where(scoped(schema_exports.license.organizationId, org.id)),
      db.select({ id: schema_exports.resource.id }).from(schema_exports.resource).where(scoped(schema_exports.resource.organizationId, org.id, like3(schema_exports.resource.title, `${MARCA}%`))),
      db.select({ id: schema_exports.announcement.id }).from(schema_exports.announcement).where(scoped(schema_exports.announcement.organizationId, org.id, eq16(schema_exports.announcement.cohortId, c.id)))
    ]);
    console.log(`
  ${c.name}`);
    console.log(`    clases ${clases.length} \xB7 inscripciones ${insc.length} \xB7 evaluaciones ${evals.length}`);
    console.log(`    cuotas ${cuotas.length} \xB7 pagos ${pagos.length} \xB7 licencias ${lic.length}`);
    console.log(`    material ${mat.length} \xB7 avisos ${avisos.length}
`);
  }
  return { cohorts };
}
async function crear() {
  const db = getDb();
  const yaHay = await db.select({ id: schema_exports.cohort.id }).from(schema_exports.cohort).where(scoped(schema_exports.cohort.organizationId, org.id, like3(schema_exports.cohort.name, `${MARCA}%`))).limit(1);
  if (yaHay.length > 0) {
    console.error("[demo] Ya existe una camada de demostraci\xF3n. Borrala primero:");
    console.error("       pnpm demo-camada -- borrar");
    return false;
  }
  const staff = await db.select({ userId: schema_exports.member.userId }).from(schema_exports.member).where(scoped(schema_exports.member.organizationId, org.id)).limit(1);
  const autorUserId = staff[0]?.userId ?? null;
  const paso = (n, ok2, extra = "") => console.log(`  ${ok2 ? "OK  " : "FALLA"} ${n}${extra ? ` \u2014 ${extra}` : ""}`);
  const aula = await createVirtualRoom(org.id, {
    name: `${MARCA} Sala de prueba`,
    url: "https://zoom.us/j/00000000000",
    accountEmail: "demo@ejemplo.test",
    notes: "Creada por pnpm demo-camada. Se borra con `borrar`."
  });
  paso("aula virtual", aula.ok);
  if (!aula.ok) return false;
  const teacherId = await createTeacher(org.id, {
    name: `${MARCA} Profesora Demo`,
    email: CORREO_PROFESOR,
    title: "Arquitecta"
  });
  paso("profesor", true, teacherId);
  const curso = await createCourse(org.id, { name: `${MARCA} Curso de prueba` });
  paso("curso", curso.ok);
  if (!curso.ok) return false;
  const inicio = soloFecha(dias(-21));
  const fin = soloFecha(dias(21));
  const cohorte = await createCohort(org.id, {
    courseId: curso.id,
    name: `${MARCA} Cohorte de prueba`,
    startDate: inicio,
    endDate: fin,
    teacherId,
    // Lunes y miércoles, para que el cronograma tenga varias clases.
    daysOfWeek: "0,2",
    startTime: "18:30",
    endTime: "20:30",
    frequency: "Lunes y mi\xE9rcoles de 18:30 a 20:30",
    classroom: "Aula demo",
    minAttendancePct: 75,
    capacity: 10,
    cost: 24e3,
    currency: "UYU",
    virtualRoomId: aula.data.id
  });
  paso("camada", cohorte.ok);
  if (!cohorte.ok) return false;
  const cohortId = cohorte.id;
  const insc = await createEnrollment(org.id, {
    cohortId,
    contact: {
      firstName: `${MARCA} Alumno`,
      lastName: "Demo",
      phone: TEL_ALUMNO,
      email: CORREO_ALUMNO
    },
    amount: 24e3,
    currency: "UYU",
    installments: 4
  });
  paso("inscripci\xF3n", insc.ok);
  if (!insc.ok) return false;
  const enrollmentId = insc.enrollment.id;
  await db.update(schema_exports.enrollment).set({ enrolledAt: soloFecha(dias(-22)) }).where(scoped(schema_exports.enrollment.organizationId, org.id, eq16(schema_exports.enrollment.id, enrollmentId)));
  const crono = await generateSchedule(org.id, cohortId);
  paso("cronograma", crono.ok, crono.ok ? `${crono.data.length} clases` : crono.message);
  if (!crono.ok) return false;
  const clases = await db.select().from(schema_exports.classSession).where(scoped(schema_exports.classSession.organizationId, org.id, eq16(schema_exports.classSession.cohortId, cohortId)));
  const ahora = Date.now();
  const pasadas = clases.filter((c) => c.date.getTime() < ahora).sort((a, b) => a.number - b.number);
  const futuras = clases.filter((c) => c.date.getTime() >= ahora).sort((a, b) => a.number - b.number);
  const patron = ["presente", "presente", "ausente", "presente", "tarde", "presente"];
  let marcadas = 0;
  for (const [i, c] of pasadas.entries()) {
    const r = await markAttendance(
      org.id,
      c.id,
      [{ enrollmentId, status: patron[i % patron.length] }],
      autorUserId
    );
    if (r.ok) marcadas++;
  }
  paso("asistencia", marcadas === pasadas.length, `${marcadas} de ${pasadas.length} clases pasadas`);
  if (pasadas[0]) {
    await db.update(schema_exports.classSession).set({ recordingUrl: "https://drive.google.com/file/d/demo/view", updatedAt: /* @__PURE__ */ new Date() }).where(
      scoped(schema_exports.classSession.organizationId, org.id, eq16(schema_exports.classSession.id, pasadas[0].id))
    );
    paso("grabaci\xF3n de la clase 1", true);
  }
  const evalA = await createAssessment(org.id, cohortId, {
    name: `${MARCA} Trabajo pr\xE1ctico 1`,
    required: true
  });
  const evalB = await createAssessment(org.id, cohortId, {
    name: `${MARCA} Entrega final`,
    required: true
  });
  paso("evaluaciones", evalA.ok && evalB.ok);
  if (evalA.ok) {
    const r = await recordResults(org.id, evalA.data.id, [{ enrollmentId, passed: true }], autorUserId);
    paso("resultado de la primera", r.ok);
  }
  const plan = await generateInstallmentPlan(org.id, enrollmentId, {
    count: 4,
    firstDueDate: soloFecha(dias(-20))
  });
  paso("plan de cuotas", plan.ok, plan.ok ? `${plan.data.length} cuotas` : plan.message);
  if (plan.ok) {
    let pagos = 0;
    for (const cuota of plan.data.slice(0, 2)) {
      const r = await recordPayment(org.id, enrollmentId, {
        installmentId: cuota.id,
        amount: cuota.amount,
        paidAt: dias(-18),
        method: "transferencia",
        receiptNumber: `${MARCA}-${cuota.number}`,
        recordedBy: autorUserId
      });
      if (r.ok) pagos++;
    }
    paso("pagos", pagos === 2, `${pagos} cuotas pagas, 2 pendientes`);
  }
  const softwareId = newId("software");
  await db.insert(schema_exports.software).values({
    id: softwareId,
    organizationId: org.id,
    name: `${MARCA} AutoCAD demo`,
    totalLicenses: 5
  });
  const lic = await assignLicense(org.id, enrollmentId, softwareId);
  paso("licencia", lic.ok);
  const mat = await createResource(org.id, {
    courseId: curso.id,
    title: `${MARCA} Gu\xEDa de la clase 1`,
    url: "https://ejemplo.test/guia-demo.pdf",
    kind: "guia"
  });
  paso("material del curso", mat.ok);
  if (autorUserId) {
    const av = await createAnnouncement(org.id, cohortId, autorUserId, {
      title: `${MARCA} Traigan el plano acotado`,
      body: "El lunes arrancamos con el render, as\xED que necesitamos el plano ya acotado."
    });
    paso("aviso de la camada", av.ok);
  }
  const accesoAlumno = await grantPortalAccess(org.id, enrollmentId);
  paso("acceso del alumno", accesoAlumno.ok);
  const accesoProfesor = await grantTeacherPortalAccess(org.id, teacherId);
  paso("acceso del profesor", accesoProfesor.ok);
  console.log("\n  \u2500\u2500 Para entrar \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");
  console.log(`  alumno    ${CORREO_ALUMNO}`);
  if (accesoAlumno.ok) {
    console.log(`            ${accesoAlumno.data.temporaryPassword ?? "(la cuenta ya exist\xEDa)"}`);
  }
  console.log(`  profesor  ${CORREO_PROFESOR}`);
  if (accesoProfesor.ok) {
    console.log(`            ${accesoProfesor.data.temporaryPassword ?? "(la cuenta ya exist\xEDa)"}`);
  }
  console.log(`
  clases: ${clases.length} (${pasadas.length} pasadas, ${futuras.length} por venir)`);
  console.log("  Para borrarlo todo:  pnpm demo-camada -- borrar\n");
  return true;
}
async function borrar() {
  const db = getDb();
  const borrado = {};
  const contar = (k, n) => {
    borrado[k] = (borrado[k] ?? 0) + n;
  };
  const cohorts = await db.select({ id: schema_exports.cohort.id, courseId: schema_exports.cohort.courseId, teacherId: schema_exports.cohort.teacherId }).from(schema_exports.cohort).where(scoped(schema_exports.cohort.organizationId, org.id, like3(schema_exports.cohort.name, `${MARCA}%`)));
  if (cohorts.length === 0) {
    console.log("\n  No hay nada de demostraci\xF3n para borrar.\n");
    return true;
  }
  const cohortIds = cohorts.map((c) => c.id);
  const courseIds = [...new Set(cohorts.map((c) => c.courseId))];
  const teacherIds = [...new Set(cohorts.map((c) => c.teacherId).filter((t) => Boolean(t)))];
  const enrollments = await db.select({ id: schema_exports.enrollment.id, contactId: schema_exports.enrollment.contactId }).from(schema_exports.enrollment).where(scoped(schema_exports.enrollment.organizationId, org.id, inArray4(schema_exports.enrollment.cohortId, cohortIds)));
  const enrollmentIds = enrollments.map((e) => e.id);
  const contactIds = [...new Set(enrollments.map((e) => e.contactId))];
  const clases = await db.select({ id: schema_exports.classSession.id }).from(schema_exports.classSession).where(scoped(schema_exports.classSession.organizationId, org.id, inArray4(schema_exports.classSession.cohortId, cohortIds)));
  const claseIds = clases.map((c) => c.id);
  const evals = await db.select({ id: schema_exports.assessment.id }).from(schema_exports.assessment).where(scoped(schema_exports.assessment.organizationId, org.id, inArray4(schema_exports.assessment.cohortId, cohortIds)));
  const evalIds = evals.map((e) => e.id);
  if (enrollmentIds.length) {
    const pagos = await db.delete(schema_exports.payment).where(scoped(schema_exports.payment.organizationId, org.id, inArray4(schema_exports.payment.enrollmentId, enrollmentIds))).returning({ id: schema_exports.payment.id });
    contar("pagos", pagos.length);
    const cuotas = await db.delete(schema_exports.installment).where(scoped(schema_exports.installment.organizationId, org.id, inArray4(schema_exports.installment.enrollmentId, enrollmentIds))).returning({ id: schema_exports.installment.id });
    contar("cuotas", cuotas.length);
    const lic = await db.delete(schema_exports.license).where(scoped(schema_exports.license.organizationId, org.id, inArray4(schema_exports.license.enrollmentId, enrollmentIds))).returning({ id: schema_exports.license.id });
    contar("licencias", lic.length);
    const cert = await db.delete(schema_exports.certificate).where(scoped(schema_exports.certificate.organizationId, org.id, inArray4(schema_exports.certificate.enrollmentId, enrollmentIds))).returning({ id: schema_exports.certificate.id });
    contar("certificados", cert.length);
    const att = await db.delete(schema_exports.attendance).where(scoped(schema_exports.attendance.organizationId, org.id, inArray4(schema_exports.attendance.enrollmentId, enrollmentIds))).returning({ id: schema_exports.attendance.id });
    contar("asistencia", att.length);
  }
  if (evalIds.length) {
    const res = await db.delete(schema_exports.assessmentResult).where(scoped(schema_exports.assessmentResult.organizationId, org.id, inArray4(schema_exports.assessmentResult.assessmentId, evalIds))).returning({ id: schema_exports.assessmentResult.id });
    contar("resultados", res.length);
    const ev = await db.delete(schema_exports.assessment).where(scoped(schema_exports.assessment.organizationId, org.id, inArray4(schema_exports.assessment.id, evalIds))).returning({ id: schema_exports.assessment.id });
    contar("evaluaciones", ev.length);
  }
  if (claseIds.length) {
    const r = await db.delete(schema_exports.resource).where(scoped(schema_exports.resource.organizationId, org.id, inArray4(schema_exports.resource.classSessionId, claseIds))).returning({ id: schema_exports.resource.id });
    contar("material", r.length);
  }
  const matCurso = await db.delete(schema_exports.resource).where(scoped(schema_exports.resource.organizationId, org.id, like3(schema_exports.resource.title, `${MARCA}%`))).returning({ id: schema_exports.resource.id });
  contar("material", matCurso.length);
  const avisos = await db.delete(schema_exports.announcement).where(scoped(schema_exports.announcement.organizationId, org.id, inArray4(schema_exports.announcement.cohortId, cohortIds))).returning({ id: schema_exports.announcement.id });
  contar("avisos", avisos.length);
  if (claseIds.length) {
    const cls = await db.delete(schema_exports.classSession).where(scoped(schema_exports.classSession.organizationId, org.id, inArray4(schema_exports.classSession.id, claseIds))).returning({ id: schema_exports.classSession.id });
    contar("clases", cls.length);
  }
  const links = await db.delete(schema_exports.accountLink).where(
    and8(
      eq16(schema_exports.accountLink.organizationId, org.id),
      contactIds.length ? inArray4(schema_exports.accountLink.contactId, contactIds) : eq16(schema_exports.accountLink.contactId, "__ninguno__")
    )
  ).returning({ userId: schema_exports.accountLink.userId });
  const linksProfe = teacherIds.length ? await db.delete(schema_exports.accountLink).where(
    and8(
      eq16(schema_exports.accountLink.organizationId, org.id),
      inArray4(schema_exports.accountLink.teacherId, teacherIds)
    )
  ).returning({ userId: schema_exports.accountLink.userId }) : [];
  contar("accesos al portal", links.length + linksProfe.length);
  const userIds = [...new Set([...links, ...linksProfe].map((l) => l.userId))];
  if (userIds.length) {
    await db.delete(schema_exports.session).where(inArray4(schema_exports.session.userId, userIds));
    await db.delete(schema_exports.account).where(inArray4(schema_exports.account.userId, userIds));
    const us = await db.delete(schema_exports.user).where(inArray4(schema_exports.user.id, userIds)).returning({ id: schema_exports.user.id });
    contar("cuentas de usuario", us.length);
  }
  if (enrollmentIds.length) {
    const e = await db.delete(schema_exports.enrollment).where(scoped(schema_exports.enrollment.organizationId, org.id, inArray4(schema_exports.enrollment.id, enrollmentIds))).returning({ id: schema_exports.enrollment.id });
    contar("inscripciones", e.length);
  }
  if (contactIds.length) {
    const c = await db.delete(schema_exports.contact).where(scoped(schema_exports.contact.organizationId, org.id, inArray4(schema_exports.contact.id, contactIds))).returning({ id: schema_exports.contact.id });
    contar("contactos", c.length);
  }
  const coh = await db.delete(schema_exports.cohort).where(scoped(schema_exports.cohort.organizationId, org.id, inArray4(schema_exports.cohort.id, cohortIds))).returning({ id: schema_exports.cohort.id });
  contar("camadas", coh.length);
  const cur = await db.delete(schema_exports.course).where(scoped(schema_exports.course.organizationId, org.id, inArray4(schema_exports.course.id, courseIds))).returning({ id: schema_exports.course.id });
  contar("cursos", cur.length);
  if (teacherIds.length) {
    const t = await db.delete(schema_exports.teacher).where(scoped(schema_exports.teacher.organizationId, org.id, inArray4(schema_exports.teacher.id, teacherIds))).returning({ id: schema_exports.teacher.id });
    contar("profesores", t.length);
  }
  const sw = await db.delete(schema_exports.software).where(scoped(schema_exports.software.organizationId, org.id, like3(schema_exports.software.name, `${MARCA}%`))).returning({ id: schema_exports.software.id });
  contar("software", sw.length);
  const aulas = await db.delete(schema_exports.virtualRoom).where(scoped(schema_exports.virtualRoom.organizationId, org.id, like3(schema_exports.virtualRoom.name, `${MARCA}%`))).returning({ id: schema_exports.virtualRoom.id });
  contar("aulas virtuales", aulas.length);
  console.log("\n  Borrado:");
  for (const [k, v] of Object.entries(borrado)) {
    if (v > 0) console.log(`    ${String(v).padStart(4)}  ${k}`);
  }
  const restos = await verificarLimpio();
  if (restos.length > 0) {
    console.error("\n  QUEDARON RASTROS:");
    for (const r of restos) console.error(`    ${r}`);
    return false;
  }
  console.log("\n  Verificado: no queda ning\xFAn rastro del demo.\n");
  return true;
}
async function verificarLimpio() {
  const db = getDb();
  const restos = [];
  const mirar = async (etiqueta, filas) => {
    if (filas.length > 0) restos.push(`${etiqueta}: ${filas.length}`);
  };
  await mirar(
    "camadas",
    await db.select({ id: schema_exports.cohort.id }).from(schema_exports.cohort).where(scoped(schema_exports.cohort.organizationId, org.id, like3(schema_exports.cohort.name, `${MARCA}%`)))
  );
  await mirar(
    "cursos",
    await db.select({ id: schema_exports.course.id }).from(schema_exports.course).where(scoped(schema_exports.course.organizationId, org.id, like3(schema_exports.course.name, `${MARCA}%`)))
  );
  await mirar(
    "contactos",
    await db.select({ id: schema_exports.contact.id }).from(schema_exports.contact).where(scoped(schema_exports.contact.organizationId, org.id, like3(schema_exports.contact.firstName, `${MARCA}%`)))
  );
  await mirar(
    "profesores",
    await db.select({ id: schema_exports.teacher.id }).from(schema_exports.teacher).where(scoped(schema_exports.teacher.organizationId, org.id, like3(schema_exports.teacher.name, `${MARCA}%`)))
  );
  await mirar(
    "software",
    await db.select({ id: schema_exports.software.id }).from(schema_exports.software).where(scoped(schema_exports.software.organizationId, org.id, like3(schema_exports.software.name, `${MARCA}%`)))
  );
  await mirar(
    "aulas virtuales",
    await db.select({ id: schema_exports.virtualRoom.id }).from(schema_exports.virtualRoom).where(scoped(schema_exports.virtualRoom.organizationId, org.id, like3(schema_exports.virtualRoom.name, `${MARCA}%`)))
  );
  await mirar(
    "material",
    await db.select({ id: schema_exports.resource.id }).from(schema_exports.resource).where(scoped(schema_exports.resource.organizationId, org.id, like3(schema_exports.resource.title, `${MARCA}%`)))
  );
  await mirar(
    "cuentas de usuario",
    await db.select({ id: schema_exports.user.id }).from(schema_exports.user).where(inArray4(schema_exports.user.email, [CORREO_ALUMNO, CORREO_PROFESOR]))
  );
  return restos;
}
console.log(`
  organizaci\xF3n: ${org.name}`);
var ok = await withOrganizationScope(org.id, `cli:demo-camada:${accion}`, async () => {
  if (accion === "crear") return crear();
  if (accion === "borrar") return borrar();
  await estado();
  return true;
});
await getSql().end();
process.exit(ok ? 0 : 1);
