import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 045 (T004) — La migración 0071: ocho tablas de dominio, cada una con su RLS
 * escrita a mano, y re-ejecutable de punta a punta (constitución IV; FR-026).
 *
 * `db:generate` produce tablas e índices, no políticas ni guardas de
 * re-ejecución: este archivo es el compilador que le falta al SQL.
 */

const ARCHIVO = path.join(process.cwd(), "drizzle", "0071_campanas_de_marketing.sql");
const leer = () => readFileSync(ARCHIVO, "utf8").replace(/\r\n/g, "\n");

const TABLAS = [
  "marketing_settings",
  "marketing_audience",
  "marketing_campaign",
  "marketing_campaign_recipient",
  "marketing_campaign_link",
  "marketing_click",
  "marketing_unsubscribe",
  "marketing_image",
] as const;

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

describe("0071 — campañas de marketing", () => {
  it("existe", () => {
    expect(existsSync(ARCHIVO), "falta drizzle/0071_campanas_de_marketing.sql").toBe(true);
  });

  it.each(TABLAS)("crea «%s» con `if not exists`", (tabla) => {
    expect(leer()).toMatch(new RegExp(`create table if not exists "${tabla}"`));
    expect(leer()).not.toMatch(new RegExp(`create table "${tabla}"`));
  });

  it.each(TABLAS)("«%s» nace con RLS y `tenant_isolation`", (tabla) => {
    const sql = leer();
    expect(sql).toContain(`alter table "${tabla}" enable row level security;`);
    expect(sql).toContain(`drop policy if exists tenant_isolation on "${tabla}";`);
    expect(sql).toMatch(
      new RegExp(
        `create policy tenant_isolation on "${tabla}"\\s+using \\(organization_id = current_setting\\('app\\.current_org', true\\)\\)\\s+with check \\(organization_id = current_setting\\('app\\.current_org', true\\)\\)`
      )
    );
  });

  it("toda FK y todo CHECK se agregan dentro de `do $$` contra `pg_constraint`", () => {
    const sql = leer();
    const constraints = [...sql.matchAll(/add constraint "([a-z0-9_]+)"/g)].map((m) => m[1]!);
    expect(constraints.length).toBeGreaterThan(20);
    for (const nombre of constraints) {
      expect(sql, `«${nombre}» sin guarda contra pg_constraint`).toContain(
        `conname = '${nombre}'`
      );
    }
    // Fuera de un bloque `do $$` no hay `add constraint` suelto.
    const fueraDeBloques = sql.replace(/do \$\$[\s\S]*?end \$\$;/g, "");
    expect(fueraDeBloques).not.toMatch(/add constraint/);
  });

  it("todo índice lleva `if not exists`", () => {
    const sql = leer();
    const indices = [...sql.matchAll(/create (unique )?index (if not exists )?"/g)];
    expect(indices.length).toBeGreaterThan(10);
    expect(indices.every((m) => m[2])).toBe(true);
  });

  it.each([
    // DV-005 — una campaña enviándose por organización.
    [
      "marketing_campaign_one_sending_uq",
      /create unique index if not exists "marketing_campaign_one_sending_uq"\s+on "marketing_campaign"[^;]*\("organization_id"\)\s+where "status" = 'enviando'/,
    ],
    // DV-011 — una baja activa por dirección.
    [
      "marketing_unsub_org_email_active_uq",
      /create unique index if not exists "marketing_unsub_org_email_active_uq"\s+on "marketing_unsubscribe"[^;]*\("organization_id", "email"\)\s+where "reverted_at" is null/,
    ],
    // FR-004 — a lo sumo una vez por dirección y campaña, garantizado por la base.
    [
      "marketing_recipient_campaign_email_uq",
      /create unique index if not exists "marketing_recipient_campaign_email_uq"\s+on "marketing_campaign_recipient"[^;]*\("campaign_id", "email"\)/,
    ],
    [
      "marketing_audience_org_name_uq",
      /create unique index if not exists "marketing_audience_org_name_uq"\s+on "marketing_audience"[^;]*\("organization_id", lower\("name"\)\)/,
    ],
  ])("índice único %s", (_nombre, patron) => {
    expect(leer()).toMatch(patron);
  });

  it("CHECK del estado de campaña, del destinatario y del tipo de imagen", () => {
    const sql = leer();
    expect(sql).toMatch(
      /"status" in \('borrador', 'enviando', 'enviada', 'cancelada'\)/
    );
    expect(sql).toMatch(
      /"status" in \('pendiente', 'enviando', 'enviado', 'fallido', 'omitido', 'cancelado'\)/
    );
    expect(sql).toMatch(/"mime_type" in \('image\/jpeg', 'image\/png', 'image\/webp'\)/);
  });

  it.each([
    ["marketing_campaign_recipient", "contact_id", "contact", "set null"],
    ["marketing_unsubscribe", "contact_id", "contact", "set null"],
    ["marketing_campaign_recipient", "campaign_id", "marketing_campaign", "cascade"],
    ["marketing_campaign_link", "campaign_id", "marketing_campaign", "cascade"],
    ["marketing_click", "campaign_id", "marketing_campaign", "cascade"],
    ["marketing_image", "campaign_id", "marketing_campaign", "cascade"],
    ["marketing_campaign", "audience_id", "marketing_audience", "set null"],
  ])("FK %s.%s → %s con `on delete %s`", (tabla, columna, destino, accion) => {
    expect(leer()).toMatch(
      new RegExp(
        `alter table "${tabla}" add constraint "[a-z0-9_]+"\\s+foreign key \\("${columna}"\\) references "public"\\."${escapar(destino)}"\\("id"\\) on delete ${accion}`
      )
    );
  });

  it("es re-ejecutable: ningún `do update`", () => {
    expect(leer()).not.toMatch(/do update/i);
  });
});
