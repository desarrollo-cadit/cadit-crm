import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { getEnv } from "@/lib/env";
import { getM365Config } from "@/lib/m365/client";

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
    operationalSender: getEnv().M365_SENDER ?? null,
  });
}
