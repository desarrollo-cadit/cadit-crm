/**
 * Montos tipeados a mano, en formato es-UY: punto de miles y COMA decimal
 * ("5.245,32").
 *
 * Los montos viajan en CENTÉSIMOS enteros (DV-008 revisada el 2026-10-21, ver
 * `src/lib/money.ts`): lo que sale de acá es `524532`, no `5245.32`. El punto
 * se lee SOLO como separador de miles; la coma separa hasta dos decimales (o
 * ninguno, en guaraníes).
 *
 * Mientras se tipea, "5," o "5245,3" tienen que seguir viéndose así aunque el
 * valor sea el mismo que "5" o "5245,30": por eso el parseo devuelve además
 * `fraction`, lo tipeado después de la coma, y `formatMoney` lo respeta.
 *
 * Puro: lo usa `MoneyInput` (`src/components/ui/money-input.tsx`).
 */
import { MINOR_PER_MAJOR, MONEY_MAX_DIGITS } from "@/lib/money";

export { MONEY_MAX_DIGITS };

/** Lo que se le dice a quien tipea más de dos decimales. */
export const MONEY_DECIMALS_HINT = "Los montos llevan como máximo dos decimales.";
/** Lo que se le dice a quien tipea una coma en un monto en guaraníes. */
export const MONEY_NO_DECIMALS_HINT = "Los montos en guaraníes se cargan sin decimales.";
/** Lo que se le dice a quien tipea una segunda coma. */
export const MONEY_FORMAT_HINT = "Usá la coma solo para los decimales: 5.245,32.";

export type MoneyParseError = "decimales" | "formato";

/** `value` en centésimos; `fraction` = lo tipeado tras la coma (null si no hay coma). */
export type MoneyDraft = { value: number | null; fraction: string | null };

export type MoneyParse = ({ ok: true } & MoneyDraft) | { ok: false; reason: MoneyParseError };

export type MoneyInputOptions = { maxDecimals?: 0 | 2 };

export function moneyHint(reason: MoneyParseError, maxDecimals: 0 | 2): string {
  if (reason === "formato") return MONEY_FORMAT_HINT;
  return maxDecimals === 0 ? MONEY_NO_DECIMALS_HINT : MONEY_DECIMALS_HINT;
}

function agrupar(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * Centésimos → texto del campo: 500000 → "5.000", 524532 → "5.245,32";
 * con `fraction` muestra lo que se está tipeando (500, "") → "5,". null → "".
 */
export function formatMoney(value: number | null, fraction?: string | null): string {
  if (value === null || !Number.isFinite(value)) return "";
  const abs = Math.abs(Math.trunc(value));
  const entero = agrupar(String(Math.trunc(abs / MINOR_PER_MAJOR)));
  if (fraction !== undefined && fraction !== null) return `${entero},${fraction}`;
  const cents = abs % MINOR_PER_MAJOR;
  return cents === 0 ? entero : `${entero},${String(cents).padStart(2, "0")}`;
}

/**
 * Lo tipeado o pegado → centésimos. Acepta "5000", "5.000", "$ 5.245,32";
 * vacío es null (no cero). Más decimales que los permitidos, o dos comas, se
 * rechazan.
 */
export function parseMoneyInput(text: string, opts: MoneyInputOptions = {}): MoneyParse {
  const maxDecimals = opts.maxDecimals ?? 2;
  const comas = text.split(",").length - 1;
  if (comas > 1) return { ok: false, reason: "formato" };
  if (comas === 1 && maxDecimals === 0) return { ok: false, reason: "decimales" };
  const [intRaw = "", fracRaw = ""] = text.split(",");
  const intDigits = intRaw.replace(/\D/g, "").slice(0, MONEY_MAX_DIGITS);
  if (comas === 0) {
    if (!intDigits) return { ok: true, value: null, fraction: null };
    return { ok: true, value: Number(intDigits) * MINOR_PER_MAJOR, fraction: null };
  }
  const fraction = fracRaw.replace(/\D/g, "");
  if (fraction.length > maxDecimals) return { ok: false, reason: "decimales" };
  const value = Number(intDigits || "0") * MINOR_PER_MAJOR + Number(fraction.padEnd(2, "0"));
  return { ok: true, value, fraction };
}

/** Lo que cuenta para ubicar el cursor: dígitos y la coma (no los puntos). */
const SIGNIFICATIVO = /[\d,]/;

/** Cuántos dígitos (y comas) hay a la izquierda de `caret` en `text`. */
export function digitsBeforeCaret(text: string, caret: number): number {
  let n = 0;
  for (const ch of text.slice(0, caret)) if (SIGNIFICATIVO.test(ch)) n++;
  return n;
}

/**
 * La posición en `formatted` justo después de su carácter significativo
 * número `digits` (dígito o coma). Así el cursor no salta al final cuando
 * aparece o desaparece un punto.
 */
export function caretForDigits(formatted: string, digits: number): number {
  if (digits <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (SIGNIFICATIVO.test(formatted[i]!)) {
      seen++;
      if (seen === digits) return i + 1;
    }
  }
  return formatted.length;
}

/**
 * Cuántos caracteres significativos quedan a la izquierda del cursor después
 * de parsear `raw` (con el cursor en `caret`): descuenta los ceros a la
 * izquierda que se descartan (o suma el "0" de ",5" → "0,5") y no pasa del
 * largo de la parte entera (lo que excede el máximo se corta).
 */
export function caretDigitsAfterParse(raw: string, caret: number, draft: MoneyDraft): number {
  if (draft.value === null) return 0;
  const intLen = String(Math.trunc(Math.abs(draft.value) / MINOR_PER_MAJOR)).length;
  const coma = raw.indexOf(",");
  const rawInt = (coma === -1 ? raw : raw.slice(0, coma)).replace(/\D/g, "");
  const left = digitsBeforeCaret(raw, caret);

  if (coma === -1 || caret <= coma) {
    const stripped = rawInt.replace(/^0+/, "");
    // Sin dígitos significativos queda un único "0": si había ceros se van
    // todos menos uno; si no había ninguno (",5"), aparece uno.
    const dropped = stripped === "" ? rawInt.length - 1 : rawInt.length - stripped.length;
    return Math.max(0, Math.min(intLen, left - Math.min(dropped, left)));
  }
  const fracLeft = left - rawInt.length - 1;
  const fracLen = draft.fraction?.length ?? 0;
  return intLen + 1 + Math.max(0, Math.min(fracLen, fracLeft));
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
  direccion: "atras" | "adelante",
  opts: MoneyInputOptions = {}
): (MoneyDraft & { caretDigits: number }) | null {
  const separador = direccion === "atras" ? caret - 1 : caret;
  if (formatted[separador] !== ".") return null;
  const digito = direccion === "atras" ? separador - 1 : separador + 1;
  if (digito < 0 || digito >= formatted.length) return null;
  const raw = formatted.slice(0, digito) + formatted.slice(digito + 1);
  const parsed = parseMoneyInput(raw, opts);
  if (!parsed.ok) return null;
  const rawCaret = direccion === "atras" ? digito : caret;
  const draft = { value: parsed.value, fraction: parsed.fraction };
  return { ...draft, caretDigits: caretDigitsAfterParse(raw, rawCaret, draft) };
}
