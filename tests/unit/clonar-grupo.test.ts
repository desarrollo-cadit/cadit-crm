import { describe, expect, it } from "vitest";
import {
  claseSugerida,
  etiquetaDeClaseDeOrigen,
  correrInstante,
  diasEntre,
  fechasSugeridas,
  modulosSugeridos,
  nombreDeModuloSugerido,
  nombreSugerido,
  planDeFechasDeGrupo,
  sumarDias,
  validarFechasDelClon,
} from "@/lib/clonar-grupo";

const TZ = "America/Montevideo";

describe("clonar grupo: aritmética de días", () => {
  it("cuenta días a través de meses y años", () => {
    expect(diasEntre("2026-01-31", "2026-03-01")).toBe(29);
    expect(diasEntre("2025-12-20", "2026-01-10")).toBe(21);
    expect(diasEntre("2026-03-10", "2026-03-01")).toBe(-9);
  });

  it("suma días sin depender de la zona ni del cambio de hora", () => {
    expect(sumarDias("2026-01-31", 29)).toBe("2026-03-01");
    expect(sumarDias("2028-02-28", 1)).toBe("2028-02-29");
    // Semana del cambio de hora en EE.UU. (8 de marzo de 2026): sigue siendo un día por día.
    expect(sumarDias("2026-03-07", 2)).toBe("2026-03-09");
  });
});

describe("clonar grupo: nombres sugeridos", () => {
  it("cambia el año por el del nuevo inicio", () => {
    expect(nombreSugerido("Revit 2025 · Noche", "2026-03-02")).toBe("Revit 2026 · Noche");
  });
  it("sin año, lo agrega", () => {
    expect(nombreSugerido("Revit avanzado", "2026-03-02")).toBe("Revit avanzado 2026");
  });
  it("un módulo sin año queda igual", () => {
    expect(nombreDeModuloSugerido("Módulo 1", "2026-03-02")).toBe("Módulo 1");
    expect(nombreDeModuloSugerido("BIM 2025 I", "2026-03-02")).toBe("BIM 2026 I");
  });
});

describe("clonar grupo: fechas sugeridas", () => {
  it("corre el fin lo mismo que el inicio", () => {
    expect(
      fechasSugeridas({ startDate: "2025-08-04", endDate: "2025-11-28" }, "2026-03-02")
    ).toEqual({ startDate: "2026-03-02", endDate: "2026-06-26", deliveryDeadline: null });
  });
  it("sin fin, sigue sin fin", () => {
    expect(fechasSugeridas({ startDate: "2025-08-04", endDate: null }, "2026-03-02").endDate).toBeNull();
  });
  it("los módulos se corren con el corrimiento del PROGRAMA", () => {
    const sugeridos = modulosSugeridos(
      "2025-03-03",
      [
        { id: "m1", name: "Módulo 1", startDate: "2025-03-03", endDate: "2025-04-30" },
        { id: "m2", name: "Módulo 2", startDate: "2025-05-05", endDate: null },
      ],
      "2026-03-02"
    );
    expect(sugeridos).toEqual([
      { sourceCohortId: "m1", name: "Módulo 1", startDate: "2026-03-02", endDate: "2026-04-29" },
      { sourceCohortId: "m2", name: "Módulo 2", startDate: "2026-05-04", endDate: null },
    ]);
  });
});

describe("clonar grupo: validación de fechas", () => {
  const modulos = [
    { id: "m1", name: "Módulo 1" },
    { id: "m2", name: "Módulo 2" },
  ];
  const base = { startDate: "2026-03-02", endDate: "2026-09-30" };

  it("bloquea un fin anterior al inicio", () => {
    const r = validarFechasDelClon({ startDate: "2026-03-02", endDate: "2026-03-01", modules: [] }, []);
    expect(r.ok).toBe(false);
  });

  it("exige las fechas de TODOS los módulos, y ninguno ajeno", () => {
    expect(
      validarFechasDelClon(
        { ...base, modules: [{ sourceCohortId: "m1", startDate: "2026-03-02", endDate: null }] },
        modulos
      )
    ).toEqual({ ok: false, message: "Faltan las fechas del módulo «Módulo 2»." });
    expect(
      validarFechasDelClon(
        { ...base, modules: [{ sourceCohortId: "otro", startDate: "2026-03-02", endDate: null }] },
        modulos
      ).ok
    ).toBe(false);
  });

  it("bloquea un módulo que termina antes de empezar", () => {
    const r = validarFechasDelClon(
      {
        ...base,
        modules: [
          { sourceCohortId: "m1", startDate: "2026-03-02", endDate: "2026-04-30" },
          { sourceCohortId: "m2", startDate: "2026-06-01", endDate: "2026-05-01" },
        ],
      },
      modulos
    );
    expect(r).toEqual({
      ok: false,
      message: "En «Módulo 2», la fecha de fin tiene que ser igual o posterior al inicio.",
    });
  });

  it("un módulo fuera del programa es aviso, no bloqueo", () => {
    const r = validarFechasDelClon(
      {
        ...base,
        modules: [
          { sourceCohortId: "m1", startDate: "2026-03-02", endDate: "2026-04-30" },
          { sourceCohortId: "m2", startDate: "2026-09-01", endDate: "2026-10-15" },
        ],
      },
      modulos
    );
    expect(r).toEqual({ ok: true, avisos: ["El módulo «Módulo 2» queda fuera de las fechas del programa."] });
  });
});

describe("clonar grupo: entrega final y plazos", () => {
  it("corre un plazo conservando la hora local de la academia", () => {
    // 23:59 del 10/11/2025 en Montevideo (UTC-3) = 02:59Z del 11/11.
    const corrido = correrInstante("2025-11-11T02:59:00.000Z", 210, TZ);
    expect(corrido).toBe("2026-06-09T02:59:00.000Z");
  });

  it("conserva la hora local aunque la zona cambie de horario en el medio", () => {
    // Nueva York: 18:00 del 1/3/2026 (EST, UTC-5) → 18:00 del 15/3/2026 (EDT, UTC-4).
    expect(correrInstante("2026-03-01T23:00:00.000Z", 14, "America/New_York")).toBe(
      "2026-03-15T22:00:00.000Z"
    );
  });

  it("corre la entrega final y los plazos; sin plazo queda sin plazo", () => {
    const plan = planDeFechasDeGrupo(
      {
        startDate: "2025-08-04",
        deliveryDeadline: "2025-12-15",
        assessments: [
          { id: "a1", name: "TP 1", dueAt: "2025-09-01T02:59:00.000Z" },
          { id: "a2", name: "Final", dueAt: null },
        ],
      },
      { startDate: "2026-03-02", endDate: "2026-06-26" },
      TZ
    );
    expect(plan.deliveryDeadline).toBe("2026-07-13");
    expect(plan.plazos.get("a1")).toBe("2026-03-30T02:59:00.000Z");
    expect(plan.plazos.get("a2")).toBeNull();
    expect(plan.avisos).toEqual([]);
  });

  it("una entrega final que quedó antes del fin se deja vacía, con aviso", () => {
    const plan = planDeFechasDeGrupo(
      { startDate: "2025-08-04", deliveryDeadline: "2025-12-15", assessments: [] },
      // La persona estiró el fin más allá de la entrega corrida.
      { startDate: "2026-03-02", endDate: "2026-08-31" },
      TZ
    );
    expect(plan.deliveryDeadline).toBeNull();
    expect(plan.avisos).toHaveLength(1);
    expect(plan.avisos[0]).toContain("entrega final");
  });

  it("un plazo que pasa la entrega final se deja vacío, con aviso", () => {
    const plan = planDeFechasDeGrupo(
      {
        startDate: "2025-08-04",
        deliveryDeadline: "2025-12-15",
        // Un plazo viejo que ya pasaba la entrega final (cargado antes de la regla).
        assessments: [{ id: "a1", name: "TP tardío", dueAt: "2025-12-20T02:59:00.000Z" }],
      },
      { startDate: "2026-03-02", endDate: "2026-06-26" },
      TZ,
      "Módulo 2"
    );
    expect(plan.plazos.get("a1")).toBeNull();
    expect(plan.avisos).toEqual(["El plazo de «TP tardío» (Módulo 2) quedó sin fecha: pasaba la entrega final."]);
  });

  it("sin entrega final, los plazos solo se corren", () => {
    const plan = planDeFechasDeGrupo(
      {
        startDate: "2025-08-04",
        deliveryDeadline: null,
        assessments: [{ id: "a1", name: "TP", dueAt: "2025-12-20T02:59:00.000Z" }],
      },
      { startDate: "2025-08-11", endDate: null },
      TZ
    );
    expect(plan.deliveryDeadline).toBeNull();
    expect(plan.plazos.get("a1")).toBe("2025-12-27T02:59:00.000Z");
  });
});

describe("clonar grupo: material de las clases del original", () => {
  it("la etiqueta recuerda número, día y tema de la clase", () => {
    expect(etiquetaDeClaseDeOrigen({ number: 3, date: "2025-03-12", topic: " Muros " })).toBe(
      "Clase 3 · 12/03 · Muros"
    );
    expect(etiquetaDeClaseDeOrigen({ number: 1, date: "2025-03-05", topic: null })).toBe("Clase 1 · 05/03");
  });

  it("sugiere la clase del mismo número, salvo que esté cancelada", () => {
    const clases = [
      { id: "c1", number: 1, canceled: false },
      { id: "c3", number: 3, canceled: false },
      { id: "c4", number: 4, canceled: true },
    ];
    expect(claseSugerida(3, clases)).toBe("c3");
    expect(claseSugerida(4, clases)).toBeNull();
    expect(claseSugerida(9, clases)).toBeNull();
    expect(claseSugerida(null, clases)).toBeNull();
  });
});

describe("clonar grupo: entrega final sugerida en el formulario", () => {
  it("corre la entrega final con el inicio", () => {
    expect(
      fechasSugeridas(
        { startDate: "2025-08-04", endDate: "2025-11-28", deliveryDeadline: "2025-12-15" },
        "2026-03-02"
      )
    ).toEqual({ startDate: "2026-03-02", endDate: "2026-06-26", deliveryDeadline: "2026-07-13" });
  });

  it("una entrega final elegida a mano no se corre: se respeta", () => {
    const plan = planDeFechasDeGrupo(
      { startDate: "2025-08-04", deliveryDeadline: "2025-12-15", assessments: [] },
      { startDate: "2026-03-02", endDate: "2026-06-26", deliveryDeadline: "2026-08-01" },
      TZ
    );
    expect(plan.deliveryDeadline).toBe("2026-08-01");
    expect(plan.avisos).toEqual([]);
  });
});
