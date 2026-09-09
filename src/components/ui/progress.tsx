import { cn } from "@/lib/utils";

/**
 * 023 — Barra de progreso.
 *
 * Es una barra y no un anillo por lo mismo que la de asistencia: las preguntas
 * que responde —"¿cuánto llevo?", "¿llego al mínimo?"— son comparaciones sobre
 * un eje, y un anillo esconde el punto de referencia.
 *
 * `marker` dibuja el umbral (el mínimo de asistencia). Es opcional porque no
 * toda barra tiene uno: el avance de la cursada no tiene "mínimo", solo
 * final.
 */
export function Progress({
  value,
  marker,
  tone = "brand",
  className,
  label,
}: {
  /** 0 a 100. Se recorta: un porcentaje mal calculado no debe romper el dibujo. */
  value: number;
  /** Umbral a marcar, 0 a 100. */
  marker?: number | null;
  tone?: "brand" | "success" | "danger";
  className?: string;
  /** Lo que anuncia un lector de pantalla. Sin esto la barra no dice nada. */
  label: string;
}) {
  const pct = Math.min(100, Math.max(0, value));
  const relleno =
    tone === "success" ? "bg-success" : tone === "danger" ? "bg-danger" : "bg-brand";

  return (
    <div
      className={cn("relative h-2 overflow-hidden rounded-full bg-border", className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-500", relleno)}
        style={{ width: `${pct}%` }}
      />
      {marker !== null && marker !== undefined && marker > 0 && marker < 100 && (
        <span
          className="absolute inset-y-0 w-px bg-text-2"
          style={{ left: `${marker}%` }}
          aria-hidden
        />
      )}
    </div>
  );
}
