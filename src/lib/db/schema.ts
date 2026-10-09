import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
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
  /**
   * La contraseña vigente la eligió OTRA persona (una invitación, el alta del
   * equipo, `reset-password`). Mientras sea así, las pantallas mandan a
   * `/cambiar-contrasena`: la que viajó por correo deja de servir en cuanto la
   * persona elige la suya. Se enciende en `src/server/auth/assigned-password.ts`
   * y se apaga en `POST /api/account/password`.
   */
  mustChangePassword: boolean("must_change_password").notNull().default(false),
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
    /**
     * 029 (DV-002) — Celular de WhatsApp del profesor, normalizado con la
     * misma regla que `contact.wa_identity` (`normalizeMx`). Es lo único que
     * permite reconocerlo cuando escribe: `teacher` no tiene vínculo con
     * `contact`. NULL = no se lo reconoce por WhatsApp (riesgo R1).
     */
    waIdentity: text("wa_identity"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("teacher_org_idx").on(t.organizationId),
    uniqueIndex("teacher_org_wa_identity_uq")
      .on(t.organizationId, t.waIdentity)
      .where(sql`${t.waIdentity} IS NOT NULL`),
  ]
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
    /**
     * 028 (seguimiento) — La cohorte ES una especialización: la madre de un
     * programa de módulos.
     *
     * Antes era implícito —"es especialización si tiene hijos"— y eso tenía
     * dos costos: una especialización recién creada no tenía dónde armarse
     * (sin hijos no había pestaña), y cualquier cohorte raíz servía de madre,
     * así que colgar un módulo de la camada equivocada la convertía en
     * especialización sin que nadie lo decidiera. Ahora es una decisión
     * explícita, y el árbol la respeta: sólo una cohorte marcada puede ser
     * madre, un módulo no puede estar marcado, y no se desmarca con módulos
     * colgando (`src/server/program-modules.ts`).
     */
    isSpecialization: boolean("is_specialization").notNull().default(false),
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
 * 2026-10-06 (decisión del dueño) — Quien vende, use o no el sistema.
 *
 * Hasta la 0049 el vendedor de una inscripción era un `user`: sólo podía
 * figurar quien tenía cuenta en el panel, y la academia tiene vendedores que
 * nunca entran. `user_id` queda como vínculo OPCIONAL para los que sí.
 *
 * No se borra: se archiva. Un vendedor archivado no se ofrece para una venta
 * nueva, pero sigue en las ventas que hizo y en el reporte de comisiones —
 * borrarlo dejaría esas ventas como "Sin vendedor", que es justo lo que el
 * reporte existe para corregir.
 */
export const seller = pgTable(
  "seller",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("seller_org_idx").on(t.organizationId),
    // Una persona del equipo es UN vendedor: dos filas para el mismo usuario
    // partirían sus ventas en dos grupos del reporte.
    uniqueIndex("seller_org_user_uq")
      .on(t.organizationId, t.userId)
      .where(sql`${t.userId} IS NOT NULL`),
    check("seller_name_present", sql`length(trim(${t.name})) between 1 and 120`),
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
    /**
     * 2026-10-06 — Quién hizo la venta, para pagar la comisión. Apunta a
     * `seller`, no a `user`: hay vendedores que nunca entran al panel (antes
     * de la 0049 apuntaba a `user.id`). Obligatorio en servidor para toda
     * inscripción MADRE con cohorte (`exigeVendedor`); la columna sigue
     * aceptando NULL porque las ventas viejas sin vendedor no se bloquean.
     */
    sellerId: text("seller_id").references(() => seller.id, {
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
 * 2026-10-05 — Envío masivo por cohorte: términos ATC, bienvenida al grupo o
 * acceso al portal, a todos los alumnos de la cohorte de una vez.
 *
 * **La fuente de verdad de "ya se le mandó" NO es esta tabla**: son las
 * marcas por persona (`enrollment.terms_email_sent_at`,
 * `welcome_email_sent_at`, `account_link`). Esta tabla es el registro de la
 * corrida —quién la pidió, a quién alcanzó y qué pasó con cada uno— para que
 * la pantalla muestre el avance y, después de recargar, los fallos.
 *
 * El estado no se guarda: `finished_at` NULL con el proceso vivo es "en
 * curso"; con el proceso reiniciado, "interrumpida". Apretar de nuevo manda
 * solo a quien todavía no tiene la marca.
 */
export const BULK_SEND_KINDS = ["terms", "welcome", "portal_access"] as const;
export type BulkSendKind = (typeof BULK_SEND_KINDS)[number];

export const bulkSendRun = pgTable(
  "bulk_send_run",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    cohortId: text("cohort_id")
      .notNull()
      .references(() => cohort.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: BULK_SEND_KINDS }).notNull(),
    startedBy: text("started_by").references(() => user.id, { onDelete: "set null" }),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    finishedAt: timestamp("finished_at"),
  },
  (t) => [index("bulk_send_run_org_cohort_idx").on(t.organizationId, t.cohortId, t.kind)]
);

export const BULK_SEND_OUTCOMES = [
  "pending",
  "sent",
  "skipped_already_sent",
  "skipped_has_access",
  "failed",
] as const;
export type BulkSendOutcome = (typeof BULK_SEND_OUTCOMES)[number];

export const bulkSendRecipient = pgTable(
  "bulk_send_recipient",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    runId: text("run_id")
      .notNull()
      .references(() => bulkSendRun.id, { onDelete: "cascade" }),
    enrollmentId: text("enrollment_id")
      .notNull()
      .references(() => enrollment.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    outcome: text("outcome", { enum: BULK_SEND_OUTCOMES }).notNull().default("pending"),
    /** El motivo de un fallo o de un salteo, en palabras para la pantalla. */
    message: text("message"),
    processedAt: timestamp("processed_at"),
  },
  (t) => [index("bulk_send_recipient_org_run_idx").on(t.organizationId, t.runId, t.position)]
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
    /**
     * 029 — Tema que el agente clasificó en el turno que produjo este
     * saliente. Solo en salientes `origin = "ai"` con el ruteo encendido; lo
     * leen el Laboratorio y el inbox.
     */
    aiTopic: text("ai_topic", {
      enum: ["ventas", "soporte", "academia", "sin_determinar"],
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    check(
      "message_ai_topic_valid",
      sql`${t.aiTopic} IS NULL OR ${t.aiTopic} IN ('ventas','soporte','academia','sin_determinar')`
    ),
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
    /**
     * 029 (DV-012) — Interruptor del ruteo por áreas. Apagado (default), el
     * prompt, el esquema y el comportamiento del agente son los de siempre.
     */
    areaRoutingEnabled: boolean("area_routing_enabled").notNull().default(false),
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
    /** 029 (DV-007) — Ruteo esperado vs. detectado: juez + hechos calculados en código. */
    routing: jsonb("routing").$type<Record<string, unknown>>(),
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
    /**
     * 030 (DV-007) — De dónde salió `recording_url`: `'manual'` (lo pegó una
     * persona) o `'zoom'` (lo adjudicó la sincronización). NULL cuando no hay
     * grabación. Es lo que impide que la sincronización pise un enlace que
     * alguien cargó a mano.
     */
    recordingSource: text("recording_source", { enum: ["manual", "zoom"] }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check(
      "class_session_recording_source_valid",
      sql`${t.recordingSource} IS NULL OR ${t.recordingSource} IN ('manual','zoom')`
    ),
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
    /**
     * 016 (FR-005, FR-005e) — La fecha límite de TODA la cohorte.
     *
     * Es un INSTANTE, no un día con un `"23:59"` colgando: se compone con
     * `classInstant()` en la zona de la organización, igual que el horario de
     * una clase. Un "23:59" sin zona cierra el plazo antes de hora para los 87
     * alumnos que cursan desde fuera de Uruguay.
     *
     * NULL = sin plazo, y es un estado legítimo (DV-001): no todas las
     * evaluaciones tienen fecha, y sin fecha no hay "tardía" que marcar.
     *
     * **No bloquea** (DV-006). Pasada la fecha la entrega se acepta marcada
     * como tardía y decide el profesor.
     */
    dueAt: timestamp("due_at"),
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
 * 016 (FR-001..FR-004) — La ENTREGA de un alumno en una evaluación.
 *
 * Es un **enlace**, nunca un archivo (decisión marco de la fase, constitución
 * II): adentro queda el registro de qué se entregó, cuándo y con qué
 * devolución; el archivo vive en el Drive del alumno y el profesor lo abre en
 * otra pestaña. Lo que se ganó a cambio es no sumar cientos de gigas de
 * modelos de Revit al VPS ni una cuarta dependencia de runtime.
 *
 * **Cuelga de la inscripción, no del contacto** (FR-001, FR-012). En un
 * programa multi-módulo esa inscripción es la del MÓDULO —la hija—, porque la
 * evaluación ya es por cohorte (`assessment.cohort_id`) y la cohorte de módulo
 * es la que tiene profesor, clases y asistencia.
 *
 * **Una fila por intento, y ninguna se borra** (FR-008). La reentrega inserta
 * una fila nueva; la anterior queda con su fecha y su devolución. Borrarla
 * perdería la evidencia de qué se corrigió y por qué se pidió de nuevo.
 *
 * Por eso NO hay índice único PLENO por evaluación e inscripción: eso es
 * exactamente lo que impediría el historial. Lo que sí hay es uno PARCIAL
 * sobre la entrega ABIERTA (`submission_abierta_uq`, más abajo), que cierra la
 * carrera entre dos entregas simultáneas sin prohibir la reentrega.
 */
export const submission = pgTable(
  "submission",
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
    /** FR-002/FR-003 — el enlace, validado con `httpUrl`. Nunca un archivo. */
    url: text("url").notNull(),
    /** FR-002 — opcional: el enlace sin título ya dice dónde está el trabajo. */
    title: text("title"),
    /** FR-004 — el instante exacto de la entrega. */
    submittedAt: timestamp("submitted_at").notNull().defaultNow(),
    /**
     * 016 (FR-006) — La corrección. `passed` NULL = todavía sin corregir, y
     * ese null NO es un desaprobado: es la misma regla de 010/FR-005, que es la
     * que más veces se rompe sola cuando alguien escribe `passed ? … : …`.
     */
    passed: boolean("passed"),
    /**
     * **FR-007 + FR-011 — la devolución, en columna PROPIA.**
     *
     * No va a `assessment_result.notes` y no es un detalle de prolijidad: ese
     * campo hoy lo carga el staff como nota INTERNA sobre el alumno, y FR-007
     * vuelve la devolución visible para él. Escribirla ahí le abriría al alumno
     * todo lo que la coordinación anotó. Son dos textos con dos audiencias.
     */
    feedback: text("feedback"),
    correctedAt: timestamp("corrected_at"),
    /** `set null`: que el profesor deje la academia no borra la corrección. */
    correctedBy: text("corrected_by").references(() => user.id, {
      onDelete: "set null",
    }),
    /**
     * 016 (FR-010, FR-013, DV-003) — **La reapertura: un ESTADO, no un
     * contador.**
     *
     * La reentrega no tiene tope. Lo único que la habilita es que el profesor
     * reabra ESTA entrega. Un número fijo de intentos obligaría a adivinar hoy
     * un límite que ningún profesor pidió, y el día que hiciera falta una
     * entrega más habría que tocar código.
     */
    reopenedAt: timestamp("reopened_at"),
    reopenedBy: text("reopened_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    // Por acá se lee el historial de una persona en una evaluación, y de ahí
    // sale la entrega VIGENTE: la más reciente.
    index("submission_org_assessment_enrollment_idx").on(
      t.organizationId,
      t.assessmentId,
      t.enrollmentId,
      t.submittedAt
    ),
    // Y por acá, la pantalla del profesor: todas las entregas de su evaluación.
    index("submission_org_assessment_idx").on(t.organizationId, t.assessmentId),
    /**
     * **Constitución IV — UNA sola entrega abierta por evaluación e
     * inscripción.**
     *
     * Sin esto, `estudianteEntregar` consultaba "¿puede entregar?" y recién
     * después insertaba: dos POST simultáneos leían los dos "sí" y entraban los
     * dos, dejando una reentrega que el profesor nunca habilitó (FR-013).
     *
     * Es PARCIAL a propósito. El único PLENO sobre (evaluación, inscripción)
     * cerraría la misma carrera y de paso prohibiría la reentrega, que es el
     * historial que FR-008 manda conservar. Éste sólo mira la entrega ABIERTA
     * —sin corregir y sin reabrir—, la única que el modelo permite tener a la
     * vez: corregirla o reabrirla la saca del índice y le deja lugar a la
     * siguiente.
     */
    uniqueIndex("submission_abierta_uq")
      .on(t.assessmentId, t.enrollmentId)
      /*
        El predicado va con las columnas SIN calificar, y no es estilo:
        interpolando `${t.correctedAt}` drizzle escribe `"submission"."corrected_at"`
        y Postgres rechaza el CREATE INDEX —dentro de un predicado de índice no
        se puede nombrar la tabla—. Así la migración generada sale ejecutable.
      */
      .where(sql`corrected_at is null and reopened_at is null`),
  ]
);

/**
 * 016 (FR-005b, FR-005c) — La PRÓRROGA individual: el plazo de UNA persona en
 * UNA evaluación.
 *
 * Nunca es una fecha suelta. Registra **quién** la otorgó y **por qué**, con el
 * mismo criterio que la dispensa de asistencia (028/FR-023) y que la
 * revocación del certificado (010): sin autor ni motivo, una excepción es
 * indistinguible de un error de carga, y a los seis meses nadie puede decidir
 * cuál de las dos cosas fue.
 *
 * La fecha vigente del alumno es la **más tardía** entre ésta y la del grupo
 * (FR-005c): una prórroga sólo puede SUMAR plazo. Si después se corre la fecha
 * del grupo más allá de ella, el alumno no queda por detrás de sus compañeros.
 */
export const assessmentExtension = pgTable(
  "assessment_extension",
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
    /** El instante, compuesto con `classInstant()` como el del grupo. */
    dueAt: timestamp("due_at").notNull(),
    /** FR-005b — sin motivo no hay prórroga. */
    reason: text("reason").notNull(),
    grantedBy: text("granted_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    /**
     * Una prórroga por persona y evaluación: volver a otorgarla la CORRIGE, no
     * acumula dos fechas distintas sobre la misma entrega (constitución IV).
     */
    uniqueIndex("assessment_extension_uq").on(t.assessmentId, t.enrollmentId),
    index("assessment_extension_org_enrollment_idx").on(
      t.organizationId,
      t.enrollmentId
    ),
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
    /**
     * 2026-10-05 — Cuándo Graph aceptó el último correo de acceso (usuario y
     * contraseña temporal) de ESTA cuenta, y quién lo pidió.
     *
     * Vive acá y no en `enrollment` aunque el envío se dispare desde una
     * inscripción: el correo entrega las credenciales de una CUENTA, y una
     * persona con tres inscripciones tiene una sola. Marcado por inscripción,
     * las otras dos dirían "nunca se envió" y ofrecerían reenviar — que
     * genera una contraseña nueva y deja afuera a quien ya entraba.
     *
     * NULL no prueba que nunca se mandó: los vínculos anteriores a esta
     * columna no tienen marca. Por eso el envío masivo saltea a quien ya
     * tiene vínculo, con marca o sin ella.
     */
    invitationEmailSentAt: timestamp("invitation_email_sent_at"),
    invitationEmailSentBy: text("invitation_email_sent_by").references(() => user.id, {
      onDelete: "set null",
    }),
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
    /**
     * 030 (DV-002) — El usuario de Zoom que hospeda esta aula, dentro de UNA
     * conexión. Se vinculan juntos o ninguno (CHECK). Archivar el aula NO
     * borra el vínculo: solo deja de sincronizarse (DV-012).
     */
    zoomConnectionId: text("zoom_connection_id").references(
      (): AnyPgColumn => zoomConnection.id,
      { onDelete: "set null" }
    ),
    /** `id` del usuario en Zoom: estable aunque cambie el correo. */
    zoomUserId: text("zoom_user_id"),
    /** Rótulo; se refresca al "Probar" la conexión. */
    zoomUserEmail: text("zoom_user_email"),
    /**
     * 030 (addendum) — La sala personal (PMI) del usuario de Zoom, como la
     * informó Zoom al vincular o al "Probar". Sirve para avisar cuando el
     * enlace del aula NO es esa sala; nunca reescribe `url` sola.
     */
    zoomUserPmi: text("zoom_user_pmi"),
    /**
     * 030 (addendum, research R-12) — Hasta qué día (UTC) ESTA aula está al
     * día con Zoom. Por aula y no por conexión: un aula recién vinculada
     * tiene que traer su propio respaldo de 90 días aunque la conexión ya se
     * haya sincronizado ayer. Se vacía al cambiar el usuario vinculado.
     */
    zoomSyncedThrough: date("zoom_synced_through", { mode: "string" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("virtual_room_org_idx").on(t.organizationId),
    // Dos aulas con el mismo nombre son imposibles de asignar sin equivocarse.
    uniqueIndex("virtual_room_org_name_uq").on(t.organizationId, t.name),
    check(
      "virtual_room_zoom_link_together",
      sql`(${t.zoomConnectionId} IS NULL) = (${t.zoomUserId} IS NULL)`
    ),
    // 030 — Un usuario de Zoom hospeda a lo sumo UN aula activa: si no, la
    // señal "aula del anfitrión" sería ambigua por construcción.
    uniqueIndex("virtual_room_zoom_user_uq")
      .on(t.organizationId, t.zoomConnectionId, t.zoomUserId)
      .where(sql`${t.zoomUserId} IS NOT NULL AND ${t.archivedAt} IS NULL`),
  ]
);

/* ============================================================
 * cursos-offline — The offline content library (imported from LearnDash)
 * ============================================================
 *
 * Read-only content: course → lesson → topic, plus single/multiple-choice
 * quizzes. It never touches `course`/`cohort`/`enrollment`: a cohort only
 * POINTS at library courses through `offline_course_access`.
 *
 * Every IMPORTED content row carries `legacy_ref` (the LearnDash id, e.g.
 * `quiz:1281`) unique per organization, so re-running the import finds its
 * rows instead of duplicating them (constitution IV). Rows created from the
 * staff editor (T11) have `legacy_ref` NULL (migration 0045); two NULLs never
 * collide on the unique index, and the importer never matches them.
 */

export const OFFLINE_COURSE_STATUSES = ["published", "draft"] as const;
export type OfflineCourseStatus = (typeof OFFLINE_COURSE_STATUSES)[number];

export const OFFLINE_ANSWER_TYPES = ["single", "multiple"] as const;
export type OfflineAnswerType = (typeof OFFLINE_ANSWER_TYPES)[number];

export const OFFLINE_ACCESS_MODES = ["grant", "revoke"] as const;
export type OfflineAccessMode = (typeof OFFLINE_ACCESS_MODES)[number];

/** Where the topic video goes relative to the text (LearnDash BEFORE|AFTER). */
export const OFFLINE_VIDEO_SHOWN = ["before", "after"] as const;
export type OfflineVideoShown = (typeof OFFLINE_VIDEO_SHOWN)[number];

/** How a topic became complete: watched, had no video, or staff override. */
export const OFFLINE_COMPLETION_SOURCES = ["video", "no_video", "staff"] as const;
export type OfflineCompletionSource = (typeof OFFLINE_COMPLETION_SOURCES)[number];

export const offlineCourse = pgTable(
  "offline_course",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    legacyRef: text("legacy_ref"),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    descriptionMd: text("description_md").notNull().default(""),
    /** Never hot-linked to the retired WordPress domain. */
    thumbnailUrl: text("thumbnail_url"),
    status: text("status", { enum: OFFLINE_COURSE_STATUSES }).notNull().default("published"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("offline_course_org_legacy_uq").on(t.organizationId, t.legacyRef),
    index("offline_course_org_title_idx").on(t.organizationId, t.title),
  ]
);

export const offlineLesson = pgTable(
  "offline_lesson",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    courseId: text("course_id")
      .notNull()
      .references(() => offlineCourse.id, { onDelete: "cascade" }),
    legacyRef: text("legacy_ref"),
    title: text("title").notNull(),
    contentMd: text("content_md").notNull().default(""),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("offline_lesson_org_legacy_uq").on(t.organizationId, t.legacyRef),
    index("offline_lesson_org_course_idx").on(t.organizationId, t.courseId, t.position),
  ]
);

export const offlineTopic = pgTable(
  "offline_topic",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    lessonId: text("lesson_id")
      .notNull()
      .references(() => offlineLesson.id, { onDelete: "cascade" }),
    legacyRef: text("legacy_ref"),
    title: text("title").notNull(),
    contentMd: text("content_md").notNull().default(""),
    position: integer("position").notNull().default(0),
    /**
     * Vimeo URL the academy already hosts (constitution II, item 4): only the
     * browser loads the official player. NULL = no video, the topic completes
     * on open.
     */
    videoUrl: text("video_url"),
    videoShown: text("video_shown", { enum: OFFLINE_VIDEO_SHOWN }).notNull().default("after"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("offline_topic_org_legacy_uq").on(t.organizationId, t.legacyRef),
    index("offline_topic_org_lesson_idx").on(t.organizationId, t.lessonId, t.position),
    check("offline_topic_video_shown_valid", sql`${t.videoShown} in ('before', 'after')`),
  ]
);

/**
 * A quiz belongs to the course; it hangs from a lesson only when the lesson
 * names the same module (old editions). `set null` on the lesson: losing the
 * lesson must not delete the quiz nor its attempt history.
 */
export const offlineQuiz = pgTable(
  "offline_quiz",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    courseId: text("course_id")
      .notNull()
      .references(() => offlineCourse.id, { onDelete: "cascade" }),
    lessonId: text("lesson_id").references(() => offlineLesson.id, { onDelete: "set null" }),
    legacyRef: text("legacy_ref"),
    title: text("title").notNull(),
    descriptionMd: text("description_md").notNull().default(""),
    /** Passed = score >= this. 80 when LearnDash did not say. */
    passingPercentage: integer("passing_percentage").notNull().default(80),
    /** Retakes AFTER the first attempt (max attempts = 1 + this). NULL = unlimited. */
    retriesAllowed: integer("retries_allowed"),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("offline_quiz_org_legacy_uq").on(t.organizationId, t.legacyRef),
    index("offline_quiz_org_course_idx").on(t.organizationId, t.courseId, t.position),
    check("offline_quiz_passing_range", sql`${t.passingPercentage} between 0 and 100`),
    check(
      "offline_quiz_retries_non_negative",
      sql`${t.retriesAllowed} is null or ${t.retriesAllowed} >= 0`
    ),
  ]
);

export const offlineQuestion = pgTable(
  "offline_question",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    quizId: text("quiz_id")
      .notNull()
      .references(() => offlineQuiz.id, { onDelete: "cascade" }),
    legacyRef: text("legacy_ref"),
    questionMd: text("question_md").notNull(),
    answerType: text("answer_type", { enum: OFFLINE_ANSWER_TYPES }).notNull(),
    points: integer("points").notNull().default(1),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("offline_question_org_legacy_uq").on(t.organizationId, t.legacyRef),
    index("offline_question_org_quiz_idx").on(t.organizationId, t.quizId, t.position),
    check("offline_question_points_non_negative", sql`${t.points} >= 0`),
  ]
);

/** `is_correct` NEVER travels to the student, before or after an attempt. */
export const offlineAnswer = pgTable(
  "offline_answer",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    questionId: text("question_id")
      .notNull()
      .references(() => offlineQuestion.id, { onDelete: "cascade" }),
    legacyRef: text("legacy_ref"),
    text: text("text").notNull(),
    isCorrect: boolean("is_correct").notNull().default(false),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("offline_answer_org_legacy_uq").on(t.organizationId, t.legacyRef),
    index("offline_answer_org_question_idx").on(t.organizationId, t.questionId, t.position),
  ]
);

/**
 * Snapshot of what the student chose, with the texts: re-importing the quiz
 * may replace answer rows, and the history must still read the same.
 */
export type OfflineAnswersGiven = Array<{
  questionId: string;
  questionText: string;
  answerIds: string[];
  answerTexts: string[];
}>;

/**
 * One row per attempt; none is ever updated. Retries are counted per CONTACT
 * (across enrollments), hence `contact_id` and the unique
 * (quiz, contact, attempt_number): two simultaneous submissions cannot both
 * take the same attempt number (constitution IV).
 */
export const offlineQuizAttempt = pgTable(
  "offline_quiz_attempt",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    quizId: text("quiz_id")
      .notNull()
      .references(() => offlineQuiz.id, { onDelete: "cascade" }),
    enrollmentId: text("enrollment_id")
      .notNull()
      .references(() => enrollment.id, { onDelete: "cascade" }),
    contactId: text("contact_id")
      .notNull()
      .references(() => contact.id, { onDelete: "cascade" }),
    attemptNumber: integer("attempt_number").notNull(),
    scorePercentage: numeric("score_percentage", { precision: 5, scale: 2 }).notNull(),
    passed: boolean("passed").notNull(),
    answersGiven: jsonb("answers_given")
      .$type<OfflineAnswersGiven>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("offline_quiz_attempt_quiz_contact_number_uq").on(
      t.quizId,
      t.contactId,
      t.attemptNumber
    ),
    index("offline_quiz_attempt_org_contact_idx").on(t.organizationId, t.contactId, t.quizId),
    index("offline_quiz_attempt_org_enrollment_idx").on(t.organizationId, t.enrollmentId),
    check("offline_quiz_attempt_number_positive", sql`${t.attemptNumber} >= 1`),
  ]
);

/**
 * Who reads which library course.
 *
 * Two kinds of row, told apart by which FK is set (the CHECK enforces exactly
 * one):
 *   - cohort row (`cohort_id`, `mode` NULL): the whole cohort inherits it.
 *   - enrollment row (`enrollment_id`, `mode` grant|revoke): an individual
 *     override on top of the cohort.
 * Effective = (cohort assigned AND NOT revoke) OR grant — see
 * `src/server/offline-courses/logic.ts`.
 */
export const offlineCourseAccess = pgTable(
  "offline_course_access",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    offlineCourseId: text("offline_course_id")
      .notNull()
      .references(() => offlineCourse.id, { onDelete: "cascade" }),
    cohortId: text("cohort_id").references(() => cohort.id, { onDelete: "cascade" }),
    enrollmentId: text("enrollment_id").references(() => enrollment.id, {
      onDelete: "cascade",
    }),
    mode: text("mode", { enum: OFFLINE_ACCESS_MODES }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  },
  (t) => [
    uniqueIndex("offline_course_access_cohort_uq")
      .on(t.cohortId, t.offlineCourseId)
      // Unqualified columns: a table-qualified name inside an index predicate
      // is rejected by Postgres (same trap as `submission_abierta_uq`).
      .where(sql`cohort_id is not null`),
    uniqueIndex("offline_course_access_enrollment_uq")
      .on(t.enrollmentId, t.offlineCourseId)
      .where(sql`enrollment_id is not null`),
    index("offline_course_access_org_cohort_idx").on(t.organizationId, t.cohortId),
    index("offline_course_access_org_enrollment_idx").on(t.organizationId, t.enrollmentId),
    index("offline_course_access_org_course_idx").on(t.organizationId, t.offlineCourseId),
    check(
      "offline_course_access_target_coherent",
      sql`(${t.cohortId} is not null and ${t.enrollmentId} is null and ${t.mode} is null)
       or (${t.enrollmentId} is not null and ${t.cohortId} is null and ${t.mode} is not null)`
    ),
  ]
);

/**
 * How far a CONTACT got in a topic (per contact, like attempts: progress
 * follows the person across enrollments). One row per (contact, topic).
 * `completed_by` is set ONLY for a staff override — who marked it, for review.
 * Client-side video tracking is spoofable; acceptable for an academy.
 */
export const offlineTopicProgress = pgTable(
  "offline_topic_progress",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    contactId: text("contact_id")
      .notNull()
      .references(() => contact.id, { onDelete: "cascade" }),
    topicId: text("topic_id")
      .notNull()
      .references(() => offlineTopic.id, { onDelete: "cascade" }),
    /** 0..1 share of the video really played (merged ranges). */
    watchedRatio: numeric("watched_ratio", { precision: 5, scale: 4 }).notNull().default("0"),
    /** Every range ever played, merged (seconds) — the ratio is over their union (T9b). */
    playedRanges: jsonb("played_ranges")
      .$type<Array<{ start: number; end: number }>>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** Seconds the ratio is computed over; `null` until the first video report. */
    videoDuration: numeric("video_duration"),
    completedAt: timestamp("completed_at"),
    completedBy: text("completed_by").references(() => user.id, { onDelete: "set null" }),
    completionSource: text("completion_source", { enum: OFFLINE_COMPLETION_SOURCES }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("offline_topic_progress_contact_topic_uq").on(t.contactId, t.topicId),
    index("offline_topic_progress_org_contact_idx").on(t.organizationId, t.contactId),
    index("offline_topic_progress_org_topic_idx").on(t.organizationId, t.topicId),
    check(
      "offline_topic_progress_ratio_range",
      sql`${t.watchedRatio} >= 0 and ${t.watchedRatio} <= 1`
    ),
    check(
      "offline_topic_progress_completion_coherent",
      sql`(${t.completedAt} is null) = (${t.completionSource} is null)`
    ),
    check(
      "offline_topic_progress_source_valid",
      sql`${t.completionSource} is null or ${t.completionSource} in ('video', 'no_video', 'staff')`
    ),
    // The author of a completion exists only for a staff override.
    check(
      "offline_topic_progress_staff_author",
      sql`${t.completedBy} is null or ${t.completionSource} = 'staff'`
    ),
  ]
);

/**
 * Staff recognizes that a CONTACT already completed a whole course
 * (`lesson_id` NULL) or one of its lessons elsewhere — students moved from the
 * previous LMS. Its own record ON PURPOSE: progress rows and attempts keep
 * meaning "what the student did here", so nothing is fabricated there, and
 * revoking a recognition leaves real progress untouched. Completion is
 * DERIVED from both (`courseProgressState` in offline-courses/logic.ts).
 *
 * Revoked rows stay (who revoked, when) for review; the partial unique
 * indexes allow one ACTIVE row per (contact, course) and per (contact,
 * lesson), so recognizing twice is a no-op.
 */
export const offlineRecognition = pgTable(
  "offline_recognition",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    contactId: text("contact_id")
      .notNull()
      .references(() => contact.id, { onDelete: "cascade" }),
    courseId: text("course_id")
      .notNull()
      .references(() => offlineCourse.id, { onDelete: "cascade" }),
    lessonId: text("lesson_id").references(() => offlineLesson.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    recognizedBy: text("recognized_by").references(() => user.id, { onDelete: "set null" }),
    recognizedAt: timestamp("recognized_at").notNull().defaultNow(),
    revokedAt: timestamp("revoked_at"),
    revokedBy: text("revoked_by").references(() => user.id, { onDelete: "set null" }),
  },
  (t) => [
    uniqueIndex("offline_recognition_course_active_uq")
      .on(t.contactId, t.courseId)
      .where(sql`lesson_id is null and revoked_at is null`),
    uniqueIndex("offline_recognition_lesson_active_uq")
      .on(t.contactId, t.lessonId)
      .where(sql`lesson_id is not null and revoked_at is null`),
    index("offline_recognition_org_contact_idx").on(t.organizationId, t.contactId, t.courseId),
    index("offline_recognition_org_course_idx").on(t.organizationId, t.courseId),
    index("offline_recognition_org_lesson_idx").on(t.organizationId, t.lessonId),
    check("offline_recognition_reason_present", sql`length(trim(${t.reason})) between 1 and 500`),
  ]
);

/* ============================================================
 * 2026-10-07 — Registro de actividad
 * ============================================================ */

/**
 * Lo que una persona HIZO, anotado en el momento: hoy, cada ingreso al portal
 * (`portal.sign_in`). La pestaña «Administración» del legajo lo lee con
 * `alumnos.auditoria`.
 *
 * `contact_id` y `user_id` son opcionales a propósito: un profesor que entra
 * al portal no es un contacto, y una acción del sistema no tiene usuario. Los
 * dos se ponen en NULL —no se borra la fila— si la persona se da de baja: un
 * registro que desaparece con su sujeto no sirve para auditar.
 *
 * `kind` es texto y no un enum de Postgres: la lista cerrada vive en
 * `lib/activity-kinds.ts`, y sumar un tipo no debería pedir una migración.
 *
 * No hay datos históricos: la tabla empieza vacía y la pantalla lo dice. Un
 * «último ingreso» reconstruido a partir de `session` mentiría, porque Better
 * Auth borra las sesiones vencidas.
 */
export const activityLog = pgTable(
  "activity_log",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    contactId: text("contact_id").references(() => contact.id, { onDelete: "set null" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    kind: text("kind").notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    // La única lectura: «lo último de esta persona».
    index("activity_log_org_contact_created_idx").on(
      t.organizationId,
      t.contactId,
      t.createdAt.desc()
    ),
  ]
);

/* ============================================================
 * 029 — Agente por áreas: configuración, caso y correos de derivación.
 * ============================================================ */

/**
 * Una fila por organización y área externa (Ventas, Soporte): a qué casilla
 * va el correo, con qué copias y qué se le dice al cliente.
 *
 * Las copias de vendedores se guardan como IDS y se resuelven a correo al
 * enviar: un vendedor que cambia de correo no deja la configuración vieja, y
 * uno archivado se omite (DV-003).
 */
export const areaConfig = pgTable(
  "area_config",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    area: text("area", { enum: ["ventas", "soporte"] }).notNull(),
    enabled: boolean("enabled").notNull().default(false),
    mailbox: text("mailbox"),
    ccEmails: text("cc_emails").array().notNull().default(sql`'{}'::text[]`),
    ccSellerIds: text("cc_seller_ids").array().notNull().default(sql`'{}'::text[]`),
    contactText: text("contact_text"),
    officeHours: jsonb("office_hours").$type<{ days: number[]; from: string; to: string }>(),
    updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("area_config_org_area_uq").on(t.organizationId, t.area),
    check("area_config_area_valid", sql`${t.area} IN ('ventas','soporte')`),
    check(
      "area_config_sellers_only_ventas",
      sql`${t.area} = 'ventas' OR cardinality(${t.ccSellerIds}) = 0`
    ),
  ]
);

/**
 * El CASO: una consulta de un contacto derivada a un área. Mientras tenga
 * actividad en los últimos 7 días está abierto y los datos nuevos salen como
 * seguimiento del mismo caso, no como otro correo de apertura.
 */
export const areaHandoff = pgTable(
  "area_handoff",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    contactId: text("contact_id")
      .notNull()
      .references(() => contact.id, { onDelete: "cascade" }),
    area: text("area", { enum: ["ventas", "soporte"] }).notNull(),
    caseRef: text("case_ref").notNull(),
    summary: text("summary").notNull(),
    collected: jsonb("collected")
      .$type<Record<string, string>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    missing: text("missing").array().notNull().default(sql`'{}'::text[]`),
    /** Estado del ÚLTIMO correo del caso. */
    status: text("status", {
      enum: ["pendiente", "enviado", "fallido", "sin_configurar", "simulado"],
    }).notNull(),
    subject: text("subject").notNull(),
    /** Reservado para el hilo real de correo (DV-005: hoy solo `Mail.Send`). */
    graphConversationId: text("graph_conversation_id"),
    isTest: boolean("is_test").notNull().default(false),
    lastActivityAt: timestamp("last_activity_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("area_handoff_open_idx").on(
      t.organizationId,
      t.contactId,
      t.area,
      t.lastActivityAt.desc()
    ),
    index("area_handoff_conv_idx").on(t.organizationId, t.conversationId, t.createdAt.desc()),
    uniqueIndex("area_handoff_case_ref_uq").on(t.organizationId, t.caseRef),
    check("area_handoff_area_valid", sql`${t.area} IN ('ventas','soporte')`),
    check("area_handoff_summary_present", sql`length(trim(${t.summary})) > 0`),
    check(
      "area_handoff_status_valid",
      sql`${t.status} IN ('pendiente','enviado','fallido','sin_configurar','simulado')`
    ),
  ]
);

/**
 * Cada correo del caso (apertura o seguimiento). El HTML no se persiste: se
 * re-arma al enviar desde la conversación y el caso.
 *
 * `UNIQUE (handoff_id, source_message_id)`: re-ejecutar el turno del mismo
 * mensaje entrante no duplica el correo (constitución IV).
 */
export const areaHandoffEmail = pgTable(
  "area_handoff_email",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    handoffId: text("handoff_id")
      .notNull()
      .references(() => areaHandoff.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["apertura", "seguimiento"] }).notNull(),
    sourceMessageId: text("source_message_id")
      .notNull()
      .references(() => message.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: ["pendiente", "enviado", "fallido", "sin_configurar", "simulado"],
    }).notNull(),
    recipients: jsonb("recipients")
      .$type<{
        to: string[];
        cc: string[];
        replyTo: string | null;
        omitted: { sellerId: string; reason: string }[];
      }>()
      .notNull(),
    collectedDelta: jsonb("collected_delta")
      .$type<Record<string, string>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    renderedSubject: text("rendered_subject").notNull(),
    /** Motivo de Graph o "M365 no configurado"; jamás secretos. */
    error: text("error"),
    graphMessageId: text("graph_message_id"),
    internetMessageId: text("internet_message_id"),
    /** Solo cuando Graph respondió 202. */
    sentAt: timestamp("sent_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("area_handoff_email_source_uq").on(t.handoffId, t.sourceMessageId),
    index("area_handoff_email_status_idx").on(t.organizationId, t.status),
    check("area_handoff_email_kind_valid", sql`${t.kind} IN ('apertura','seguimiento')`),
    check(
      "area_handoff_email_status_valid",
      sql`${t.status} IN ('pendiente','enviado','fallido','sin_configurar','simulado')`
    ),
  ]
);

/* ============================================================
 * 030 — Grabaciones de Zoom (constitución 1.6.0)
 * ============================================================
 *
 * El CRM LEE las grabaciones en la nube de las cuentas de Zoom del negocio y
 * las adjudica a clases. No descarga ni almacena video: una grabación es un
 * ENLACE. Todo es opcional: sin conexiones, nada de esto se usa.
 */

/**
 * Credenciales de UNA cuenta de Zoom (app Server-to-Server OAuth). Cubre uno
 * o muchos usuarios de Zoom, así sirve igual si las cuentas son una
 * organización de Zoom o varias cuentas sueltas (DV-002).
 */
export const zoomConnection = pgTable(
  "zoom_connection",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    accountId: text("account_id").notNull(),
    clientId: text("client_id").notNull(),
    /** AES-256-GCM (`lib/crypto`). Jamás en respuestas ni logs. */
    clientSecretCipher: text("client_secret_cipher").notNull(),
    clientSecretIv: text("client_secret_iv").notNull(),
    clientSecretTag: text("client_secret_tag").notNull(),
    /** Lo único que se muestra (`••••1234`). */
    clientSecretLast4: text("client_secret_last4").notNull(),
    status: text("status", { enum: ["sin_probar", "ok", "error"] })
      .notNull()
      .default("sin_probar"),
    /** Código propio + mensaje legible; nunca la respuesta cruda de Zoom. */
    lastError: text("last_error"),
    lastTestedAt: timestamp("last_tested_at"),
    lastSyncAt: timestamp("last_sync_at"),
    /** Fecha (UTC) hasta la que la conexión está al día (DV-004). */
    syncedThrough: date("synced_through", { mode: "string" }),
    /** Baja lógica: no se sincroniza; sus grabaciones se conservan. */
    archivedAt: timestamp("archived_at"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("zoom_connection_org_idx").on(t.organizationId),
    uniqueIndex("zoom_connection_org_name_uq").on(t.organizationId, t.name),
    // La misma cuenta de Zoom no se conecta dos veces.
    uniqueIndex("zoom_connection_org_account_uq").on(t.organizationId, t.accountId),
    check("zoom_connection_status_valid", sql`${t.status} IN ('sin_probar','ok','error')`),
  ]
);

/**
 * Una fila por INSTANCIA de reunión grabada (no por archivo: el enlace
 * compartible es de la reunión). `zoom_meeting_uuid` es la llave de
 * idempotencia del upsert.
 */
export const zoomRecording = pgTable(
  "zoom_recording",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    zoomConnectionId: text("zoom_connection_id")
      .notNull()
      .references(() => zoomConnection.id, { onDelete: "restrict" }),
    virtualRoomId: text("virtual_room_id").references(() => virtualRoom.id, {
      onDelete: "set null",
    }),
    zoomMeetingUuid: text("zoom_meeting_uuid").notNull(),
    /** Número de reunión, como texto (supera 2^53 en algunos casos). */
    zoomMeetingId: text("zoom_meeting_id").notNull(),
    hostZoomUserId: text("host_zoom_user_id").notNull(),
    hostEmail: text("host_email"),
    topic: text("topic"),
    startTime: timestamp("start_time", { withTimezone: true }).notNull(),
    durationMin: integer("duration_min"),
    totalSizeBytes: bigint("total_size_bytes", { mode: "number" }),
    fileCount: integer("file_count"),
    shareUrl: text("share_url"),
    /** DV-008: `share_url` + `pwd` si corresponde. */
    playUrl: text("play_url"),
    passcodeCipher: text("passcode_cipher"),
    passcodeIv: text("passcode_iv"),
    passcodeTag: text("passcode_tag"),
    passcodeEmbedded: boolean("passcode_embedded").notNull().default(false),
    autoDeleteDate: date("auto_delete_date", { mode: "string" }),
    /**
     * 030 (addendum) — Tipos de archivo de la reunión (`MP4`, `TRANSCRIPT`,
     * `CC`…). Solo METADATOS de `recording_files`: el CRM no descarga nada.
     */
    fileTypes: text("file_types").array().notNull().default(sql`'{}'::text[]`),
    firstSeenAt: timestamp("first_seen_at").notNull(),
    lastSeenAt: timestamp("last_seen_at").notNull(),
    /** DV-013 — dejó de aparecer en Zoom dentro de la ventana consultada. */
    missingInZoomAt: timestamp("missing_in_zoom_at"),
    classSessionId: text("class_session_id").references(() => classSession.id, {
      onDelete: "set null",
    }),
    assignmentMode: text("assignment_mode", { enum: ["auto", "manual"] })
      .notNull()
      .default("auto"),
    assignmentState: text("assignment_state", {
      enum: ["pendiente", "asignada", "ambigua", "conflicto", "sin_clase"],
    })
      .notNull()
      .default("pendiente"),
    candidateClassIds: text("candidate_class_ids").array().notNull().default(sql`'{}'::text[]`),
    conflictClassSessionId: text("conflict_class_session_id").references(
      () => classSession.id,
      { onDelete: "set null" }
    ),
    assignedBy: text("assigned_by").references(() => user.id, { onDelete: "set null" }),
    assignedAt: timestamp("assigned_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("zoom_recording_org_conn_uuid_uq").on(
      t.organizationId,
      t.zoomConnectionId,
      t.zoomMeetingUuid
    ),
    // Una clase, UNA grabación adjudicada.
    uniqueIndex("zoom_recording_org_class_uq")
      .on(t.organizationId, t.classSessionId)
      .where(sql`${t.classSessionId} IS NOT NULL`),
    index("zoom_recording_org_start_idx").on(t.organizationId, t.startTime.desc()),
    index("zoom_recording_org_room_start_idx").on(
      t.organizationId,
      t.virtualRoomId,
      t.startTime.desc()
    ),
    index("zoom_recording_org_state_idx").on(t.organizationId, t.assignmentState),
    index("zoom_recording_org_meeting_idx").on(t.organizationId, t.zoomMeetingId),
    check("zoom_recording_mode_valid", sql`${t.assignmentMode} IN ('auto','manual')`),
    check(
      "zoom_recording_state_valid",
      sql`${t.assignmentState} IN ('pendiente','asignada','ambigua','conflicto','sin_clase')`
    ),
    check(
      "zoom_recording_assigned_has_class",
      sql`(${t.assignmentState} = 'asignada') = (${t.classSessionId} IS NOT NULL)`
    ),
  ]
);

/** Lease de "una sincronización por organización a la vez" (DV-004). */
export const zoomSyncState = pgTable("zoom_sync_state", {
  organizationId: text("organization_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  /** `<hostname>:<pid>:<nanoid>`. */
  leaseOwner: text("lease_owner"),
  /** Vence solo si el proceso muere (15 min, renovado por aula). */
  leaseUntil: timestamp("lease_until"),
  /** Lo que dice la UI: "corriendo desde…". */
  currentRunStartedAt: timestamp("current_run_started_at"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/** Bitácora: una fila por corrida y conexión. Se conservan las últimas 200. */
export const zoomSyncRun = pgTable(
  "zoom_sync_run",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    zoomConnectionId: text("zoom_connection_id")
      .notNull()
      .references(() => zoomConnection.id, { onDelete: "cascade" }),
    trigger: text("trigger", { enum: ["manual", "periodica"] }).notNull(),
    triggeredBy: text("triggered_by").references(() => user.id, { onDelete: "set null" }),
    windowFrom: date("window_from", { mode: "string" }).notNull(),
    windowTo: date("window_to", { mode: "string" }).notNull(),
    status: text("status", { enum: ["corriendo", "ok", "parcial", "error"] }).notNull(),
    fetchedCount: integer("fetched_count").notNull().default(0),
    newCount: integer("new_count").notNull().default(0),
    assignedCount: integer("assigned_count").notNull().default(0),
    ambiguousCount: integer("ambiguous_count").notNull().default(0),
    conflictCount: integer("conflict_count").notNull().default(0),
    /** Mensaje propio, sin datos sensibles; por aula si `parcial`. */
    error: text("error"),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    finishedAt: timestamp("finished_at"),
  },
  (t) => [
    index("zoom_sync_run_org_conn_started_idx").on(
      t.organizationId,
      t.zoomConnectionId,
      t.startedAt.desc()
    ),
    check("zoom_sync_run_trigger_valid", sql`${t.trigger} IN ('manual','periodica')`),
    check(
      "zoom_sync_run_status_valid",
      sql`${t.status} IN ('corriendo','ok','parcial','error')`
    ),
  ]
);
