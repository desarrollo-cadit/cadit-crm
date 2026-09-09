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
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { Capability } from "@/lib/capabilities";

/**
 * 007 — Monedas admitidas en los importes. Hasta 006 los montos eran un
 * entero suelto que asumía UNA sola moneda; con alumnos de Uruguay y de
 * Paraguay en la misma cohorte, sumar $57.000 (UYU) con 10.000.000 (PYG) en
 * la misma columna daba totales de facturación sin sentido. El importe
 * sigue siendo entero (sin centavos, DV-008): lo que se agrega es de QUÉ
 * moneda es ese entero.
 */
export const CURRENCIES = ["UYU", "PYG", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];

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
  meetingOpenAfterMin: integer("meeting_open_after_min").notNull().default(30),
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
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("contact_org_wa_identity_uq").on(t.organizationId, t.waIdentity),
    index("contact_org_wa_user_id_idx").on(t.organizationId, t.waUserId),
    index("contact_org_name_idx").on(t.organizationId, t.firstName),
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

/** 005 — Docente que dicta cohortes (DV-005: entidad propia, no texto libre). */
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
/**
 * 006 — Categoría del catálogo ("IA", "BIM", "Diseño"). Tabla propia y no un
 * texto libre en `course` para que el sitio comercial pueda filtrar por un id
 * estable aunque se renombre la categoría, y para no depender de que quien
 * carga el curso escriba siempre igual.
 */
export const courseCategory = pgTable(
  "course_category",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Identificador para URLs del sitio comercial (`/cursos?categoria=ia`). */
    slug: text("slug").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("course_category_org_slug_uq").on(t.organizationId, t.slug)]
);

export const course = pgTable(
  "course",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
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
      onDelete: "set null",
    }),
    level: text("level", { enum: ["inicial", "intermedio", "avanzado"] }),
    modality: text("modality", { enum: ["en_vivo", "asincronico", "presencial"] }),
    durationWeeks: integer("duration_weeks"),
    hoursPerWeek: integer("hours_per_week"),
    imageUrl: text("image_url"),
    /** Bullets de "qué vas a aprender" — jsonb, mismo criterio que lab.transcript. */
    learningObjectives: jsonb("learning_objectives").$type<string[]>(),
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
     * 028 fase 5 (FR-019) — si este curso ENTREGA certificado.
     *
     * Regla del dueño (2026-09-09): el certificado de un módulo se emite sólo
     * si el curso de ese módulo lo otorga. No todo producto de la academia
     * entrega uno —hay inducciones, talleres y módulos introductorios que
     * forman parte del recorrido sin certificar—, y hasta acá el sistema
     * emitía igual porque no tenía cómo saberlo.
     *
     * **Gobierna la EMISIÓN y NADA MÁS.** No entra en `approvalState`, ni en
     * `moduleApprovalState`, ni en `programApprovalState`: aprobar y
     * certificar son cosas distintas, y un módulo que no otorga certificado
     * propio igual cuenta para el certificado general de la especialización
     * (decisión del dueño, 2026-09-09). Excluirlo del cómputo le entregaría
     * el general a alguien que reprobó un módulo del programa.
     *
     * Default `true` para que los 41 cursos ya cargados —AutoCAD entre
     * ellos— sigan comportándose exactamente como en el ciclo 010 (FR-032).
     */
    grantsCertificate: boolean("grants_certificate").notNull().default(true),
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
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("course_org_idx").on(t.organizationId),
    index("course_category_idx").on(t.categoryId),
    uniqueIndex("course_org_slug_uq").on(t.organizationId, t.slug),
  ]
);

/**
 * 006 — Temario estructurado del curso: un bloque por fila, con sus temas.
 * Estructurado y no un PDF suelto para que el sitio comercial pueda
 * renderizarlo (acordeón del temario) y para poder corregir un tema sin
 * regenerar un archivo. Convive con `course.syllabus_url`, que sigue siendo
 * el PDF descargable.
 *
 * ============================================================
 * 028 (DV-001) — ESTO NO ES UN MÓDULO DE PROGRAMA
 * ============================================================
 * Esta tabla es el **temario de UN curso**: contenido de la ficha pública,
 * sin profesor, sin fechas, sin clases y sin alumnos. NO es la unidad de
 * cursada de una especialización.
 *
 * El **módulo de programa** de la 028 es una **cohorte hija**
 * (`cohort.parent_cohort_id`): tiene profesor, fechas, clases,
 * evaluaciones, asistencia e inscripciones propias. No hay tabla `module`
 * ni colisión de nombres en la base — la colisión es de vocabulario, y se
 * resuelve nombrando: acá se dice "bloque del temario", allá se dice
 * "módulo de programa" o "cohorte hija".
 *
 * La spec de la 028 proponía renombrar o ELIMINAR esta tabla alegando "0 uso
 * desde el ciclo 006". Es falso: la nombran 8 archivos de `src/`
 * (`api/courses/route.ts`, `api/courses/[id]/route.ts`,
 * `api/resources/route.ts`, `lib/db/ids.ts`, `lib/db/schema.ts`,
 * `server/course-content.ts`, `server/public-catalog.ts`,
 * `server/resources.ts`), más el importador y dos tests, y alimenta el
 * catálogo público. Que la tabla esté vacía en producción dice que el dueño
 * todavía no cargó temarios, no que el código no la use: borrarla rompería
 * el catálogo. Queda como está.
 */
export const courseModule = pgTable(
  "course_module",
  {
    id: text("id").primaryKey(),
    // Multi-tenancy (constitución III): organization_id explícito aunque se
    // pueda derivar de course_id — toda query pasa por `scoped()`.
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    courseId: text("course_id")
      .notNull()
      .references(() => course.id, { onDelete: "cascade" }),
    /** Orden de aparición en la web; contiguo desde 0, lo reasigna el server. */
    position: integer("position").notNull(),
    title: text("title").notNull(),
    /** Temas del módulo, en orden. */
    topics: jsonb("topics").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  // Org-first, como el resto de las tablas de dominio: toda lectura del temario
  // filtra por organización y curso antes de ordenar por posición.
  (t) => [
    index("course_module_course_idx").on(t.organizationId, t.courseId, t.position),
  ]
);

/**
 * 005 iteración 2 — Puente N:N: qué curso(s) dicta un profesor. Sin `id`
 * propio, mismo patrón que `cohort_software`. Usado para filtrar el selector
 * de profesor de una cohorte por curso (feedback en vivo del dueño).
 */
export const teacherCourse = pgTable(
  "teacher_course",
  {
    // Multi-tenancy (constitución III): explícito aunque se pueda derivar de
    // `teacher_id`, mismo criterio que `course_module`. Sin esta columna la
    // seguridad dependía de que CADA llamador filtrara el padre por
    // organización antes de tocar el puente: hoy todos lo hacen, pero una
    // call site nueva que se olvide filtra en silencio y sin error de
    // compilación. Con la columna, `scoped()` lo vuelve inexpresable.
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
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
    index("teacher_course_org_idx").on(t.organizationId),
  ]
);

/**
 * 004 — Cohorte: una edición concreta de un `course`, con fechas y profesor
 * propios. Varias cohortes pueden compartir curso.
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
    /**
     * 028 (FR-001) — La camada de la especialización es el PADRE; cada
     * **módulo de programa** es una cohorte HIJA. NULL = "no es módulo de
     * nada", que es el estado de las 41 filas existentes y el que devuelve
     * el comportamiento anterior sin ninguna bandera (FR-033).
     *
     * Un módulo es una cohorte y no un curso porque tiene profesor, fechas,
     * clases, evaluaciones, asistencia y enlace de reunión propios — o sea,
     * exactamente lo que una cohorte ya sabe llevar desde el ciclo 004. No
     * confundir con `course_module`, que es el temario de la ficha pública.
     *
     * `restrict`: borrar la camada padre con módulos colgando dejaría
     * huérfano el programa entero. Primero se desarma el árbol.
     *
     * El anidamiento es de UN solo nivel (FR-003) y nadie es su propio padre
     * (FR-004). Lo segundo lo fija el CHECK de más abajo; lo primero exige
     * mirar OTRA fila, así que vive en el servidor
     * (`src/server/program-modules.ts`).
     */
    parentCohortId: text("parent_cohort_id").references(
      (): AnyPgColumn => cohort.id,
      { onDelete: "restrict" }
    ),
    /**
     * 028 (FR-002) — Orden del módulo dentro de su programa.
     *
     * NO se deduce de `start_date`: dos módulos pueden solaparse en el
     * calendario y el orden pedagógico lo decide la academia. En una cohorte
     * sin padre no significa nada y no se muestra.
     */
    position: integer("position"),
    /** 005 iteración 2 — nombre propio de la cohorte; NULL = usar course.name. */
    name: text("name"),
    startDate: timestamp("start_date").notNull(),
    endDate: timestamp("end_date"),
    /** 005 (DV-005) — reemplaza el `professor` texto libre de 004. */
    teacherId: text("teacher_id").references(() => teacher.id, {
      onDelete: "set null",
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
     * 023 (FR-002) — El aula virtual de la cohorte. Sus clases la HEREDAN.
     *
     * No se les copia al generar el cronograma, por el mismo motivo que
     * `meeting_url`: copiarla dejaría 41 cohortes con aulas congeladas el día
     * que se reasigne una.
     *
     * `set null` y no `restrict`: dar de baja un aula no puede trabar la
     * cohorte. Sin aula, el enlace cae al `meeting_url` de siempre (FR-004).
     */
    virtualRoomId: text("virtual_room_id").references(() => virtualRoom.id, {
      onDelete: "set null",
    }),
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
    /**
     * 028 (FR-001/FR-002) — Por acá se camina el árbol: "los módulos de esta
     * camada, en orden". Org primero, como el resto de las tablas de dominio.
     */
    index("cohort_org_parent_idx").on(t.organizationId, t.parentCohortId, t.position),
    /**
     * 028 (FR-004) — Nadie es su propio padre. Es una línea y cubre el error
     * más tonto; el repositorio ya tiene dos CHECK
     * (`account_link_kind_coherente`, `resource_contenedor_unico`), así que
     * esto no inaugura ningún mecanismo.
     */
    check(
      "cohort_padre_distinto_de_si",
      sql`${t.parentCohortId} is null or ${t.parentCohortId} <> ${t.id}`
    ),
  ]
);

/**
 * 005 — Puente N:N: qué software(s) declara usar una cohorte (DV-004,
 * FR-006). Sin `id` propio, es una tabla puente pura.
 */
export const cohortSoftware = pgTable(
  "cohort_software",
  {
    /** Multi-tenancy (constitución III) — ver el comentario de `teacherCourse`. */
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
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
    index("cohort_software_org_idx").on(t.organizationId),
  ]
);

/**
 * 004 — Reemplaza a `lead`. `cohort_id` NULL = lead general de ventas de la
 * academia (mismo rol que el `lead` de antes, sin cambio de comportamiento);
 * con `cohort_id` asignada, es la inscripción a esa cohorte puntual. Un mismo
 * contacto puede tener su lead general Y N inscripciones a cohortes distintas.
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
    /**
     * 028 (FR-006) — El RECORRIDO de la persona. NULL = inscripción normal,
     * que es el estado de las 384 filas existentes (FR-033).
     *
     * La inscripción **madre** apunta a la camada de la especialización y
     * lleva el **paquete cerrado**: monto, moneda y plan de cuotas de la
     * venta (FR-007). Hay una inscripción **hija** por módulo efectivamente
     * cursado (FR-008).
     *
     * **Acá está el punto de toda la fase**: el `cohort_id` de la hija apunta
     * a la corrida del módulo que la persona REALMENTE cursó, y esa corrida
     * puede pertenecer a OTRA especialización — la EBIM siguiente. Eso es lo
     * que vuelve representables la baja voluntaria y la recursada: la madre
     * contesta "de qué recorrido soy" y el `cohort_id` de la hija contesta
     * "qué corrida cursé". Con una sola columna las dos preguntas se pisan;
     * con dos, ninguna miente. Por eso NO existe (ni debe agregarse) una FK
     * que obligue a la hija a quedarse dentro de los módulos de su madre.
     *
     * Un solo nivel de anidamiento (FR-009): la hija de una hija no existe.
     *
     * `restrict`: borrar la madre con hijas colgando borraría el paquete y
     * dejaría los módulos sin recorrido.
     */
    parentEnrollmentId: text("parent_enrollment_id").references(
      (): AnyPgColumn => enrollment.id,
      { onDelete: "restrict" }
    ),
    stageId: text("stage_id")
      .notNull()
      .references(() => pipelineStage.id),
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
      onDelete: "set null",
    }),
    /** 005 — facturación B2B opcional (DV-009). */
    companyId: text("company_id").references(() => company.id, {
      onDelete: "restrict",
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
      onDelete: "set null",
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
    /* ------------------------------------------------------------
     * 028 (FR-022/FR-023, DV-003, DV-004) — La dispensa de asistencia
     * ------------------------------------------------------------
     * Habilita la aprobación de ESTE módulo pese a no alcanzar el mínimo de
     * asistencia. Es por módulo —vive en la inscripción hija—, nunca por
     * especialización: el dueño dijo "dependiendo del módulo".
     *
     * **Nunca es un booleano suelto** (FR-023). Una excepción sin autor ni
     * motivo es indistinguible de un error de cálculo: a los seis meses,
     * frente a alguien aprobado con 62% de asistencia, nadie puede decidir
     * si tenía permiso o si el sistema falló. Es el mismo criterio de la 024
     * ("un hito sólo se marca cumplido si el sistema puede probarlo") y del
     * `sin_datos` del legajo (013).
     *
     * Saltea la compuerta de ASISTENCIA y nada más (FR-024): una evaluación
     * obligatoria desaprobada sigue reprobando. Perdona faltas, no trabajos.
     *
     * La gobierna `evaluacion.editar` (DV-003): lo que cambia es si el
     * alumno aprueba, no quién pasó lista.
     *
     * Los nombres copian a `certificate` a propósito —`issued_at`/
     * `issued_by` para el acto, `revoked_at`/`revoked_by`/`revoke_reason`
     * para deshacerlo—: dos patrones de revocación que se leen distinto son
     * dos oportunidades de equivocarse.
     */
    /** Cuándo se otorgó. NULL = no hay dispensa. */
    attendanceWaiverAt: timestamp("attendance_waiver_at"),
    /** Quién la otorgó. `set null`: que alguien deje la academia no borra el acto. */
    attendanceWaiverBy: text("attendance_waiver_by").references(() => user.id, {
      onDelete: "set null",
    }),
    /** Por qué. Sin motivo no hay dispensa: el servidor lo exige (FR-023). */
    attendanceWaiverReason: text("attendance_waiver_reason"),
    /**
     * DV-004 — Revocable, y se MARCA revocada, no se borra: borrarla dejaría
     * un alumno aprobado sin que ningún registro explique por qué.
     *
     * Revocar la dispensa y revocar el certificado son **dos actos separados
     * y explícitos**. Encadenarlos revocaría un certificado ya entregado en
     * la mano de una persona sin que nadie lo haya decidido.
     */
    attendanceWaiverRevokedAt: timestamp("attendance_waiver_revoked_at"),
    attendanceWaiverRevokedBy: text("attendance_waiver_revoked_by").references(
      () => user.id,
      { onDelete: "set null" }
    ),
    attendanceWaiverRevokeReason: text("attendance_waiver_revoke_reason"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    // Una inscripción por contacto y cohorte (cuando hay cohorte asignada).
    uniqueIndex("enrollment_contact_cohort_uq")
      .on(t.contactId, t.cohortId)
      .where(sql`${t.cohortId} IS NOT NULL`),
    // Un solo lead general (sin cohorte) por contacto — reemplaza lead_contact_uq.
    uniqueIndex("enrollment_contact_general_uq")
      .on(t.contactId)
      .where(sql`${t.cohortId} IS NULL`),
    index("enrollment_org_stage_idx").on(t.organizationId, t.stageId, t.position),
    index("enrollment_org_cohort_idx").on(t.organizationId, t.cohortId),
    index("enrollment_seller_idx").on(t.sellerId),
    index("enrollment_company_idx").on(t.companyId),
    index("enrollment_org_interest_course_idx").on(
      t.organizationId,
      t.interestCourseId
    ),
    /**
     * 028 (FR-006) — Por acá se camina el recorrido: "las hijas de esta
     * madre". Lo consultan el portal del alumno, el legajo y la composición
     * del estado de la especialización.
     */
    index("enrollment_org_parent_idx").on(t.organizationId, t.parentEnrollmentId),
    /** 028 (FR-009) — Nadie es su propia madre. Ver el CHECK gemelo de `cohort`. */
    check(
      "enrollment_madre_distinta_de_si",
      sql`${t.parentEnrollmentId} is null or ${t.parentEnrollmentId} <> ${t.id}`
    ),
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

/* ============================================================
 * 008 — Cobranza: la cuota que se DEBE y el pago que ENTRÓ
 * ============================================================
 * Dos tablas y no una porque responden preguntas distintas que la
 * administración hace todos los meses: "¿cuánto se venció?" mira
 * `installment.due_date`; "¿cuánto entró?" mira `payment.paid_at`. Y sin la
 * separación no se puede representar el caso que importa —la cuota que vence
 * y nadie paga—: sin fila de pago esa deuda no existiría en la base, que es
 * exactamente el problema que esta feature viene a resolver.
 */

/** 008 — La obligación: lo que el alumno debe y cuándo. */
export const installment = pgTable(
  "installment",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    enrollmentId: text("enrollment_id")
      .notNull()
      .references(() => enrollment.id, { onDelete: "cascade" }),
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
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("installment_enrollment_number_uq").on(
      t.organizationId,
      t.enrollmentId,
      t.number
    ),
    // Vista de morosidad: "qué venció y sigue sin pagarse".
    index("installment_org_due_idx").on(t.organizationId, t.dueDate),
  ]
);

/**
 * 008 — El hecho: plata que entró.
 *
 * Ni el pago ni la cuota llevan columna de estado: `pagada`, `parcial`,
 * `vencida` y `pendiente` se DERIVAN de los pagos y la fecha (DV-003).
 * Persistir el estado obliga a un job nocturno que se desincroniza, y una
 * cuota marcada "al día" que en realidad venció es peor que no tener el dato.
 */
export const payment = pgTable(
  "payment",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** Denormalizado desde la cuota: permite la caja del mes sin join. */
    enrollmentId: text("enrollment_id")
      .notNull()
      .references(() => enrollment.id, { onDelete: "cascade" }),
    /** NULL = pago a cuenta, todavía sin cuota asignada. */
    installmentId: text("installment_id").references(() => installment.id, {
      onDelete: "set null",
    }),
    amount: integer("amount").notNull(),
    /** DEBE coincidir con la moneda de su cuota (FR-004). */
    currency: text("currency", { enum: CURRENCIES }).notNull().default("UYU"),
    /** Fecha REAL del pago, no la de carga: la caja del mes depende de esto. */
    paidAt: timestamp("paid_at").notNull(),
    method: text("method", {
      enum: ["efectivo", "transferencia", "tarjeta", "otro"],
    }).notNull(),
    /** 008 (DV-006) — el recibo es del PAGO; la factura sigue en `enrollment`. */
    receiptNumber: text("receipt_number"),
    notes: text("notes"),
    recordedBy: text("recorded_by").references(() => user.id, {
      onDelete: "set null",
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
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("payment_org_paid_idx").on(t.organizationId, t.paidAt),
    index("payment_org_enrollment_idx").on(t.organizationId, t.enrollmentId),
    uniqueIndex("payment_org_idempotency_uq")
      .on(t.organizationId, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} IS NOT NULL`),
  ]
);

/* ============================================================
 * 009 — Clases dictadas y asistencia
 * ============================================================ */

/**
 * 009 — Una clase concreta de una cohorte. El cronograma se genera con una
 * acción EXPLÍCITA (DV-003) y no al crear la cohorte: dar de alta 40 clases
 * que nadie pidió es difícil de deshacer.
 */
export const classSession = pgTable(
  "class_session",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    cohortId: text("cohort_id")
      .notNull()
      .references(() => cohort.id, { onDelete: "cascade" }),
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
      onDelete: "set null",
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
     * 023 (FR-003) — Aula propia de ESTA clase; pisa la de la cohorte.
     * NULL = usa la de la cohorte. Existe porque los choques se resuelven de a
     * una: mover una clase a otra sala no debería tocar las otras treinta y
     * nueve.
     */
    virtualRoomId: text("virtual_room_id").references(() => virtualRoom.id, {
      onDelete: "set null",
    }),
    /**
     * 013 (FR-005b/FR-005f) — La grabación es un ENLACE: el sistema no
     * almacena video (decisión marco de archivos). Una clase cancelada NO
     * ofrece grabación (FR-005e), aunque la columna tenga valor.
     */
    recordingUrl: text("recording_url"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("class_session_cohort_number_uq").on(
      t.organizationId,
      t.cohortId,
      t.number
    ),
    index("class_session_org_date_idx").on(t.organizationId, t.date),
  ]
);

/**
 * 009 — Asistencia de UNA inscripción a UNA clase.
 *
 * Se ata a `enrollment` y no a `contact` porque la misma persona puede cursar
 * dos cohortes a la vez: colgada del contacto, su asistencia a Revit
 * contaminaría el porcentaje de Civil 3D.
 *
 * `tarde` cuenta como PRESENTE para el porcentaje (DV-002): se registra para
 * que quede el dato, pero no penaliza.
 */
export const attendance = pgTable(
  "attendance",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    classSessionId: text("class_session_id")
      .notNull()
      .references(() => classSession.id, { onDelete: "cascade" }),
    enrollmentId: text("enrollment_id")
      .notNull()
      .references(() => enrollment.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: ["presente", "tarde", "ausente", "justificado"],
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
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    // Una marca por alumno y clase: volver a marcar CORRIGE, no duplica.
    uniqueIndex("attendance_session_enrollment_uq").on(
      t.classSessionId,
      t.enrollmentId
    ),
    index("attendance_org_enrollment_idx").on(t.organizationId, t.enrollmentId),
  ]
);

/* ============================================================
 * 010 — Evaluación y certificados
 * ============================================================
 * DV-001: la escala es APROBADO / NO APROBADO, sin nota numérica. Por eso
 * `assessment` NO lleva `weight` ni `max_score`: sin número que ponderar, un
 * peso no pondera nada. El alumno aprueba si aprobó TODAS las evaluaciones y
 * cumple el mínimo de asistencia de 009.
 *
 * Los FR-002 y FR-003 del spec (pesos que suman 100, nota final ponderada)
 * quedaron NO APLICABLES por esa decisión; está registrado en el spec.
 */

/** 010 — Una instancia evaluable de la cohorte ("Trabajo final", "Parcial 1"). */
export const assessment = pgTable(
  "assessment",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    cohortId: text("cohort_id")
      .notNull()
      .references(() => cohort.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull().default(0),
    /**
     * Una evaluación opcional no bloquea la aprobación. Sirve para prácticas
     * que se registran pero no definen si el alumno se recibe.
     */
    required: boolean("required").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("assessment_org_cohort_idx").on(t.organizationId, t.cohortId, t.position)]
);

/**
 * 010 — El resultado de UN alumno en UNA evaluación.
 *
 * `passed` es NULLABLE y ese null significa PENDIENTE, no reprobado (FR-005).
 * La diferencia importa: un alumno al que todavía no le corrigieron el
 * trabajo no puede figurar como desaprobado en ninguna pantalla.
 */
export const assessmentResult = pgTable(
  "assessment_result",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    assessmentId: text("assessment_id")
      .notNull()
      .references(() => assessment.id, { onDelete: "cascade" }),
    enrollmentId: text("enrollment_id")
      .notNull()
      .references(() => enrollment.id, { onDelete: "cascade" }),
    /** NULL = pendiente de corrección (FR-005). true/false = aprobó o no. */
    passed: boolean("passed"),
    notes: text("notes"),
    recordedBy: text("recorded_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    // Un resultado por alumno y evaluación: recargar CORRIGE, no duplica.
    uniqueIndex("assessment_result_uq").on(t.assessmentId, t.enrollmentId),
    index("assessment_result_org_enrollment_idx").on(t.organizationId, t.enrollmentId),
  ]
);

/**
 * 010 — El certificado emitido.
 *
 * `enrollment_id` es ÚNICO: emitir dos veces devuelve el mismo certificado
 * (FR-007, constitución IV). Y el `code` no es secuencial (FR-010): un código
 * adivinable convierte el endpoint público de verificación en un listado de
 * todos los egresados de la academia.
 *
 * `attendance_pct` se CONGELA al emitir: si después se carga una clase o se
 * cancela otra, el porcentaje del momento de la emisión no debe moverse — el
 * certificado ya está en manos del alumno.
 */
export const certificate = pgTable(
  "certificate",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    enrollmentId: text("enrollment_id")
      .notNull()
      .unique()
      .references(() => enrollment.id, { onDelete: "cascade" }),
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
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("certificate_org_idx").on(t.organizationId)]
);

/* ============================================================
 * 012 — Identidad de portal y roles de staff
 * ============================================================ */

/** 012 — Qué es esta cuenta dentro de la academia. */
export const ACCOUNT_LINK_KINDS = ["alumno", "profesor"] as const;
export type AccountLinkKind = (typeof ACCOUNT_LINK_KINDS)[number];

/**
 * 012 (T012, DV-001) — Vincula una cuenta de Better Auth con la persona que
 * ya existe en el dominio: un `contact` inscripto, o un `teacher`.
 *
 * **Por qué no se usa `member`**: `member` es la membresía del plugin de
 * organización y es lo que alimenta la pantalla de equipo y los permisos de
 * staff. Meter ahí a los 340 alumnos los convertiría en personal de la
 * academia, con acceso a todo lo que hoy protege una capacidad de staff. Son
 * dos audiencias distintas y por eso son dos tablas distintas.
 *
 * **Una persona puede ser las dos cosas**: un egresado que después da clases
 * tiene dos filas, una por `kind`. Lo que el índice único impide es la misma
 * dos veces.
 *
 * **Suspender no es borrar (DV-007)**: cancelar una inscripción llena
 * `suspended_at`, no elimina la fila. La persona puede volver a inscribirse y
 * lo que cursó antes sigue siendo cierto.
 *
 * **Lo que el CHECK NO puede cubrir (FR-005b)**: que un vínculo `alumno` exija
 * un contacto CON inscripción. Un CHECK no consulta otra tabla, así que esa
 * regla vive en el servidor (`src/server/access.ts`) y tiene su propio test.
 */
export const accountLink = pgTable(
  "account_link",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ACCOUNT_LINK_KINDS }).notNull(),
    /** Obligatorio si `kind = alumno`, prohibido si no (ver el CHECK). */
    contactId: text("contact_id").references(() => contact.id, { onDelete: "cascade" }),
    /** Obligatorio si `kind = profesor`, prohibido si no (ver el CHECK). */
    teacherId: text("teacher_id").references(() => teacher.id, { onDelete: "cascade" }),
    /** DV-007 — acceso suspendido. La fila NO se borra. */
    suspendedAt: timestamp("suspended_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
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
    ),
  ]
);

/**
 * 012 (T012, DV-003) — Los roles de staff, configurables desde la pantalla.
 *
 * El reparto es deliberado: las CAPACIDADES son una lista cerrada en código
 * (`src/lib/capabilities.ts`, verificada por el compilador) y los ROLES viven
 * en la base porque son lo que el dueño quiere poder cambiar sin un deploy.
 * Lo que se prueba vive en código; lo que se edita vive en la base.
 *
 * **Por qué `jsonb` y no una tabla puente**: una puente agregaría un join a
 * CADA verificación de permiso sin agregar ninguna garantía — la garantía la
 * da el tipo en TypeScript, no la forma de la tabla.
 *
 * La tabla se crea acá pero todavía no manda: el mapeo sigue siendo el de
 * `capabilities.ts` hasta la fase 4 (T018-T021), que la siembra y recién ahí
 * la pone a decidir.
 */
export const role = pgTable(
  "role",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** `direccion`, `coordinacion`, `soporte`… — la llave estable. */
    key: text("key").notNull(),
    /** Rótulo visible; este sí se puede renombrar sin romper nada. */
    name: text("name").notNull(),
    capabilities: jsonb("capabilities")
      .$type<Capability[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** Los de sistema no se borran desde la pantalla. */
    system: boolean("system").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("role_org_key_uq").on(t.organizationId, t.key)]
);

/* ============================================================
 * 013 — Material de cursada y anuncios
 * ============================================================ */

/** 013 (FR-007) — Qué clase de recurso es. Todos son ENLACES. */
export const RESOURCE_KINDS = ["guia", "ejemplo", "enlace", "video"] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

/**
 * 013 (T018, FR-006/FR-007) — El material de cursada.
 *
 * **Son ENLACES, no archivos.** El sistema no almacena la guía ni el video:
 * guarda dónde están. Es la decisión marco de archivos, y sostiene el
 * principio II de la constitución — almacenar archivos habría empujado a S3/R2.
 *
 * **Cuelga de un curso O de una clase, nunca de los dos.** Un recurso sin
 * contenedor no se puede mostrar en ninguna pantalla; uno con los dos
 * aparecería duplicado. Lo impone el CHECK y se valida antes en el servidor,
 * porque un constraint violado llega como 500 sin explicación (mismo criterio
 * que `account_link` en 012).
 *
 * `course_module_id` es una referencia OPCIONAL al temario, no el contenedor:
 * `course_module` tiene **0 filas**, así que atar el material al temario lo
 * dejaría inutilizable desde el día uno (DV-002).
 */
export const resource = pgTable(
  "resource",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** Material del CURSO: aplica a todas sus cohortes. */
    courseId: text("course_id").references(() => course.id, { onDelete: "cascade" }),
    /** Material de una CLASE puntual. */
    classSessionId: text("class_session_id").references(() => classSession.id, {
      onDelete: "cascade",
    }),
    /**
     * 023 — Material de una CAMADA: lo ven sus alumnos y nadie más.
     *
     * Es el tercer contenedor, y hacía falta. El del CURSO es el programa
     * oficial que mantiene coordinación y alcanza a las siete camadas que lo
     * dictan; el de la CLASE es el ejercicio de un día puntual. Faltaba el del
     * medio: la guía que esta camada usa y las otras no —porque cambió el
     * software, porque es in-company, porque el profesor arma lo suyo—.
     *
     * Sin esto, un profesor que quería compartir algo para toda su camada solo
     * podía colgarlo de una clase (y quedaba escondido ahí adentro) o pedirle
     * a coordinación que lo pusiera en el curso, afectando a las demás.
     */
    cohortId: text("cohort_id").references(() => cohort.id, { onDelete: "cascade" }),
    /** Referencia opcional al temario; no es el contenedor. */
    courseModuleId: text("course_module_id").references(() => courseModule.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    /** El enlace. El sistema NO almacena el archivo (FR-007). */
    url: text("url").notNull(),
    kind: text("kind", { enum: RESOURCE_KINDS }).notNull().default("enlace"),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("resource_org_course_idx").on(t.organizationId, t.courseId),
    index("resource_org_class_idx").on(t.organizationId, t.classSessionId),
    index("resource_org_cohort_idx").on(t.organizationId, t.cohortId),
    /**
     * 023 — Exactamente UN contenedor: curso, camada o clase.
     *
     * Con dos, el material aparecería duplicado en dos pantallas; con
     * ninguno, no aparecería en ninguna. La suma de banderas dice "uno y solo
     * uno" sin escribir las tres combinaciones a mano — que es como se
     * olvida una al agregar el cuarto contenedor.
     */
    check(
      "resource_contenedor_unico",
      sql`(case when ${t.courseId} is not null then 1 else 0 end)
        + (case when ${t.cohortId} is not null then 1 else 0 end)
        + (case when ${t.classSessionId} is not null then 1 else 0 end) = 1`
    ),
  ]
);

/**
 * 013 (T018, FR-008) — Los avisos por cohorte.
 *
 * **No notifica** (DV-003): se registra y se ve. El aviso llega con 017. Lo
 * que resuelve hoy es lo que pedía la spec —que "no me enteré" deje de ser una
 * discusión—, y eso lo dan `author_user_id` y `created_at`, no la notificación.
 *
 * El autor es `set null` y no `cascade`: si mañana esa persona deja la
 * academia, el aviso que publicó sigue siendo parte de la historia de la
 * cohorte. Borrarlo reescribiría el pasado.
 */
export const announcement = pgTable(
  "announcement",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    cohortId: text("cohort_id")
      .notNull()
      .references(() => cohort.id, { onDelete: "cascade" }),
    authorUserId: text("author_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    // La consulta real es "los últimos avisos de esta cohorte".
    index("announcement_org_cohort_idx").on(t.organizationId, t.cohortId, t.createdAt),
  ]
);

/**
 * 023 — El AULA VIRTUAL: una sala de reunión de la academia.
 *
 * En la práctica es una cuenta de Zoom con su PMI (la sala permanente, de URL
 * fija). La academia tiene cinco, y hasta acá el sistema no sabía que
 * existían: `cohort.meeting_url` era texto libre y **0 de las 41 cohortes lo
 * tenían cargado**.
 *
 * Modelarla como fila —y no seguir pegando URLs— es lo que permite responder
 * "¿qué aula usa esta clase?", "¿quién está en cada aula?" y sobre todo
 * "¿se pisan?". Con cinco aulas y 41 cohortes, la pregunta no es si se van a
 * pisar: es cuándo.
 *
 * **No es una integración con Zoom.** El choque se calcula comparando rangos
 * horarios con `classInstant()`, que ya existe. Si algún día se conecta la API
 * (018), el aula deja de ser un PMI fijo y pasa a ser el proveedor que emite
 * la reunión — sin cambiar quién la usa ni cómo se detecta el choque.
 */
export const virtualRoom = pgTable(
  "virtual_room",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
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
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("virtual_room_org_idx").on(t.organizationId),
    // Dos aulas con el mismo nombre son imposibles de asignar sin equivocarse.
    uniqueIndex("virtual_room_org_name_uq").on(t.organizationId, t.name),
  ]
);
