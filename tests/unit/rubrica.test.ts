import { describe, expect, it } from "vitest";
import {
  ETIQUETA_DE_NIVEL,
  NIVELES,
  PORCENTAJE_DE_NIVEL,
  completarPuntosDeNivel,
  correctionInputSchema,
  leerPlantilla,
  normalizarPlantilla,
  plantillaCongelada,
  puntosDeNivel,
  templateSchema,
  tieneDescriptores,
  validarCorreccion,
  validarPlantilla,
  type Template,
} from "@/lib/grading-template";

/**
 * 0084 — La rúbrica con niveles FIJOS.
 *
 * Cuatro niveles —Excelente / Bueno / Suficiente / Insuficiente— que valen
 * 100 / 75 / 50 / 0 % del máximo del criterio. Son constantes del módulo puro:
 * no se configuran por evaluación (decisión del dueño). Cada criterio puede
 * llevar una frase por nivel; sin frases, la rúbrica es la lista de siempre.
 */

const RUBRICA: Template = {
  scale: "numeric",
  minScore: 60,
  requiresApproval: false,
  criteria: [
    {
      id: "c1",
      name: "Modelado",
      maxPoints: 40,
      levels: {
        excelente: "Modela todo el edificio sin errores",
        bueno: "Errores menores",
        suficiente: "Faltan elementos",
        insuficiente: "No modela",
      },
    },
    { id: "c2", name: "Planos", maxPoints: 60 },
  ],
  textFields: [],
};

describe("los cuatro niveles son fijos", () => {
  it("son cuatro, en orden, con sus porcentajes y etiquetas", () => {
    expect(NIVELES).toEqual(["excelente", "bueno", "suficiente", "insuficiente"]);
    expect(PORCENTAJE_DE_NIVEL).toEqual({ excelente: 100, bueno: 75, suficiente: 50, insuficiente: 0 });
    expect(ETIQUETA_DE_NIVEL).toEqual({
      excelente: "Excelente",
      bueno: "Bueno",
      suficiente: "Suficiente",
      insuficiente: "Insuficiente",
    });
  });

  it("los puntos de un nivel son su porcentaje del máximo, redondeado al entero más cercano", () => {
    expect(puntosDeNivel("excelente", 40)).toBe(40);
    expect(puntosDeNivel("bueno", 40)).toBe(30);
    expect(puntosDeNivel("suficiente", 40)).toBe(20);
    expect(puntosDeNivel("insuficiente", 40)).toBe(0);
    // 75 % de 10 = 7,5 → 8; 50 % de 15 = 7,5 → 8.
    expect(puntosDeNivel("bueno", 10)).toBe(8);
    expect(puntosDeNivel("suficiente", 15)).toBe(8);
  });
});

describe("la plantilla con descriptores", () => {
  it("valida igual que antes: la suma sigue siendo 100", () => {
    expect(validarPlantilla(RUBRICA)).toEqual({ ok: true });
    const mal = { ...RUBRICA, criteria: [{ ...RUBRICA.criteria[0]!, maxPoints: 30 }, RUBRICA.criteria[1]!] };
    expect(validarPlantilla(mal).ok).toBe(false);
  });

  it("el esquema acepta descriptores opcionales y rechaza un nivel inventado", () => {
    expect(templateSchema.safeParse(RUBRICA).success).toBe(true);
    const inventado = {
      ...RUBRICA,
      criteria: [{ id: "c1", name: "X", maxPoints: 100, levels: { genial: "no" } }],
    };
    expect(templateSchema.safeParse(inventado).success).toBe(false);
  });

  it("un descriptor es UNA línea: con salto de línea no valida", () => {
    const t = {
      ...RUBRICA,
      criteria: [{ ...RUBRICA.criteria[0]!, levels: { bueno: "una\notra" } }, RUBRICA.criteria[1]!],
    };
    const r = validarPlantilla(t);
    expect(r.ok).toBe(false);
  });

  it("un criterio viejo, sin descriptores, se sigue leyendo", () => {
    const t = leerPlantilla({
      scale: "numeric",
      minScore: 60,
      requiresApproval: false,
      criteria: [{ id: "c1", name: "Viejo", maxPoints: 100 }],
      textFields: [],
    });
    expect(t.criteria).toEqual([{ id: "c1", name: "Viejo", maxPoints: 100 }]);
    expect(tieneDescriptores(t)).toBe(false);
  });

  it("leer conserva los descriptores", () => {
    const t = leerPlantilla(RUBRICA);
    expect(t.criteria[0]?.levels?.excelente).toBe("Modela todo el edificio sin errores");
    expect(tieneDescriptores(t)).toBe(true);
  });

  it("normalizar recorta y descarta los descriptores vacíos", () => {
    const t = normalizarPlantilla({
      ...RUBRICA,
      criteria: [
        { id: "c1", name: "A", maxPoints: 50, levels: { excelente: "  Todo  ", bueno: "   " } },
        { id: "c2", name: "B", maxPoints: 50, levels: { bueno: "" } },
      ],
    });
    expect(t.criteria[0]?.levels).toEqual({ excelente: "Todo" });
    expect(t.criteria[1]).not.toHaveProperty("levels");
  });
});

describe("cambiar descriptores después de publicar congela (409 plantilla_congelada)", () => {
  it("cambiar una frase cuenta como cambio de plantilla", () => {
    const nueva: Template = {
      ...RUBRICA,
      criteria: [
        { ...RUBRICA.criteria[0]!, levels: { ...RUBRICA.criteria[0]!.levels, bueno: "Otro texto" } },
        RUBRICA.criteria[1]!,
      ],
    };
    expect(plantillaCongelada(RUBRICA, nueva)).toBe(true);
  });

  it("agregar descriptores a un criterio que no tenía también", () => {
    const nueva: Template = {
      ...RUBRICA,
      criteria: [RUBRICA.criteria[0]!, { ...RUBRICA.criteria[1]!, levels: { excelente: "Nuevo" } }],
    };
    expect(plantillaCongelada(RUBRICA, nueva)).toBe(true);
  });

  it("el mismo texto con espacios distintos o un vacío no es un cambio", () => {
    const nueva: Template = {
      ...RUBRICA,
      criteria: [
        { ...RUBRICA.criteria[0]!, levels: { ...RUBRICA.criteria[0]!.levels, bueno: " Errores menores " } },
        { ...RUBRICA.criteria[1]!, levels: { bueno: "" } },
      ],
    };
    expect(plantillaCongelada(RUBRICA, nueva)).toBe(false);
  });

  it("renombrar el criterio sigue sin congelar", () => {
    const nueva: Template = {
      ...RUBRICA,
      criteria: [{ ...RUBRICA.criteria[0]!, name: "Modelado BIM" }, RUBRICA.criteria[1]!],
    };
    expect(plantillaCongelada(RUBRICA, nueva)).toBe(false);
  });
});

describe("corregir por nivel", () => {
  it("el esquema de la corrección acepta un nivel por criterio", () => {
    const r = correctionInputSchema.safeParse({
      action: "draft",
      criterionScores: [{ criterionId: "c1", points: null, level: "bueno", comment: "Bien" }],
    });
    expect(r.success).toBe(true);
    const mal = correctionInputSchema.safeParse({
      action: "draft",
      criterionScores: [{ criterionId: "c1", points: 3, level: "genial" }],
    });
    expect(mal.success).toBe(false);
  });

  it("un nivel sin puntos toma los puntos del nivel", () => {
    const r = completarPuntosDeNivel(RUBRICA, [
      { criterionId: "c1", points: null, level: "bueno" },
      { criterionId: "c2", points: null, level: null },
    ]);
    expect(r).toEqual([
      { criterionId: "c1", points: 30, level: "bueno" },
      { criterionId: "c2", points: null, level: null },
    ]);
  });

  it("los puntos cargados a mano ganan sobre el nivel (el corrector puede ajustar)", () => {
    const r = completarPuntosDeNivel(RUBRICA, [{ criterionId: "c1", points: 33, level: "bueno" }]);
    expect(r[0]?.points).toBe(33);
  });

  it("la nota es la suma, igual que siempre", () => {
    const v = validarCorreccion(
      RUBRICA,
      {
        criterionScores: [
          { criterionId: "c1", points: 30, level: "bueno", comment: null },
          { criterionId: "c2", points: 60, level: "excelente", comment: null },
        ],
      },
      "publish"
    );
    expect(v).toEqual({ ok: true, score: 90, passed: true });
  });

  it("el ajuste manual sigue acotado a 0..máximo", () => {
    const v = validarCorreccion(
      RUBRICA,
      { criterionScores: [{ criterionId: "c1", points: 41, level: "excelente" }] },
      "draft"
    );
    expect(v.ok).toBe(false);
  });
});
