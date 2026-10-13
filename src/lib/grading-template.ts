import { customAlphabet } from "nanoid";
import { z } from "zod";

/**
 * 031 (DV-002, DV-007) — La plantilla de corrección de una evaluación y la
 * validación de una corrección, en PURO.
 *
 * Vive en `src/lib` y no en el servidor porque es la lógica con más bordes del
 * ciclo (puntaje sobre el máximo, ejercicio sin cargar, nota justo en el
 * mínimo) y la que decide si un alumno aprobó: tiene que poder probarse sin
 * base y usarse igual desde el formulario, que muestra la nota en vivo.
 *
 * La plantilla vive en columnas de `assessment` (los ejercicios y los campos en
 * jsonb). Lo que viene de jsonb no está tipado por la base: por eso se valida
 * con Zod al escribir Y al leer (`leerPlantilla`).
 */

export const SCALES = ["pass_fail", "numeric"] as const;
export type Scale = (typeof SCALES)[number];

export type Criterion = { id: string; name: string; maxPoints: number };
export type TextField = { id: string; name: string; required: boolean };

export type Template = {
  scale: Scale;
  /** 1..100 si `numeric`; null si `pass_fail`. */
  minScore: number | null;
  requiresApproval: boolean;
  /** Vacío, o Σ maxPoints = 100. Solo en `numeric`. */
  criteria: Criterion[];
  textFields: TextField[];
};

export type CorrectionMode = "draft" | "submit" | "publish";

/** Lo que la validación necesita de una corrección (subconjunto del input de la API). */
export type CorrectionInput = {
  score?: number | null;
  passed?: boolean | null;
  criterionScores?: { criterionId: string; points: number | null; comment?: string | null }[];
  textValues?: { fieldId: string; value: string }[];
};

const NOMBRE_MAX = 120;
const TEXTO_MAX = 5000;

const criterionSchema = z.object({
  id: z.string().max(40),
  name: z.string().max(NOMBRE_MAX),
  maxPoints: z.number().int().min(1).max(100),
});

const textFieldSchema = z.object({
  id: z.string().max(40),
  name: z.string().max(NOMBRE_MAX),
  required: z.boolean(),
});

/**
 * La FORMA de una plantilla (tipos y rangos). Las reglas de negocio —suma 100,
 * mínimo según escala, ids únicos— las dice `validarPlantilla`, que devuelve un
 * mensaje que se puede mostrar tal cual.
 */
export const templateSchema = z.object({
  scale: z.enum(SCALES),
  minScore: z.number().int().nullable(),
  requiresApproval: z.boolean(),
  criteria: z.array(criterionSchema).max(50),
  textFields: z.array(textFieldSchema).max(20),
});

export const correctionInputSchema = z.object({
  action: z.enum(["draft", "submit", "publish"]),
  submissionId: z.string().max(64).nullable().optional(),
  score: z.number().int().nullable().optional(),
  passed: z.boolean().nullable().optional(),
  feedback: z.string().max(TEXTO_MAX).nullable().optional(),
  criterionScores: z
    .array(
      z.object({
        criterionId: z.string().max(40),
        points: z.number().int().nullable(),
        comment: z.string().max(TEXTO_MAX).nullable().optional(),
      })
    )
    .max(50)
    .optional(),
  textValues: z
    .array(z.object({ fieldId: z.string().max(40), value: z.string().max(TEXTO_MAX) }))
    .max(20)
    .optional(),
});

export type PlantillaValida = { ok: true } | { ok: false; mensaje: string };

export function validarPlantilla(t: Template): PlantillaValida {
  if (t.scale === "pass_fail") {
    if (t.minScore !== null) {
      return { ok: false, mensaje: "Una evaluación aprobado/no aprobado no lleva nota mínima." };
    }
    if (t.criteria.length > 0) {
      return {
        ok: false,
        mensaje: "Los ejercicios con puntaje solo existen en la escala numérica.",
      };
    }
  } else {
    if (t.minScore === null || !Number.isInteger(t.minScore) || t.minScore < 1 || t.minScore > 100) {
      return { ok: false, mensaje: "La nota mínima de aprobación tiene que ser un entero entre 1 y 100." };
    }
    if (t.criteria.length > 0) {
      const suma = t.criteria.reduce((s, c) => s + c.maxPoints, 0);
      if (suma !== 100) {
        const diferencia =
          suma < 100 ? `faltan ${100 - suma}` : `sobran ${suma - 100}`;
        return {
          ok: false,
          mensaje: `Los ejercicios suman ${suma}; ${diferencia} para llegar a 100.`,
        };
      }
    }
  }

  for (const c of t.criteria) {
    if (!c.name.trim()) return { ok: false, mensaje: "Todos los ejercicios necesitan un nombre." };
    if (!Number.isInteger(c.maxPoints) || c.maxPoints < 1 || c.maxPoints > 100) {
      return { ok: false, mensaje: `${c.name.trim()}: el puntaje máximo va de 1 a 100.` };
    }
  }
  for (const f of t.textFields) {
    if (!f.name.trim()) return { ok: false, mensaje: "Todos los campos de texto necesitan un nombre." };
  }
  if (repetidos(t.criteria.map((c) => c.id)) || repetidos(t.textFields.map((f) => f.id))) {
    return { ok: false, mensaje: "Hay ejercicios o campos repetidos en la plantilla." };
  }
  return { ok: true };
}

function repetidos(ids: string[]): boolean {
  return new Set(ids).size !== ids.length;
}

const nanoItem = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 12);

/**
 * Los ejercicios y campos nuevos llegan sin id desde el editor; el servidor se
 * los da. Los existentes se respetan: una corrección guardada apunta a ellos.
 */
export function completarIds(t: Template, generar: () => string = nanoItem): Template {
  return {
    ...t,
    criteria: t.criteria.map((c) => (c.id ? c : { ...c, id: generar() })),
    textFields: t.textFields.map((f) => (f.id ? f : { ...f, id: generar() })),
  };
}

/** La fila tal como la devuelve drizzle: jsonb es `unknown` para la base. */
export type FilaPlantilla = {
  scale: string;
  minScore: number | null;
  requiresApproval: boolean;
  criteria: unknown;
  textFields: unknown;
};

/**
 * Lee la plantilla de una fila de `assessment`. Un jsonb con forma inesperada
 * se lee como lista vacía en vez de romper la planilla entera: la evaluación
 * sigue funcionando y quien la edite vuelve a cargar los ejercicios.
 */
export function leerPlantilla(fila: FilaPlantilla): Template {
  const criteria = z.array(criterionSchema).safeParse(fila.criteria);
  const textFields = z.array(textFieldSchema).safeParse(fila.textFields);
  return {
    scale: fila.scale === "numeric" ? "numeric" : "pass_fail",
    minScore: fila.minScore,
    requiresApproval: fila.requiresApproval,
    criteria: criteria.success ? criteria.data : [],
    textFields: textFields.success ? textFields.data : [],
  };
}

/**
 * FR-009 — Con ejercicios, la nota es la suma (y no hay nota mientras falte
 * alguno); sin ejercicios, la que carga el corrector. En aprobado/no aprobado
 * no hay nota.
 */
export function notaDeCorreccion(t: Template, entrada: CorrectionInput): number | null {
  if (t.scale !== "numeric") return null;
  if (t.criteria.length === 0) return entrada.score ?? null;
  let suma = 0;
  for (const c of t.criteria) {
    const p = entrada.criterionScores?.find((s) => s.criterionId === c.id)?.points;
    if (p === null || p === undefined) return null;
    suma += p;
  }
  return suma;
}

/** FR-010 — La nota igual al mínimo aprueba. */
export function aproboConNota(nota: number, minimo: number): boolean {
  return nota >= minimo;
}

export type CorreccionValida =
  | { ok: true; score: number | null; passed: boolean | null }
  | {
      ok: false;
      code: "correccion_incompleta" | "puntaje_fuera_de_rango" | "correccion_invalida";
      mensaje: string;
    };

/**
 * Valida una corrección contra su plantilla y devuelve la nota y el aprobado
 * DERIVADOS (FR-010: en numérica nadie carga `passed` a mano).
 *
 * `draft` tolera faltantes (FR-013) pero no valores imposibles: un puntaje
 * sobre el máximo no se guarda ni en borrador, porque después nadie lo mira
 * hasta el momento de publicar.
 */
export function validarCorreccion(
  t: Template,
  entrada: CorrectionInput,
  modo: CorrectionMode
): CorreccionValida {
  const completa = modo !== "draft";

  for (const s of entrada.criterionScores ?? []) {
    const c = t.criteria.find((x) => x.id === s.criterionId);
    if (!c) {
      return { ok: false, code: "correccion_invalida", mensaje: "La corrección trae un ejercicio que la plantilla no tiene." };
    }
    if (s.points !== null && (!Number.isInteger(s.points) || s.points < 0 || s.points > c.maxPoints)) {
      return {
        ok: false,
        code: "puntaje_fuera_de_rango",
        mensaje: `${c.name}: el puntaje va de 0 a ${c.maxPoints}.`,
      };
    }
  }
  for (const v of entrada.textValues ?? []) {
    if (!t.textFields.some((f) => f.id === v.fieldId)) {
      return { ok: false, code: "correccion_invalida", mensaje: "La corrección trae un campo que la plantilla no tiene." };
    }
  }

  if (completa) {
    for (const c of t.criteria) {
      const p = entrada.criterionScores?.find((s) => s.criterionId === c.id)?.points;
      if (p === null || p === undefined) {
        return { ok: false, code: "correccion_incompleta", mensaje: `Falta el puntaje de "${c.name}".` };
      }
    }
    for (const f of t.textFields) {
      if (!f.required) continue;
      const v = entrada.textValues?.find((x) => x.fieldId === f.id)?.value ?? "";
      if (!v.trim()) {
        return { ok: false, code: "correccion_incompleta", mensaje: `Falta completar "${f.name}".` };
      }
    }
  }

  if (t.scale === "pass_fail") {
    const passed = entrada.passed ?? null;
    if (completa && passed === null) {
      return { ok: false, code: "correccion_incompleta", mensaje: "Falta indicar si aprobó o no." };
    }
    return { ok: true, score: null, passed };
  }

  if (t.criteria.length === 0 && entrada.score !== null && entrada.score !== undefined) {
    if (!Number.isInteger(entrada.score) || entrada.score < 1 || entrada.score > 100) {
      return { ok: false, code: "puntaje_fuera_de_rango", mensaje: "La nota va de 1 a 100." };
    }
  }

  const score = notaDeCorreccion(t, entrada);
  if (completa && score === null) {
    return { ok: false, code: "correccion_incompleta", mensaje: "Falta la nota." };
  }
  const passed = score === null || t.minScore === null ? null : aproboConNota(score, t.minScore);
  return { ok: true, score, passed };
}

/**
 * DV-008 — ¿Este cambio toca lo que ya no se puede tocar una vez publicada una
 * corrección? Escala, mínimo y ejercicios (ids y máximos): cambiarlos le
 * movería la nota a alguien que ya la vio. Nombres, campos de texto y
 * "requiere aprobación" son presentación y circuito, no la nota.
 *
 * El ORDEN de los ejercicios no congela: no cambia ninguna suma.
 */
export function plantillaCongelada(anterior: Template, nueva: Template): boolean {
  if (anterior.scale !== nueva.scale) return true;
  if (anterior.minScore !== nueva.minScore) return true;
  if (anterior.criteria.length !== nueva.criteria.length) return true;
  const maximos = new Map(anterior.criteria.map((c) => [c.id, c.maxPoints]));
  return nueva.criteria.some((c) => maximos.get(c.id) !== c.maxPoints);
}
