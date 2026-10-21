"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  MONEY_DECIMALS_HINT,
  borrarSobreSeparador,
  caretDigitsAfterParse,
  caretForDigits,
  digitsBeforeCaret,
  formatMoney,
  parseMoneyInput,
} from "@/lib/money-input";

/**
 * Un monto entero con separador de miles es-UY: tipear `5000` muestra
 * `5.000`. Lo que sale por `onChange` es el ENTERO (o null si está vacío):
 * la API recibe lo mismo que antes.
 *
 * Sin centésimos (DV-008): una coma no entra y se avisa abajo. Agregar
 * decimales es una decisión de producto pendiente.
 */
export function MoneyInput({
  value,
  onChange,
  id,
  className,
  placeholder,
  disabled,
  required,
  "aria-label": ariaLabel,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  id?: string;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  "aria-label"?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [hint, setHint] = useState(false);
  // Dónde dejar el cursor después del próximo render (en dígitos, no en chars).
  const pendingCaret = useRef<number | null>(null);
  const shown = formatMoney(value);

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
        inputMode="numeric"
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
            e.key === "Backspace" ? "atras" : "adelante"
          );
          if (!borrado) return;
          e.preventDefault();
          setHint(false);
          pendingCaret.current = borrado.caretDigits;
          onChange(borrado.value);
        }}
        onChange={(e) => {
          const raw = e.target.value;
          const parsed = parseMoneyInput(raw);
          const caret = e.target.selectionStart ?? raw.length;
          if (!parsed.ok) {
            // Se rechaza la edición: el input vuelve a mostrar el valor previo,
            // con el cursor donde estaba.
            setHint(true);
            const before = digitsBeforeCaret(raw, caret);
            pendingCaret.current = before;
            e.target.value = shown;
            const pos = caretForDigits(shown, before);
            e.target.setSelectionRange(pos, pos);
            return;
          }
          setHint(false);
          pendingCaret.current = caretDigitsAfterParse(raw, caret, parsed.value);
          onChange(parsed.value);
        }}
      />
      {hint && (
        <p id={hintId} className="mt-1 text-xs text-muted-foreground" role="status">
          {MONEY_DECIMALS_HINT}
        </p>
      )}
    </div>
  );
}
