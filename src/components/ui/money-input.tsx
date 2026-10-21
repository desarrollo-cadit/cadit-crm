"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { currencyHasDecimals } from "@/lib/money";
import {
  borrarSobreSeparador,
  caretDigitsAfterParse,
  caretForDigits,
  digitsBeforeCaret,
  formatMoney,
  moneyHint,
  parseMoneyInput,
  type MoneyParseError,
} from "@/lib/money-input";

/**
 * Un monto con separador de miles y coma decimal es-UY: tipear `5245,32`
 * muestra `5.245,32`. Lo que sale por `onChange` son CENTÉSIMOS enteros
 * (524532) o null si está vacío (DV-008 revisada el 2026-10-21): la API
 * recibe y devuelve centésimos.
 *
 * Hasta dos decimales; con `currency="PYG"`, ninguno. Lo que no entra se
 * rechaza y se avisa abajo.
 */
export function MoneyInput({
  value,
  onChange,
  currency,
  id,
  className,
  placeholder,
  disabled,
  required,
  "aria-label": ariaLabel,
}: {
  /** En centésimos. */
  value: number | null;
  onChange: (value: number | null) => void;
  /** Si el formulario la conoce: en guaraníes no se aceptan decimales. */
  currency?: string | null;
  id?: string;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  "aria-label"?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [hint, setHint] = useState<MoneyParseError | null>(null);
  // Lo tipeado después de la coma ("5," o "5,3"): el valor solo no lo dice.
  const [fraction, setFraction] = useState<string | null>(null);
  // Dónde dejar el cursor después del próximo render (en dígitos, no en chars).
  const pendingCaret = useRef<number | null>(null);
  const maxDecimals: 0 | 2 = currency && !currencyHasDecimals(currency) ? 0 : 2;

  // Si el valor cambió desde afuera (reset, otra moneda), lo tipeado ya no
  // corresponde: se muestra el valor tal cual.
  const fractionVigente =
    fraction !== null &&
    value !== null &&
    Math.abs(value) % 100 === Number(fraction.padEnd(2, "0"))
      ? fraction
      : null;
  const shown = formatMoney(value, fractionVigente);
  const opts = { maxDecimals };

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || pendingCaret.current === null) return;
    const pos = caretForDigits(shown, pendingCaret.current);
    pendingCaret.current = null;
    if (document.activeElement === el) el.setSelectionRange(pos, pos);
  });

  const hintId = id ? `${id}-hint` : undefined;

  return (
    <div className="w-full">
      <Input
        ref={ref}
        id={id}
        type="text"
        inputMode={maxDecimals === 0 ? "numeric" : "decimal"}
        autoComplete="off"
        className={className}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        aria-label={ariaLabel}
        aria-describedby={hint ? hintId : undefined}
        value={shown}
        onKeyDown={(e) => {
          if (e.key !== "Backspace" && e.key !== "Delete") return;
          const el = e.currentTarget;
          if (el.selectionStart === null || el.selectionStart !== el.selectionEnd) return;
          const borrado = borrarSobreSeparador(
            shown,
            el.selectionStart,
            e.key === "Backspace" ? "atras" : "adelante",
            opts
          );
          if (!borrado) return;
          e.preventDefault();
          setHint(null);
          setFraction(borrado.fraction);
          pendingCaret.current = borrado.caretDigits;
          onChange(borrado.value);
        }}
        onChange={(e) => {
          const raw = e.target.value;
          const parsed = parseMoneyInput(raw, opts);
          const caret = e.target.selectionStart ?? raw.length;
          if (!parsed.ok) {
            // Se rechaza la edición: el input vuelve a mostrar el valor previo,
            // con el cursor donde estaba.
            setHint(parsed.reason);
            const before = digitsBeforeCaret(raw, caret);
            pendingCaret.current = before;
            e.target.value = shown;
            const pos = caretForDigits(shown, before);
            e.target.setSelectionRange(pos, pos);
            return;
          }
          setHint(null);
          setFraction(parsed.fraction);
          pendingCaret.current = caretDigitsAfterParse(raw, caret, parsed);
          onChange(parsed.value);
        }}
      />
      {hint && (
        <p id={hintId} className="mt-1 text-xs text-muted-foreground" role="status">
          {moneyHint(hint, maxDecimals)}
        </p>
      )}
    </div>
  );
}
