import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import {
  AREAS,
  type Area,
  type AreaConfigDto,
  type HandoffRecipients,
  type OfficeHours,
} from "@/lib/areas";

/**
 * 029 (DV-003) — Configuración de las áreas de derivación y el interruptor
 * del ruteo.
 *
 * Todo por `scoped()`: las rutas corren dentro de la transacción del pedido
 * (RLS) y la tarea de envío abre su propio `withOrganizationScope`.
 */

/** Cuerpo del `PUT /api/settings/areas/[area]` (`contracts/api-areas.md`). */
export const areaConfigBodySchema = z
  .object({
    enabled: z.boolean(),
    mailbox: z.string().trim().email().max(200).nullable(),
    ccEmails: z.array(z.string().trim().email().max(200)).max(10),
    ccSellerIds: z.array(z.string().min(1)).max(20),
    contactText: z.string().trim().max(600).nullable(),
    officeHours: z
      .object({
        // 0 = lunes, como `WEEKDAY_LABELS` y `cohort.days_of_week`.
        days: z.array(z.number().int().min(0).max(6)).min(1),
        from: z.string().regex(/^\d{2}:\d{2}$/),
        to: z.string().regex(/^\d{2}:\d{2}$/),
      })
      .refine((h) => h.from < h.to, "El horario tiene que empezar antes de terminar")
      .nullable(),
  })
  .refine((b) => !b.enabled || b.mailbox !== null, {
    message: "Para encender el área hace falta la casilla",
    path: ["mailbox"],
  });

export type AreaConfigBody = z.infer<typeof areaConfigBodySchema>;

export type SellerRef = {
  id: string;
  name: string;
  email: string | null;
  archivedAt: Date | null;
};

/**
 * ¿Los vendedores en copia son válidos para esta área? Devuelve el motivo del
 * rechazo (para el 422) o `null`.
 */
export function checkCcSellers(area: Area, ids: string[], sellers: SellerRef[]): string | null {
  if (ids.length === 0) return null;
  if (area !== "ventas") return "Solo Ventas puede llevar vendedores en copia.";
  for (const id of ids) {
    const seller = sellers.find((s) => s.id === id);
    if (!seller) return `El vendedor ${id} no existe en esta organización.`;
    if (seller.archivedAt) return `El vendedor ${seller.name} está archivado.`;
  }
  return null;
}

type AreaConfigRow = {
  area: Area;
  enabled: boolean;
  mailbox: string | null;
  ccEmails: string[];
  ccSellerIds: string[];
  contactText: string | null;
  officeHours: OfficeHours | null;
  updatedAt: Date | null;
};

function defaultsFor(area: Area): AreaConfigDto {
  return {
    area,
    enabled: false,
    mailbox: null,
    ccEmails: [],
    ccSellerIds: [],
    contactText: null,
    officeHours: null,
    updatedAt: null,
  };
}

/** Las dos áreas SIEMPRE, en orden; una fila ausente son los valores por defecto. */
export function withAreaDefaults(rows: AreaConfigRow[]): AreaConfigDto[] {
  return AREAS.map((area) => {
    const row = rows.find((r) => r.area === area);
    if (!row) return defaultsFor(area);
    return {
      area,
      enabled: row.enabled,
      mailbox: row.mailbox,
      ccEmails: row.ccEmails,
      ccSellerIds: row.ccSellerIds,
      contactText: row.contactText,
      officeHours: row.officeHours,
      updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
    };
  });
}

/**
 * Destinatarios del correo: To = casilla; CC = copias manuales ∪ correos de
 * los vendedores activos — sin duplicados (sin distinguir mayúsculas) ni el
 * To. Los vendedores que no pueden ir en copia quedan en `omitted` con su
 * motivo, para que el caso diga a quién NO le llegó.
 *
 * `replyTo` lo completa quien arma el correo (sale del caso, no del área).
 */
export function resolveRecipients(
  config: { mailbox: string | null; ccEmails: string[]; ccSellerIds: string[] },
  sellers: SellerRef[]
): HandoffRecipients {
  const to = config.mailbox ? [config.mailbox] : [];
  const seen = new Set(to.map((e) => e.toLowerCase()));
  const cc: string[] = [];
  const add = (email: string) => {
    const key = email.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    cc.push(email);
  };
  config.ccEmails.forEach(add);

  const omitted: HandoffRecipients["omitted"] = [];
  for (const id of config.ccSellerIds) {
    const seller = sellers.find((s) => s.id === id);
    if (!seller) omitted.push({ sellerId: id, reason: "inexistente" });
    else if (seller.archivedAt) omitted.push({ sellerId: id, reason: "archivado" });
    else if (!seller.email) omitted.push({ sellerId: id, reason: "sin_correo" });
    else add(seller.email);
  }
  return { to, cc, replyTo: null, omitted };
}

/* ------------------------------ base ------------------------------ */

export async function getAreaConfigs(organizationId: string): Promise<AreaConfigDto[]> {
  const rows = await getDb()
    .select({
      area: schema.areaConfig.area,
      enabled: schema.areaConfig.enabled,
      mailbox: schema.areaConfig.mailbox,
      ccEmails: schema.areaConfig.ccEmails,
      ccSellerIds: schema.areaConfig.ccSellerIds,
      contactText: schema.areaConfig.contactText,
      officeHours: schema.areaConfig.officeHours,
      updatedAt: schema.areaConfig.updatedAt,
    })
    .from(schema.areaConfig)
    .where(scoped(schema.areaConfig.organizationId, organizationId));
  return withAreaDefaults(rows);
}

export async function getAreaConfig(organizationId: string, area: Area): Promise<AreaConfigDto> {
  const all = await getAreaConfigs(organizationId);
  return all.find((a) => a.area === area) ?? defaultsFor(area);
}

/** Todos los vendedores de la organización (activos y archivados), para validar y resolver copias. */
export async function listSellers(organizationId: string): Promise<SellerRef[]> {
  return getDb()
    .select({
      id: schema.seller.id,
      name: schema.seller.name,
      email: schema.seller.email,
      archivedAt: schema.seller.archivedAt,
    })
    .from(schema.seller)
    .where(scoped(schema.seller.organizationId, organizationId));
}

/** Los vendedores activos, para la pantalla (los sin correo se muestran marcados). */
export async function listActiveSellersWithEmail(
  organizationId: string
): Promise<{ id: string; name: string; email: string | null }[]> {
  const sellers = await listSellers(organizationId);
  return sellers
    .filter((s) => !s.archivedAt)
    .map((s) => ({ id: s.id, name: s.name, email: s.email }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export class AreaConfigError extends Error {}

/** Upsert por `(organization_id, area)`. Lanza `AreaConfigError` si un vendedor no sirve. */
export async function saveAreaConfig(
  organizationId: string,
  area: Area,
  input: AreaConfigBody,
  userId: string | null
): Promise<AreaConfigDto> {
  const sellerError = checkCcSellers(area, input.ccSellerIds, await listSellers(organizationId));
  if (sellerError) throw new AreaConfigError(sellerError);

  const now = new Date();
  const values = {
    enabled: input.enabled,
    mailbox: input.mailbox,
    ccEmails: [...new Set(input.ccEmails)],
    ccSellerIds: [...new Set(input.ccSellerIds)],
    contactText: input.contactText || null,
    officeHours: input.officeHours
      ? { ...input.officeHours, days: [...new Set(input.officeHours.days)].sort((a, b) => a - b) }
      : null,
    updatedBy: userId,
    updatedAt: now,
  };
  await getDb()
    .insert(schema.areaConfig)
    .values({ id: newId("areaConfig"), organizationId, area, ...values })
    .onConflictDoUpdate({
      target: [schema.areaConfig.organizationId, schema.areaConfig.area],
      set: values,
    });
  return getAreaConfig(organizationId, area);
}

/** El interruptor global: `false` si la organización no tiene agente configurado. */
export async function getRoutingEnabled(organizationId: string): Promise<boolean> {
  const rows = await getDb()
    .select({ enabled: schema.agentProfile.areaRoutingEnabled })
    .from(schema.agentProfile)
    .where(scoped(schema.agentProfile.organizationId, organizationId))
    .limit(1);
  return rows[0]?.enabled ?? false;
}

/** `false` si no existe `agent_profile` (la ruta responde 422). */
export async function setRoutingEnabled(organizationId: string, enabled: boolean): Promise<boolean> {
  const updated = await getDb()
    .update(schema.agentProfile)
    .set({ areaRoutingEnabled: enabled, updatedAt: new Date() })
    .where(scoped(schema.agentProfile.organizationId, organizationId))
    .returning({ id: schema.agentProfile.id });
  return updated.length > 0;
}
