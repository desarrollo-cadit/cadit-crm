/**
 * Montos tipeados a mano, con separador de miles es-UY ("5.000").
 *
 * Los montos son ENTEROS sin centésimos (DV-008, ver `enrollment.amount` en
 * `src/lib/db/schema.ts`): por eso el punto se lee SOLO como separador de
 * miles y la coma no se acepta — sumar decimales es una decisión de producto
 * pendiente, no algo que este campo resuelva por su cuenta.
 *
 * Puro: lo usa `MoneyInput` (`src/components/ui/money-input.tsx`).
 */

/** 999.999.999: entra holgado en un `integer` de PostgreSQL (2.147.483.647). */
export const MONEY_MAX_DIGITS = 9;

/** Lo que se le dice a quien tipea una coma. */
export const MONEY_DECIMALS_HINT = "Los montos se cargan sin centésimos.";

export type MoneyParse =
  | { ok: true; value: number | null }
  | { ok: false; reason: "decimales" };

/** "5000" → "5.000"; null → "". */
export function formatMoney(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "";
  const digits = String(Math.trunc(Math.abs(value)));
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * Lo tipeado o pegado → entero. Acepta "5000", "5.000", "$ 5.000"; vacío es
 * null (no cero). Una coma es un intento de centésimos y se rechaza.
 */
export function parseMoneyInput(text: string): MoneyParse {
  if (text.includes(",")) return { ok: false, reason: "decimales" };
  const digits = text.replace(/\D/g, "").slice(0, MONEY_MAX_DIGITS);
  if (!digits) return { ok: true, value: null };
  return { ok: true, value: Number(digits) };
}

/** Cuántos dígitos hay a la izquierda de `caret` en `text`. */
export function digitsBeforeCaret(text: string, caret: number): number {
  return text.slice(0, caret).replace(/\D/g, "").length;
}

/**
 * La posición en `formatted` justo después de su dígito número `digits`.
 * Así el cursor no salta al final cuando aparece o desaparece un punto.
 */
export function caretForDigits(formatted: string, digits: number): number {
  if (digits <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (/\d/.test(formatted[i]!)) {
      seen++;
      if (seen === digits) return i + 1;
    }
  }
  return formatted.length;
}

/**
 * Cuántos dígitos quedan a la izquierda del cursor después de parsear `raw`
 * (con el cursor en `caret`): descuenta los ceros a la izquierda que se
 * descartan y no pasa del largo del valor (lo que excede el máximo se corta).
 */
export function caretDigitsAfterParse(
  raw: string,
  caret: number,
  value: number | null
): number {
  if (value === null) return 0;
  const kept = String(value).length;
  const rawDigits = raw.replace(/\D/g, "");
  const stripped = rawDigits.replace(/^0+/, "");
  // El cero solo se queda con uno de sus ceros.
  const dropped = value === 0 ? rawDigits.length - 1 : rawDigits.length - stripped.length;
  const left = digitsBeforeCaret(raw, caret);
  return Math.max(0, Math.min(kept, left - Math.min(dropped, left)));
}

/**
 * Borrar pegado a un punto. El navegador borra el punto, `formatMoney` lo
 * vuelve a poner y la tecla "no hace nada": hay que apretarla dos veces.
 * Acá se salta el punto y se borra el dígito del otro lado. `null` = no hay
 * un punto en juego y el borrado normal alcanza.
 */
export function borrarSobreSeparador(
  formatted: string,
  caret: number,
  direccion: "atras" | "adelante"
): { value: number | null; caretDigits: number } | null {
  const separador = direccion === "atras" ? caret - 1 : caret;
  if (formatted[separador] !== ".") return null;
  const digito = direccion === "atras" ? separador - 1 : separador + 1;
  if (digito < 0 || digito >= formatted.length) return null;
  const raw = formatted.slice(0, digito) + formatted.slice(digito + 1);
  const parsed = parseMoneyInput(raw);
  if (!parsed.ok) return null;
  const rawCaret = direccion === "atras" ? digito : caret;
  return { value: parsed.value, caretDigits: caretDigitsAfterParse(raw, rawCaret, parsed.value) };
}
