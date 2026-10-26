"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { formatAmount } from "@/lib/utils";

type Currency = "UYU" | "PYG" | "USD";

export type FilaDeMorosidad = {
  enrollmentId: string;
  contact: { id: string; name: string };
  overdueAmount: number;
  currency: Currency;
  daysOverdue: number;
};

/** Cuántas filas entran en la tarjeta del inicio. */
export const FILAS_EN_EL_INICIO = 3;

/**
 * 2026-10-26 — La morosidad en el inicio, en chico: las personas con más
 * atraso y un enlace a la lista entera (`/finanzas/morosidad`, con el filtro
 * de atraso mínimo). Lee el MISMO `GET /api/dashboard/overdue`, que ya viene
 * ordenado de mayor a menor atraso; con `cobranza.ver`, igual que antes.
 */
export function MorosidadResumen() {
  const [filas, setFilas] = useState<FilaDeMorosidad[] | null>(null);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/dashboard/overdue?minDaysOverdue=0").catch(() => null);
      if (!res?.ok) {
        setFallo(true);
        return;
      }
      setFilas(((await res.json()) as { rows: FilaDeMorosidad[] }).rows);
    })();
  }, []);

  if (fallo) return null;
  if (filas === null) return <Skeleton className="h-36 w-full" />;
  return <TarjetaDeMorosidad filas={filas} />;
}

export function TarjetaDeMorosidad({ filas }: { filas: readonly FilaDeMorosidad[] }) {
  return (
    <div className="min-w-0 rounded-md border bg-muted px-4 py-3.5">
      <h3 className="mb-2 text-[13px] font-semibold text-text-2">Morosidad</h3>
      {filas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nadie con cuotas vencidas.</p>
      ) : (
        <>
          <ul className="space-y-1.5">
            {filas.slice(0, FILAS_EN_EL_INICIO).map((r) => (
              <li key={r.enrollmentId} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">{r.contact.name}</span>
                <span className="shrink-0 tabular-nums text-destructive">
                  {formatAmount(r.overdueAmount, r.currency)} · {r.daysOverdue}{" "}
                  {r.daysOverdue === 1 ? "día" : "días"}
                </span>
              </li>
            ))}
          </ul>
          <Link
            href="/finanzas/morosidad"
            className="mt-2 inline-block text-xs font-medium text-brand-text hover:underline"
          >
            {filas.length > FILAS_EN_EL_INICIO ? `Ver los ${filas.length} →` : "Ver el detalle →"}
          </Link>
        </>
      )}
    </div>
  );
}
