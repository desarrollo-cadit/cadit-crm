import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CAPABILITIES, SYSTEM_ROLES, capabilitiesFor } from "@/lib/capabilities";

/**
 * 2026-10-29 — Unificar empresas duplicadas es `empresas.unificar`: los
 * mismos roles que `contactos.unificar` (Dirección, Coordinación y Soporte).
 * Ventas y Administración no. Es irreversible: no cuelga de `empresas.editar`.
 */

const leer = (rel: string) =>
  readFileSync(path.join(process.cwd(), rel), "utf8").replace(/\r\n/g, "\n");
const rol = (key: string) => SYSTEM_ROLES.find((r) => r.key === key)?.capabilities ?? [];

describe("empresas.unificar — la capacidad y los roles", () => {
  it("existe en la lista cerrada", () => {
    expect(CAPABILITIES).toContain("empresas.unificar");
  });

  it.each(["direccion", "coordinacion", "soporte"])("%s la recibe (igual que contactos.unificar)", (key) => {
    expect(rol(key)).toContain("empresas.unificar");
    expect(rol(key)).toContain("contactos.unificar");
  });

  it.each(["ventas", "administracion"])("%s NO la recibe", (key) => {
    expect(rol(key)).not.toContain("empresas.unificar");
  });

  it("el respaldo en código de `soporte` también la trae", () => {
    expect(capabilitiesFor("soporte")).toContain("empresas.unificar");
  });

  it("/settings/roles la muestra con rótulo", () => {
    expect(leer("src/components/settings/roles-client.tsx")).toContain(
      `"empresas.unificar": "Unificar empresas duplicadas"`
    );
  });
});

describe("empresas.unificar — las rutas", () => {
  it.each([
    ["src/app/api/companies/[id]/merge-preview/route.ts", "GET"],
    ["src/app/api/companies/[id]/merge/route.ts", "POST"],
  ])("%s %s exige empresas.unificar", (archivo, metodo) => {
    expect(leer(archivo)).toMatch(
      new RegExp(`export const ${metodo} = requireCapability\\(\\s*"empresas\\.unificar"`)
    );
  });

  it("el POST pide confirmación explícita y responde los bloqueos ANTES de escribir", () => {
    expect(leer("src/lib/company-merge.ts")).toMatch(/confirm: z\.literal\(true/);
    const ruta = leer("src/app/api/companies/[id]/merge/route.ts");
    expect(ruta.indexOf("plan.bloqueos.length > 0")).toBeLessThan(ruta.indexOf("aplicarUnificacionDeEmpresas("));
  });
});

describe("empresas.unificar — la pantalla", () => {
  it("/empresas dibuja «Unificar con…» solo con la capacidad", () => {
    expect(leer("src/app/(app)/empresas/page.tsx")).toMatch(/canMerge=\{caps\.includes\("empresas\.unificar"\)\}/);
    expect(leer("src/components/companies/companies-client.tsx")).toMatch(/canMerge &&/);
  });

  it("el diálogo avisa que no se puede deshacer y no deja confirmar con bloqueos", () => {
    const dialogo = leer("src/components/companies/merge-companies-dialog.tsx");
    expect(dialogo).toContain("Esta acción no se puede deshacer.");
    expect(dialogo).toMatch(/preview\.bloqueos\.length > 0/);
    expect(dialogo).toMatch(/disabled=\{bloqueado/);
  });
});

describe("0085 — empresas.unificar a dirección, coordinación y soporte", () => {
  const ARCHIVO = path.join(process.cwd(), "drizzle", "0085_empresas_unificar.sql");

  it("existe", () => {
    expect(existsSync(ARCHIVO), "falta drizzle/0085_empresas_unificar.sql").toBe(true);
  });

  it("solo suma (nunca quita), por llave, sin repetir, y nunca a ventas ni administración", () => {
    const sql = readFileSync(ARCHIVO, "utf8").replace(/\r\n/g, "\n");
    const updates = [...sql.matchAll(/update "role"[\s\S]*?;/g)].map((m) => m[0]);
    expect(updates).toHaveLength(3);
    const llaves = updates.map((u) => /where "key" = '([a-z]+)'/.exec(u)?.[1]).sort();
    expect(llaves).toEqual(["coordinacion", "direccion", "soporte"]);
    for (const u of updates) {
      expect(u).toContain(`"capabilities" || jsonb_build_array('empresas.unificar')`);
      expect(u).toMatch(/not \("capabilities" @> jsonb_build_array\('empresas\.unificar'\)\)/);
    }
    expect(sql).not.toMatch(/delete|\s-\s'/i);
    expect(sql).not.toContain("'ventas'");
    expect(sql).not.toContain("'administracion'");
  });

  it("está en el journal", () => {
    expect(leer("drizzle/meta/_journal.json")).toContain('"tag": "0085_empresas_unificar"');
  });
});
