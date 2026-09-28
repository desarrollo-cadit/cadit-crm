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
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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

/**
 * 029 — La grilla alumno × módulo del Recorrido, UNA para las tres pantallas
 * que la muestran: la pestaña Recorrido (con acciones por celda) y el resumen
 * "Todos" de Asistencia y Evaluación (de solo lectura).
 *
 * Cada celda es una insignia que DICE el estado —aprobado, cursando,
 * reprobado, pendiente, sin datos, baja → otra camada, recursa—; el color
 * acompaña. Al
 * pasar el mouse, la asistencia real y los motivos; el clic lleva al módulo.
 * La última columna es el estado general del certificado. Nada de plata.
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
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Alumno</TableHead>
            {columnas.map((c) => (
              <TableHead key={c.cohortId} className="min-w-[9rem]">
                <Link href={`/cohorts/${c.cohortId}`} className="hover:underline">
                  {c.label}
                </Link>
              </TableHead>
            ))}
            <TableHead>Certificado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {alumnos.map((a) => (
            <TableRow key={a.enrollmentId}>
              <TableCell className="font-medium">{a.contact.name}</TableCell>
              {columnas.map((col) => {
                const intentos = intentosDeLaColumna(a.modules, col);
                const celda = estadoDeCelda(intentos, col, ahora);
                const vigente = intentoVigente(intentos);
                return (
                  <TableCell key={col.cohortId} data-estado={celda.kind}>
                    {celda.href ? (
                      <Link
                        href={celda.href}
                        title={celda.title}
                        aria-label={`${a.contact.name}, ${col.label}: ${celda.label}. ${celda.title}`}
                      >
                        <Badge variant={celda.variant}>{celda.label}</Badge>
                      </Link>
                    ) : (
                      <span className="text-xs text-muted-foreground" title={celda.title}>
                        —
                      </span>
                    )}
                    {vigente?.attendancePct !== undefined && vigente.attendancePct !== null ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {vigente.attendancePct}% asistencia
                      </p>
                    ) : null}
                    {/*
                      FR-025 — El motivo no alcanza con que viaje en el título:
                      tiene que LEERSE en la celda. "Con dispensa" dice que la
                      hay; la línea de motivos dice quién, cuándo y por qué —y,
                      sin dispensa, por qué el módulo está como está—.
                    */}
                    {vigente?.dispensada ? (
                      <p className="mt-1 text-xs text-warning">Con dispensa</p>
                    ) : null}
                    {vigente && vigente.reasons.length > 0 ? (
                      <p className="mt-1 max-w-[14rem] text-xs text-muted-foreground">
                        {vigente.reasons.join(" · ")}
                      </p>
                    ) : null}
                    {acciones && vigente ? (
                      <div className="mt-1 flex flex-wrap gap-1">{acciones(a, vigente)}</div>
                    ) : null}
                  </TableCell>
                );
              })}
              <TableCell title={a.reasons.join(" · ") || undefined}>
                <Badge variant={GENERAL[a.state].variant}>{GENERAL[a.state].label}</Badge>
                {a.reasons.length > 0 ? (
                  <p className="mt-1 max-w-[16rem] text-xs text-muted-foreground">
                    {a.reasons.join(" · ")}
                  </p>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
