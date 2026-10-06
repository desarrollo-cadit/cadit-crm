"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Currency = "UYU" | "PYG" | "USD";

type Fila = {
  enrollmentId: string;
  cohortId: string;
  fecha: string;
  alumno: string;
  alumnoDeBaja: boolean;
  cohorte: string;
  curso: string;
  importe: number | null;
  currency: Currency;
};

type Grupo = {
  vendedor: { id: string; name: string; archived: boolean } | null;
  filas: Fila[];
  totales: { currency: Currency; total: number; ventas: number }[];
  sinMonto: number;
};

type Reporte = {
  periodo: { mes: string; etiqueta: string; timezone: string };
  grupos: Grupo[];
  sinVendedor: number;
};

const miles = new Intl.NumberFormat("es-UY", { maximumFractionDigits: 0 });

function fecha(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("es-UY", {
      timeZone,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

/**
 * 2026-10-06 — Ventas por vendedor del período, para pagar comisiones.
 *
 * Un bloque por vendedor con un total POR MONEDA —nunca uno general— y un
 * bloque "Sin vendedor" al final, con cada fila enlazada al roster de su
 * cohorte, que es donde se corrige. Sin porcentajes de comisión: el dueño no
 * los definió, y un número inventado en esta pantalla se paga.
 */
export function VentasPorVendedor({
  mes,
  busqueda,
}: {
  mes: string;
  busqueda: string;
}) {
  const [reporte, setReporte] = useState<Reporte | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(false);
    const params = new URLSearchParams();
    if (mes) params.set("mes", mes);
    void (async () => {
      const res = await fetch(`/api/finanzas/ventas?${params.toString()}`).catch(() => null);
      if (cancelado) return;
      setCargando(false);
      if (!res?.ok) {
        setError(true);
        return;
      }
      setReporte((await res.json()) as Reporte);
    })();
    return () => {
      cancelado = true;
    };
  }, [mes]);

  const q = busqueda.trim().toLowerCase();
  const filtra = (f: Fila) =>
    !q || `${f.alumno} ${f.cohorte} ${f.curso}`.toLowerCase().includes(q);

  if (error) {
    return (
      <p className="rounded-md border border-danger-border bg-danger-soft px-4 py-3 text-sm text-danger">
        No pudimos cargar las ventas del período. Si al reintentar sigue igual, conviene
        consultarlo con quien administra la instancia.
      </p>
    );
  }

  if (cargando && !reporte) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (!reporte) return null;

  return (
    <section className="space-y-6">
      <p className="text-xs text-text-3">
        Inscripciones en una cohorte con fecha de inscripción en el período. En una
        especialización cuenta sólo la inscripción al programa, no cada módulo. Los
        totales van por moneda y no se suman entre sí. El filtro de camada no aplica a
        esta vista.
      </p>

      {reporte.sinVendedor > 0 && (
        <p className="rounded-md border border-warning-border bg-warning-soft px-4 py-3 text-sm text-warning">
          {reporte.sinVendedor === 1
            ? "Hay 1 venta sin vendedor en este período."
            : `Hay ${reporte.sinVendedor} ventas sin vendedor en este período.`}{" "}
          Están al final de la lista, con un enlace a la cohorte para indicarlo.
        </p>
      )}

      {reporte.grupos.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
          No hubo ventas en este período.
        </p>
      ) : (
        reporte.grupos.map((g) => (
          <div
            key={g.vendedor?.id ?? "sin-vendedor"}
            className={`rounded-md border ${g.vendedor ? "border-border" : "border-warning-border"}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                {g.vendedor ? g.vendedor.name : "Sin vendedor"}
                {g.vendedor?.archived && <Badge variant="secondary">Archivado</Badge>}
              </h3>
              <span className="flex flex-wrap gap-4 text-sm">
                {g.totales.map((t) => (
                  <span key={t.currency}>
                    <span className="text-text-3">
                      {t.ventas === 1 ? "1 venta" : `${t.ventas} ventas`} · Total {t.currency}:{" "}
                    </span>
                    <span className="font-semibold tabular-nums">{miles.format(t.total)}</span>
                  </span>
                ))}
              </span>
            </div>
            {g.sinMonto > 0 && (
              <p className="px-4 pt-2 text-xs text-text-3">
                {g.sinMonto === 1
                  ? "1 venta no tiene monto cargado y no suma al total."
                  : `${g.sinMonto} ventas no tienen monto cargado y no suman al total.`}
              </p>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Alumno</TableHead>
                  <TableHead>Cohorte / curso</TableHead>
                  <TableHead className="text-right">Importe</TableHead>
                  <TableHead>Moneda</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {g.filas.filter(filtra).map((f) => (
                  <TableRow key={f.enrollmentId}>
                    <TableCell className="tabular-nums">
                      {fecha(f.fecha, reporte.periodo.timezone)}
                    </TableCell>
                    <TableCell>
                      {f.alumno}
                      {f.alumnoDeBaja && (
                        <Badge variant="secondary" className="ml-2">
                          De baja
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-text-2">
                      <a
                        href={`/cohorts/${f.cohortId}`}
                        className="underline decoration-dotted underline-offset-2 hover:decoration-solid"
                        title={g.vendedor ? "Ver la cohorte" : "Ir a la cohorte para indicar el vendedor"}
                      >
                        {f.cohorte} · {f.curso}
                      </a>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {f.importe === null ? (
                        <span className="text-text-3">Sin monto</span>
                      ) : (
                        miles.format(f.importe)
                      )}
                    </TableCell>
                    <TableCell className="text-text-3">{f.currency}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ))
      )}
    </section>
  );
}
