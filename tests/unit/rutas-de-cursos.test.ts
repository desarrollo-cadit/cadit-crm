import { describe, expect, it } from "vitest";
import {
  MAX_SIGUIENTES,
  proximoGrupoAbierto,
  sugerenciasDeRecompra,
  validarSiguientes,
} from "@/lib/rutas-de-cursos";
import type { EstadoComercial } from "@/lib/recorrido-comercial";

/**
 * 046 (T014; US2, FR-005) — Las rutas entre cursos: qué se puede guardar.
 */

const cursos = new Map([
  ["arq", { kind: "curso" as const }],
  ["mep", { kind: "curso" as const }],
  ["est", { kind: "curso" as const }],
  ["tal", { kind: "taller" as const }],
]);

describe("validarSiguientes", () => {
  it("acepta una lista ordenada y la devuelve en el mismo orden", () => {
    expect(validarSiguientes("arq", ["mep", "est"], cursos)).toEqual({ ok: true, ids: ["mep", "est"] });
  });

  it("acepta la lista vacía (sin siguientes)", () => {
    expect(validarSiguientes("arq", [], cursos)).toEqual({ ok: true, ids: [] });
  });

  it("un curso no puede seguirse a sí mismo", () => {
    expect(validarSiguientes("arq", ["mep", "arq"], cursos)).toEqual({
      ok: false,
      code: "invalid_body",
      message: "Un curso no puede seguirse a sí mismo.",
    });
  });

  it("rechaza repetidos", () => {
    expect(validarSiguientes("arq", ["mep", "mep"], cursos)).toMatchObject({
      ok: false,
      message: "Hay un curso repetido en la lista.",
    });
  });

  it("rechaza cursos que no existen en la organización", () => {
    expect(validarSiguientes("arq", ["ajeno"], cursos)).toMatchObject({
      ok: false,
      code: "invalid_body",
      message: "Alguno de los cursos elegidos no existe.",
    });
  });

  it("el origen ajeno o inexistente es not_found", () => {
    expect(validarSiguientes("ajeno", ["mep"], cursos)).toMatchObject({ ok: false, code: "not_found" });
  });

  it("los talleres no forman parte de las rutas, ni de origen ni de destino", () => {
    const msg = "Los talleres no forman parte de las rutas entre cursos.";
    expect(validarSiguientes("arq", ["tal"], cursos)).toMatchObject({ ok: false, message: msg });
    expect(validarSiguientes("tal", ["arq"], cursos)).toMatchObject({ ok: false, message: msg });
  });

  it("los ciclos se permiten: cada sugerencia descarta lo ya hecho", () => {
    expect(validarSiguientes("mep", ["arq"], cursos)).toMatchObject({ ok: true });
  });

  it(`a lo sumo ${MAX_SIGUIENTES} siguientes`, () => {
    const muchos = new Map(Array.from({ length: 30 }, (_, i) => [`c${i}`, { kind: "curso" as const }]));
    const ids = Array.from({ length: MAX_SIGUIENTES + 1 }, (_, i) => `c${i + 1}`);
    expect(validarSiguientes("c0", ids, muchos)).toMatchObject({ ok: false, code: "invalid_body" });
  });
});

/* ============================================================
 * 046 (T020; US3, FR-007) — "Le podría interesar"
 * ============================================================ */


const CATALOGO = new Map([
  ["arq", { name: "Revit Arquitectura", published: true, kind: "curso" as const }],
  ["mep", { name: "Revit MEP", published: true, kind: "curso" as const }],
  ["est", { name: "Revit Estructura", published: true, kind: "curso" as const }],
  ["viejo", { name: "AutoCAD 2010", published: false, kind: "curso" as const }],
  ["nav", { name: "Navisworks", published: true, kind: "curso" as const }],
]);

const entrada = (courseId: string, estado: EstadoComercial) => ({ courseId, courseName: CATALOGO.get(courseId)?.name ?? courseId, estado });

describe("sugerenciasDeRecompra", () => {
  const rutas = new Map([
    ["arq", ["mep", "est"]],
    ["mep", ["nav", "arq"]],
  ]);
  const grupoMep = { cohortId: "coh_mep", name: "Revit MEP — Noviembre", startDate: "2026-11-10" };
  const proximos = new Map([["mep", grupoMep]]);

  it("aprobó Arquitectura → MEP y Estructura, en el orden de la ruta, con el próximo grupo", () => {
    expect(sugerenciasDeRecompra([entrada("arq", "aprobo")], rutas, CATALOGO, proximos)).toEqual([
      { courseId: "mep", courseName: "Revit MEP", porCursos: ["Revit Arquitectura"], proximoGrupo: grupoMep },
      { courseId: "est", courseName: "Revit Estructura", porCursos: ["Revit Arquitectura"], proximoGrupo: null },
    ]);
  });

  it("lo ya inscripto (por empezar) o hecho no se sugiere", () => {
    const s = sugerenciasDeRecompra([entrada("arq", "aprobo"), entrada("est", "por_empezar")], rutas, CATALOGO, proximos);
    expect(s.map((x) => x.courseId)).toEqual(["mep"]);
  });

  it("sin repetidos: un curso sugerido por dos orígenes figura una vez, con los dos", () => {
    const r = new Map([
      ["arq", ["nav"]],
      ["mep", ["nav"]],
    ]);
    const s = sugerenciasDeRecompra([entrada("mep", "en_curso"), entrada("arq", "aprobo")], r, CATALOGO, new Map());
    expect(s).toEqual([
      { courseId: "nav", courseName: "Navisworks", porCursos: ["Revit MEP", "Revit Arquitectura"], proximoGrupo: null },
    ]);
  });

  it("un curso que no se publica no se sugiere", () => {
    const r = new Map([["arq", ["viejo", "mep"]]]);
    expect(sugerenciasDeRecompra([entrada("arq", "aprobo")], r, CATALOGO, new Map()).map((x) => x.courseId)).toEqual([
      "mep",
    ]);
  });

  it("solo sugiere desde lo cursado: estar inscripto por empezar no abre la ruta", () => {
    expect(sugerenciasDeRecompra([entrada("arq", "por_empezar")], rutas, CATALOGO, proximos)).toEqual([]);
  });

  it("los ciclos no rompen: A → B → A descarta A porque ya la hizo", () => {
    const s = sugerenciasDeRecompra([entrada("mep", "aprobo"), entrada("arq", "aprobo")], rutas, CATALOGO, new Map());
    expect(s.map((x) => x.courseId)).toEqual(["nav", "est"]);
  });

  it("sin rutas o sin cursos, nada (y sin error)", () => {
    expect(sugerenciasDeRecompra([entrada("nav", "aprobo")], rutas, CATALOGO, new Map())).toEqual([]);
    expect(sugerenciasDeRecompra([], rutas, CATALOGO, new Map())).toEqual([]);
  });
});

describe("proximoGrupoAbierto", () => {
  const NOW = new Date("2026-10-23T12:00:00Z");
  const g = (id: string, start: string, p: { parentCohortId?: string | null; end?: string } = {}) => ({
    id,
    name: id,
    courseName: "Revit MEP",
    startDate: new Date(start),
    endDate: p.end ? new Date(p.end) : null,
    parentCohortId: p.parentCohortId ?? null,
  });

  it("el primer grupo que todavía no empezó, sin módulos de especialización", () => {
    expect(
      proximoGrupoAbierto(
        [g("dic", "2026-12-01"), g("mod", "2026-11-01", { parentCohortId: "x" }), g("nov", "2026-11-15"), g("ya", "2026-10-01", { end: "2026-12-01" })],
        NOW
      )
    ).toEqual({ cohortId: "nov", name: "Revit MEP — nov", startDate: "2026-11-15" });
  });

  it("sin grupos abiertos → null", () => {
    expect(proximoGrupoAbierto([g("ya", "2026-01-01", { end: "2026-03-01" })], NOW)).toBeNull();
  });
});

describe("sugerenciasDeRecompra — cursada histórica (046 US6)", () => {
  it("una cursada histórica abre la ruta como cualquier cursada", () => {
    const r = new Map([["arq", ["mep"]]]);
    expect(
      sugerenciasDeRecompra([entrada("arq", "curso_historico")], r, CATALOGO, new Map()).map((x) => x.courseId)
    ).toEqual(["mep"]);
  });
});
