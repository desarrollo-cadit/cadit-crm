import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 2026-10-16 (pedido del dueño) — El catálogo de programas (alta, nombre,
 * foto, total de licencias) vive en /licencias y no en Académico. Guard
 * estructural: que Académico no vuelva a tener su pestaña "Software", que
 * /licencias reciba del SERVIDOR el permiso de editar el catálogo (la misma
 * capacidad que exigen POST/PATCH de /api/software) y que ninguna pantalla
 * mande a buscar el catálogo a un lugar que ya no existe.
 */
const leer = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("catálogo de programas dentro de /licencias", () => {
  it("Académico ya no tiene la pestaña Software ni su formulario", () => {
    const src = leer("src/components/academic/academic-client.tsx");
    expect(src).not.toMatch(/key:\s*"software"/);
    expect(src).not.toContain("SoftwareForm");
    // El selector de software del formulario de cohorte sigue necesitando la lista.
    expect(src).toContain('"/api/software"');
  });

  it("/licencias recibe del servidor el permiso de editar el catálogo", () => {
    const page = leer("src/app/(app)/licencias/page.tsx");
    expect(page).toMatch(/canEdit=\{caps\.includes\("academico\.editar"\)\}/);
    for (const ruta of ["src/app/api/software/route.ts", "src/app/api/software/[id]/route.ts"]) {
      expect(leer(ruta)).toContain('"academico.editar"');
    }
    const view = leer("src/components/licenses/licenses-view.tsx");
    expect(view).toContain("SoftwareForm");
    expect(view).toContain("Nuevo programa");
  });

  it("ninguna copia manda al catálogo a Académico → Software", () => {
    for (const p of [
      "src/components/licenses/licenses-view.tsx",
      "src/components/academic/academic-client.tsx",
    ]) {
      expect(leer(p)).not.toContain("Académico → Software");
    }
  });
});
