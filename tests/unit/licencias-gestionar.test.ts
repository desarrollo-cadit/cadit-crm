import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CAPABILITIES, SYSTEM_ROLES, capabilitiesFor } from "@/lib/capabilities";

/**
 * 2026-10-26 (decisión del dueño) — Asignar y quitar licencias es tarea de
 * SOPORTE: `licencias.gestionar`. Coordinación sigue VIENDO qué licencia tiene
 * cada alumno, pero no la cambia. Ventas y Administración, como antes: nada.
 *
 * El catálogo de programas (`/api/software`) y las sincronizaciones
 * automáticas (inscribir, módulos, mudar, baja) no cambian: no son asignar.
 */

const leer = (rel: string) =>
  readFileSync(path.join(process.cwd(), rel), "utf8").replace(/\r\n/g, "\n");
const rol = (key: string) => SYSTEM_ROLES.find((r) => r.key === key)?.capabilities ?? [];

describe("licencias.gestionar — la capacidad y los roles", () => {
  it("existe en la lista cerrada", () => {
    expect(CAPABILITIES).toContain("licencias.gestionar");
  });

  it.each(["direccion", "soporte"])("%s la recibe", (key) => {
    expect(rol(key)).toContain("licencias.gestionar");
  });

  it.each(["coordinacion", "ventas", "administracion"])("%s NO la recibe", (key) => {
    expect(rol(key)).not.toContain("licencias.gestionar");
  });

  it("coordinación conserva la lectura: sigue viendo lo académico", () => {
    expect(rol("coordinacion")).toContain("academico.ver");
  });

  it("el respaldo en código de `soporte` también la trae", () => {
    expect(capabilitiesFor("soporte")).toContain("licencias.gestionar");
  });
});

describe("licencias.gestionar — las rutas que asignan y quitan", () => {
  const exige = (archivo: string, metodo: string) => {
    const src = leer(archivo);
    expect(src).toMatch(
      new RegExp(`export const ${metodo} = requireCapability\\(\\s*"licencias\\.gestionar"`)
    );
  };

  it.each([
    ["src/app/api/enrollments/[id]/license/route.ts", "PUT"],
    ["src/app/api/enrollments/[id]/license/route.ts", "DELETE"],
    ["src/app/api/enrollments/[id]/license-email/route.ts", "PATCH"],
    ["src/app/api/cohorts/[id]/group-licenses/route.ts", "POST"],
    ["src/app/api/cohorts/[id]/group-licenses/[softwareId]/route.ts", "DELETE"],
  ])("%s %s exige licencias.gestionar", (archivo, metodo) => {
    exige(archivo, metodo);
  });

  it.each([
    "src/app/api/enrollments/[id]/license/route.ts",
    "src/app/api/cohorts/[id]/group-licenses/route.ts",
  ])("%s: el GET sigue con academico.ver (coordinación ve)", (archivo) => {
    expect(leer(archivo)).toMatch(/export const GET = requireCapability\(\s*"academico\.ver"/);
  });

  it("el catálogo de programas sigue con academico.editar", () => {
    expect(leer("src/app/api/software/route.ts")).toMatch(/"academico\.editar"/);
  });
});

describe("licencias.gestionar — la pantalla", () => {
  it("la cohorte deriva el permiso de licencias de `licencias.gestionar`", () => {
    const page = leer("src/app/(app)/cohorts/[id]/page.tsx");
    expect(page).toMatch(/canManageLicenses=\{caps\.includes\("licencias\.gestionar"\)\}/);
  });

  it("las pestañas pasan ese permiso, no academico.editar, a los dos rosters", () => {
    const tabs = leer("src/components/cohorts/cohort-tabs.tsx");
    const usos = [...tabs.matchAll(/canEditLicenses=\{(\w+)\}/g)].map((m) => m[1]);
    expect(usos).toHaveLength(2);
    expect(new Set(usos)).toEqual(new Set(["canManageLicenses"]));
  });

  it("en /licencias, el catálogo sigue con academico.editar y Desasignar pide licencias.gestionar", () => {
    const page = leer("src/app/(app)/licencias/page.tsx");
    expect(page).toMatch(/canEdit=\{caps\.includes\("academico\.editar"\)\}/);
    expect(page).toMatch(/canManage=\{caps\.includes\("licencias\.gestionar"\)\}/);
    const vista = leer("src/components/licenses/licenses-view.tsx");
    // 0088 — Junto a Desasignar hay un «Equipo» (cambiar de equipo): los dos son de canManage.
    expect(vista).toMatch(/\) : canManage \? \(\s*<div[^>]*>\s*<Button[\s\S]*?Desasignar/);
  });

  it("/settings/roles la muestra (rótulo y grupo Académico)", () => {
    const roles = leer("src/components/settings/roles-client.tsx");
    expect(roles).toContain(`"licencias.gestionar": "Asignar y quitar licencias"`);
    expect(roles).toMatch(/\|cohortes\|licencias\)\\\./);
  });

  it("el roster falla cerrado: sin el permiso, no hay controles", () => {
    expect(leer("src/components/cohorts/roster-client.tsx")).toMatch(
      /canEditLicenses = false,/
    );
  });
});

describe("0076 — licencias.gestionar a dirección y soporte", () => {
  const ARCHIVO = path.join(process.cwd(), "drizzle", "0076_licencias_gestionar.sql");

  it("existe", () => {
    expect(existsSync(ARCHIVO), "falta drizzle/0076_licencias_gestionar.sql").toBe(true);
  });

  it("solo suma (nunca quita), por llave, sin repetir, y nunca a coordinación", () => {
    const sql = readFileSync(ARCHIVO, "utf8").replace(/\r\n/g, "\n");
    const updates = [...sql.matchAll(/update "role"[\s\S]*?;/g)].map((m) => m[0]);
    expect(updates).toHaveLength(2);
    const llaves = updates.map((u) => /where "key" = '([a-z]+)'/.exec(u)?.[1]).sort();
    expect(llaves).toEqual(["direccion", "soporte"]);
    for (const u of updates) {
      expect(u).toContain(`"capabilities" || jsonb_build_array('licencias.gestionar')`);
      expect(u).toMatch(/not \("capabilities" @> jsonb_build_array\('licencias\.gestionar'\)\)/);
    }
    expect(sql).not.toMatch(/delete|\s-\s'/i);
    expect(sql).not.toContain("'coordinacion'");
  });

  it("está en el journal", () => {
    expect(leer("drizzle/meta/_journal.json")).toContain('"tag": "0076_licencias_gestionar"');
  });
});
