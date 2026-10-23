import { describe, expect, it } from "vitest";
import type { EntradaDeHistorial } from "@/lib/recorrido-comercial";
import {
  OTROS,
  SIN_VENDEDOR,
  alumnosPorPeriodo,
  comprasDelPeriodo,
  cursosMasCursados,
  embudoPorOrigen,
  empresasQueMasCapacitan,
  empresasVsParticulares,
  evolucionPorCurso,
  ingresosPorCurso,
  origenDeContacto,
  recompraResumen,
  ventasPorAnio,
  ventasPorVendedor,
  type ContextoDeReportes,
} from "@/lib/reportes";

/**
 * 046 US8 (T070; FR-027…FR-030) — Las agregaciones de los reportes, PURAS,
 * sobre los historiales de la derivación única. Datos inventados.
 */

function compra(courseId: string, fecha: string, p: Partial<EntradaDeHistorial> = {}): EntradaDeHistorial {
  const d = new Date(`${fecha}T00:00:00Z`);
  return {
    courseId,
    courseName: courseId.toUpperCase(),
    categoryId: null,
    estado: "aprobo",
    sinResultado: false,
    cohortId: "g",
    cohortName: "g",
    startDate: d,
    endDate: null,
    primerInicio: d,
    ultimoInicioCursado: d,
    veces: 1,
    activo: false,
    sellerId: null,
    companyId: null,
    especializacion: null,
    ...p,
  };
}

const CTX: ContextoDeReportes = {
  cursosGratuitos: new Set(["gratis"]),
  empresasExcluidas: new Set(["emp_x"]),
  vendedores: new Map([
    ["sel_a", "Ana"],
    ["sel_b", "Bruno"],
  ]),
  empresas: new Map([
    ["emp_1", "Constructora Uno"],
    ["emp_2", "Estudio Dos"],
    ["emp_x", "Convenio Excluido"],
  ]),
};

const TODO = { desde: null, hastaExclusivo: null, etiqueta: { desde: null, hasta: null } };

const historiales = new Map<string, EntradaDeHistorial[]>([
  ["p1", [compra("arq", "2021-03-01", { sellerId: "sel_a", companyId: "emp_1" }), compra("mep", "2022-05-01", { sellerId: "sel_a" })]],
  ["p2", [compra("arq", "2021-08-01", { sellerId: "sel_b" }), compra("gratis", "2021-09-01")]],
  ["p3", [compra("arq", "2022-02-01", { companyId: "emp_2" })]],
  ["p4", [compra("arq", "2022-02-01", { companyId: "emp_x", sellerId: "sel_a" })]],
  ["p5", [compra("est", "2023-11-01", { companyId: "emp_1" })]],
]);

describe("comprasDelPeriodo", () => {
  it("deja afuera las empresas excluidas y filtra por el primer inicio", () => {
    const todas = comprasDelPeriodo(historiales, TODO, CTX);
    expect(todas.some((c) => c.contactId === "p4")).toBe(false);
    expect(todas).toHaveLength(6);
    const de2022 = comprasDelPeriodo(
      historiales,
      { desde: new Date("2022-01-01T00:00:00Z"), hastaExclusivo: new Date("2023-01-01T00:00:00Z"), etiqueta: { desde: "2022-01-01", hasta: "2022-12-31" } },
      CTX
    );
    expect(de2022.map((c) => c.contactId).sort()).toEqual(["p1", "p3"]);
  });
});

const compras = comprasDelPeriodo(historiales, TODO, CTX);

describe("cursosMasCursados", () => {
  it("cuenta cursadas por curso, sin gratuitos salvo que se pidan", () => {
    expect(cursosMasCursados(compras, CTX, { incluirGratuitos: false })).toEqual([
      { label: "ARQ", cursadas: 3 },
      { label: "EST", cursadas: 1 },
      { label: "MEP", cursadas: 1 },
    ]);
    expect(cursosMasCursados(compras, CTX, { incluirGratuitos: true }).map((c) => c.label)).toContain("GRATIS");
  });

  it("top 10 y el resto en «Otros»", () => {
    const muchas = new Map(
      Array.from({ length: 13 }, (_, i) => [`x${i}`, [compra(`c${String(i).padStart(2, "0")}`, "2021-01-01")]] as const)
    );
    const r = cursosMasCursados(comprasDelPeriodo(muchas, TODO, CTX), CTX, { incluirGratuitos: false });
    expect(r).toHaveLength(11);
    expect(r[10]).toEqual({ label: OTROS, cursadas: 3 });
  });
});

describe("alumnosPorPeriodo", () => {
  it("personas distintas por año y por trimestre", () => {
    const r = alumnosPorPeriodo(compras);
    expect(r.porAnio).toEqual([
      { periodo: "2021", alumnos: 2 },
      { periodo: "2022", alumnos: 2 },
      { periodo: "2023", alumnos: 1 },
    ]);
    expect(r.porTrimestre[0]).toEqual({ periodo: "2021-T1", alumnos: 1 });
    expect(r.porTrimestre.find((t) => t.periodo === "2021-T3")).toEqual({ periodo: "2021-T3", alumnos: 1 });
  });
});

describe("empresasQueMasCapacitan", () => {
  it("cursadas con empresa, top 10, sin las excluidas", () => {
    expect(empresasQueMasCapacitan(compras, CTX)).toEqual([
      { companyId: "emp_1", nombre: "Constructora Uno", cursadas: 2 },
      { companyId: "emp_2", nombre: "Estudio Dos", cursadas: 1 },
    ]);
  });
});

describe("ventas (sin gratuitos)", () => {
  it("por año", () => {
    expect(ventasPorAnio(compras, CTX)).toEqual([
      { anio: "2021", ventas: 2 },
      { anio: "2022", ventas: 2 },
      { anio: "2023", ventas: 1 },
    ]);
  });

  it("por vendedor y año, con «Sin vendedor»", () => {
    expect(ventasPorVendedor(compras, CTX)).toEqual([
      { vendedor: "Ana", porAnio: { "2021": 1, "2022": 1 }, total: 2 },
      { vendedor: SIN_VENDEDOR, porAnio: { "2022": 1, "2023": 1 }, total: 2 },
      { vendedor: "Bruno", porAnio: { "2021": 1 }, total: 1 },
    ]);
  });

  it("empresas vs particulares por año", () => {
    expect(empresasVsParticulares(compras, CTX)).toEqual([
      { anio: "2021", empresa: 1, particular: 1 },
      { anio: "2022", empresa: 1, particular: 1 },
      { anio: "2023", empresa: 1, particular: 0 },
    ]);
  });
});

describe("evolucionPorCurso", () => {
  it("cursadas por año de cada curso, el más cursado primero, y los 5 primeros", () => {
    const r = evolucionPorCurso(compras, CTX);
    expect(r.anios).toEqual(["2021", "2022", "2023"]);
    expect(r.cursos[0]).toEqual({ courseId: "arq", label: "ARQ", total: 3, porAnio: { "2021": 2, "2022": 1 } });
    expect(r.top).toEqual(r.cursos.slice(0, 5).map((c) => c.courseId));
    expect(r.cursos.some((c) => c.courseId === "gratis")).toBe(false);
  });
});

describe("embudoPorOrigen", () => {
  it("origen del contacto", () => {
    expect(origenDeContacto("formulario:Taller Dynamo")).toBe("Taller");
    expect(origenDeContacto("formulario:Landing Revit")).toBe("Formulario: Landing Revit");
    expect(origenDeContacto("whatsapp")).toBe("WhatsApp");
    expect(origenDeContacto("importacion:planilla-2020-2024")).toBe("Importación");
    expect(origenDeContacto(null)).toBe("Carga manual");
  });

  it("leads creados en el período → inscriptos (tipo distinto de lead) y conversión", () => {
    const r = embudoPorOrigen(
      [
        { id: "a", source: "whatsapp", createdAt: new Date("2025-01-01") },
        { id: "b", source: "whatsapp", createdAt: new Date("2025-01-02") },
        { id: "c", source: "formulario:Landing", createdAt: new Date("2025-01-03") },
        { id: "viejo", source: "whatsapp", createdAt: new Date("2019-01-01") },
      ],
      (id) => (id === "a" ? "exalumno" : "lead"),
      { desde: new Date("2024-01-01T00:00:00Z"), hastaExclusivo: null, etiqueta: { desde: "2024-01-01", hasta: null } }
    );
    expect(r).toEqual([
      { origen: "WhatsApp", leads: 2, inscriptos: 1, conversion: 50 },
      { origen: "Formulario: Landing", leads: 1, inscriptos: 0, conversion: 0 },
    ]);
  });

  /**
   * 2026-10-23 — Un contacto importado (`importacion:…`) se crea el día de la
   * importación, pero no es un interesado que llegó ese día: son exalumnos
   * de años anteriores. Contarlos como leads del período inflaría el embudo
   * con miles de "altas" de un solo día.
   */
  it("los contactos importados no son leads del embudo", () => {
    const r = embudoPorOrigen(
      [
        { id: "a", source: "whatsapp", createdAt: new Date("2025-01-01") },
        { id: "imp1", source: "importacion:planilla-2020-2024", createdAt: new Date("2025-01-02") },
        { id: "imp2", source: "importacion:planilla-2020-2024", createdAt: new Date("2025-01-02") },
      ],
      () => "exalumno",
      { desde: new Date("2024-01-01T00:00:00Z"), hastaExclusivo: null, etiqueta: { desde: "2024-01-01", hasta: null } }
    );
    expect(r).toEqual([{ origen: "WhatsApp", leads: 1, inscriptos: 1, conversion: 100 }]);
  });
});

describe("recompraResumen", () => {
  it("la tasa y los 5 pares de Recompra, sin las empresas excluidas", () => {
    const r = recompraResumen(historiales, TODO, CTX);
    expect(r.personas).toBe(4);
    expect(r.recompraron).toBe(2);
    expect(r.tasa).toBe(50);
    expect(r.pares).toEqual([
      { fromName: "ARQ", toName: "GRATIS", personas: 1 },
      { fromName: "ARQ", toName: "MEP", personas: 1 },
    ]);
  });
});

describe("ingresosPorCurso", () => {
  it("por moneda, el que más cobró primero, top 10", () => {
    expect(
      ingresosPorCurso([
        { courseName: "ARQ", currency: "UYU", amount: 100 },
        { courseName: "MEP", currency: "UYU", amount: 300 },
        { courseName: "ARQ", currency: "UYU", amount: 50 },
        { courseName: "ARQ", currency: "USD", amount: 10 },
      ])
    ).toEqual([
      {
        currency: "UYU",
        cursos: [
          { label: "MEP", cobrado: 300 },
          { label: "ARQ", cobrado: 150 },
        ],
      },
      { currency: "USD", cursos: [{ label: "ARQ", cobrado: 10 }] },
    ]);
  });
});
