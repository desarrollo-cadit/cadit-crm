import { z } from "zod";
import { phoneInputSchema } from "@/lib/phone";

/**
 * Contactos sin teléfono (2026-10-21) — reglas puras.
 *
 * El panel puede dar de alta a una persona con solo su correo. Pero
 * `contact.wa_identity` sigue siendo NOT NULL y única por organización (es la
 * llave con la que la ingesta reconoce a quien escribe), así que esa persona
 * recibe una identidad PROVISIONAL: `sinwa:<contactId>`.
 *
 * - No puede chocar con una identidad real: las de WhatsApp son un teléfono
 *   (solo dígitos) o `bsuid:<id>`.
 * - Jamás es un destinatario: `destinoDeWhatsApp` se niega a mandarle nada.
 * - Se reemplaza por el teléfono cuando alguien se lo agrega desde el panel
 *   (`planDeTelefono`). Una identidad REAL (teléfono o `bsuid:`) no se pisa
 *   nunca: eso migraría de qué conversación depende el contacto.
 */

export const PROVISIONAL_IDENTITY_PREFIX = "sinwa:";

export function identidadProvisional(contactId: string): string {
  return `${PROVISIONAL_IDENTITY_PREFIX}${contactId}`;
}

export function esIdentidadProvisional(identity: string | null | undefined): boolean {
  return typeof identity === "string" && identity.startsWith(PROVISIONAL_IDENTITY_PREFIX);
}

/* ============================================================
 * Correo: recortado y en minúsculas, en TODA escritura de un contacto
 * ============================================================ */

/** Recorta y pasa a minúsculas; vacío o ausente es `null`. */
export function normalizarCorreo(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim().toLowerCase();
  return s ? s : null;
}

/** Recortado y en minúsculas; `""` queda como `""` para que cada uso decida. */
const correoOVacio = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.union([z.literal(""), z.string().email("Revisá el correo.").max(200)]));

/** Correo opcional de un alta: `""` = no vino. */
export const correoOpcional = correoOVacio.transform((v) => v || undefined).optional();

/** Correo de una edición: `""` o `null` = borrarlo; ausente = no tocarlo. */
export const correoNullable = z
  .union([z.null(), correoOVacio.transform((v) => v || null)])
  .optional();

/** Teléfono opcional: `""` = no vino; si viene, se normaliza y valida. */
export const telefonoOpcional = z
  .string()
  .trim()
  .pipe(z.union([z.literal(""), phoneInputSchema]))
  .transform((v) => v || undefined)
  .optional();

export const FALTA_TELEFONO_O_CORREO = "Cargá al menos un teléfono o un correo.";

/** Para `.superRefine`: un contacto nuevo trae teléfono, correo o los dos. */
export function exigirTelefonoOCorreo(
  v: { phone?: string | null; email?: string | null },
  ctx: z.RefinementCtx
): void {
  if (!v.phone && !v.email) {
    ctx.addIssue({ code: "custom", path: ["phone"], message: FALTA_TELEFONO_O_CORREO });
  }
}

/** Los campos de un contacto nuevo cargado a mano desde el panel. */
export const contactoNuevoCampos = {
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().max(120).optional(),
  phone: telefonoOpcional,
  email: correoOpcional,
  nationalId: z.string().trim().max(60).optional(),
};

export const contactoNuevoSchema = z
  .object(contactoNuevoCampos)
  .superRefine(exigirTelefonoOCorreo);

/* ============================================================
 * Agregar un teléfono después
 * ============================================================ */

export type PlanDeTelefono =
  | { tipo: "sin_cambio" }
  | { tipo: "bloqueado"; mensaje: string }
  | { tipo: "agregar"; phone: string; waIdentity: string };

export const TELEFONO_BLOQUEADO =
  "Este contacto ya tiene teléfono y es su identidad de WhatsApp: no se cambia desde acá.";

/**
 * Qué pasa al cargar `nuevo` (ya normalizado) en un contacto.
 *
 * - Sin teléfono: se guarda. La identidad pasa al teléfono SOLO si era
 *   provisional; un `bsuid:` se queda como está (el teléfono es un atributo y
 *   la ingesta ya reconoce a la persona por cualquiera de los dos).
 * - Con el mismo teléfono: nada.
 * - Con OTRO teléfono: bloqueado. Ese teléfono es (o acompaña) la identidad de
 *   WhatsApp: cambiarlo movería la conversación a otra persona.
 */
export function planDeTelefono(
  actual: { phone: string | null; waIdentity: string },
  nuevo: string
): PlanDeTelefono {
  if (actual.phone === nuevo) return { tipo: "sin_cambio" };
  if (actual.phone) return { tipo: "bloqueado", mensaje: TELEFONO_BLOQUEADO };
  return {
    tipo: "agregar",
    phone: nuevo,
    waIdentity: esIdentidadProvisional(actual.waIdentity) ? nuevo : actual.waIdentity,
  };
}

/** Un contacto sin teléfono ni correo no se puede ubicar: no se permite. */
export function quedaSinCanal(c: { phone: string | null; email: string | null }): boolean {
  return !c.phone && !c.email;
}

/* ============================================================
 * La guarda del emisor
 * ============================================================ */

export type DestinoDeWhatsApp =
  | { ok: true; to: string }
  | { ok: false; code: "sin_whatsapp"; mensaje: string };

export const SIN_WHATSAPP =
  "Este contacto se cargó sin teléfono: no tiene WhatsApp. Agregale un teléfono para escribirle.";

/**
 * A quién se le manda un mensaje de WhatsApp. El teléfono normalizado o, si
 * llegó por BSUID sin teléfono, su Business-Scoped User ID. Una identidad
 * provisional sin teléfono se NIEGA siempre: el prefijo `sinwa:` jamás llega
 * a Graph.
 */
export function destinoDeWhatsApp(
  contact: { phone: string | null; waUserId: string | null; waIdentity: string },
  normalizar: (phone: string) => string
): DestinoDeWhatsApp {
  if (contact.phone) return { ok: true, to: normalizar(contact.phone) };
  if (esIdentidadProvisional(contact.waIdentity)) {
    return { ok: false, code: "sin_whatsapp", mensaje: SIN_WHATSAPP };
  }
  if (contact.waUserId) return { ok: true, to: contact.waUserId };
  return {
    ok: false,
    code: "sin_whatsapp",
    mensaje: "El contacto no tiene teléfono ni identidad de WhatsApp utilizable",
  };
}

/* ============================================================
 * Duplicados
 * ============================================================ */

export type CampoDuplicado = "telefono" | "correo";

export function mensajeDeDuplicado(campo: CampoDuplicado, nombre: string): string {
  return `Ya existe un contacto con ese ${campo === "correo" ? "correo" : "teléfono"}: ${nombre}`;
}
