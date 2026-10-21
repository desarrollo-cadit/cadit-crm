"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  estadoDeCelda,
  intentoVigente,
  intentosDeLaColumna,
  type ColumnaDeModulo,
  type IntentoDeModulo,
} from "@/lib/recorrido";
import { nivelDePorcentaje, type NivelDePorcentaje } from "@/lib/attendance-grid";
import { etiquetaCortaDeModulo } from "@/lib/program-order";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** El estado GENERAL de la especialización: `sin_datos` es de los módulos. */
type Estado = "aprobado" | "reprobado" | "pendiente";

export type ColumnaDelRecorrido = ColumnaDeModulo & { label: string };

export type IntentoDelRecorrido = IntentoDeModulo & { enrollmentId: string; label: string };

export type AlumnoDelRecorrido<I extends IntentoDelRecorrido = IntentoDelRecorrido> = {
  enrollmentId: string;
  contact: { id: string; name: string };
  state: Estado;
  reasons: string[];
  modules: I[];
};

/** El estado GENERAL —el del certificado de la especialización—, en palabras. */
const GENERAL: Record<Estado, { label: string; variant: "success" | "destructive" | "outline" }> = {
  aprobado: { label: "Certifica", variant: "success" },
  reprobado: { label: "No certifica", variant: "destructive" },
  pendiente: { label: "Pendiente", variant: "outline" },
};

/** El % de asistencia contra el mínimo del módulo; solo tokens. */
const NIVEL_CLASS: Record<NivelDePorcentaje, string> = {
  sin_datos: "text-muted-foreground",
  sin_minimo: "text-text-2",
  bajo: "text-danger",
  ok: "text-success",
};

const BADGE_COMPACTO = "px-1.5 py-0 text-[11px] leading-5";

/**
 * 029 / 2026-10-21 — La grilla alumno × módulo del Recorrido, UNA para las
 * tres pantallas que la muestran: la pestaña Recorrido (con acciones por
 * celda) y el resumen "Todos" de Asistencia y Evaluación (de solo lectura).
 *
 * Compacta como la planilla de asistencia: una fila por alumno, nombre y
 * encabezado fijos, desplazamiento dentro de la tabla. Cada celda es una
 * insignia que DICE el estado —aprobado, cursando, reprobado, pendiente, sin
 * datos, baja → otra camada, recursa— y el % de asistencia (la regla de
 * `attendancePercentage`: solo clases dictadas). El clic lleva al módulo.
 *
 * FR-025 — El motivo de cada celda (y la lista del certificado) NO va como
 * texto suelto en la fila: va en el `title` y como descripción accesible
 * (`aria-describedby`), así el lector de pantalla lo lee completo y la grilla
 * se puede recorrer de un vistazo. Nada de plata.
 */
export function RecorridoGrid<I extends IntentoDelRecorrido>({
  columnas,
  alumnos,
  ahora,
  acciones,
}: {
  columnas: readonly ColumnaDelRecorrido[];
  alumnos: readonly AlumnoDelRecorrido<I>[];
  ahora: Date;
  /** Lo que se puede hacer sobre la celda; sin esto la grilla es de lectura. */
  acciones?: (alumno: AlumnoDelRecorrido<I>, intento: I) => ReactNode;
}) {
  return (
    <div className="max-h-[calc(100vh-14rem)] max-w-full overflow-auto rounded-lg border">
      <table className="border-separate border-spacing-0 text-xs" aria-label="Recorrido por módulo">
        <thead>
          <tr>
            <th
              scope="col"
              className="sticky left-0 top-0 z-30 min-w-[12rem] border-b border-r bg-subtle px-3 py-1.5 text-left font-medium text-muted-foreground"
            >
              Alumno
            </th>
            {columnas.map((c) => (
              <th
                key={c.cohortId}
                scope="col"
                className="sticky top-0 z-20 min-w-[8.5rem] border-b bg-subtle px-2 py-1.5 text-left font-medium"
              >
                <Link
                  href={`/cohorts/${c.cohortId}`}
                  title={c.label}
                  className="block max-w-[11rem] truncate hover:underline"
                >
                  {etiquetaCortaDeModulo(c.label)}
                </Link>
              </th>
            ))}
            <th
              scope="col"
              className="sticky top-0 z-20 border-b border-l bg-subtle px-2 py-1.5 text-left font-medium text-muted-foreground"
            >
              Certificado
            </th>
          </tr>
        </thead>
        <tbody>
          {alumnos.map((a) => {
            const idCert = `cert-${a.enrollmentId}`;
            const motivosCert = a.reasons.join(" · ");
            return (
              <tr key={a.enrollmentId} className="group">
                <th
                  scope="row"
                  className="sticky left-0 z-10 h-8 max-w-[16rem] truncate border-b border-r bg-card px-3 text-left font-medium group-hover:bg-accent"
                  title={a.contact.name}
                >
                  {a.contact.name}
                </th>
                {columnas.map((col) => {
                  const intentos = intentosDeLaColumna(a.modules, col);
                  const celda = estadoDeCelda(intentos, col, ahora);
                  const vigente = intentoVigente(intentos);
                  const pct = vigente?.attendancePct ?? null;
                  const nivel = nivelDePorcentaje(pct, vigente?.minAttendancePct ?? null);
                  const idMotivo = `mot-${a.enrollmentId}-${col.cohortId}`;
                  const motivos = vigente && vigente.reasons.length > 0 ? vigente.reasons.join(" · ") : "";
                  return (
                    <td
                      key={col.cohortId}
                      data-estado={celda.kind}
                      className="h-8 border-b px-2 group-hover:bg-accent"
                    >
                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                        {celda.href ? (
                          <Link
                            href={celda.href}
                            title={celda.title}
                            aria-label={`${a.contact.name}, ${col.label}: ${celda.label}`}
                            aria-describedby={idMotivo}
                            className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <Badge variant={celda.variant} className={BADGE_COMPACTO}>
                              {celda.label}
                            </Badge>
                          </Link>
                        ) : (
                          <span
                            className="text-muted-foreground"
                            title={celda.title}
                            aria-label={`${a.contact.name}, ${col.label}: ${celda.title}`}
                          >
                            —
                          </span>
                        )}
                        {vigente ? (
                          <span
                            className={cn("tabular-nums", NIVEL_CLASS[nivel])}
                            title={
                              pct === null
                                ? "Asistencia: sin datos"
                                : vigente.minAttendancePct === null
                                  ? `Asistencia ${pct}%`
                                  : `Asistencia ${pct}% (mínimo ${vigente.minAttendancePct}%)`
                            }
                          >
                            {pct === null ? "—" : `${pct}%`}
                          </span>
                        ) : null}
                        {vigente?.dispensada ? (
                          <span className="text-warning" title="Con dispensa de asistencia">
                            D<span className="sr-only">: con dispensa</span>
                          </span>
                        ) : null}
                        {/* La descripción completa para el lector de pantalla: estado, asistencia y motivos. */}
                        <span id={idMotivo} className="sr-only">
                          {[celda.title, motivos].filter(Boolean).join(" · ")}
                        </span>
                        {/* En la misma línea: la fila no crece con las acciones. */}
                        {acciones && vigente ? (
                          <span className="ml-auto flex items-center gap-1">{acciones(a, vigente)}</span>
                        ) : null}
                      </div>
                    </td>
                  );
                })}
                <td className="h-8 border-b border-l px-2 group-hover:bg-accent">
                  <span title={motivosCert || undefined} aria-describedby={motivosCert ? idCert : undefined}>
                    <Badge variant={GENERAL[a.state].variant} className={BADGE_COMPACTO}>
                      {GENERAL[a.state].label}
                    </Badge>
                  </span>
                  {motivosCert ? (
                    <span id={idCert} className="sr-only">
                      {motivosCert}
                    </span>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
