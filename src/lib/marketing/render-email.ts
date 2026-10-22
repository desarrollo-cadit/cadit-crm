import { contrastRatio, resolveAccentSet } from "@/lib/branding";
import { hrefPermitido, parseInline, type InlineNode } from "@/lib/markdown-inline";
import { escapeHtml } from "@/lib/utils";
import { markSafeHtml, renderTemplate } from "@/server/email/templates";
import {
  ESQUEMAS_DE_BOTON,
  ESQUEMAS_EN_LINEA,
  reemplazarVariables,
  valorDeVariable,
  type Block,
  type CampaignBody,
} from "./body";

/**
 * 045 (DV-007; FR-007, FR-008, FR-011, FR-023) — Bloques + marca + pie →
 * el HTML del correo.
 *
 * Es la ÚNICA función que arma el HTML de una campaña: la vista previa, la
 * prueba y el envío real pasan por acá, así que lo que se ve es lo que llega.
 *
 * - Todo texto se escapa. El valor de una variable entra como TEXTO después
 *   de interpretar el Markdown: un nombre con `[x](https://…)` no se vuelve
 *   enlace.
 * - Tablas y estilos en línea (Outlook/Gmail), sin `<style>` ni clases.
 * - Los grises del correo viven acá, en un `.ts`, no en componentes
 *   (`tema-oscuro.test.ts` solo mira `.tsx`): un correo no tiene tema oscuro
 *   que respetar, y su fondo es blanco siempre.
 */

const FONDO = "#ffffff";
const TEXTO = "#1f2937";
const TITULO = "#111827";
const LINEA = "#e5e7eb";
const OSCURO_DE_RESPALDO = "#1f2937";
const FUENTE = "Arial,Helvetica,sans-serif";

export type RenderContext = {
  /** Asunto con variables (se personaliza acá). */
  subject: string;
  academyName: string;
  /** Acento de la marca (`getBranding().accent`). */
  accent: string;
  senderName: string;
  footer: { address: string; contact: string };
  /** A dónde lleva "No quiero recibir más correos". */
  unsubscribeUrl: string;
  /** URL pública absoluta de cada imagen de la campaña. */
  imageUrls: Record<string, string>;
  /** Solo en el envío real: cada enlace https pasa por el registro de clics. */
  trackLink?: (url: string) => string;
};

/**
 * El color del botón: el acento de la marca, alejado del fondo, y medido
 * contra su texto blanco con `contrastRatio` (4.5:1). Si no alcanza, el tono
 * de texto del mismo acento; si tampoco, un gris oscuro.
 */
export function colorDeMarca(accent: string): string {
  const set = resolveAccentSet(accent, "light");
  return (
    [set.accent, set.text, OSCURO_DE_RESPALDO].find((c) => contrastRatio(c, FONDO) >= 4.5) ??
    OSCURO_DE_RESPALDO
  );
}

type Vars = Record<string, string | undefined>;

function href(url: string, ctx: RenderContext): string {
  return ctx.trackLink && url.startsWith("https:") ? ctx.trackLink(url) : url;
}

function inline(nodes: InlineNode[], vars: Vars, ctx: RenderContext, color: string): string {
  return nodes
    .map((n) => {
      switch (n.type) {
        case "text":
          return escapeHtml(n.text).replace(/\n/g, "<br>");
        case "code":
          return `<code style="font-family:monospace;">${escapeHtml(n.text)}</code>`;
        case "bold":
          return `<strong>${inline(n.children, vars, ctx, color)}</strong>`;
        case "italic":
          return `<em>${inline(n.children, vars, ctx, color)}</em>`;
        case "link":
          return `<a href="${escapeHtml(href(n.href, ctx))}" style="color:${color};text-decoration:underline;">${inline(n.children, vars, ctx, color)}</a>`;
        case "var":
          return escapeHtml(valorDeVariable(n.name, n.alt, vars));
      }
    })
    .join("");
}

function texto(t: string, vars: Vars, ctx: RenderContext, color: string): string {
  return inline(parseInline(t, { esquemas: ESQUEMAS_EN_LINEA, variables: true }), vars, ctx, color);
}

function bloque(b: Block, vars: Vars, ctx: RenderContext, color: string): string {
  switch (b.type) {
    case "heading": {
      const size = b.level === 1 ? 24 : 20;
      const tag = b.level === 1 ? "h1" : "h2";
      return `<${tag} style="margin:0 0 16px 0;font-family:${FUENTE};font-size:${size}px;line-height:1.3;color:${TITULO};">${texto(b.text, vars, ctx, color)}</${tag}>`;
    }
    case "paragraph":
      return `<p style="margin:0 0 16px 0;font-family:${FUENTE};font-size:16px;line-height:1.5;color:${TEXTO};">${texto(b.text, vars, ctx, color)}</p>`;
    case "list": {
      const tag = b.ordered ? "ol" : "ul";
      const items = b.items
        .map((i) => `<li style="margin:0 0 4px 0;">${texto(i, vars, ctx, color)}</li>`)
        .join("");
      return `<${tag} style="margin:0 0 16px 0;padding-left:24px;font-family:${FUENTE};font-size:16px;line-height:1.5;color:${TEXTO};">${items}</${tag}>`;
    }
    case "image": {
      const src = ctx.imageUrls[b.imageId];
      if (!src) return "";
      const img = `<img src="${escapeHtml(src)}" alt="${escapeHtml(b.alt)}" width="536" style="display:block;width:100%;max-width:536px;height:auto;border:0;">`;
      const destino = b.href ? hrefPermitido(b.href, ESQUEMAS_DE_BOTON) : null;
      const contenido = destino ? `<a href="${escapeHtml(href(destino, ctx))}">${img}</a>` : img;
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:0 0 16px 0;">${contenido}</td></tr></table>`;
    }
    case "button": {
      const destino = hrefPermitido(b.url, ESQUEMAS_DE_BOTON);
      if (!destino) return "";
      // La etiqueta es texto (puede llevar variables), nunca un enlace dentro de otro.
      const etiqueta = inline(
        parseInline(b.label, { esquemas: [], variables: true }),
        vars,
        ctx,
        FONDO
      );
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px 0;"><tr><td style="border-radius:6px;background-color:${color};"><a href="${escapeHtml(href(destino, ctx))}" style="display:inline-block;padding:12px 24px;font-family:${FUENTE};font-size:16px;font-weight:bold;color:${FONDO};text-decoration:none;background-color:${color};border-radius:6px;">${etiqueta}</a></td></tr></table>`;
    }
    case "divider":
      return `<hr style="border:0;border-top:1px solid ${LINEA};margin:24px 0;">`;
  }
}

export function renderCampaignEmail(
  body: CampaignBody,
  vars: Vars,
  ctx: RenderContext
): { subject: string; html: string } {
  const color = colorDeMarca(ctx.accent);
  const cuerpo = body.blocks.map((b) => bloque(b, vars, ctx, color)).join("");
  const html = renderTemplate(
    "campana-marketing",
    {
      academia: ctx.academyName,
      remitente: ctx.senderName,
      direccion: ctx.footer.address,
      contacto: ctx.footer.contact,
      urlBaja: ctx.unsubscribeUrl,
    },
    // Cada valor de afuera se escapó arriba, bloque por bloque.
    { cuerpo: markSafeHtml(cuerpo) }
  );
  return { subject: reemplazarVariables(ctx.subject, vars), html };
}
