import { cn } from "@/lib/utils";

/**
 * 007 — `<select>` con el estilo de la casa, mismo criterio que `Input` y
 * `Table`: un wrapper de Tailwind sobre el elemento nativo, SIN dependencias
 * nuevas (este repo no usa Radix ni el CLI de shadcn; sus primitivas de `ui/`
 * están escritas a mano).
 *
 * Existe porque el `<select>` nativo suelto aparecía copiado con clases
 * distintas en una decena de pantallas, y cada una se veía apenas diferente.
 * El elemento nativo se conserva a propósito: en móvil abre el selector del
 * sistema, que es mejor que cualquier menú que dibujemos nosotros.
 */
export function Select({
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "flex h-9 w-full rounded-md border border-input hover:border-text-3 bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}
