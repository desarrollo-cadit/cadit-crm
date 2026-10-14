import { describe, expect, it } from "vitest";
import {
  admiteAtajo,
  aproboConNota,
  completarIds,
  leerPlantilla,
  modoDeCorreccion,
  notaDeCorreccion,
  plantillaDe,
  plantillaCongelada,
  validarCorreccion,
  validarPlantilla,
  type Template,
} from "@/lib/grading-template";

/**
 * 031 (T002, DV-007) — La plantilla de corrección y la corrección, en puro.
 *
 * Es la lógica con más bordes del ciclo —un puntaje sobre el máximo, un
 * ejercicio sin cargar, una nota justo en el mínimo— y la que decide si un
 * alumno aprobó. Probarla no debería necesitar una base.
 */

const PASS_FAIL: Template = {
  scale: "pass_fail",
  minScore: null,
  requiresApproval: false,
  criteria: [],
  textFields: [],
};

const NUMERICA: Template = {
  scale: "numeric",
  minScore: 60,
  requiresApproval: false,
  criteria: [
    { id: "c1", name: "Ejercicio 1", maxPoints: 40 },
    { id: "c2", name: "Ejercicio 2", maxPoints: 30 },
    { id: "c3", name: "Ejercicio 3", maxPoints: 30 },
  ],
  textFields: [
    { id: "f1", name: "Fortalezas", required: true },
    { id: "f2", name: "A mejorar", required: false },
  ],
};

const NUMERICA_DIRECTA: Template = { ...NUMERICA, criteria: [], textFields: [] };

describe("validarPlantilla", () => {
  it("acepta aprobado/no aprobado sin mínimo ni ejercicios", () => {
    expect(validarPlantilla(PASS_FAIL)).toEqual({ ok: true });
  });

  it("acepta numérica 40/30/30 con mínimo y campos de texto", () => {
    expect(validarPlantilla(NUMERICA)).toEqual({ ok: true });
  });

  it("acepta numérica sin ejercicios (la nota se carga directa)", () => {
    expect(validarPlantilla(NUMERICA_DIRECTA)).toEqual({ ok: true });
  });

  /** Escenario 2 de US1: dice cuánto suman y cuánto falta. */
  it("rechaza ejercicios que no suman 100 diciendo cuánto falta", () => {
    const r = validarPlantilla({
      ...NUMERICA,
      criteria: [
        { id: "c1", name: "Ejercicio 1", maxPoints: 40 },
        { id: "c2", name: "Ejercicio 2", maxPoints: 50 },
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.mensaje).toContain("90");
      expect(r.mensaje).toContain("faltan 10");
    }
  });

  it("y cuánto sobra", () => {
    const r = validarPlantilla({
      ...NUMERICA,
      criteria: [
        { id: "c1", name: "Ejercicio 1", maxPoints: 60 },
        { id: "c2", name: "Ejercicio 2", maxPoints: 50 },
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.mensaje).toContain("sobran 10");
  });

  it("exige mínimo entre 1 y 100 en numérica", () => {
    expect(validarPlantilla({ ...NUMERICA, minScore: null }).ok).toBe(false);
    expect(validarPlantilla({ ...NUMERICA, minScore: 0 }).ok).toBe(false);
    expect(validarPlantilla({ ...NUMERICA, minScore: 101 }).ok).toBe(false);
    expect(validarPlantilla({ ...NUMERICA, minScore: 100 }).ok).toBe(true);
    expect(validarPlantilla({ ...NUMERICA, minScore: 1 }).ok).toBe(true);
  });

  /** Un mínimo en aprobado/no aprobado sería un número que nadie lee. */
  it("exige mínimo null en aprobado/no aprobado", () => {
    expect(validarPlantilla({ ...PASS_FAIL, minScore: 60 }).ok).toBe(false);
  });

  it("no admite ejercicios en aprobado/no aprobado", () => {
    expect(
      validarPlantilla({ ...PASS_FAIL, criteria: NUMERICA.criteria }).ok
    ).toBe(false);
  });

  it("admite campos de texto en aprobado/no aprobado", () => {
    expect(
      validarPlantilla({ ...PASS_FAIL, textFields: NUMERICA.textFields }).ok
    ).toBe(true);
  });

  it("rechaza ids repetidos", () => {
    const r = validarPlantilla({
      ...NUMERICA,
      criteria: [
        { id: "c1", name: "Ejercicio 1", maxPoints: 50 },
        { id: "c1", name: "Ejercicio 2", maxPoints: 50 },
      ],
    });
    expect(r.ok).toBe(false);
    expect(
      validarPlantilla({
        ...PASS_FAIL,
        textFields: [
          { id: "f1", name: "Uno", required: false },
          { id: "f1", name: "Dos", required: false },
        ],
      }).ok
    ).toBe(false);
  });

  it("rechaza nombres vacíos", () => {
    expect(
      validarPlantilla({
        ...NUMERICA,
        criteria: [
          { id: "c1", name: "   ", maxPoints: 50 },
          { id: "c2", name: "Ejercicio 2", maxPoints: 50 },
        ],
      }).ok
    ).toBe(false);
    expect(
      validarPlantilla({
        ...PASS_FAIL,
        textFields: [{ id: "f1", name: "", required: true }],
      }).ok
    ).toBe(false);
  });
});

describe("completarIds", () => {
  it("genera los ids faltantes y respeta los existentes", () => {
    let n = 0;
    const t = completarIds(
      {
        ...NUMERICA,
        criteria: [
          { id: "c1", name: "Uno", maxPoints: 50 },
          { id: "", name: "Dos", maxPoints: 50 },
        ],
        textFields: [{ id: "", name: "Fortalezas", required: true }],
      },
      () => `nuevo${++n}`
    );
    expect(t.criteria.map((c) => c.id)).toEqual(["c1", "nuevo1"]);
    expect(t.textFields.map((f) => f.id)).toEqual(["nuevo2"]);
  });
});

describe("leerPlantilla", () => {
  /** Escenario 3 de US1: una evaluación vieja se lee como antes. */
  it("una fila sin plantilla es aprobado/no aprobado", () => {
    expect(
      leerPlantilla({
        scale: "pass_fail",
        minScore: null,
        requiresApproval: false,
        criteria: [],
        textFields: [],
      })
    ).toEqual(PASS_FAIL);
  });

  /** Lo que viene de jsonb se valida al leer: basura no rompe la pantalla. */
  it("un jsonb con forma inesperada se lee como lista vacía", () => {
    const t = leerPlantilla({
      scale: "numeric",
      minScore: 60,
      requiresApproval: true,
      criteria: { roto: true },
      textFields: [{ nada: 1 }],
    });
    expect(t.criteria).toEqual([]);
    expect(t.textFields).toEqual([]);
    expect(t.scale).toBe("numeric");
  });
});

describe("notaDeCorreccion", () => {
  it("con ejercicios, la nota es la suma", () => {
    expect(
      notaDeCorreccion(NUMERICA, {
        criterionScores: [
          { criterionId: "c1", points: 35 },
          { criterionId: "c2", points: 20 },
          { criterionId: "c3", points: 25 },
        ],
      })
    ).toBe(80);
  });

  it("con un ejercicio sin puntaje todavía no hay nota", () => {
    expect(
      notaDeCorreccion(NUMERICA, {
        criterionScores: [
          { criterionId: "c1", points: 35 },
          { criterionId: "c2", points: null },
        ],
      })
    ).toBeNull();
  });

  it("sin ejercicios, la nota es la cargada", () => {
    expect(notaDeCorreccion(NUMERICA_DIRECTA, { score: 72 })).toBe(72);
  });

  it("en aprobado/no aprobado no hay nota", () => {
    expect(notaDeCorreccion(PASS_FAIL, { score: 72 })).toBeNull();
  });
});

describe("aproboConNota", () => {
  it("la nota igual al mínimo aprueba", () => {
    expect(aproboConNota(60, 60)).toBe(true);
    expect(aproboConNota(59, 60)).toBe(false);
    expect(aproboConNota(100, 60)).toBe(true);
  });
});

describe("validarCorreccion", () => {
  const completa = {
    criterionScores: [
      { criterionId: "c1", points: 35, comment: "Bien" },
      { criterionId: "c2", points: 20 },
      { criterionId: "c3", points: 25 },
    ],
    textValues: [{ fieldId: "f1", value: "Prolijo" }],
  };

  it("una corrección completa publica con nota y aprobado derivados", () => {
    expect(validarCorreccion(NUMERICA, completa, "publish")).toEqual({
      ok: true,
      score: 80,
      passed: true,
    });
  });

  it("debajo del mínimo queda no aprobada", () => {
    const r = validarCorreccion(
      NUMERICA,
      {
        ...completa,
        criterionScores: [
          { criterionId: "c1", points: 20 },
          { criterionId: "c2", points: 20 },
          { criterionId: "c3", points: 10 },
        ],
      },
      "submit"
    );
    expect(r).toEqual({ ok: true, score: 50, passed: false });
  });

  /** FR-013: el borrador guarda lo que haya. */
  it("en borrador tolera ejercicios y campos faltantes", () => {
    const r = validarCorreccion(
      NUMERICA,
      { criterionScores: [{ criterionId: "c1", points: 35 }] },
      "draft"
    );
    expect(r).toEqual({ ok: true, score: null, passed: null });
  });

  it("enviar o publicar exige todos los ejercicios, con el nombre del que falta", () => {
    for (const modo of ["submit", "publish"] as const) {
      const r = validarCorreccion(
        NUMERICA,
        {
          ...completa,
          criterionScores: [
            { criterionId: "c1", points: 35 },
            { criterionId: "c2", points: null },
            { criterionId: "c3", points: 25 },
          ],
        },
        modo
      );
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.code).toBe("correccion_incompleta");
        expect(r.mensaje).toContain("Ejercicio 2");
      }
    }
  });

  it("enviar o publicar exige los campos de texto obligatorios", () => {
    const r = validarCorreccion(
      NUMERICA,
      { ...completa, textValues: [{ fieldId: "f1", value: "   " }] },
      "publish"
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("correccion_incompleta");
      expect(r.mensaje).toContain("Fortalezas");
    }
  });

  /** Un puntaje imposible no se guarda ni en borrador. */
  it("un puntaje sobre el máximo se rechaza con el nombre del ejercicio", () => {
    for (const modo of ["draft", "publish"] as const) {
      const r = validarCorreccion(
        NUMERICA,
        {
          criterionScores: [{ criterionId: "c2", points: 35 }],
        },
        modo
      );
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.code).toBe("puntaje_fuera_de_rango");
        expect(r.mensaje).toContain("Ejercicio 2");
        expect(r.mensaje).toContain("30");
      }
    }
  });

  it("un puntaje negativo también", () => {
    const r = validarCorreccion(
      NUMERICA,
      { criterionScores: [{ criterionId: "c1", points: -1 }] },
      "draft"
    );
    expect(r.ok).toBe(false);
  });

  it("la nota directa fuera de 1–100 se rechaza", () => {
    for (const score of [0, 101]) {
      const r = validarCorreccion(NUMERICA_DIRECTA, { score }, "draft");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe("puntaje_fuera_de_rango");
    }
    expect(validarCorreccion(NUMERICA_DIRECTA, { score: 60 }, "publish")).toEqual({
      ok: true,
      score: 60,
      passed: true,
    });
  });

  it("numérica directa sin nota no se publica", () => {
    const r = validarCorreccion(NUMERICA_DIRECTA, {}, "publish");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("correccion_incompleta");
  });

  /** FR-010: en numérica `passed` se deriva; lo que mande el cliente no cuenta. */
  it("ignora el `passed` que manda el cliente en numérica", () => {
    const r = validarCorreccion(NUMERICA_DIRECTA, { score: 40, passed: true }, "publish");
    expect(r).toEqual({ ok: true, score: 40, passed: false });
  });

  it("aprobado/no aprobado exige elegir al publicar, no en borrador", () => {
    expect(validarCorreccion(PASS_FAIL, {}, "draft")).toEqual({
      ok: true,
      score: null,
      passed: null,
    });
    const r = validarCorreccion(PASS_FAIL, {}, "publish");
    expect(r.ok).toBe(false);
    expect(validarCorreccion(PASS_FAIL, { passed: false }, "publish")).toEqual({
      ok: true,
      score: null,
      passed: false,
    });
  });

  it("un ejercicio o campo que la plantilla no tiene se rechaza", () => {
    expect(
      validarCorreccion(
        NUMERICA,
        { criterionScores: [{ criterionId: "otro", points: 1 }] },
        "draft"
      ).ok
    ).toBe(false);
    expect(
      validarCorreccion(PASS_FAIL, { textValues: [{ fieldId: "x", value: "a" }] }, "draft").ok
    ).toBe(false);
  });
});

describe("plantillaCongelada (DV-008)", () => {
  it("cambiar la escala congela", () => {
    expect(plantillaCongelada(NUMERICA, { ...NUMERICA, scale: "pass_fail", minScore: null, criteria: [] })).toBe(true);
  });

  it("cambiar el mínimo congela", () => {
    expect(plantillaCongelada(NUMERICA, { ...NUMERICA, minScore: 70 })).toBe(true);
  });

  it("cambiar un máximo o los ejercicios congela", () => {
    expect(
      plantillaCongelada(NUMERICA, {
        ...NUMERICA,
        criteria: [
          { id: "c1", name: "Ejercicio 1", maxPoints: 50 },
          { id: "c2", name: "Ejercicio 2", maxPoints: 20 },
          { id: "c3", name: "Ejercicio 3", maxPoints: 30 },
        ],
      })
    ).toBe(true);
    expect(
      plantillaCongelada(NUMERICA, {
        ...NUMERICA,
        criteria: [
          { id: "c1", name: "Ejercicio 1", maxPoints: 40 },
          { id: "c2", name: "Ejercicio 2", maxPoints: 30 },
          { id: "c9", name: "Ejercicio 3", maxPoints: 30 },
        ],
      })
    ).toBe(true);
  });

  it("renombrar ejercicios y campos, o cambiar requerido/aprobación, no congela", () => {
    expect(
      plantillaCongelada(NUMERICA, {
        ...NUMERICA,
        requiresApproval: true,
        criteria: NUMERICA.criteria.map((c) => ({ ...c, name: `${c.name} (bis)` })),
        textFields: [{ id: "f1", name: "Lo mejor", required: false }],
      })
    ).toBe(false);
  });
});

/**
 * 031 (T019/T022, DV-005/DV-014) — Quién decide el circuito.
 *
 * Son dos preguntas puras que contestan las dos puertas y los tres atajos: si
 * una corrección se PUBLICA o se ENVÍA a aprobación, y si la carga rápida de la
 * celda todavía vale para esta evaluación.
 */
describe("modoDeCorreccion", () => {
  it("sin aprobación requerida, publica cualquiera", () => {
    expect(modoDeCorreccion(PASS_FAIL, false)).toBe("publish");
    expect(modoDeCorreccion(NUMERICA, false)).toBe("publish");
  });

  it("con aprobación requerida, publica solo quien puede aprobar", () => {
    const conAprobacion = { ...NUMERICA, requiresApproval: true };
    expect(modoDeCorreccion(conAprobacion, true)).toBe("publish");
    expect(modoDeCorreccion(conAprobacion, false)).toBe("submit");
  });
});

describe("admiteAtajo", () => {
  it("solo aprobado/no aprobado sin aprobación admite la carga rápida", () => {
    expect(admiteAtajo(PASS_FAIL)).toBe(true);
    expect(admiteAtajo({ ...PASS_FAIL, requiresApproval: true })).toBe(false);
    expect(admiteAtajo(NUMERICA)).toBe(false);
  });
});

describe("plantillaDe", () => {
  it("lo que no trae plantilla es aprobado/no aprobado, como antes de 031", () => {
    expect(plantillaDe({})).toEqual(PASS_FAIL);
  });

  it("respeta lo que trae", () => {
    expect(plantillaDe(NUMERICA)).toEqual(NUMERICA);
  });
});
