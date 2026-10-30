import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { seccionesDeMisGrupos } from "@/lib/teacher-cohort-sections";

/** 2026-10-30 — "Mis grupos" del portal del profesor: secciones, color y progreso. */
const g = (id: string, status: "planificada" | "en_curso" | "finalizada", startDate: string) => ({
  id,
  status,
  startDate,
});

describe("seccionesDeMisGrupos", () => {
  it("separa en curso, próximos y finalizados, cada uno en su orden", () => {
    const s = seccionesDeMisGrupos([
      g("f1", "finalizada", "2025-03-01"),
      g("p2", "planificada", "2026-12-01"),
      g("c1", "en_curso", "2026-09-01"),
      g("p1", "planificada", "2026-11-10"),
      g("f2", "finalizada", "2026-04-01"),
      g("c2", "en_curso", "2026-10-01"),
    ]);
    expect(s.enCurso.map((x) => x.id)).toEqual(["c2", "c1"]);
    // Próximos: el que empieza antes, primero.
    expect(s.proximos.map((x) => x.id)).toEqual(["p1", "p2"]);
    // Finalizados: el más reciente primero.
    expect(s.finalizados.map((x) => x.id)).toEqual(["f2", "f1"]);
  });

  it("sin grupos, tres secciones vacías", () => {
    expect(seccionesDeMisGrupos([])).toEqual({ enCurso: [], proximos: [], finalizados: [] });
  });
});

describe("el portal del profesor sigue sin plata ni contacto", () => {
  const servidor = readFileSync("src/server/teacher-portal.ts", "utf8");
  const ruta = readFileSync("src/app/api/portal/cohorts/route.ts", "utf8");
  const pantalla = readFileSync("src/components/portal/portal-cohorts-client.tsx", "utf8");

  it("el progreso usa la regla única de Académico y solo fechas de clase", () => {
    expect(servidor).toContain("progresoDeCursada(");
    const sinComentarios = servidor.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(sinComentarios).not.toMatch(/\b403\b/);
    expect(ruta).toContain("conProgreso: { timeZone: timezone }");
  });

  it("la pantalla usa las piezas compartidas (avatar, tono, encabezado)", () => {
    expect(pantalla).toMatch(/from "@\/components\/listados\/curso-visual"/);
    expect(pantalla).toContain("<EncabezadoDeSeccion");
    expect(pantalla).toContain("<AvatarDeCurso");
    expect(pantalla).toContain("href={`/portal/cohortes/${c.id}`}");
  });
});
