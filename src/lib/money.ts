/**
 * Dinero: la ÚNICA puerta para mostrar, convertir y repartir montos.
 *
 * DV-008 (revisada el 2026-10-21): todo monto se guarda en CENTÉSIMOS
 * (unidades menores) en columnas `bigint`, con la MISMA escala ×100 para
 * todas las monedas (UYU, USD y también PYG, aunque los guaraníes no se
 * muestren con decimales). La base, la API interna y toda la aritmética
 * hablan en centésimos enteros; solo este módulo divide por 100, y solo para
 * mostrar o exportar. La excepción es el catálogo PÚBLICO de talleres
 * (`/api/public/talleres`), que el sitio de la academia lee en unidades
 * mayores: ver `toMajor` en `src/lib/workshops.ts`.
 *
 * Puro y sin dependencias de servidor: lo usan pantallas, correos y PDFs.
 */

/** Unidades menores por unidad mayor, igual para todas las monedas. */
export const MINOR_PER_MAJOR = 100;

/**
 * Dígitos de la parte ENTERA que se pueden cargar (999.999.999.999).
 * En centésimos son ~1e14, holgado bajo `Number.MAX_SAFE_INTEGER` (~9e15):
 * un `bigint` en modo `number` de Drizzle no pierde precisión.
 */
export const MONEY_MAX_DIGITS = 12;

/** El mayor monto aceptado, en centésimos. Las validaciones Zod lo usan. */
export const MONEY_MAX_MINOR = 10 ** MONEY_MAX_DIGITS * MINOR_PER_MAJOR - 1;

/**
 * Símbolo por moneda (los alumnos de Paraguay pagan en guaraníes). Un solo
 * mapa: con una copia por pantalla, la que se olvide de una moneda nueva la
 * imprime con el símbolo de otra.
 */
export const CURRENCY_SYMBOL: Readonly<Record<string, string>> = {
  UYU: "$",
  PYG: "Gs. ",
  USD: "US$",
};

/** El símbolo de la moneda; nunca asume pesos salvo que no haya moneda. */
export function currencySymbol(currency: string | null | undefined): string {
  return CURRENCY_SYMBOL[currency ?? "UYU"] ?? "$";
}

/** Los guaraníes no tienen centésimos en la práctica: nunca se muestran. */
export function currencyHasDecimals(currency: string | null | undefined): boolean {
  return currency !== "PYG";
}

function agrupar(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * Centésimos → número es-UY SIN símbolo: "5.000" o "5.245,32". Los decimales
 * aparecen solo si el monto los tiene (y nunca en guaraníes, que se redondean).
 */
export function formatMinorNumber(minor: number, currency: string | null | undefined): string {
  const signo = minor < 0 ? "-" : "";
  const abs = Math.abs(Math.round(minor));
  if (!currencyHasDecimals(currency)) {
    return `${signo}${agrupar(String(Math.round(abs / MINOR_PER_MAJOR)))}`;
  }
  const entero = Math.trunc(abs / MINOR_PER_MAJOR);
  const cents = abs % MINOR_PER_MAJOR;
  const base = `${signo}${agrupar(String(entero))}`;
  return cents === 0 ? base : `${base},${String(cents).padStart(2, "0")}`;
}

/** Importe con el símbolo de SU moneda: "$5.000", "$5.245,32", "Gs. 5.000". */
export function formatAmount(
  minor: number | null | undefined,
  currency: string | null | undefined
): string {
  if (minor === null || minor === undefined) return "—";
  return `${currencySymbol(currency)}${formatMinorNumber(minor, currency)}`;
}

/** "UYU 12.000" (correos internos); sin monto, lo dice. */
export function formatAmountWithCode(minor: number | null, currency: string): string {
  return minor === null ? "sin monto" : `${currency} ${formatMinorNumber(minor, currency)}`;
}

/** Centésimos → unidades mayores (5245.32). Solo para salir del sistema. */
export function toMajor(minor: number): number {
  return minor / MINOR_PER_MAJOR;
}

/** Unidades mayores → centésimos enteros (redondea el ruido de coma flotante). */
export function toMinor(major: number): number {
  return Math.round(major * MINOR_PER_MAJOR);
}

/**
 * Un monto o una suma leída de Postgres → número. postgres-js devuelve
 * `bigint` y `numeric` (lo que da `sum()`) como TEXTO; `Number()` a ciegas
 * redondearía en silencio pasado 2^53, así que eso se rechaza.
 */
export function minorFromDb(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "bigint" ? Number(value) : Number(value);
  if (!Number.isSafeInteger(n)) {
    throw new Error(`Monto fuera de rango o no entero: ${String(value)}`);
  }
  return n;
}

/**
 * Reparte `total` centésimos en `count` partes enteras: el resto va a la
 * PRIMERA y la suma da SIEMPRE exactamente `total`.
 */
export function splitMinor(total: number, count: number): number[] {
  const base = Math.floor(total / count);
  const remainder = total - base * count;
  return Array.from({ length: count }, (_, i) => (i === 0 ? base + remainder : base));
}

/**
 * Para un CSV separado por COMAS: unidades mayores con PUNTO decimal
 * ("5245.32"), sin separador de miles, para que la coma nunca parta el campo.
 * Pesos y dólares siempre con dos decimales; guaraníes sin decimales.
 */
export function minorToCsv(minor: number, currency: string | null | undefined): string {
  if (!currencyHasDecimals(currency)) return String(Math.round(minor / MINOR_PER_MAJOR));
  const signo = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  const entero = Math.trunc(abs / MINOR_PER_MAJOR);
  return `${signo}${entero}.${String(abs % MINOR_PER_MAJOR).padStart(2, "0")}`;
}
