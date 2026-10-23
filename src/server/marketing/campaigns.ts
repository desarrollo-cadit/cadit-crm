import { count, countDistinct, desc, eq, exists, ilike, inArray, isNotNull, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { onAfterCommit } from "@/lib/db/tenant-context";
import { getEnv } from "@/lib/env";
import { checkRateLimit } from "@/lib/rate-limit";
import { nombreCompleto, type AudienceFilters } from "@/lib/marketing/audience";
import {
  CampaignBodySchema,
  CUERPO_VACIO,
  extraerEnlaces,
  validarCuerpo,
  type CampaignBody,
  type ErrorDeCuerpo,
} from "@/lib/marketing/body";
import { renderCampaignEmail, type RenderContext } from "@/lib/marketing/render-email";
import { getBranding } from "@/server/branding";
import { destinatariosDeAudiencia, leerFiltros, type DestinatarioConVariables } from "./audiences";
import { urlPublicaDeImagen, borrarImagenesDeCampana } from "./images";
import { runCampaign } from "./runner";
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
  /** `null` en borrador. */
  metrics: CampaignMetricsDto | null;
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
    metrics: fila.status === "borrador" ? null : await metricasDeCampana(orgId, id),
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

/* ============================================================
 * Enviar y cancelar (contracts/send-and-cancel.md)
 * ============================================================ */

type FallaDeEnvio =
  | {
      ok: false;
      code:
        | "not_found"
        | "campana_no_editable"
        | "buzon_no_listo"
        | "contenido_incompleto"
        | "audiencia_vacia"
        | "tope_superado"
        | "conteo_cambio"
        | "otra_campana_enviando";
      message: string;
      fields?: { path: string; message: string }[];
    }
  | ErrorDeCuerpo;

const QUE_FALTA: Record<FaltanteDeCampana, string> = {
  buzon: "Falta el buzón de marketing, el remitente o el pie.",
  buzon_sin_verificar: "El buzón de marketing todavía no pasó la prueba.",
  m365: "Microsoft 365 no está configurado en el servidor.",
  audiencia: "Elegí una audiencia.",
  asunto: "Escribí el asunto.",
  cuerpo: "El correo está vacío.",
};

/**
 * Confirma el envío (FR-019). Todo o nada, en la transacción del pedido:
 * congela filtros, remitente y pie; inserta la foto de destinatarios (con sus
 * variables) y los destinos de los clics; pasa a `enviando`. El ejecutor se
 * agenda con `onAfterCommit`: una tarea suelta no ve filas sin confirmar.
 */
export async function confirmarEnvio(
  session: { organizationId: string; userId: string },
  campaignId: string,
  expectedCount: number
): Promise<{ ok: true; campaignId: string; recipientCount: number } | FallaDeEnvio> {
  const orgId = session.organizationId;
  const fila = await filaDeCampana(orgId, campaignId);
  if (!fila) return { ok: false, code: "not_found", message: NO_EXISTE };
  if (fila.status !== "borrador") return { ok: false, code: "campana_no_editable", message: NO_EDITABLE };

  const settings = await getMarketingSettings(orgId);
  const listo = preparacionParaEnviar(settings, m365Configurado());
  if (
    !listo.ok ||
    !settings.senderEmail ||
    !settings.senderName ||
    !settings.footerAddress ||
    !settings.footerContact
  ) {
    return {
      ok: false,
      code: "buzon_no_listo",
      message: "Falta configurar o probar el buzón de marketing en Ajustes › Marketing.",
      fields: listo.missing.map((m) => ({ path: m, message: QUE_FALTA[m] })),
    };
  }

  const body = leerCuerpo(fila.body);
  const incompleto = faltantesDeCampana(settings, true, { subject: fila.subject, body, filters: fila.filters });
  if (incompleto.length > 0) {
    return {
      ok: false,
      code: "contenido_incompleto",
      message: incompleto.map((m) => QUE_FALTA[m]).join(" "),
      fields: incompleto.map((m) => ({ path: m, message: QUE_FALTA[m] })),
    };
  }

  const imagenes = await imagenesDeCampana(orgId, campaignId);
  const valido = validarCuerpo(body, fila.subject, imagenes.map((i) => i.id));
  if (!valido.ok) return valido;

  // La ÚNICA fuente de destinatarios: la misma evaluación que vio la persona.
  const filters = leerFiltros(fila.filters);
  const audiencia = await destinatariosDeAudiencia(orgId, filters);
  if (audiencia.count === 0) {
    return { ok: false, code: "audiencia_vacia", message: "La audiencia no tiene a nadie a quien enviarle." };
  }
  if (audiencia.overCap) {
    return {
      ok: false,
      code: "tope_superado",
      message: `La audiencia tiene ${audiencia.count} personas y el tope es 500 por campaña. Acotá los filtros.`,
    };
  }
  if (audiencia.count !== expectedCount) {
    return {
      ok: false,
      code: "conteo_cambio",
      message: `La audiencia cambió: ahora son ${audiencia.count} personas. Confirmá otra vez.`,
      fields: [{ path: "count", message: String(audiencia.count) }],
    };
  }

  const c = schema.marketingCampaign;
  const [otra] = await getDb()
    .select({ id: c.id })
    .from(c)
    .where(scoped(c.organizationId, orgId, eq(c.status, "enviando"), ne(c.id, campaignId)))
    .limit(1);
  if (otra) {
    return {
      ok: false,
      code: "otra_campana_enviando",
      message: "Ya hay otra campaña enviándose. Esperá a que termine o cancelala.",
    };
  }

  // El índice único parcial (una `enviando` por organización) cubre la carrera.
  await getDb()
    .update(c)
    .set({
      status: "enviando",
      filters,
      senderEmail: settings.senderEmail,
      senderName: settings.senderName,
      footer: { address: settings.footerAddress, contact: settings.footerContact },
      sentBy: session.userId,
      sendConfirmedAt: new Date(),
      recipientCount: audiencia.count,
      lastError: null,
      pausedUntil: null,
      leaseUntil: null,
      updatedAt: new Date(),
    })
    .where(scoped(c.organizationId, orgId, eq(c.id, campaignId), eq(c.status, "borrador")));

  await getDb()
    .insert(schema.marketingCampaignRecipient)
    .values(
      audiencia.recipients.map((r, position) => ({
        id: newId("marketingCampaignRecipient"),
        organizationId: orgId,
        campaignId,
        contactId: r.contactId,
        email: r.email,
        firstName: r.firstName,
        lastName: r.lastName,
        vars: r.vars,
        position,
        status: "pendiente" as const,
      }))
    );

  const enlaces = extraerEnlaces(body);
  if (enlaces.length > 0) {
    await getDb()
      .insert(schema.marketingCampaignLink)
      .values(
        enlaces.map((url, position) => ({
          id: newId("marketingCampaignLink"),
          organizationId: orgId,
          campaignId,
          position,
          url,
        }))
      );
  }

  onAfterCommit(() => {
    void runCampaign(orgId, campaignId).catch((err) =>
      console.error("[marketing] no arrancó el envío:", err instanceof Error ? err.message : "error")
    );
  });
  return { ok: true, campaignId, recipientCount: audiencia.count };
}

/**
 * Cancela un envío en curso (FR-020): `cancelada` y las `pendiente` a
 * `cancelado`, en la misma transacción. Una fila que ya está `enviando`
 * termina su intento (Graph ya la tiene) y queda con su resultado.
 */
export async function cancelarCampana(
  session: { organizationId: string; userId: string },
  campaignId: string
): Promise<
  { ok: true; cancelled: number } | { ok: false; code: "not_found" | "no_esta_enviando"; message: string }
> {
  const orgId = session.organizationId;
  const c = schema.marketingCampaign;
  const [fila] = await getDb()
    .select({ status: c.status })
    .from(c)
    .where(scoped(c.organizationId, orgId, eq(c.id, campaignId)))
    .limit(1);
  if (!fila) return { ok: false, code: "not_found", message: NO_EXISTE };
  if (fila.status !== "enviando") {
    return { ok: false, code: "no_esta_enviando", message: "La campaña no se está enviando." };
  }
  await getDb()
    .update(c)
    .set({ status: "cancelada", finishedAt: new Date(), cancelledBy: session.userId, updatedAt: new Date() })
    .where(scoped(c.organizationId, orgId, eq(c.id, campaignId), eq(c.status, "enviando")));
  const r = schema.marketingCampaignRecipient;
  const canceladas = await getDb()
    .update(r)
    .set({ status: "cancelado" })
    .where(scoped(r.organizationId, orgId, eq(r.campaignId, campaignId), eq(r.status, "pendiente")))
    .returning({ id: r.id });
  return { ok: true, cancelled: canceladas.length };
}

/* ============================================================
 * Resultados (contracts/recipients-and-metrics.md)
 * ============================================================ */

export type CampaignMetricsDto = {
  status: CampaignStatus;
  total: number;
  pending: number;
  sent: number;
  failed: number;
  skipped: number;
  cancelled: number;
  unsubscribes: number;
  clicks: { total: number; uniqueRecipients: number };
  pausedUntil: string | null;
  lastError: string | null;
};

export async function metricasDeCampana(orgId: string, campaignId: string): Promise<CampaignMetricsDto | null> {
  const c = schema.marketingCampaign;
  const [campana] = await getDb()
    .select({ status: c.status, recipientCount: c.recipientCount, pausedUntil: c.pausedUntil, lastError: c.lastError })
    .from(c)
    .where(scoped(c.organizationId, orgId, eq(c.id, campaignId)))
    .limit(1);
  if (!campana) return null;

  const r = schema.marketingCampaignRecipient;
  const porEstado = await getDb()
    .select({ status: r.status, n: count() })
    .from(r)
    .where(scoped(r.organizationId, orgId, eq(r.campaignId, campaignId)))
    .groupBy(r.status);
  const n = (s: string) => Number(porEstado.find((x) => x.status === s)?.n ?? 0);
  const [bajas] = await getDb()
    .select({ n: count() })
    .from(r)
    .where(scoped(r.organizationId, orgId, eq(r.campaignId, campaignId), isNotNull(r.unsubscribedAt)));
  const k = schema.marketingClick;
  const [clics] = await getDb()
    .select({ total: count(), unicos: countDistinct(k.recipientId) })
    .from(k)
    .where(scoped(k.organizationId, orgId, eq(k.campaignId, campaignId)));

  return {
    status: campana.status,
    total: campana.recipientCount ?? 0,
    pending: n("pendiente") + n("enviando"),
    sent: n("enviado"),
    failed: n("fallido"),
    skipped: n("omitido"),
    cancelled: n("cancelado"),
    unsubscribes: Number(bajas?.n ?? 0),
    clicks: { total: Number(clics?.total ?? 0), uniqueRecipients: Number(clics?.unicos ?? 0) },
    pausedUntil: campana.pausedUntil?.toISOString() ?? null,
    lastError: campana.lastError,
  };
}

export const ESTADOS_VISIBLES = ["pendiente", "enviado", "fallido", "omitido", "cancelado"] as const;
export type EstadoVisible = (typeof ESTADOS_VISIBLES)[number];

export const RecipientsQuerySchema = z
  .object({
    status: z.enum(ESTADOS_VISIBLES).optional(),
    clicked: z.literal("true").optional(),
    q: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.enum(["50", "100", "500"]).optional(),
  })
  .strict();

export type CampaignRecipientDto = {
  id: string;
  name: string;
  email: string;
  contactId: string | null;
  status: EstadoVisible;
  reason: string | null;
  sentAt: string | null;
  unsubscribedHere: boolean;
  clicked: boolean;
  clickCount: number;
};

const MOTIVOS: Record<string, string> = {
  baja: "Se había dado de baja",
  interrumpido: "Se interrumpió el envío (puede haberle llegado); no se reintenta",
};

export async function destinatariosDeCampana(
  orgId: string,
  campaignId: string,
  opts: { status?: EstadoVisible; clicked?: boolean; q?: string; page: number; pageSize: number }
): Promise<{ recipients: CampaignRecipientDto[]; total: number; page: number; pageSize: number }> {
  const vacio = { recipients: [], total: 0, page: opts.page, pageSize: opts.pageSize };
  const c = schema.marketingCampaign;
  const [campana] = await getDb()
    .select({ status: c.status })
    .from(c)
    .where(scoped(c.organizationId, orgId, eq(c.id, campaignId)))
    .limit(1);
  if (!campana || campana.status === "borrador") return vacio;

  const r = schema.marketingCampaignRecipient;
  const k = schema.marketingClick;
  const clicDe = exists(
    getDb()
      .select({ uno: sql`1` })
      .from(k)
      .where(scoped(k.organizationId, orgId, eq(k.recipientId, r.id)))
  );
  const q = opts.q?.trim();
  const porEstado =
    opts.status === "pendiente"
      ? inArray(r.status, ["pendiente", "enviando"])
      : opts.status
        ? eq(r.status, opts.status)
        : undefined;
  const porTexto = q
    ? or(ilike(r.email, `%${q}%`), ilike(sql`${r.firstName} || ' ' || coalesce(${r.lastName}, '')`, `%${q}%`))
    : undefined;
  const donde = scoped(
    r.organizationId,
    orgId,
    eq(r.campaignId, campaignId),
    porEstado,
    opts.clicked ? clicDe : undefined,
    porTexto
  );

  const filas = await getDb()
    .select({
      id: r.id,
      firstName: r.firstName,
      lastName: r.lastName,
      email: r.email,
      contactId: r.contactId,
      status: r.status,
      reason: r.reason,
      sentAt: r.sentAt,
      unsubscribedAt: r.unsubscribedAt,
      clickCount: sql<number>`(select count(*) from ${k} where ${k.recipientId} = ${r.id})`,
    })
    .from(r)
    .where(donde)
    .orderBy(r.position)
    .limit(opts.pageSize)
    .offset((opts.page - 1) * opts.pageSize);
  const [{ total } = { total: 0 }] = await getDb().select({ total: count() }).from(r).where(donde);

  return {
    recipients: filas.map((f) => {
      const clickCount = Number(f.clickCount ?? 0);
      return {
        id: f.id,
        name: nombreCompleto(f.firstName, f.lastName),
        email: f.email,
        contactId: f.contactId,
        status: (f.status === "enviando" ? "pendiente" : f.status) as EstadoVisible,
        reason: f.reason ? (MOTIVOS[f.reason] ?? f.reason) : null,
        sentAt: f.sentAt?.toISOString() ?? null,
        unsubscribedHere: f.unsubscribedAt !== null,
        clicked: clickCount > 0,
        clickCount,
      };
    }),
    total: Number(total),
    page: opts.page,
    pageSize: opts.pageSize,
  };
}

export async function enlacesDeCampana(
  orgId: string,
  campaignId: string
): Promise<{ id: string; url: string; clicks: number; uniqueRecipients: number }[] | null> {
  const c = schema.marketingCampaign;
  const [campana] = await getDb()
    .select({ status: c.status })
    .from(c)
    .where(scoped(c.organizationId, orgId, eq(c.id, campaignId)))
    .limit(1);
  if (!campana) return null;
  const l = schema.marketingCampaignLink;
  const k = schema.marketingClick;
  const filas = await getDb()
    .select({
      id: l.id,
      url: l.url,
      clicks: sql<number>`(select count(*) from ${k} where ${k.linkId} = ${l.id})`,
      uniqueRecipients: sql<number>`(select count(distinct ${k.recipientId}) from ${k} where ${k.linkId} = ${l.id})`,
    })
    .from(l)
    .where(scoped(l.organizationId, orgId, eq(l.campaignId, campaignId)))
    .orderBy(l.position);
  return filas.map((f) => ({
    id: f.id,
    url: f.url,
    clicks: Number(f.clicks),
    uniqueRecipients: Number(f.uniqueRecipients),
  }));
}
