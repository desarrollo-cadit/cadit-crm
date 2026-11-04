import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CAPABILITIES, SYSTEM_ROLES, capabilitiesFor, type Capability } from "@/lib/capabilities";
import { DESTINOS_MENU } from "@/lib/nav";

/**
 * 2026-11-04 (decisión del dueño) — Administración no ve Licencias, Cursos
 * offline ni Talleres. Conserva `academico.ver` porque sin ella las filas de
 * cobranza dicen un id de cohorte en vez de un curso; por eso las tres
 * pantallas tienen capacidad propia y ya no cuelgan de `academico.ver`.
 *
 * Todo otro rol que tenía `academico.ver` las recibe: nadie más pierde nada.
 */

const leer = (rel: string) =>
  readFileSync(path.join(process.cwd(), rel), "utf8").replace(/\r\n/g, "\n");
const rol = (key: string) => SYSTEM_ROLES.find((r) => r.key === key)?.capabilities ?? [];

const NUEVAS = ["licencias.ver", "cursosoffline.ver", "talleres.ver"] as const;

describe("las tres capacidades y los roles", () => {
  it("existen en la lista cerrada", () => {
    for (const c of NUEVAS) expect(CAPABILITIES).toContain(c);
  });

  it("Administración conserva `academico.ver` y no recibe ninguna de las tres", () => {
    expect(rol("administracion")).toContain("academico.ver");
    for (const c of NUEVAS) expect(rol("administracion"), c).not.toContain(c);
  });

  it("todo otro rol de sistema con `academico.ver` recibe las tres", () => {
    const conAcademico = SYSTEM_ROLES.filter(
      (r) => r.key !== "administracion" && r.capabilities.includes("academico.ver")
    );
    expect(conAcademico.map((r) => r.key).sort()).toEqual(
      ["coordinacion", "direccion", "soporte", "ventas"].sort()
    );
    for (const r of conAcademico) {
      for (const c of NUEVAS) expect(r.capabilities, `${r.key} sin ${c}`).toContain(c);
    }
  });

  it("owner, member y el respaldo de soporte también las traen", () => {
    for (const role of ["owner", "member", "soporte"]) {
      for (const c of NUEVAS) expect(capabilitiesFor(role), `${role} sin ${c}`).toContain(c);
    }
  });
});

describe("las pantallas piden la suya, no `academico.ver`", () => {
  const PANTALLAS: [string, string, Capability][] = [
    ["/licencias", "src/app/(app)/licencias/page.tsx", "licencias.ver"],
    ["/cursos-offline", "src/app/(app)/cursos-offline/page.tsx", "cursosoffline.ver"],
    ["/cursos-offline/[id]", "src/app/(app)/cursos-offline/[id]/page.tsx", "cursosoffline.ver"],
    ["/talleres", "src/app/(app)/talleres/page.tsx", "talleres.ver"],
    ["/talleres/[id]", "src/app/(app)/talleres/[id]/page.tsx", "talleres.ver"],
  ];

  it.each(PANTALLAS)("%s: el servidor redirige sin %s", (_ruta, archivo, cap) => {
    const src = leer(archivo);
    expect(src).toContain(`includes("${cap}")) redirect("/")`);
    expect(src).not.toMatch(/includes\("academico\.ver"\)/);
  });

  it("el menú declara cada una con su capacidad", () => {
    const de = (href: string) => DESTINOS_MENU.find((d) => d.href === href)?.capability;
    expect(de("/licencias")).toBe("licencias.ver");
    expect(de("/cursos-offline")).toBe("cursosoffline.ver");
    expect(de("/talleres")).toBe("talleres.ver");
    // Y lo que Administración sí usa sigue colgando de `academico.ver`.
    expect(de("/academico")).toBe("academico.ver");
    expect(de("/calendar")).toBe("academico.ver");
  });

  it("el menú que ve Administración no incluye ninguna de las tres", () => {
    const caps = new Set<string>(rol("administracion"));
    const visibles = DESTINOS_MENU.filter((d) => d.capability === null || caps.has(d.capability)).map(
      (d) => d.href
    );
    for (const href of ["/licencias", "/cursos-offline", "/talleres"]) {
      expect(visibles, href).not.toContain(href);
    }
    expect(visibles).toContain("/academico");
    expect(visibles).toContain("/finanzas");
  });
});

describe("las rutas de lectura piden la suya", () => {
  const LECTURAS: [string, RegExp][] = [
    ["src/app/api/licenses/route.ts", /GET = requireCapability\("licencias\.ver"/],
    ["src/app/api/license-teams/route.ts", /GET = requireCapability\("licencias\.ver"/],
    ["src/app/api/license-imports/route.ts", /GET = requireCapability\("licencias\.ver"/],
    ["src/app/api/dashboard/licenses/route.ts", /GET = requireCapability\(\s*"licencias\.ver"/],
    ["src/app/api/teachers/[id]/license/route.ts", /GET = requireCapability\(\s*"licencias\.ver"/],
    ["src/app/api/talleres/route.ts", /GET = requireCapability\("talleres\.ver"/],
    ["src/app/api/talleres/ediciones/[id]/route.ts", /GET = requireCapability\(\s*"talleres\.ver"/],
    ["src/app/api/offline-courses/route.ts", /GET = requireCapability\("cursosoffline\.ver"/],
    ["src/app/api/offline-courses/[id]/route.ts", /GET = requireCapability\(\s*"cursosoffline\.ver"/],
    ["src/app/api/offline-courses/[id]/access/route.ts", /GET = requireCapability\(\s*"cursosoffline\.ver"/],
    ["src/app/api/offline-courses/[id]/thumbnail/route.ts", /GET = requireCapability\(\s*"cursosoffline\.ver"/],
    [
      "src/app/api/offline-courses/[id]/grants/company/route.ts",
      /GET = requireCapability\("cursosoffline\.ver"/,
    ],
  ];

  it.each(LECTURAS)("%s", (archivo, patron) => {
    expect(leer(archivo)).toMatch(patron);
  });

  it("escribir sigue con las capacidades de siempre", () => {
    expect(leer("src/app/api/talleres/route.ts")).toMatch(/POST = requireCapability\("academico\.editar"/);
    expect(leer("src/app/api/offline-courses/route.ts")).toMatch(
      /POST = requireCapability\("academico\.editar"/
    );
    expect(leer("src/app/api/teachers/[id]/license/route.ts")).toMatch(
      /PUT = requireCapability\(\s*"licencias\.gestionar"/
    );
  });
});

describe("el inicio no dibuja el inventario de licencias sin `licencias.ver`", () => {
  it("la página lo gobierna con la capacidad, no solo la ruta", () => {
    const src = leer("src/app/(app)/page.tsx");
    expect(src).toContain('includes("licencias.ver")');
    expect(src).toMatch(/\{verLicencias && <LicenseInventoryPanel \/>\}/);
  });
});

describe("la migración 0092", () => {
  const sql = leer("drizzle/0093_pantallas_academicas_propias.sql");

  it("nunca le da nada al rol `administracion`", () => {
    expect(sql).not.toMatch(/where "key" = 'administracion'/);
  });

  it("suma a los otros cuatro roles de sistema y a los roles creados a mano", () => {
    for (const key of ["direccion", "coordinacion", "soporte", "ventas"]) {
      expect(sql).toContain(`where "key" = '${key}'`);
    }
    expect(sql).toContain('where "system" = false');
  });

  it("solo suma a quien tiene `academico.ver`, y es re-ejecutable", () => {
    const updates = sql.split("--> statement-breakpoint").filter((s) => s.includes('update "role"'));
    expect(updates).toHaveLength(15);
    for (const u of updates) {
      expect(u).toContain("@> jsonb_build_array('academico.ver')");
      expect(u).toMatch(/and not \("capabilities" @> jsonb_build_array\('[a-z.]+'\)\)/);
    }
  });
});
