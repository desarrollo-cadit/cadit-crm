import { getEnv } from "@/lib/env";
import { sendMail, type SendMailResult } from "@/lib/m365/client";
import { derivarClave, firmarBaja, firmarClic } from "@/lib/marketing/link-token";
import { renderCampaignEmail } from "@/lib/marketing/render-email";
import type { CampaignBody } from "@/lib/marketing/body";

/**
 * 045 (DV-004; FR-011, FR-012, FR-016, FR-023) — El envío de las campañas.
 *
 * `enviarCorreoDeMarketing` es el ÚNICO llamador de `sendMail` que pasa
 * `sender`. Constitución 1.8.0 II.a: las campañas salen de un buzón de
 * marketing SEPARADO del de los correos operativos (`M365_SENDER`), por el
 * mismo adaptador. `tests/unit/marketing-guard.test.ts` fija que nadie más
 * elija remitente.
 */
export async function enviarCorreoDeMarketing(input: {
  sender: string;
  fromName: string;
  to: string;
  subject: string;
  html: string;
}): Promise<SendMailResult> {
  return sendMail({
    to: input.to,
    subject: input.subject,
    html: input.html,
    sender: input.sender,
    fromName: input.fromName,
  });
}

/** La clave de los enlaces firmados, derivada de `ENCRYPTION_KEY` (HKDF). */
export function claveDeEnlaces(): Buffer {
  return derivarClave(getEnv().ENCRYPTION_KEY);
}

const base = () => getEnv().APP_BASE_URL.replace(/\/+$/, "");

export function urlDeBaja(recipientId: string, clave: Buffer = claveDeEnlaces()): string {
  return `${base()}/baja/${firmarBaja(clave, recipientId)}`;
}

export function urlDeClic(recipientId: string, linkId: string, clave: Buffer = claveDeEnlaces()): string {
  return `${base()}/api/public/marketing/click/${firmarClic(clave, recipientId)}/${linkId}`;
}

/** Lo que el ejecutor congeló al confirmar, más lo necesario para dibujar. */
export type DatosDeEnvio = {
  campaignId: string;
  subject: string;
  body: CampaignBody;
  senderEmail: string;
  senderName: string;
  footer: { address: string; contact: string };
  academyName: string;
  accent: string;
  imageUrls: Record<string, string>;
  /** URL guardada → id del enlace (`marketing_campaign_link`). */
  linkIds: Record<string, string>;
};

export type DestinatarioDeEnvio = {
  id: string;
  email: string;
  firstName: string;
  lastName: string | null;
  vars: Record<string, string>;
};

/**
 * Un correo a UN destinatario: variables congeladas, enlaces rastreados hacia
 * destinos guardados y la baja firmada para esta persona. Sin base: la
 * llamada a Graph corre fuera de toda transacción.
 */
export async function enviarADestinatario(
  datos: DatosDeEnvio,
  r: DestinatarioDeEnvio,
  clave: Buffer = claveDeEnlaces()
): Promise<SendMailResult> {
  const { subject, html } = renderCampaignEmail(
    datos.body,
    { nombre: r.firstName, apellido: r.lastName ?? undefined, ...r.vars },
    {
      subject: datos.subject,
      academyName: datos.academyName,
      accent: datos.accent,
      senderName: datos.senderName,
      footer: datos.footer,
      unsubscribeUrl: urlDeBaja(r.id, clave),
      imageUrls: datos.imageUrls,
      trackLink: (url) => {
        const linkId = datos.linkIds[url];
        return linkId ? urlDeClic(r.id, linkId, clave) : url;
      },
    }
  );
  return enviarCorreoDeMarketing({
    sender: datos.senderEmail,
    fromName: datos.senderName,
    to: r.email,
    subject,
    html,
  });
}
