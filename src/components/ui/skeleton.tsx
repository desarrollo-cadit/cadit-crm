import { cn } from "@/lib/utils";

/**
 * Iteración 3 — primitivo de carga reusable: evita el "flash" del mensaje de
 * vacío antes de que la respuesta del fetch llegue. Sin animación elaborada
 * por pantalla — consistencia sobre sofisticación visual.
 */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-secondary", className)}
      {...props}
    />
  );
}
