import { and, eq } from "drizzle-orm";
import { customAlphabet } from "nanoid";
import { getAuth, runInternalSignup } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import type { AccountLinkKind } from "@/lib/db/schema";
import { getEnv } from "@/lib/env";
import { sendMail } from "@/lib/m365/client";
import { PORTAL_NO_EMAIL_REASON } from "@/lib/portal-access";
import { fullName } from "@/lib/utils";
import { resolveMembership } from "@/server/auth/on-signup";
import { renderTemplate } from "@/server/email/templates";

/**
 * 012 (fase 3) — Alta y resolución de los vínculos de portal.
 *
 * Un `account_link` dice qué es una cuenta dentro de la academia: el alumno
 * `ct_...` o el profesor `tch_...`. Es lo que separa a las 340 personas que
 * van a entrar al portal del puñado que es STAFF — que sigue viviendo en
 * `member` y no se toca (FR-017).
 */

export type AccountLinkInput = {
  userId: string;
  kind: AccountLinkKind;
  contactId?: string | null;
  teacherId?: string | null;
};

/**
 * `502` está en la lista porque invitar depende de Microsoft Graph: si el
 * proveedor de correo rechaza el envío, eso NO es culpa de quien pidió la
 * invitación y no puede contestarse con un 422 que sugiere un dato mal puesto.
 */
export type AccessResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: 404 | 409 | 422 | 502; code: string; message: string };

/** Los hechos que la regla necesita saber, ya averiguados. */
export type AccountLinkFacts = {
  /** FR-005b — ¿el contacto tiene al menos una inscripción? */
  contactHasEnrollment: boolean;
};

/**
 * 012 (T014) — Decide si un vínculo puede existir. Pura y sin base.
 *
 * Son dos reglas de origen distinto y por eso están las dos acá:
 *
 * 1. **Coherencia de `kind`** — la misma que el CHECK
 *    `account_link_kind_coherente` impone en Postgres. Se valida ANTES del
 *    insert no por desconfianza del CHECK, sino porque un constraint violado
 *    llega como un 500 sin explicación, y esto es un 422 que dice qué pasó.
 *
 * 2. **FR-005b, el alumno nace de la inscripción** — esta el CHECK NO puede
 *    imponerla: un CHECK no consulta otra tabla. Un contacto puede ser un lead
 *    que nunca se inscribió, y darle portal sería entregarle el legajo de una
 *    cursada que no existe.
 *
 * El orden entre ellas no es casual: la incoherencia se responde primero. Si a
 * un pedido le falta el contacto, contestarle "no tiene inscripción" lo manda
 * a buscar el problema al lugar equivocado.
 */
export function validateAccountLink(
  input: AccountLinkInput,
  facts: AccountLinkFacts
): AccessResult<AccountLinkInput> {
  const incoherente =
    input.kind === "alumno"
      ? !input.contactId || Boolean(input.teacherId)
      : !input.teacherId || Boolean(input.contactId);

  if (incoherente) {
    return {
      ok: false,
      status: 422,
      code: "incoherent_link",
      message:
        input.kind === "alumno"
          ? "Un acceso de alumno necesita un contacto, y solo un contacto"
          : "Un acceso de profesor necesita un profesor, y solo un profesor",
    };
  }

  if (input.kind === "alumno" && !facts.contactHasEnrollment) {
    return {
      ok: false,
      status: 422,
      code: "not_enrolled",
      message:
        "El contacto no tiene ninguna inscripción; el acceso de alumno nace de la inscripción",
    };
  }

  return { ok: true, data: input };
}

/** ¿Este contacto se inscribió alguna vez? (FR-005b) */
async function contactHasEnrollment(
  organizationId: string,
  contactId: string
): Promise<boolean> {
  const rows = await getDb()
    .select({ id: schema.enrollment.id })
    .from(schema.enrollment)
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        eq(schema.enrollment.contactId, contactId)
      )
    )
    .limit(1);
  return Boolean(rows[0]);
}

export type AccountLinkDto = {
  id: string;
  userId: string;
  kind: AccountLinkKind;
  contactId: string | null;
  teacherId: string | null;
  suspendedAt: string | null;
};

/**
 * Crea el vínculo. Idempotente por (organización, usuario, kind): pedirlo dos
 * veces devuelve el que ya existe en vez de chocar contra el índice único
 * (constitución IV).
 *
 * NO envía ningún correo. La invitación es un paso aparte y explícito del
 * staff (DV-004/DV-008): inscribir o vincular nunca dispara un envío.
 */
export async function createAccountLink(
  organizationId: string,
  input: AccountLinkInput
): Promise<AccessResult<AccountLinkDto>> {
  const facts: AccountLinkFacts = {
    contactHasEnrollment:
      input.kind === "alumno" && input.contactId
        ? await contactHasEnrollment(organizationId, input.contactId)
        : false,
  };

  const valid = validateAccountLink(input, facts);
  if (!valid.ok) return valid;

  const db = getDb();

  const existing = await db
    .select()
    .from(schema.accountLink)
    .where(
      scoped(
        schema.accountLink.organizationId,
        organizationId,
        and(
          eq(schema.accountLink.userId, input.userId),
          eq(schema.accountLink.kind, input.kind)
        )
      )
    )
    .limit(1);
  if (existing[0]) return { ok: true, data: serializeAccountLink(existing[0]) };

  const inserted = await db
    .insert(schema.accountLink)
    .values({
      id: newId("accountLink"),
      organizationId,
      userId: input.userId,
      kind: input.kind,
      contactId: input.contactId ?? null,
      teacherId: input.teacherId ?? null,
    })
    .returning();

  const row = inserted[0];
  if (!row) {
    return { ok: false, status: 409, code: "not_created", message: "No se pudo crear el acceso" };
  }
  return { ok: true, data: serializeAccountLink(row) };
}

export function serializeAccountLink(
  row: typeof schema.accountLink.$inferSelect
): AccountLinkDto {
  return {
    id: row.id,
    userId: row.userId,
    kind: row.kind,
    contactId: row.contactId,
    teacherId: row.teacherId,
    suspendedAt: row.suspendedAt?.toISOString() ?? null,
  };
}

/* ============================================================
 * 012 (T017) — Invitación al portal
 * ============================================================ */

/**
 * Alfabeto sin `0/O`, `1/l/I`: la contraseña se va a leer de un correo y
 * tipear a mano, y un cero confundido con una O es un ticket de soporte.
 */
const nanoPassword = customAlphabet("23456789ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz", 14);

/** Contraseña temporal legible. Se manda por correo y se cambia al entrar. */
export function generateTemporaryPassword(): string {
  return nanoPassword();
}

export type PortalAccessState = {
  /** `null` si esta persona todavía no tiene acceso. */
  link: AccountLinkDto | null;
  /** El correo al que se mandaría la invitación; `null` si no tiene. */
  email: string | null;
  /**
   * T017d — Por qué NO se puede invitar, en palabras. `null` = se puede.
   * La pantalla muestra esto en vez de un botón que va a fallar.
   */
  blockedReason: string | null;
};

/** Qué sabe el sistema sobre el acceso al portal del alumno de esta inscripción. */
export async function portalAccessState(
  organizationId: string,
  enrollmentId: string
): Promise<AccessResult<PortalAccessState>> {
  const ctx = await loadEnrollmentContact(organizationId, enrollmentId);
  if (!ctx) {
    return { ok: false, status: 404, code: "not_found", message: "Inscripción no encontrada" };
  }

  const links = await getDb()
    .select()
    .from(schema.accountLink)
    .where(
      scoped(
        schema.accountLink.organizationId,
        organizationId,
        and(
          eq(schema.accountLink.kind, "alumno"),
          eq(schema.accountLink.contactId, ctx.contact.id)
        )
      )
    )
    .limit(1);

  const link = links[0] ? serializeAccountLink(links[0]) : null;

  return {
    ok: true,
    data: {
      link,
      email: ctx.contact.email,
      blockedReason: link || ctx.contact.email ? null : SIN_CORREO,
    },
  };
}

/**
 * T017d — El motivo, dicho igual acá que en la pantalla y que en el 422.
 *
 * De los 340 alumnos importados, 6 no tienen correo. No fallan en silencio ni
 * les aparece un botón que devuelve error: se les dice qué falta y quién lo
 * puede arreglar.
 */
const SIN_CORREO = PORTAL_NO_EMAIL_REASON;

async function loadEnrollmentContact(organizationId: string, enrollmentId: string) {
  const rows = await getDb()
    .select({ enrollment: schema.enrollment, contact: schema.contact })
    .from(schema.enrollment)
    .innerJoin(schema.contact, eq(schema.enrollment.contactId, schema.contact.id))
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        eq(schema.enrollment.id, enrollmentId)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

export type GrantPortalAccessResult = {
  link: AccountLinkDto;
  /**
   * `true` cuando la persona YA tenía cuenta en el sistema (por ejemplo,
   * alguien del staff que además es alumno). En ese caso no se le toca la
   * contraseña ni se le manda nada: entra con la que ya usa.
   */
  existingAccount: boolean;
  /** Se devuelve UNA vez para que el staff pueda dictarla si el correo demora. */
  temporaryPassword: string | null;
  emailSentAt: string | null;
  /**
   * 014 — Por qué NO salió el correo, si no salió. `null` = salió bien.
   *
   * El acceso se entrega igual. Antes, un fallo del correo devolvía 502 y la
   * contraseña temporal se perdía con la respuesta —pero la cuenta ya estaba
   * creada, porque devolver una `Response` de error no revierte la
   * transacción—. Reintentar entraba por el camino de "ya existe", generaba
   * otra contraseña y volvía a fallar en el mismo lugar: la persona quedaba
   * con cuenta y sin forma de entrar, para siempre.
   *
   * Perder una credencial recién generada porque un tercero falló está mal con
   * M365 configurado y sin configurar: una caída de Graph de 30 segundos
   * produce exactamente el mismo agujero.
   */
  emailError: string | null;
};

/**
 * 012 (T017, DV-004/DV-008) — Habilita el portal de UN alumno y le avisa.
 *
 * Es un paso EXPLÍCITO del staff: inscribir a alguien no dispara esto ni nada
 * parecido. Y no existe la versión masiva — ver T017b: el botón de "invitar a
 * todos" no se construye, porque construirlo es invitar a que alguien lo
 * apriete y les llegue un correo a los 340 de una.
 *
 * El orden es deliberado: primero se crea el acceso, después se avisa. Si el
 * correo falla, el acceso queda creado y el staff reintenta —lo que genera una
 * contraseña temporal nueva—. Al revés, un correo enviado sobre un acceso que
 * no se pudo crear manda a la persona a una puerta que no abre.
 */
export async function grantPortalAccess(
  organizationId: string,
  enrollmentId: string
): Promise<AccessResult<GrantPortalAccessResult>> {
  const ctx = await loadEnrollmentContact(organizationId, enrollmentId);
  if (!ctx) {
    return { ok: false, status: 404, code: "not_found", message: "Inscripción no encontrada" };
  }
  const { contact } = ctx;

  if (!contact.email) {
    return { ok: false, status: 422, code: "no_email", message: SIN_CORREO };
  }

  const db = getDb();
  const email = contact.email.toLowerCase();

  const existingUsers = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, email))
    .limit(1);

  const existing = existingUsers[0];

  /**
   * La cuenta ya existe. Qué hacer con su contraseña depende de QUÉ cuenta es,
   * y la pregunta se responde mirando `member`:
   *
   * - **Con membresía = es del STAFF** (un coordinador que además hizo un
   *   curso). Se le agrega el vínculo de alumno y NO se le toca nada más.
   *   Pisarle la contraseña por invitarlo al portal lo dejaría afuera del
   *   panel, que es su trabajo.
   * - **Sin membresía = es una cuenta de portal** que ya se había creado, casi
   *   siempre porque el correo anterior falló. Reinvitar es exactamente eso:
   *   contraseña temporal nueva y otro correo.
   */
  if (existing) {
    const linked = await createAccountLink(organizationId, {
      userId: existing.id,
      kind: "alumno",
      contactId: contact.id,
    });
    if (!linked.ok) return linked;

    const membership = await resolveMembership(existing.id);
    if (membership) {
      return {
        ok: true,
        data: {
          link: linked.data,
          existingAccount: true,
          temporaryPassword: null,
          emailSentAt: null,
          // No se mandó nada porque no hacía falta: entra con la que ya usa.
          emailError: null,
        },
      };
    }

    return inviteExisting(existing.id, contact, linked.data);
  }

  const temporaryPassword = generateTemporaryPassword();
  let userId: string;
  try {
    const created = await runInternalSignup(() =>
      getAuth().api.signUpEmail({
        body: { name: fullName(contact), email, password: temporaryPassword },
      })
    );
    userId = created.user.id;
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo crear la cuenta";
    return { ok: false, status: 422, code: "signup_failed", message };
  }

  const linked = await createAccountLink(organizationId, {
    userId,
    kind: "alumno",
    contactId: contact.id,
  });
  if (!linked.ok) return linked;

  const envio = await sendInvitationEmail(contact, temporaryPassword);

  return {
    ok: true,
    data: { link: linked.data, existingAccount: false, temporaryPassword, ...envio },
  };
}

/**
 * 014 (T009, DV-006) — Habilita el portal de UN profesor y le avisa.
 *
 * Reusa entera la maquinaria de 012: la misma cuenta con contraseña temporal,
 * el mismo correo, el mismo trato para quien ya tiene cuenta. Lo único que
 * cambia es de dónde sale el correo (`teacher.email` en vez de
 * `contact.email`) y el `kind` del vínculo.
 *
 * **`validateAccountLink` ya contempla que un profesor NO necesita
 * inscripción** (FR-005b es solo para alumnos), así que no hubo que tocar la
 * regla.
 *
 * Sin envío masivo, igual que con los alumnos (T017b de 012): son 7 personas
 * y un correo no se puede desenviar.
 */
export async function grantTeacherPortalAccess(
  organizationId: string,
  teacherId: string
): Promise<AccessResult<GrantPortalAccessResult>> {
  const db = getDb();

  const rows = await db
    .select()
    .from(schema.teacher)
    .where(scoped(schema.teacher.organizationId, organizationId, eq(schema.teacher.id, teacherId)))
    .limit(1);
  const teacher = rows[0];
  if (!teacher) {
    return { ok: false, status: 404, code: "not_found", message: "Profesor no encontrado" };
  }

  /**
   * **Los 7 profesores reales están así hoy.** El motivo se dice con el mismo
   * criterio que T017d de 012: la pantalla explica qué falta en vez de ofrecer
   * un botón que devuelve error.
   */
  if (!teacher.email) {
    return {
      ok: false,
      status: 422,
      code: "no_email",
      message:
        "El profesor no tiene correo cargado. Agregáselo en su ficha y vas a poder invitarlo.",
    };
  }

  const email = teacher.email.toLowerCase();

  const existingUsers = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, email))
    .limit(1);
  const existing = existingUsers[0];

  // Un profesor "contacto" para el correo: reusa `sendInvitationEmail`, que
  // necesita nombre y correo. El apellido va vacío porque `teacher.name` ya
  // es el nombre completo.
  const comoContacto = {
    firstName: teacher.name,
    email: teacher.email,
  } as typeof schema.contact.$inferSelect;

  if (existing) {
    const linked = await createAccountLink(organizationId, {
      userId: existing.id,
      kind: "profesor",
      teacherId,
    });
    if (!linked.ok) return linked;

    // Mismo criterio que con alumnos: al staff no se le toca la contraseña.
    const membership = await resolveMembership(existing.id);
    if (membership) {
      return {
        ok: true,
        data: {
          link: linked.data,
          existingAccount: true,
          temporaryPassword: null,
          emailSentAt: null,
          // No se mandó nada porque no hacía falta: entra con la que ya usa.
          emailError: null,
        },
      };
    }
    return inviteExisting(existing.id, comoContacto, linked.data);
  }

  const temporaryPassword = generateTemporaryPassword();
  let userId: string;
  try {
    const created = await runInternalSignup(() =>
      getAuth().api.signUpEmail({
        body: { name: teacher.name, email, password: temporaryPassword },
      })
    );
    userId = created.user.id;
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo crear la cuenta";
    return { ok: false, status: 422, code: "signup_failed", message };
  }

  const linked = await createAccountLink(organizationId, {
    userId,
    kind: "profesor",
    teacherId,
  });
  if (!linked.ok) return linked;

  const envio = await sendInvitationEmail(comoContacto, temporaryPassword);

  return {
    ok: true,
    data: { link: linked.data, existingAccount: false, temporaryPassword, ...envio },
  };
}

/** Reinvitación de una cuenta de portal existente: contraseña nueva y correo. */
async function inviteExisting(
  userId: string,
  contact: typeof schema.contact.$inferSelect,
  link: AccountLinkDto
): Promise<AccessResult<GrantPortalAccessResult>> {
  const temporaryPassword = generateTemporaryPassword();

  // La MISMA ruta que usa el login para hashear (scrypt configurado en Better
  // Auth). Escribir el hash a mano en `account.password` genera una cuenta que
  // no puede iniciar sesión nunca más — ver scripts/reset-password.ts.
  const authCtx = await getAuth().$context;
  await authCtx.internalAdapter.updatePassword(
    userId,
    await authCtx.password.hash(temporaryPassword)
  );

  const envio = await sendInvitationEmail(contact, temporaryPassword);

  return {
    ok: true,
    data: { link, existingAccount: true, temporaryPassword, ...envio },
  };
}

/** Lo que pasó con el correo. **Nunca corta el alta**: ver `emailError`. */
type EnvioDeInvitacion = { emailSentAt: string | null; emailError: string | null };

async function sendInvitationEmail(
  contact: typeof schema.contact.$inferSelect,
  temporaryPassword: string
): Promise<EnvioDeInvitacion> {
  const env = getEnv();
  const sent = await sendMail({
    to: contact.email ?? "",
    subject: "Tu acceso al portal — CAD IT",
    html: renderTemplate("acceso-portal", {
      nombre: contact.firstName,
      academia: "CAD IT",
      urlPortal: env.APP_BASE_URL,
      usuario: (contact.email ?? "").toLowerCase(),
      contrasenaTemporal: temporaryPassword,
      contactoSoporte: env.M365_SENDER ?? "",
    }),
    bcc: env.M365_BCC,
  });

  if (!sent.ok) {
    // El acceso YA existe a esta altura. Devolverlo con el motivo a la vista
    // es lo único que deja seguir: la contraseña viaja igual y quien invita
    // se la dicta. Fallar acá dejaría la cuenta creada y sin llave.
    return { emailSentAt: null, emailError: sent.message };
  }
  return { emailSentAt: new Date().toISOString(), emailError: null };
}
