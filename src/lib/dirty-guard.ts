/**
 * Cambios sin guardar en un diálogo. Puro: lo usan `Modal` y `useDirty`
 * (`src/components/ui/modal.tsx`).
 *
 * "Sucio" compara lo que el formulario tiene AHORA contra lo que tenía al
 * abrirse. Los espacios en los bordes y la diferencia entre vacío, null y
 * undefined no cuentan: no son nada cargado, y preguntar por ellos sería
 * pedirle a alguien que confirme que quiere perder… nada.
 */

function normalize(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") {
    const t = value.trim();
    return t === "" ? null : t;
  }
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === "object") {
    // Un File (u otro objeto no plano) se compara por identidad más abajo.
    if (Object.getPrototypeOf(value) !== Object.prototype) return value;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const n = normalize(v);
      if (n !== null) out[k] = n;
    }
    return out;
  }
  return value;
}

function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => equal(x, b[i]));
  }
  if (
    a &&
    b &&
    typeof a === "object" &&
    typeof b === "object" &&
    Object.getPrototypeOf(a) === Object.prototype &&
    Object.getPrototypeOf(b) === Object.prototype
  ) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    return (
      ka.length === kb.length &&
      ka.every((k) =>
        equal((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])
      )
    );
  }
  return false;
}

/** ¿El formulario cambió desde que se abrió? */
export function isDirty(initial: unknown, current: unknown): boolean {
  return !equal(normalize(initial), normalize(current));
}

/** Qué hacer cuando alguien intenta cerrar (click afuera, Escape, la X). */
export function closeDecision({
  dirty,
  busy,
}: {
  dirty: boolean;
  busy: boolean;
}): "close" | "confirm" | "ignore" {
  // Cerrar en medio de un pedido escondería su error.
  if (busy) return "ignore";
  return dirty ? "confirm" : "close";
}
