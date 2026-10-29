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

/**
 * 0084 — Los niveles de la rúbrica. FIJOS: son constantes de este módulo y no
 * se configuran por evaluación (decisión del dueño). Cada nivel vale un
 * porcentaje del máximo del criterio.
 */
export const NIVELES = ["excelente", "bueno", "suficiente", "insuficiente"] as const;
export type Nivel = (typeof NIVELES)[number];

export const PORCENTAJE_DE_NIVEL: Readonly<Record<Nivel, number>> = {
  excelente: 100,
  bueno: 75,
  suficiente: 50,
  insuficiente: 0,
};

export const ETIQUETA_DE_NIVEL: Readonly<Record<Nivel, string>> = {
  excelente: "Excelente",
  bueno: "Bueno",
  suficiente: "Suficiente",
  insuficiente: "Insuficiente",
};

/** 0084 — Una frase (una línea) por nivel. Todas opcionales. */
export type DescriptoresDeNivel = Partial<Record<Nivel, string>>;

/**
 * 0084 — `levels` es opcional: un criterio sin descriptores es el de siempre,
 * y una rúbrica sin descriptores es la lista de ejercicios de 031.
 */
export type Criterion = {
  id: string;
  name: string;
  maxPoints: number;
  levels?: DescriptoresDeNivel;
};

/**
 * 0084 — Los puntos que da un nivel: su porcentaje del máximo, redondeado al
 * entero más cercano (los puntajes son enteros). 75 % de 10 = 7,5 → 8.
 */
export function puntosDeNivel(nivel: Nivel, maxPoints: number): number {
  return Math.round((maxPoints * PORCENTAJE_DE_NIVEL[nivel]) / 100);
}
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
  criterionScores?: {
    criterionId: string;
    points: number | null;
    comment?: string | null;
    /** 0084 — El nivel elegido; los puntos se pueden ajustar a mano. */
    level?: Nivel | null;
  }[];
  textValues?: { fieldId: string; value: string }[];
};

const NOMBRE_MAX = 120;
const TEXTO_MAX = 5000;
/** 0084 — Un descriptor es una frase corta: lo que distingue un nivel del otro. */
const DESCRIPTOR_MAX = 300;

const descriptoresSchema = z
  .object({
    excelente: z.string().max(DESCRIPTOR_MAX).optional(),
    bueno: z.string().max(DESCRIPTOR_MAX).optional(),
    suficiente: z.string().max(DESCRIPTOR_MAX).optional(),
    insuficiente: z.string().max(DESCRIPTOR_MAX).optional(),
  })
  .strict();

const criterionSchema = z.object({
  id: z.string().max(40),
  name: z.string().max(NOMBRE_MAX),
  maxPoints: z.number().int().min(1).max(100),
  levels: descriptoresSchema.optional(),
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
        level: z.enum(NIVELES).nullable().optional(),
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
    // 0084 — Un descriptor es UNA línea: es lo que entra en la celda de la rúbrica.
    for (const n of NIVELES) {
      const d = c.levels?.[n];
      if (d !== undefined && /[\r\n]/.test(d)) {
        return {
          ok: false,
          mensaje: `${c.name.trim()}: la descripción de «${ETIQUETA_DE_NIVEL[n]}» tiene que ser una sola línea.`,
        };
      }
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

/**
 * 0084 — Recorta los descriptores y descarta los vacíos; un criterio sin
 * ninguno queda SIN `levels` (la forma de 031). Se aplica antes de guardar
 * para que "un espacio de más" no cuente como un cambio de plantilla.
 */
export function normalizarPlantilla(t: Template): Template {
  return {
    ...t,
    criteria: t.criteria.map((c) => {
      const { levels, ...resto } = c;
      const limpios = descriptoresLimpios(levels);
      return limpios ? { ...resto, levels: limpios } : resto;
    }),
  };
}

function descriptoresLimpios(levels: DescriptoresDeNivel | undefined): DescriptoresDeNivel | null {
  if (!levels) return null;
  const out: DescriptoresDeNivel = {};
  for (const n of NIVELES) {
    const d = levels[n]?.trim();
    if (d) out[n] = d;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** 0084 — ¿Algún criterio trae frases por nivel? Sin ellas, la rúbrica es la lista de 031. */
export function tieneDescriptores(t: Pick<Template, "criteria">): boolean {
  return t.criteria.some((c) => descriptoresLimpios(c.levels) !== null);
}

/**
 * 0084 — Un nivel elegido sin puntos toma los puntos del nivel. Los puntos
 * cargados a mano GANAN: el corrector puede ajustar dentro de 0..máximo.
 */
export function completarPuntosDeNivel<
  S extends { criterionId: string; points: number | null; level?: Nivel | null },
>(t: Template, scores: S[]): S[] {
  return scores.map((s) => {
    if (s.points !== null || !s.level) return s;
    const c = t.criteria.find((x) => x.id === s.criterionId);
    return c ? { ...s, points: puntosDeNivel(s.level, c.maxPoints) } : s;
  });
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
 * corrección? Escala, mínimo y ejercicios (ids, máximos y —0084— las frases
 * de cada nivel de la rúbrica): cambiarlos le
 * movería la nota a alguien que ya la vio. Nombres, campos de texto y
 * "requiere aprobación" son presentación y circuito, no la nota.
 *
 * El ORDEN de los ejercicios no congela: no cambia ninguna suma.
 */
export function plantillaCongelada(anterior: Template, nueva: Template): boolean {
  if (anterior.scale !== nueva.scale) return true;
  if (anterior.minScore !== nueva.minScore) return true;
  if (anterior.criteria.length !== nueva.criteria.length) return true;
  const previos = new Map(anterior.criteria.map((c) => [c.id, c]));
  return nueva.criteria.some((c) => {
    const p = previos.get(c.id);
    if (!p || p.maxPoints !== c.maxPoints) return true;
    // 0084 — Las frases de cada nivel también son la vara contra la que se
    // corrigió: cambiarlas después de publicar es cambiar la plantilla.
    return claveDeDescriptores(p.levels) !== claveDeDescriptores(c.levels);
  });
}

function claveDeDescriptores(levels: DescriptoresDeNivel | undefined): string {
  const l = descriptoresLimpios(levels) ?? {};
  return NIVELES.map((n) => l[n] ?? "").join("\u0000");
}

/**
 * T015 — Cómo se resume la plantilla en la cabecera de la planilla. Una sola
 * frase para que quien carga sepa qué está corrigiendo sin abrir el editor.
 */
export function etiquetaDePlantilla(t: Template): string {
  return t.scale === "numeric" ? `Numérica · aprueba con ${t.minScore}` : "Aprobado / no aprobado";
}

/**
 * La plantilla de algo que PUEDE traerla (un DTO de evaluación, una fila de la
 * planilla). Lo que no la trae es aprobado/no aprobado, que es lo que era toda
 * evaluación antes de 031 (FR-001).
 *
 * Vive acá y no en el servidor ni en la pantalla porque las dos la necesitan:
 * con una copia en cada lado, el default de una se corre y la otra no.
 */
export function plantillaDe(a: Partial<Template>): Template {
  return {
    scale: a.scale ?? "pass_fail",
    minScore: a.minScore ?? null,
    requiresApproval: a.requiresApproval ?? false,
    criteria: a.criteria ?? [],
    textFields: a.textFields ?? [],
  };
}

/**
 * DV-014/FR-018 — Si quien corrige PUBLICA o ENVÍA a aprobación. Lo decide el
 * servidor con la plantilla y la capacidad de la sesión; la pantalla solo
 * dibuja el botón que corresponde. El profesor nunca tiene capacidades de
 * staff, así que su puerta pasa siempre `false`.
 */
export function modoDeCorreccion(t: Template, puedeAprobar: boolean): "publish" | "submit" {
  return !t.requiresApproval || puedeAprobar ? "publish" : "submit";
}

/**
 * DV-005 — La carga rápida (la celda de la planilla, la corrección vieja de la
 * entrega) sigue valiendo SOLO donde no puede esquivar nada: aprobado/no
 * aprobado y sin aprobación. En una numérica dejaría un `passed` sin nota que
 * lo explique; con aprobación, publicaría salteando a quien aprueba.
 */
export function admiteAtajo(t: Template): boolean {
  return t.scale === "pass_fail" && !t.requiresApproval;
}
