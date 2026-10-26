import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CAPABILITIES, SYSTEM_ROLES, capabilitiesFor } from "@/lib/capabilities";

/**
 * 2026-10-26 (decisión del dueño) — Unificar contactos duplicados es
 * `contactos.unificar`: Dirección, Coordinación y Soporte. Ventas y
 * Administración no. Es irreversible, así que no cuelga de `contactos.editar`.
 */

const leer = (rel: string) =>
  readFileSync(path.join(process.cwd(), rel), "utf8").replace(/\r\n/g, "\n");
const rol = (key: string) => SYSTEM_ROLES.find((r) => r.key === key)?.capabilities ?? [];

describe("contactos.unificar — la capacidad y los roles", () => {
  it("existe en la lista cerrada", () => {
    expect(CAPABILITIES).toContain("contactos.unificar");
  });

  it.each(["direccion", "coordinacion", "soporte"])("%s la recibe", (key) => {
    expect(rol(key)).toContain("contactos.unificar");
  });

  it.each(["ventas", "administracion"])("%s NO la recibe", (key) => {
    expect(rol(key)).not.toContain("contactos.unificar");
  });

  it("el respaldo en código de `soporte` también la trae", () => {
    expect(capabilitiesFor("soporte")).toContain("contactos.unificar");
  });

  it("/settings/roles la muestra con rótulo (grupo Comercial por el prefijo `contactos.`)", () => {
    expect(leer("src/components/settings/roles-client.tsx")).toContain(
      `"contactos.unificar": "Unificar contactos duplicados"`
    );
  });
});

describe("contactos.unificar — las rutas", () => {
  it.each([
    ["src/app/api/contacts/[id]/merge-preview/route.ts", "GET"],
    ["src/app/api/contacts/[id]/merge/route.ts", "POST"],
  ])("%s %s exige contactos.unificar", (archivo, metodo) => {
    expect(leer(archivo)).toMatch(
      new RegExp(`export const ${metodo} = requireCapability\\(\\s*"contactos\\.unificar"`)
    );
  });

  it("el POST pide confirmación explícita y responde los bloqueos ANTES de escribir", () => {
    expect(leer("src/lib/contact-merge.ts")).toMatch(/confirm: z\.literal\(true/);
    const ruta = leer("src/app/api/contacts/[id]/merge/route.ts");
    expect(ruta.indexOf("plan.bloqueos.length > 0")).toBeLessThan(ruta.indexOf("aplicarUnificacion("));
  });

  it("la lectura bloquea las dos filas de contacto (`for update`)", () => {
    expect(leer("src/server/contact-merge.ts")).toMatch(/\.for\("update"\)/);
  });
});

describe("contactos.unificar — la pantalla", () => {
  it("el legajo dibuja «Unificar con…» solo con la capacidad", () => {
    expect(leer("src/app/(app)/contacts/[id]/legajo/page.tsx")).toMatch(
      /caps\.includes\("contactos\.unificar"\) \? <MergeContactsLauncher/
    );
  });

  it("el 409 de duplicado ofrece unificar solo con la capacidad", () => {
    expect(leer("src/app/(app)/contacts/page.tsx")).toMatch(
      /canMerge=\{caps\.includes\("contactos\.unificar"\)\}/
    );
    const cliente = leer("src/components/contacts/contacts-client.tsx");
    expect(cliente).toMatch(/canMerge = false,/);
    expect(cliente).toContain("Unificar con {error.contact.name}");
  });

  it("el diálogo avisa que no se puede deshacer y no deja confirmar con bloqueos", () => {
    const dialogo = leer("src/components/contacts/merge-contacts-dialog.tsx");
    expect(dialogo).toContain("Esta acción no se puede deshacer.");
    expect(dialogo).toMatch(/preview\.bloqueos\.length > 0/);
    expect(dialogo).toMatch(/disabled=\{bloqueado/);
  });
});

describe("0078 — contactos.unificar a dirección, coordinación y soporte", () => {
  const ARCHIVO = path.join(process.cwd(), "drizzle", "0078_contactos_unificar.sql");

  it("existe", () => {
    expect(existsSync(ARCHIVO), "falta drizzle/0078_contactos_unificar.sql").toBe(true);
  });

  it("solo suma (nunca quita), por llave, sin repetir, y nunca a ventas ni administración", () => {
    const sql = readFileSync(ARCHIVO, "utf8").replace(/\r\n/g, "\n");
    const updates = [...sql.matchAll(/update "role"[\s\S]*?;/g)].map((m) => m[0]);
    expect(updates).toHaveLength(3);
    const llaves = updates.map((u) => /where "key" = '([a-z]+)'/.exec(u)?.[1]).sort();
    expect(llaves).toEqual(["coordinacion", "direccion", "soporte"]);
    for (const u of updates) {
      expect(u).toContain(`"capabilities" || jsonb_build_array('contactos.unificar')`);
      expect(u).toMatch(/not \("capabilities" @> jsonb_build_array\('contactos\.unificar'\)\)/);
    }
    expect(sql).not.toMatch(/delete|\s-\s'/i);
    expect(sql).not.toContain("'ventas'");
    expect(sql).not.toContain("'administracion'");
  });

  it("está en el journal", () => {
    expect(leer("drizzle/meta/_journal.json")).toContain('"tag": "0078_contactos_unificar"');
  });
});
