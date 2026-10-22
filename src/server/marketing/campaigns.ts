import { count, desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { getEnv } from "@/lib/env";
import { checkRateLimit } from "@/lib/rate-limit";
import type { AudienceFilters } from "@/lib/marketing/audience";
import {
  CampaignBodySchema,
  CUERPO_VACIO,
  validarCuerpo,
  type CampaignBody,
  type ErrorDeCuerpo,
} from "@/lib/marketing/body";
import { renderCampaignEmail, type RenderContext } from "@/lib/marketing/render-email";
import { getBranding } from "@/server/branding";
import { destinatariosDeAudiencia, leerFiltros, type DestinatarioConVariables } from "./audiences";
import { urlPublicaDeImagen, borrarImagenesDeCampana } from "./images";
import { enviarCorreoDeMarketing } from "./send";
import {
  getMarketingSettings,
  m365Configurado,
  preparacionParaEnviar,
  type FaltanteDeAjustes,
  type MarketingSettingsData,
} from "./settings";

/**
 * 045 (US2; FR-006…FR-010) — Campañas: borrador, vista previa y prueba.
 *
 * Solo el borrador se edita o se borra (409 `campana_no_editable`). La vista
 * previa y la prueba arman el correo con `renderCampaignEmail`, la MISMA
 * función del envío real: lo que se ve es lo que llega.
 */

export type CampaignStatus = "borrador" | "enviando" | "enviada" | "cancelada";

export type CampaignSummaryDto = {
  id: string;
  name: string;
  status: CampaignStatus;
  audienceName: string | null;
  recipientCount: number | null;
  createdAt: string;
  sentAt: string | null;
  finishedAt: string | null;
  createdByName: string | null;
  sentByName: string | null;
};

export type FaltanteDeCampana = FaltanteDeAjustes | "audiencia" | "asunto" | "cuerpo";

export type CampaignDto = CampaignSummaryDto & {
  subject: string;
  body: CampaignBody;
  audienceId: string | null;
  filters: AudienceFilters | null;
  images: { id: string; url: string; sizeBytes: number }[];
  readOnly: boolean;
  readiness: { ok: boolean; missing: FaltanteDeCampana[]; settingsHref: "/settings/marketing" };
  /** Se completa con el envío (US3); `null` en borrador. */
  metrics: null;
};

const NO_EXISTE = "Esa campaña no existe.";
const NO_EDITABLE = "La campaña ya se envió o se está enviando: no se puede cambiar.";

/** Un `jsonb` que no pasa el esquema no se interpreta: se lanza (falla cerrado). */
export function leerCuerpo(raw: unknown): CampaignBody {
  const parsed = CampaignBodySchema.safeParse(raw);
  if (!parsed.success) throw new Error("marketing: cuerpo de campaña inválido en la base");
  return parsed.data;
}

/* ============================================================
 * Lectura
 * ============================================================ */

function seleccionDeCampana() {
  const c = schema.marketingCampaign;
  const u = schema.user;
  return getDb()
    .select({
      id: c.id,
      name: c.name,
      subject: c.subject,
      body: c.body,
      audienceId: c.audienceId,
      audienceName: schema.marketingAudience.name,
      filters: c.filters,
      status: c.status,
      recipientCount: c.recipientCount,
      createdAt: c.createdAt,
      sendConfirmedAt: c.sendConfirmedAt,
      finishedAt: c.finishedAt,
      senderEmail: c.senderEmail,
      senderName: c.senderName,
      footer: c.footer,
      createdByName: sql<string | null>`(select ${u.name} from ${u} where ${u.id} = ${c.createdBy})`,
      sentByName: sql<string | null>`(select ${u.name} from ${u} where ${u.id} = ${c.sentBy})`,
    })
    .from(c)
    .leftJoin(schema.marketingAudience, eq(schema.marketingAudience.id, c.audienceId));
}

type FilaCampana = {
  id: string;
  name: string;
  subject: string;
  body: unknown;
  audienceId: string | null;
  audienceName: string | null;
  filters: unknown;
  status: CampaignStatus;
  recipientCount: number | null;
  createdAt: Date;
  sendConfirmedAt: Date | null;
  finishedAt: Date | null;
  senderEmail?: string | null;
  senderName?: string | null;
  footer?: { address: string; contact: string } | null;
  createdByName: string | null;
  sentByName: string | null;
};

async function filaDeCampana(orgId: string, id: string): Promise<FilaCampana | null> {
  const c = schema.marketingCampaign;
  const [row] = await seleccionDeCampana().where(scoped(c.organizationId, orgId, eq(c.id, id))).limit(1);
  return (row as FilaCampana | undefined) ?? null;
}

async function imagenesDeCampana(orgId: string, campaignId: string) {
  const img = schema.marketingImage;
  return getDb()
    .select({ id: img.id, publicToken: img.publicToken, sizeBytes: img.sizeBytes })
    .from(img)
    .where(scoped(img.organizationId, orgId, eq(img.campaignId, campaignId)))
    .orderBy(img.createdAt);
}

function toSummary(r: FilaCampana): CampaignSummaryDto {
  return {
    id: r.id,
    name: r.name,
    status: r.status,
    audienceName: r.audienceName,
    recipientCount: r.recipientCount,
    createdAt: r.createdAt.toISOString(),
    sentAt: r.sendConfirmedAt?.toISOString() ?? null,
    finishedAt: r.finishedAt?.toISOString() ?? null,
    createdByName: r.createdByName,
    sentByName: r.sentByName,
  };
}

/** Qué falta para poder enviar: ajustes del buzón y contenido de la campaña. */
export function faltantesDeCampana(
  settings: MarketingSettingsData,
  m365: boolean,
  campana: { subject: string; body: CampaignBody; filters: unknown }
): FaltanteDeCampana[] {
  const missing: FaltanteDeCampana[] = [...preparacionParaEnviar(settings, m365).missing];
  if (campana.filters == null) missing.push("audiencia");
  if (!campana.subject.trim()) missing.push("asunto");
  if (campana.body.blocks.length === 0) missing.push("cuerpo");
  return missing;
}

export async function obtenerCampana(orgId: string, id: string): Promise<CampaignDto | null> {
  const fila = await filaDeCampana(orgId, id);
  if (!fila) return null;
  const imagenes = await imagenesDeCampana(orgId, id);
  const body = leerCuerpo(fila.body);
  const missing = faltantesDeCampana(await getMarketingSettings(orgId), m365Configurado(), {
    subject: fila.subject,
    body,
    filters: fila.filters,
  });
  return {
    ...toSummary(fila),
    subject: fila.subject,
    body,
    audienceId: fila.audienceId,
    filters: fila.filters == null ? null : leerFiltros(fila.filters),
    images: imagenes.map((i) => ({ id: i.id, url: urlPublicaDeImagen(i.publicToken), sizeBytes: i.sizeBytes })),
    readOnly: fila.status !== "borrador",
    readiness: { ok: missing.length === 0, missing, settingsHref: "/settings/marketing" },
    metrics: null,
  };
}

export const CAMPANAS_POR_PAGINA = 20;

export async function listarCampanas(
  orgId: string,
  opts: { status?: CampaignStatus; page?: number } = {}
): Promise<{ campaigns: CampaignSummaryDto[]; total: number }> {
  const c = schema.marketingCampaign;
  const where = scoped(c.organizationId, orgId, opts.status ? eq(c.status, opts.status) : undefined);
  const page = Math.max(1, opts.page ?? 1);
  const rows = await seleccionDeCampana()
    .where(where)
    .orderBy(desc(c.createdAt))
    .limit(CAMPANAS_POR_PAGINA)
    .offset((page - 1) * CAMPANAS_POR_PAGINA);
  const [{ total } = { total: 0 }] = await getDb().select({ total: count() }).from(c).where(where);
  return { campaigns: (rows as FilaCampana[]).map(toSummary), total: Number(total) };
}

/* ============================================================
 * Borrador
 * ============================================================ */

type Falla =
  | { ok: false; code: "not_found" | "audience_not_found" | "campana_no_editable"; message: string }
  | ErrorDeCuerpo;

async function filtrosDeAudiencia(orgId: string, audienceId: string): Promise<AudienceFilters | null> {
  const a = schema.marketingAudience;
  const [row] = await getDb()
    .select({ filters: a.filters })
    .from(a)
    .where(scoped(a.organizationId, orgId, eq(a.id, audienceId)))
    .limit(1);
  return row ? leerFiltros(row.filters) : null;
}

export async function crearCampana(
  orgId: string,
  userId: string,
  input: { name: string; audienceId?: string; subject?: string; body?: CampaignBody }
): Promise<{ ok: true; campaign: CampaignDto } | Falla> {
  let filters: AudienceFilters | null = null;
  if (input.audienceId) {
    filters = await filtrosDeAudiencia(orgId, input.audienceId);
    if (!filters) return { ok: false, code: "audience_not_found", message: "Esa audiencia no existe." };
  }
  const subject = input.subject?.trim() ?? "";
  const body = input.body ?? CUERPO_VACIO;
  // Una campaña nueva no tiene imágenes todavía.
  const valido = validarCuerpo(body, subject, []);
  if (!valido.ok) return valido;

  const id = newId("marketingCampaign");
  await getDb().insert(schema.marketingCampaign).values({
    id,
    organizationId: orgId,
    name: input.name.trim(),
    subject,
    body,
    audienceId: input.audienceId ?? null,
    filters,
    status: "borrador",
    createdBy: userId,
  });
  const campaign = await obtenerCampana(orgId, id);
  if (!campaign) throw new Error("marketing: la campaña recién creada no se pudo leer");
  return { ok: true, campaign };
}

export async function actualizarCampana(
  orgId: string,
  id: string,
  patch: { name?: string; subject?: string; body?: CampaignBody; audienceId?: string | null }
): Promise<{ ok: true; campaign: CampaignDto } | Falla> {
  const fila = await filaDeCampana(orgId, id);
  if (!fila) return { ok: false, code: "not_found", message: NO_EXISTE };
  if (fila.status !== "borrador") return { ok: false, code: "campana_no_editable", message: NO_EDITABLE };

  const subject = patch.subject !== undefined ? patch.subject.trim() : fila.subject;
  if (patch.body !== undefined || patch.subject !== undefined) {
    const imagenes = await imagenesDeCampana(orgId, id);
    const valido = validarCuerpo(
      patch.body ?? leerCuerpo(fila.body),
      subject,
      imagenes.map((i) => i.id)
    );
    if (!valido.ok) return valido;
  }

  let audiencia: { audienceId: string | null; filters: AudienceFilters | null } | null = null;
  if (patch.audienceId === null) audiencia = { audienceId: null, filters: null };
  else if (patch.audienceId !== undefined) {
    const filters = await filtrosDeAudiencia(orgId, patch.audienceId);
    if (!filters) return { ok: false, code: "audience_not_found", message: "Esa audiencia no existe." };
    audiencia = { audienceId: patch.audienceId, filters };
  }

  const c = schema.marketingCampaign;
  await getDb()
    .update(c)
    .set({
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.subject !== undefined ? { subject } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      ...(audiencia ?? {}),
      updatedAt: new Date(),
    })
    // Solo un borrador: si otro pedido lo confirmó en el medio, no se toca.
    .where(scoped(c.organizationId, orgId, eq(c.id, id), eq(c.status, "borrador")));
  const campaign = await obtenerCampana(orgId, id);
  if (!campaign) return { ok: false, code: "not_found", message: NO_EXISTE };
  return { ok: true, campaign };
}

export async function borrarCampana(
  orgId: string,
  id: string
): Promise<{ ok: true } | { ok: false; code: "not_found" | "campana_no_editable"; message: string }> {
  const fila = await filaDeCampana(orgId, id);
  if (!fila) return { ok: false, code: "not_found", message: NO_EXISTE };
  if (fila.status !== "borrador") return { ok: false, code: "campana_no_editable", message: NO_EDITABLE };
  // Primero los archivos: el `cascade` de la base solo borra filas.
  await borrarImagenesDeCampana(orgId, id);
  const c = schema.marketingCampaign;
  await getDb().delete(c).where(scoped(c.organizationId, orgId, eq(c.id, id), eq(c.status, "borrador")));
  return { ok: true };
}

/* ============================================================
 * Vista previa y prueba
 * ============================================================ */

export type PreviewDto = {
  contact: { id: string; name: string; email: string } | null;
  subject: string;
  html: string;
};

type FallaDePrevia =
  | { ok: false; code: "not_found" | "contact_not_in_audience"; message: string }
  | ErrorDeCuerpo;

/** Las variables de una persona: nombre y apellido, más lo congelado/calculado. */
export function variablesDe(r: DestinatarioConVariables | null): Record<string, string | undefined> {
  if (!r) return {};
  return { nombre: r.firstName, apellido: r.lastName ?? undefined, ...r.vars };
}

/**
 * El contacto con que se personaliza: el pedido (si está en la audiencia y no
 * está excluido) o el primero. Audiencia vacía o sin filtros → `null`, y se
 * usan los textos alternativos.
 */
async function contactoDePrevia(
  orgId: string,
  filters: unknown,
  contactId: string | undefined
): Promise<{ ok: true; recipient: DestinatarioConVariables | null } | { ok: false }> {
  const recipients =
    filters == null ? [] : (await destinatariosDeAudiencia(orgId, leerFiltros(filters))).recipients;
  if (contactId) {
    const r = recipients.find((x) => x.contactId === contactId);
    return r ? { ok: true, recipient: r } : { ok: false };
  }
  return { ok: true, recipient: recipients[0] ?? null };
}

async function contextoDeRender(
  orgId: string,
  settings: MarketingSettingsData,
  subject: string,
  imagenes: { id: string; publicToken: string }[],
  unsubscribeUrl: string
): Promise<RenderContext> {
  const branding = await getBranding(orgId);
  return {
    subject,
    academyName: branding.name,
    accent: branding.accent,
    senderName: settings.senderName ?? branding.name,
    footer: {
      address: settings.footerAddress ?? "Dirección de la academia",
      contact: settings.footerContact ?? "Contacto de la academia",
    },
    unsubscribeUrl,
    imageUrls: Object.fromEntries(imagenes.map((i) => [i.id, urlPublicaDeImagen(i.publicToken)])),
  };
}

export async function vistaPrevia(
  orgId: string,
  campaignId: string,
  input: { contactId?: string; subject?: string; body?: CampaignBody }
): Promise<{ ok: true; preview: PreviewDto } | FallaDePrevia> {
  const fila = await filaDeCampana(orgId, campaignId);
  if (!fila) return { ok: false, code: "not_found", message: NO_EXISTE };
  const imagenes = await imagenesDeCampana(orgId, campaignId);
  const subject = input.subject ?? fila.subject;
  const body = input.body ?? leerCuerpo(fila.body);
  const valido = validarCuerpo(body, subject, imagenes.map((i) => i.id));
  if (!valido.ok) return valido;

  const contacto = await contactoDePrevia(orgId, fila.filters, input.contactId);
  if (!contacto.ok) {
    return {
      ok: false,
      code: "contact_not_in_audience",
      message: "Esa persona no está en la audiencia de la campaña (o está excluida).",
    };
  }
  const r = contacto.recipient;
  // Baja inerte: en la vista previa el enlace no lleva a ningún lado.
  const ctx = await contextoDeRender(orgId, await getMarketingSettings(orgId), subject, imagenes, "#");
  const correo = renderCampaignEmail(body, variablesDe(r), ctx);
  return {
    ok: true,
    preview: {
      contact: r ? { id: r.contactId, name: r.name, email: r.email } : null,
      subject: correo.subject,
      html: correo.html,
    },
  };
}

/** 10 pruebas por persona cada 10 minutos. */
export const LIMITE_DE_PRUEBAS = { windowMs: 10 * 60 * 1000, max: 10 };

export async function enviarPrueba(
  session: { organizationId: string; userId: string },
  campaignId: string,
  input: { contactId?: string }
): Promise<
  | { ok: true; sentTo: string }
  | { ok: false; code: "too_many_requests" | "not_found" | "contact_not_in_audience" | "envio_fallido"; message: string }
  | { ok: false; code: "buzon_no_listo"; missing: FaltanteDeAjustes[] }
  | ErrorDeCuerpo
> {
  const orgId = session.organizationId;
  if (!checkRateLimit(`marketing-prueba:${session.userId}`, LIMITE_DE_PRUEBAS).allowed) {
    return { ok: false, code: "too_many_requests", message: "Mandaste muchas pruebas seguidas. Esperá unos minutos." };
  }
  const fila = await filaDeCampana(orgId, campaignId);
  if (!fila) return { ok: false, code: "not_found", message: NO_EXISTE };
  const imagenes = await imagenesDeCampana(orgId, campaignId);
  const body = leerCuerpo(fila.body);
  const valido = validarCuerpo(body, fila.subject, imagenes.map((i) => i.id));
  if (!valido.ok) return valido;

  const settings = await getMarketingSettings(orgId);
  const listo = preparacionParaEnviar(settings, m365Configurado());
  if (!listo.ok || !settings.senderEmail) {
    return { ok: false, code: "buzon_no_listo", missing: listo.missing };
  }

  // El destino es SIEMPRE quien la pide: el cuerpo no acepta destinatario.
  const [usuario] = await getDb()
    .select({ email: schema.user.email })
    .from(schema.user)
    // `user` es de Better Auth, no una tabla de dominio: se busca por id.
    .where(eq(schema.user.id, session.userId))
    .limit(1);
  if (!usuario) return { ok: false, code: "not_found", message: "No encontramos tu cuenta." };

  const contacto = await contactoDePrevia(orgId, fila.filters, input.contactId);
  if (!contacto.ok) {
    return {
      ok: false,
      code: "contact_not_in_audience",
      message: "Esa persona no está en la audiencia de la campaña (o está excluida).",
    };
  }
  const base = getEnv().APP_BASE_URL.replace(/\/+$/, "");
  const ctx = await contextoDeRender(orgId, settings, fila.subject, imagenes, `${base}/baja/prueba`);
  const correo = renderCampaignEmail(body, variablesDe(contacto.recipient), ctx);
  const enviado = await enviarCorreoDeMarketing({
    sender: settings.senderEmail,
    fromName: settings.senderName ?? ctx.academyName,
    to: usuario.email,
    subject: `[PRUEBA] ${correo.subject}`,
    html: correo.html,
  });
  if (!enviado.ok) return { ok: false, code: "envio_fallido", message: enviado.message };
  return { ok: true, sentTo: usuario.email };
}
