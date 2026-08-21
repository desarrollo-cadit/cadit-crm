import { cn } from "@/lib/utils";

/**
 * 007 — Casilla con el estilo de la casa. Mismo criterio que `Select`: envuelve
 * el `<input type="checkbox">` nativo con Tailwind, sin dependencias nuevas.
 *
 * Se mantiene nativo a propósito: ya trae foco por teclado, barra espaciadora,
 * estado indeterminado y lectura correcta por lectores de pantalla. Una
 * casilla dibujada con divs hay que reimplementar todo eso a mano, y
 * normalmente se hace mal.
 */
export function Checkbox({
  className,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">) {
  return (
    <input
      type="checkbox"
      className={cn(
        "h-4 w-4 shrink-0 cursor-pointer rounded border-input accent-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

/** Casilla + etiqueta clickeable, que es como se usa en casi todas las pantallas. */
export function CheckboxField({
  label,
  className,
  children,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <label className={cn("flex items-center gap-1.5 text-xs", className)}>
      <Checkbox {...props} />
      {label}
      {children}
    </label>
  );
}
