import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { getEnv } from "@/lib/env";
import { getM365Config } from "@/lib/m365/client";
import { normalizarCorreo } from "@/lib/contact-identity";
import { checkRateLimit } from "@/lib/rate-limit";
import { enviarCorreoDeMarketing } from "./send";

/**
 * 045 (DV-006, contracts/marketing-settings.md) — Buzón de marketing,
 * remitente y pie.
 *
 * La credencial de M365 sigue en el entorno y JAMÁS viaja (constitución I):
 * el DTO solo dice `m365Configured: boolean`. El buzón de marketing es una
 * dirección, no un secreto, y vive en la base para que el dueño lo cambie y lo
 * pruebe sin tocar el despliegue.
 */

export type MarketingSettingsData = {
  senderEmail: string | null;
  senderName: string | null;
  footerAddress: string | null;
  footerContact: string | null;
  verifiedSender: string | null;
  verifiedAt: Date | null;
  lastTestAt: Date | null;
  lastTestError: string | null;
};

export const AJUSTES_VACIOS: MarketingSettingsData = {
  senderEmail: null,
  senderName: null,
  footerAddress: null,
  footerContact: null,
  verifiedSender: null,
  verifiedAt: null,
  lastTestAt: null,
  lastTestError: null,
};

/** Lo que le falta a la organización para poder enviar una campaña. */
export type FaltanteDeAjustes = "buzon" | "buzon_sin_verificar" | "m365";

export type MarketingSettingsDto = {
  senderEmail: string | null;
  senderName: string | null;
  footerAddress: string | null;
  footerContact: string | null;
  verified: boolean;
  verifiedAt: string | null;
  lastTestAt: string | null;
  lastTestError: string | null;
  m365Configured: boolean;
  /** `M365_SENDER`: una dirección, no un secreto ("debe ser distinto de …"). */
  operationalSender: string | null;
  ready: boolean;
};

const vacio = (v: string | null) => v === null || v.trim() === "";

/** El buzón cargado pasó la prueba (y no se cambió después). */
function verificado(s: MarketingSettingsData): boolean {
  return !vacio(s.senderEmail) && s.verifiedSender === s.senderEmail;
}

/**
 * "Listo para enviar" (data-model §1): buzón, remitente y pie cargados, el
 * buzón verificado y M365 configurado. Derivado, nunca guardado.
 */
export function preparacionParaEnviar(
  settings: MarketingSettingsData,
  m365Configured: boolean
): { ok: boolean; missing: FaltanteDeAjustes[] } {
  const missing: FaltanteDeAjustes[] = [];
  const incompleto =
    vacio(settings.senderEmail) ||
    vacio(settings.senderName) ||
    vacio(settings.footerAddress) ||
    vacio(settings.footerContact);
  if (incompleto) missing.push("buzon");
  // Un buzón ausente no está "sin verificar": falta, y eso ya lo dice `buzon`.
  if (!vacio(settings.senderEmail) && !verificado(settings)) missing.push("buzon_sin_verificar");
  if (!m365Configured) missing.push("m365");
  return { ok: missing.length === 0, missing };
}

export function toMarketingSettingsDto(
  row: MarketingSettingsData,
  opts: { m365Configured: boolean; operationalSender: string | null }
): MarketingSettingsDto {
  return {
    senderEmail: row.senderEmail,
    senderName: row.senderName,
    footerAddress: row.footerAddress,
    footerContact: row.footerContact,
    verified: verificado(row),
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    lastTestAt: row.lastTestAt?.toISOString() ?? null,
    lastTestError: row.lastTestError,
    m365Configured: opts.m365Configured,
    operationalSender: opts.operationalSender,
    ready: preparacionParaEnviar(row, opts.m365Configured).ok,
  };
}

/** Los ajustes de la organización; todo `null` si nunca se configuró. */
export async function getMarketingSettings(orgId: string): Promise<MarketingSettingsData> {
  const t = schema.marketingSettings;
  const [row] = await getDb()
    .select({
      senderEmail: t.senderEmail,
      senderName: t.senderName,
      footerAddress: t.footerAddress,
      footerContact: t.footerContact,
      verifiedSender: t.verifiedSender,
      verifiedAt: t.verifiedAt,
      lastTestAt: t.lastTestAt,
      lastTestError: t.lastTestError,
    })
    .from(t)
    .where(scoped(t.organizationId, orgId))
    .limit(1);
  return row ?? { ...AJUSTES_VACIOS };
}

/** ¿Hay credenciales de M365 en el entorno? Solo el booleano sale de acá. */
export function m365Configurado(): boolean {
  return getM365Config() !== null;
}

/** El DTO de la organización, listo para viajar. */
export async function marketingSettingsDto(orgId: string): Promise<MarketingSettingsDto> {
  const settings = await getMarketingSettings(orgId);
  return toMarketingSettingsDto(settings, {
    m365Configured: m365Configurado(),
    operationalSender: normalizarCorreo(getEnv().M365_SENDER) ?? null,
  });
}

/* ============================================================
 * Escritura y prueba (US5)
 * ============================================================ */

export type AjustesInput = {
  senderEmail: string;
  senderName: string;
  footerAddress: string;
  footerContact: string;
};

/**
 * Guarda buzón, remitente y pie (una fila por organización). El buzón tiene
 * que ser DISTINTO del operativo (constitución 1.8.0 II.a). Cambiarlo borra
 * la verificación en el mismo `UPDATE`: un buzón nuevo no se usa sin probarlo.
 */
export async function guardarAjustes(
  session: { organizationId: string; userId: string },
  input: AjustesInput
): Promise<
  | { ok: true; settings: MarketingSettingsDto }
  | { ok: false; code: "buzon_no_separado" | "campana_enviando"; message: string }
> {
  const orgId = session.organizationId;
  const senderEmail = normalizarCorreo(input.senderEmail) ?? "";
  const operativo = normalizarCorreo(getEnv().M365_SENDER);
  if (operativo && senderEmail === operativo) {
    return {
      ok: false,
      code: "buzon_no_separado",
      message: `El buzón de marketing tiene que ser distinto del de los correos de los cursos (${operativo}).`,
    };
  }

  const t = schema.marketingSettings;
  const [fila] = await getDb()
    .select({ id: t.id, senderEmail: t.senderEmail })
    .from(t)
    .where(scoped(t.organizationId, orgId))
    .limit(1);
  const cambiaBuzon = (fila?.senderEmail ?? null) !== senderEmail;

  if (cambiaBuzon) {
    const c = schema.marketingCampaign;
    const [enviando] = await getDb()
      .select({ id: c.id })
      .from(c)
      .where(scoped(c.organizationId, orgId, eq(c.status, "enviando")))
      .limit(1);
    if (enviando) {
      return {
        ok: false,
        code: "campana_enviando",
        message: "Hay una campaña enviándose: cambiá el buzón cuando termine.",
      };
    }
  }

  const datos = {
    senderEmail,
    senderName: input.senderName.trim(),
    footerAddress: input.footerAddress.trim(),
    footerContact: input.footerContact.trim(),
    updatedBy: session.userId,
    updatedAt: new Date(),
  };
  if (fila) {
    await getDb()
      .update(t)
      .set({ ...datos, ...(cambiaBuzon ? { verifiedSender: null, verifiedAt: null } : {}) })
      .where(scoped(t.organizationId, orgId, eq(t.id, fila.id)));
  } else {
    await getDb()
      .insert(t)
      .values({ id: newId("marketingSettings"), organizationId: orgId, ...datos });
  }
  return { ok: true, settings: await marketingSettingsDto(orgId) };
}

/** 5 pruebas del buzón por persona cada 10 minutos. */
export const LIMITE_DE_PRUEBAS_DEL_BUZON = { windowMs: 10 * 60 * 1000, max: 5 };

/**
 * Prueba el buzón: manda un correo DESDE el buzón de marketing A quien prueba.
 * Aceptado → queda verificado. Rechazado → el motivo, en palabras, se guarda y
 * se devuelve; NO lanza (lanzar revertiría el `last_test_error`).
 */
export async function probarBuzon(session: { organizationId: string; userId: string }): Promise<
  | { ok: true; sentTo: string }
  | { ok: false; error: string }
  | { ok: false; code: "sin_buzon" | "m365_no_configurado" | "too_many_requests"; message: string }
> {
  const orgId = session.organizationId;
  if (!checkRateLimit(`marketing-buzon:${session.userId}`, LIMITE_DE_PRUEBAS_DEL_BUZON).allowed) {
    return { ok: false, code: "too_many_requests", message: "Probaste muchas veces seguidas. Esperá unos minutos." };
  }
  const ajustes = await getMarketingSettings(orgId);
  const buzon = ajustes.senderEmail;
  if (!buzon) return { ok: false, code: "sin_buzon", message: "Primero cargá y guardá el buzón de marketing." };
  if (!m365Configurado()) {
    return {
      ok: false,
      code: "m365_no_configurado",
      message: "Microsoft 365 no está configurado en el servidor (variables M365_*).",
    };
  }

  const [usuario] = await getDb()
    .select({ email: schema.user.email })
    .from(schema.user)
    // `user` es de Better Auth, no una tabla de dominio: se busca por id.
    .where(eq(schema.user.id, session.userId))
    .limit(1);
  if (!usuario) return { ok: false, error: "No encontramos tu cuenta." };

  const r = await enviarCorreoDeMarketing({
    sender: buzon,
    fromName: ajustes.senderName ?? buzon,
    to: usuario.email,
    subject: "Prueba del buzón de marketing",
    html:
      "<p>Si estás leyendo esto, el sistema puede enviar campañas desde " +
      buzon.replace(/[<>&"']/g, "") +
      ".</p>",
  });

  const t = schema.marketingSettings;
  const ahora = new Date();
  if (r.ok) {
    await getDb()
      .update(t)
      .set({ verifiedSender: buzon, verifiedAt: ahora, lastTestAt: ahora, lastTestError: null })
      .where(scoped(t.organizationId, orgId));
    return { ok: true, sentTo: usuario.email };
  }

  const error =
    r.code === "mailbox_denied"
      ? `El sistema no tiene permiso para enviar desde ${buzon}. Hay que incluirlo en la ApplicationAccessPolicy de la app en Exchange.`
      : r.code === "mailbox_not_found"
        ? "Ese buzón no existe en Microsoft 365."
        : r.message;
  await getDb()
    .update(t)
    .set({ lastTestAt: ahora, lastTestError: error })
    .where(scoped(t.organizationId, orgId));
  return { ok: false, error };
}
