"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Sello, TituloDeVista } from "@/components/portal/plano";

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
  // El día calendario en la zona pedida, como número de días desde 1970. Las
  // dos fechas se miden igual: si una se midiera en UTC, cerca de medianoche
  // una clase de mañana se leería "hace 0 días".
  const dia = (d: Date) => {
    const [y, m, dd] = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .format(d)
      .split("-")
      .map(Number);
    return Date.UTC(y!, m! - 1, dd!) / 86_400_000;
  };
  const dif = dia(new Date(iso)) - dia(new Date());
  if (dif === 0) return "hoy";
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
          hora local · {formatHour(startsAt, academyZone)} en {zoneLabel(academyZone)}
        </span>
      )}
    </span>
  );
}

/* ============================================================
 * Aprobación
 * ============================================================ */

export type ApprovalValue = "aprobado" | "reprobado" | "pendiente" | "sin_datos";

const APROBACION: Record<
  ApprovalValue,
  { label: string; tone: "ok" | "revision" | "curso" | "neutro" }
> = {
  aprobado: { label: "Aprobado", tone: "ok" },
  reprobado: { label: "No aprobado", tone: "revision" },
  pendiente: { label: "En curso", tone: "curso" },
  /**
   * DV-003 — La mayoría de las 41 cohortes importadas está acá. Decirle
   * "Aprobado" a alguien de quien no se cargó una sola nota es afirmar algo
   * que el sistema no puede respaldar; decirle "0%" es peor.
   *
   * En el mundo Cianotipo es el único sello de trazo punteado: la misma
   * convención que la línea de lo que todavía no existe.
   */
  sin_datos: { label: "Sin registro", tone: "neutro" },
};

/**
 * El estado de una cursada, como sello sobre la hoja. Sobre una lámina azul
 * (`onSheet`) el sello va en tinta blanca, salvo "no alcanzado", que conserva
 * el rojo de revisión: es lo único que tiene que llamar la atención.
 */
export function ApprovalBadge({
  value,
  onSheet = false,
}: {
  value: ApprovalValue;
  onSheet?: boolean;
}) {
  const { label, tone } = APROBACION[value];
  return (
    <Sello
      tone={onSheet ? (value === "reprobado" ? "lamina-revision" : "lamina") : tone}
      className={cn(onSheet && value === "sin_datos" && "border-dashed")}
    >
      {label}
    </Sello>
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
  return <TituloDeVista>{children}</TituloDeVista>;
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
