import { z } from "zod";

/**
 * Duración del CURSO: cantidad de clases, horas por clase y duración total en
 * horas. Reemplaza a "semanas × horas por semana", que no describía bien un
 * curso de 15 clases de 2,5 horas.
 *
 * El total se GUARDA, no se deriva: un examen o una última clase más corta lo
 * pueden hacer distinto de clases × horas por clase. El producto es solo una
 * sugerencia que el formulario precarga y un aviso suave si no coincide.
 *
 * Puro: sin base ni React. Las horas son horas (unidades mayores), no plata.
 */

/** Redondea a centésimos: es la precisión de las columnas `numeric(_,2)`. */
function aCentesimos(n: number): number {
  return Math.round(n * 100) / 100;
}

function esMultiploDe(n: number, paso: number): boolean {
  const veces = n / paso;
  return Math.abs(veces - Math.round(veces)) < 1e-9;
}

/** Texto del formulario → número. Acepta coma decimal. Vacío o basura → null. */
export function parseHoras(texto: string): number | null {
  const limpio = texto.trim().replace(",", ".");
  if (!limpio) return null;
  if (!/^\d+(\.\d+)?$/.test(limpio)) return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

/** Clases × horas por clase, si las dos están cargadas y son positivas. */
export function totalSugerido(
  clases: number | null,
  horasPorClase: number | null
): number | null {
  if (!clases || !horasPorClase || clases <= 0 || horasPorClase <= 0) return null;
  return aCentesimos(clases * horasPorClase);
}

/** Las tres cargadas y el total no es clases × horas por clase. Nunca bloquea. */
export function totalNoCoincide(
  clases: number | null,
  horasPorClase: number | null,
  total: number | null
): boolean {
  const sugerido = totalSugerido(clases, horasPorClase);
  if (sugerido === null || total === null) return false;
  return Math.abs(aCentesimos(total) - sugerido) > 0.001;
}

/**
 * Qué poner en el campo "Duración total" cuando cambian las clases o las horas
 * por clase: sigue a la sugerencia mientras la persona no lo haya escrito a
 * mano (vacío, o igual a la sugerencia anterior). Lo escrito a mano no se pisa.
 */
export function autocompletarTotal(
  totalActual: string,
  sugeridoAnterior: number | null,
  sugeridoNuevo: number | null
): string {
  if (sugeridoNuevo === null) return totalActual;
  const actual = parseHoras(totalActual);
  const siguiendoLaSugerencia =
    totalActual.trim() === "" ||
    (actual !== null && sugeridoAnterior !== null && Math.abs(actual - sugeridoAnterior) < 0.001);
  return siguiendoLaSugerencia ? formatNumeroDeHoras(sugeridoNuevo) : totalActual;
}

const numeroEs = new Intl.NumberFormat("es-UY", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
  useGrouping: false,
});

/** "2,5", "40": el número solo, con coma decimal y sin ceros de más. */
export function formatNumeroDeHoras(n: number): string {
  return numeroEs.format(n);
}

/** "40 horas", "37,5 horas", "1 hora" — así figura en el certificado. */
export function formatHoras(n: number): string {
  return `${formatNumeroDeHoras(n)} ${n === 1 ? "hora" : "horas"}`;
}

/** `numeric` de Postgres llega como texto (postgres-js). */
export function horasDesdeDb(valor: string | null): number | null {
  if (valor === null) return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

/** Número → texto para `numeric`. `undefined` = no tocar la columna (PATCH). */
export function horasParaDb(n: number | null | undefined): string | null | undefined {
  if (n === undefined) return undefined;
  if (n === null) return null;
  return String(n);
}

/** Validación del alta y la edición del curso. Las tres son opcionales y anulables. */
export const courseDurationSchema = {
  classCount: z.number().int().min(1).max(1000).nullable().optional(),
  hoursPerClass: z
    .number()
    .positive()
    .max(24)
    .refine((n) => esMultiploDe(n, 0.25), "Las horas por clase van de a cuartos de hora")
    .nullable()
    .optional(),
  totalHours: z
    .number()
    .positive()
    .max(10000)
    .refine((n) => esMultiploDe(n, 0.01), "La duración total admite hasta dos decimales")
    .nullable()
    .optional(),
};
