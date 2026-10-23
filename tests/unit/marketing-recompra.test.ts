import { describe, expect, it } from "vitest";
import { metricasDeRecompra, periodoDeRecompra } from "@/lib/marketing/recompra";
import type { EntradaDeHistorial } from "@/lib/recorrido-comercial";

/**
 * 046 (T031; US5, FR-011) — Las métricas de recompra coinciden con el cálculo
 * a mano.
 */

function compra(courseId: string, inicio: string): EntradaDeHistorial {
  const d = new Date(`${inicio}T00:00:00Z`);
  return {
    courseId,
    courseName: { arq: "Revit Arquitectura", mep: "Revit MEP", est: "Revit Estructura" }[courseId] ?? courseId,
    categoryId: null,
    estado: "aprobo",
    sinResultado: false,
    cohortId: `g_${courseId}`,
    cohortName: "g",
    startDate: d,
    endDate: null,
    primerInicio: d,
    ultimoInicioCursado: d,
    veces: 1,
    especializacion: null,
  };
}

/** 100 personas con Arquitectura en 2025; 20 siguen a MEP a los 30 días y 10 a Estructura a los 60. */
function historiales(): Map<string, EntradaDeHistorial[]> {
  const m = new Map<string, EntradaDeHistorial[]>();
  for (let i = 0; i < 100; i++) {
    const h = [compra("arq", "2025-03-01")];
    if (i < 20) h.unshift(compra("mep", "2025-03-31"));
    else if (i < 30) h.unshift(compra("est", "2025-04-30"));
    m.set(`ct${i}`, h); // el historial llega más reciente primero
  }
  return m;
}

const todo = { desde: null, hastaExclusivo: null, etiqueta: { desde: null, hasta: null } };

describe("metricasDeRecompra", () => {
  it("100 personas, 30 con dos o más → 30 % (US5-1)", () => {
    const r = metricasDeRecompra(historiales(), todo);
    expect(r.personas).toBe(100);
    expect(r.recompraron).toBe(30);
    expect(r.tasa).toBe(30);
  });

  it("tiempo promedio entre cursos: (20×30 + 10×60) / 30 = 40 días", () => {
    const r = metricasDeRecompra(historiales(), todo);
    expect(r.diasPromedioEntreCursos).toBe(40);
    expect(r.paresMedidos).toBe(30);
  });

  it("pares curso → curso siguiente, contados por persona, más frecuentes primero", () => {
    expect(metricasDeRecompra(historiales(), todo).pares).toEqual([
      { fromCourseId: "arq", fromName: "Revit Arquitectura", toCourseId: "mep", toName: "Revit MEP", personas: 20 },
      { fromCourseId: "arq", fromName: "Revit Arquitectura", toCourseId: "est", toName: "Revit Estructura", personas: 10 },
    ]);
  });

  it("el período recalcula: solo abril cuenta las compras que empiezan en abril (US5-2)", () => {
    const abril = {
      desde: new Date("2025-04-01T03:00:00Z"),
      hastaExclusivo: new Date("2025-05-01T03:00:00Z"),
      etiqueta: { desde: "2025-04-01", hasta: "2025-04-30" },
    };
    const r = metricasDeRecompra(historiales(), abril);
    expect(r.personas).toBe(10);
    expect(r.recompraron).toBe(10);
    expect(r.tasa).toBe(100);
    expect(r.diasPromedioEntreCursos).toBe(60);
    expect(r.periodo).toEqual({ desde: "2025-04-01", hasta: "2025-04-30" });
  });

  it("sin nadie: tasa 0 y sin promedio, sin dividir por cero", () => {
    expect(metricasDeRecompra(new Map(), todo)).toMatchObject({
      personas: 0,
      recompraron: 0,
      tasa: 0,
      diasPromedioEntreCursos: null,
      pares: [],
    });
  });

  it("a lo sumo 10 pares", () => {
    const m = new Map<string, EntradaDeHistorial[]>();
    for (let i = 0; i < 12; i++) m.set(`ct${i}`, [compra(`c${i}`, "2025-02-01"), compra("base", "2025-01-01")]);
    expect(metricasDeRecompra(m, todo).pares).toHaveLength(10);
  });
});

describe("periodoDeRecompra", () => {
  it("sin fechas = todo", () => {
    expect(periodoDeRecompra(null, null, "America/Montevideo")).toEqual({ ok: true, periodo: todo });
  });

  it("días en la zona de la organización, el último entero", () => {
    const r = periodoDeRecompra("2025-04-01", "2025-04-30", "America/Montevideo");
    expect(r.ok && r.periodo.desde?.toISOString()).toBe("2025-04-01T03:00:00.000Z");
    expect(r.ok && r.periodo.hastaExclusivo?.toISOString()).toBe("2025-05-01T03:00:00.000Z");
  });

  it("rechaza fechas inválidas o invertidas", () => {
    expect(periodoDeRecompra("2025-02-30", null, "UTC").ok).toBe(false);
    expect(periodoDeRecompra("abril", null, "UTC").ok).toBe(false);
    expect(periodoDeRecompra("2025-05-01", "2025-04-01", "UTC").ok).toBe(false);
  });
});
