import { and, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { normalizarCorreo } from "@/lib/contact-identity";
import { verificarBaja, verificarClic } from "@/lib/marketing/link-token";
import { claveDeEnlaces } from "./send";

/**
 * 045 (DV-010, DV-011, DV-012; FR-012…FR-015, FR-023) — Bajas de marketing y
 * clics. Las superficies sin sesión llaman a estas funciones dentro de
 * `withOrganizationScope` (lo hace `withOrganization` en la ruta).
 *
 * Una baja de marketing la leen SOLO los módulos de `src/server/marketing`:
 * el correo operativo no se entera (FR-014).
 */

export { bajaActiva } from "./bajas";
import { bajaActiva } from "./bajas";

/* ============================================================
 * El enlace de baja (dos pasos: la página LEE, el botón REGISTRA)
 * ============================================================ */

export type EstadoDeEnlaceDeBaja = "valido" | "ya_dado_de_baja" | "prueba" | "invalido";

/** El token de los correos de PRUEBA: lleva a una página que no da de baja a nadie. */
export const TOKEN_DE_PRUEBA = "prueba";

async function destinatarioDelToken(orgId: string, token: string) {
  const recipientId = verificarBaja(claveDeEnlaces(), token);
  if (!recipientId) return null;
  const r = schema.marketingCampaignRecipient;
  const [fila] = await getDb()
    .select({ id: r.id, email: r.email, contactId: r.contactId, campaignId: r.campaignId })
    .from(r)
    .where(scoped(r.organizationId, orgId, eq(r.id, recipientId)))
    .limit(1);
  return fila ?? null;
}

/**
 * Qué mostrar en `/baja/[token]`. Devuelve SOLO un estado: nunca el correo ni
 * el nombre. Firma alterada, destinatario inexistente y otra organización son
 * el MISMO `invalido` (no revela de quién es el enlace, US4-2).
 */
export async function estadoDeEnlaceDeBaja(orgId: string, token: string): Promise<EstadoDeEnlaceDeBaja> {
  if (token === TOKEN_DE_PRUEBA) return "prueba";
  const d = await destinatarioDelToken(orgId, token);
  if (!d) return "invalido";
  return (await bajaActiva(orgId, { contactId: d.contactId, email: d.email })) ? "ya_dado_de_baja" : "valido";
}

/**
 * Registra la baja (el POST del botón). Idempotente: con una baja activa para
 * ese correo, el índice único parcial la absorbe (`on conflict do nothing`) y
 * la respuesta es la misma. Una campaña en curso la respeta desde el
 * siguiente turno: el ejecutor consulta `bajaActiva` antes de cada envío.
 */
export async function registrarBaja(orgId: string, token: string): Promise<{ ok: boolean }> {
  if (token === TOKEN_DE_PRUEBA) return { ok: false };
  const d = await destinatarioDelToken(orgId, token);
  if (!d) return { ok: false };
  const email = normalizarCorreo(d.email) ?? d.email;
  await getDb()
    .insert(schema.marketingUnsubscribe)
    .values({
      id: newId("marketingUnsubscribe"),
      organizationId: orgId,
      contactId: d.contactId,
      email,
      campaignId: d.campaignId,
      recipientId: d.id,
    })
    .onConflictDoNothing();
  const r = schema.marketingCampaignRecipient;
  await getDb()
    .update(r)
    .set({ unsubscribedAt: new Date() })
    .where(scoped(r.organizationId, orgId, eq(r.id, d.id), isNull(r.unsubscribedAt)));
  return { ok: true };
}

/** El correo de UN contacto (para buscar sus bajas también por dirección). */
async function correoDelContacto(orgId: string, contactId: string): Promise<{ email: string | null } | null> {
  const [fila] = await getDb()
    .select({ email: schema.contact.email })
    .from(schema.contact)
    .where(scoped(schema.contact.organizationId, orgId, eq(schema.contact.id, contactId)))
    .limit(1);
  return fila ?? null;
}

function deLaPersona(contactId: string, email: string | null) {
  const u = schema.marketingUnsubscribe;
  const correo = normalizarCorreo(email);
  return or(eq(u.contactId, contactId), correo ? eq(u.email, correo) : undefined);
}

/**
 * Reactiva los correos de marketing de un contacto (`marketing.configurar`:
 * deshace una oposición expresa, Ley 18.331). Marca, nunca borra: la ficha
 * conserva la historia.
 */
export async function revertirBaja(
  session: { organizationId: string; userId: string },
  contactId: string
): Promise<{ ok: true } | { ok: false; code: "not_found" }> {
  const orgId = session.organizationId;
  const contacto = await correoDelContacto(orgId, contactId);
  if (!contacto) return { ok: false, code: "not_found" };
  const u = schema.marketingUnsubscribe;
  const activas = await getDb()
    .select({ id: u.id })
    .from(u)
    .where(scoped(u.organizationId, orgId, isNull(u.revertedAt), deLaPersona(contactId, contacto.email)));
  if (activas.length === 0) return { ok: false, code: "not_found" };
  await getDb()
    .update(u)
    .set({ revertedAt: new Date(), revertedBy: session.userId })
    .where(
      scoped(u.organizationId, orgId, isNull(u.revertedAt), inArray(u.id, activas.map((a) => a.id)))
    );
  return { ok: true };
}

export type BajaDelContacto = {
  id: string;
  at: string;
  campaignName: string | null;
  revertedAt: string | null;
  revertedByName: string | null;
};

/** Las bajas de un contacto (por contacto o por su correo), la más nueva primero. */
export async function estadoDeMarketingDelContacto(orgId: string, contactId: string): Promise<BajaDelContacto[]> {
  const contacto = await correoDelContacto(orgId, contactId);
  if (!contacto) return [];
  const u = schema.marketingUnsubscribe;
  const filas = await getDb()
    .select({
      id: u.id,
      createdAt: u.createdAt,
      revertedAt: u.revertedAt,
      campaignName: schema.marketingCampaign.name,
      revertedByName: schema.user.name,
    })
    .from(u)
    .leftJoin(schema.marketingCampaign, eq(schema.marketingCampaign.id, u.campaignId))
    .leftJoin(schema.user, eq(schema.user.id, u.revertedBy))
    .where(scoped(u.organizationId, orgId, deLaPersona(contactId, contacto.email)))
    .orderBy(desc(u.createdAt));
  return filas.map((f) => ({
    id: f.id,
    at: f.createdAt.toISOString(),
    campaignName: f.campaignName ?? null,
    revertedAt: f.revertedAt?.toISOString() ?? null,
    revertedByName: f.revertedByName ?? null,
  }));
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
