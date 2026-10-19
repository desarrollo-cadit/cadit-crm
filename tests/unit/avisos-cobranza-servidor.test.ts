import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 041 — La forma del lado servidor de los avisos de cobranza: de dónde salen,
 * cuándo se mandan y qué no los dispara. Reglas estructurales que no se
 * pueden romper sin que nadie lo note.
 */

const leer = (...p: string[]) => readFileSync(path.join(process.cwd(), ...p), "utf8");
/** Sin comentarios: las reglas se miran sobre el código, no sobre lo que se dice de él. */
const codigo = (...p: string[]) =>
  leer(...p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const entre = (src: string, desde: string, hasta?: string) => {
  const i = src.indexOf(desde);
  expect(i, `no está: ${desde}`).toBeGreaterThan(-1);
  const j = hasta ? src.indexOf(hasta, i + desde.length) : -1;
  return src.slice(i, j > i ? j : undefined);
};

describe("041 — de dónde sale cada aviso", () => {
  it("la cola: encola DENTRO del pedido y manda DESPUÉS del commit, sin esperar", () => {
    const src = codigo("src", "server", "billing-notices-queue.ts");
    expect(src.indexOf("await encolarAviso(")).toBeLessThan(src.indexOf("onAfterCommit("));
    expect(src).toMatch(/onAfterCommit\(\(\) => \{\s*void import\("@\/server\/billing-notices"\)/);
    expect(src).not.toMatch(/await import\(/);
  });

  it("el alta: solo una venta (`esVentaParaAviso`) y salvo `avisoInterno: false`", () => {
    const src = entre(codigo("src", "server", "enrollments.ts"), "export async function createEnrollment");
    expect(src).toMatch(
      /if \(opts\.avisoInterno !== false && esVentaParaAviso\(nueva\)\) \{\s*await avisarAAdministracion\(organizationId, \{ kind: "inscripcion_nueva"/
    );
  });

  it("el lead que recibe cohorte avisa; mudar no (`pasaAVenta`)", () => {
    const src = codigo("src", "app", "api", "pipeline", "leads", "[id]", "route.ts");
    expect(src).toMatch(/pasaAVenta\(cohorteAntes, body\.data\.cohortId\)/);
    expect(src).toMatch(/kind: "inscripcion_nueva"/);
  });

  it("el pago avisa, salvo la carga en bloque; el reintento idempotente sale antes y no avisa", () => {
    const src = entre(codigo("src", "server", "billing.ts"), "export async function recordPayment", "export async function voidPayment");
    expect(src.indexOf("if (dup[0]) return")).toBeLessThan(src.indexOf("avisarAAdministracion("));
    expect(src).toMatch(/if \(input\.avisoInterno !== false\) \{\s*await avisarAAdministracion\(organizationId, \{\s*kind: "pago_registrado"/);
    expect(codigo("src", "server", "billing-bulk.ts")).toMatch(/avisoInterno: false/);
  });

  it("anular un pago no avisa", () => {
    const src = entre(codigo("src", "server", "billing.ts"), "export async function voidPayment", "export async function listPayments");
    expect(src).not.toContain("avisarAAdministracion(");
  });

  it("talleres, módulos automáticos, leads del inbox, semillas e importación no avisan", () => {
    for (const archivo of [
      ["src", "server", "workshops.ts"],
      ["src", "server", "module-enrollment.ts"],
      ["src", "server", "inbox", "lead-activity.ts"],
      ["src", "server", "seed", "academic.ts"],
      ["src", "server", "seed", "demo.ts"],
      ["scripts", "import", "cadit-2026.ts"],
    ]) {
      expect(codigo(...archivo), archivo.join("/")).not.toContain("avisarAAdministracion");
    }
    expect(codigo("scripts", "demo-camada.ts")).toMatch(/\{ avisoInterno: false \}/);
  });
});

describe("041 — cómo se mandan", () => {
  it("el correo se manda FUERA de la transacción (prepararEnvio no llama a sendMail)", () => {
    const src = codigo("src", "server", "billing-notices.ts");
    const preparar = entre(src, "async function prepararEnvio", "export async function enviarAvisoDeCobranza");
    expect(preparar).not.toContain("sendMail(");
    expect(entre(src, "export async function enviarAvisoDeCobranza")).toContain("return mandarAviso(");
  });

  it("solo Administración: nunca otra área", () => {
    const src = codigo("src", "server", "billing-notices.ts");
    expect(src).toContain('getAreaConfig(organizationId, "administracion")');
    expect(src).not.toMatch(/getAreaConfig\(organizationId, "(ventas|soporte)"\)/);
  });

  it("una sola periódica corre los avisos de cohorte y los de cobranza", () => {
    const src = codigo("src", "server", "staff-notices.ts");
    expect(entre(src, "export function defaultStaffNoticeDeps")).toContain("runInternalNoticesForOrg(orgId)");
    const run = entre(codigo("src", "server", "billing-notices.ts"), "export async function runInternalNoticesForOrg");
    expect(run).toContain("runStaffNoticesForOrg(");
    expect(run).toContain("runBillingNoticesForOrg(");
  });

  it("sin variable de entorno nueva: la reusa (`STAFF_NOTICES_INTERVAL_MIN`)", () => {
    expect(codigo("src", "server", "billing-notices.ts")).not.toContain("getEnv(");
  });
});

describe("041 — la migración 0062", () => {
  const sql = leer("drizzle", "0062_avisos_internos_cobranza.sql");

  it("rellena la llave de las filas de 039 ANTES de exigirla y de cambiar el índice único", () => {
    const backfill = sql.indexOf(`set "dedup_key" = "kind" || ':' || "cohort_id"`);
    expect(backfill).toBeGreaterThan(-1);
    expect(backfill).toBeLessThan(sql.indexOf(`alter column "dedup_key" set not null`));
    expect(sql.indexOf(`create unique index if not exists "staff_notice_org_dedup_uq"`)).toBeLessThan(
      sql.indexOf(`drop index if exists "staff_notice_org_cohort_kind_uq"`)
    );
  });

  it("re-ejecutable y con RLS", () => {
    expect(sql).toMatch(/add column if not exists "dedup_key"/);
    expect(sql).toMatch(/where "dedup_key" is null/);
    expect(sql).toMatch(/enable row level security/);
    expect(sql).toMatch(/create policy tenant_isolation on "staff_notice"/);
  });

  it("está en el journal", () => {
    expect(leer("drizzle", "meta", "_journal.json")).toContain('"tag": "0062_avisos_internos_cobranza"');
  });
});
