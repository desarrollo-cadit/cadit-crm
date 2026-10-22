import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { normalizarCorreo } from "@/lib/contact-identity";
import { verificarClic } from "@/lib/marketing/link-token";
import { claveDeEnlaces } from "./send";

/**
 * 045 (DV-010, DV-011, DV-012; FR-012…FR-015, FR-023) — Bajas de marketing y
 * clics. Las superficies sin sesión llaman a estas funciones dentro de
 * `withOrganizationScope` (lo hace `withOrganization` en la ruta).
 *
 * Una baja de marketing la leen SOLO los módulos de `src/server/marketing`:
 * el correo operativo no se entera (FR-014).
 */

/**
 * ¿Tiene esta persona una baja de marketing activa? Por contacto O por correo
 * normalizado: la baja sobrevive al borrado del contacto (DV-011).
 */
export async function bajaActiva(
  orgId: string,
  persona: { contactId: string | null; email: string | null }
): Promise<boolean> {
  const u = schema.marketingUnsubscribe;
  const correo = normalizarCorreo(persona.email);
  const porQuien = [
    persona.contactId ? eq(u.contactId, persona.contactId) : undefined,
    correo ? eq(u.email, correo) : undefined,
  ].filter((c) => c !== undefined);
  if (porQuien.length === 0) return false;
  const [fila] = await getDb()
    .select({ id: u.id })
    .from(u)
    .where(scoped(u.organizationId, orgId, isNull(u.revertedAt), or(...porQuien)))
    .limit(1);
  return Boolean(fila);
}

/** Un segundo clic igual dentro de esta ventana no suma (escáneres de correo). */
export const VENTANA_DE_CLIC_REPETIDO_MS = 10_000;

/**
 * El destino de un clic: la URL GUARDADA del enlace, solo si el enlace es de
 * la MISMA campaña que el destinatario firmado. Nunca se lee una URL del
 * pedido (FR-023: no hay redirección abierta). `null` = 404 neutro.
 *
 * Suma el clic solo si el destinatario está `enviado`, la campaña no se
 * canceló y no hubo un clic suyo al mismo enlace en los últimos 10 s.
 */
export async function registrarClic(orgId: string, token: string, linkId: string): Promise<string | null> {
  const recipientId = verificarClic(claveDeEnlaces(), token);
  if (!recipientId) return null;

  const r = schema.marketingCampaignRecipient;
  const c = schema.marketingCampaign;
  const [destinatario] = await getDb()
    .select({ id: r.id, campaignId: r.campaignId, status: r.status, campaignStatus: c.status })
    .from(r)
    .innerJoin(c, eq(c.id, r.campaignId))
    .where(scoped(r.organizationId, orgId, eq(r.id, recipientId)))
    .limit(1);
  if (!destinatario) return null;

  const l = schema.marketingCampaignLink;
  const [enlace] = await getDb()
    .select({ id: l.id, campaignId: l.campaignId, url: l.url })
    .from(l)
    .where(scoped(l.organizationId, orgId, eq(l.id, linkId)))
    .limit(1);
  if (!enlace || enlace.campaignId !== destinatario.campaignId) return null;

  if (destinatario.status === "enviado" && destinatario.campaignStatus !== "cancelada") {
    const k = schema.marketingClick;
    const [reciente] = await getDb()
      .select({ id: k.id })
      .from(k)
      .where(
        scoped(
          k.organizationId,
          orgId,
          and(
            eq(k.recipientId, destinatario.id),
            eq(k.linkId, enlace.id),
            gt(k.clickedAt, sql`now() - interval '10 seconds'`)
          )
        )
      )
      .limit(1);
    if (!reciente) {
      await getDb().insert(k).values({
        id: newId("marketingClick"),
        organizationId: orgId,
        campaignId: destinatario.campaignId,
        recipientId: destinatario.id,
        linkId: enlace.id,
      });
    }
  }
  return enlace.url;
}
