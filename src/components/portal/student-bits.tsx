"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * 015 — Las piezas compartidas de las pantallas del alumno.
 *
 * Están juntas por una razón concreta: el porcentaje de asistencia, el estado
 * de aprobación y la hora de una clase aparecen en el inicio, en el detalle de
 * la cursada y en el estado de cuenta. Con una copia por pantalla, la que se
 * olvide de la regla —que `null` es "sin datos" y no "cero"— la imprime mal, y
 * ese error se lo lleva puesto una persona leyendo sobre sí misma.
 */

/* ============================================================
 * FR-011 — La hora, en la zona de quien mira
 * ============================================================ */

/**
 * La zona horaria del navegador, o `null` hasta que el componente monta.
 *
 * Se resuelve en un efecto y no al renderizar porque el servidor no la conoce:
 * calcularla en el cuerpo daría un HTML distinto al del cliente y React
 * descartaría el árbol entero. Mientras es `null` se muestra la hora de la
 * academia, que es la que el servidor ya resolvió bien.
 */
export function useViewerTimeZone(): string | null {
  const [zona, setZona] = useState<string | null>(null);
  useEffect(() => {
    try {
      setZona(Intl.DateTimeFormat().resolvedOptions().timeZone || null);
    } catch {
      setZona(null);
    }
  }, []);
  return zona;
}

/** Nombre corto de una zona, tal como lo diría alguien: "Asunción". */
export function zoneLabel(timeZone: string): string {
  const ultimo = timeZone.split("/").pop() ?? timeZone;
  return ultimo.replace(/_/g, " ");
}

export function formatHour(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("es-UY", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export function formatDay(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("es-UY", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(iso));
}

/** Fecha corta para tablas y listas: `12 mar 2026`. */
export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("es-UY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}

/** "hoy", "mañana", "en 3 días", "hace 2 días". */
export function relativeDay(iso: string, timeZone: string): string {
  const dia = (d: Date) =>
    Number(
      new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
        .format(d)
        .replace(/-/g, "")
    );
  const objetivo = new Date(iso);
  const hoy = new Date();
  const dif = Math.round(
    (Date.UTC(objetivo.getUTCFullYear(), objetivo.getUTCMonth(), objetivo.getUTCDate()) -
      Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate())) /
      86_400_000
  );
  // `dia()` fija la comparación en la zona pedida cuando el corte del día
  // importa; el resto sale de la diferencia en días completos.
  if (dia(objetivo) === dia(hoy)) return "hoy";
  if (dif === 1) return "mañana";
  if (dif === -1) return "ayer";
  if (dif > 1) return `en ${dif} días`;
  return `hace ${Math.abs(dif)} días`;
}

/**
 * La hora de una clase, con la zona de la academia cuando NO coincide con la
 * de quien mira (FR-011).
 *
 * 42 alumnos están en Paraguay y 45 en otros países. Mostrarles "18:30" sin
 * aclarar de dónde es esa hora hace que alguien se pierda la clase — y es un
 * error que no se ve nunca en una prueba hecha desde Montevideo.
 */
export function ClassTime({
  startsAt,
  endsAt,
  academyZone,
}: {
  startsAt: string | null;
  endsAt: string | null;
  academyZone: string;
}) {
  const viewerZone = useViewerTimeZone();

  if (!startsAt) {
    return <span className="text-text-3">Sin horario cargado</span>;
  }

  const zona = viewerZone ?? academyZone;
  const distinta = viewerZone !== null && viewerZone !== academyZone;

  const rango = endsAt
    ? `${formatHour(startsAt, zona)}–${formatHour(endsAt, zona)}`
    : formatHour(startsAt, zona);

  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
      <span className="tabular-nums">{rango}</span>
      {distinta && (
        <span className="text-xs text-text-3">
          tu hora · {formatHour(startsAt, academyZone)} en {zoneLabel(academyZone)}
        </span>
      )}
    </span>
  );
}

/* ============================================================
 * Asistencia
 * ============================================================ */

/**
 * La barra de asistencia, con el mínimo marcado.
 *
 * Es una barra y no un anillo de progreso porque la pregunta del alumno no es
 * "¿cuánto llevo?" sino "¿llego al mínimo?", y eso es una comparación entre
 * dos valores sobre un eje. Un anillo esconde justamente el segundo.
 *
 * `pct === null` no dibuja barra: **0% porque nadie pasó lista no es 0% porque
 * no vino** (SC-004), y una barra vacía dice lo segundo.
 */
export function AttendanceBar({
  pct,
  min,
  attended,
  eligible,
}: {
  pct: number | null;
  min: number | null;
  attended: number;
  eligible: number;
}) {
  if (pct === null) {
    return (
      <p className="text-sm text-text-3">
        Todavía no se registró asistencia en esta cursada.
      </p>
    );
  }

  const alcanza = min === null || pct >= min;

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold tabular-nums">{pct}%</span>
        <span className="text-text-3">
          {attended} de {eligible} {eligible === 1 ? "clase" : "clases"}
          {min !== null && ` · mínimo ${min}%`}
        </span>
      </div>
      <div
        className="relative h-2 overflow-hidden rounded-full bg-border"
        role="img"
        aria-label={`Asistencia ${pct}%${min !== null ? `, mínimo ${min}%` : ""}`}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width]",
            alcanza ? "bg-success" : "bg-danger"
          )}
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
        {min !== null && min > 0 && min < 100 && (
          <span
            className="absolute inset-y-0 w-px bg-text-2"
            style={{ left: `${min}%` }}
            aria-hidden
          />
        )}
      </div>
    </div>
  );
}

/* ============================================================
 * Aprobación
 * ============================================================ */

export type ApprovalValue = "aprobado" | "reprobado" | "pendiente" | "sin_datos";

const APROBACION: Record<
  ApprovalValue,
  { label: string; className: string }
> = {
  aprobado: {
    label: "Aprobado",
    className: "border-success-border bg-success-soft text-success",
  },
  reprobado: {
    label: "No alcanzado",
    className: "border-danger-border bg-danger-soft text-danger",
  },
  pendiente: {
    label: "En curso",
    className: "border-warning-border bg-warning-soft text-warning",
  },
  /**
   * DV-003 — La mayoría de las 41 cohortes importadas está acá. Decirle
   * "Aprobado" a alguien de quien no se cargó una sola nota es afirmar algo
   * que el sistema no puede respaldar; decirle "0%" es peor.
   */
  sin_datos: {
    label: "Sin registro",
    className: "border-border bg-secondary text-text-2",
  },
};

export function ApprovalBadge({ value }: { value: ApprovalValue }) {
  const { label, className } = APROBACION[value];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        className
      )}
    >
      {label}
    </span>
  );
}

/* ============================================================
 * Superficies
 * ============================================================ */

/** La tarjeta del portal: un solo lugar donde vive el aire y el radio. */
export function PortalCard({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card p-[var(--portal-card-pad)] shadow-sm",
        className
      )}
      {...props}
    />
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-wide text-text-3">
      {children}
    </h2>
  );
}

/**
 * El vacío honesto. Dice qué falta y por qué, no "no hay datos".
 */
export function EmptyNote({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border p-6 text-center">
      <p className="text-sm font-medium">{title}</p>
      {children && <p className="mt-2 text-sm text-muted-foreground">{children}</p>}
    </div>
  );
}
