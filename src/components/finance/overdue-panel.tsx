"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatAmount } from "@/lib/utils";

type Currency = "UYU" | "PYG" | "USD";

type OverdueRow = {
  enrollmentId: string;
  contact: { id: string; name: string };
  cohort: { id: string; name: string };
  overdueCount: number;
  overdueAmount: number;
  currency: Currency;
  oldestDueDate: string;
  daysOverdue: number;
};

type Overdue = {
  asOf: string;
  byCurrency: { currency: Currency; overdueTotal: number; enrollments: number }[];
  rows: OverdueRow[];
};

/**
 * 008 (T022) — Vista de morosidad.
 *
 * Ordenada por días de atraso descendente, que es el orden en que se llama a
 * la gente. Los totales van SEPARADOS por moneda: sumar pesos con guaraníes
 * da un número que no significa nada.
 */
export function OverduePanel() {
  const [data, setData] = useState<Overdue | null>(null);
  const [loading, setLoading] = useState(true);
  const [minDays, setMinDays] = useState("0");

  const refetch = useCallback(async () => {
    const res = await fetch(
      `/api/dashboard/overdue?minDaysOverdue=${encodeURIComponent(minDays || "0")}`
    ).catch(() => null);
    if (res?.ok) setData((await res.json()) as Overdue);
    setLoading(false);
  }, [minDays]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  if (loading) return <Skeleton className="h-40 w-full" />;
  if (!data) return null;

  const conDeuda = data.byCurrency.filter((c) => c.enrollments > 0);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Morosidad</h2>
          <p className="text-xs text-muted-foreground">
            Cuotas vencidas y sin saldar, de mayor a menor atraso.
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="min-days" className="text-xs">
            Atraso mínimo (días)
          </Label>
          <Input
            id="min-days"
            type="number"
            min={0}
            className="h-8 w-28"
            value={minDays}
            onChange={(e) => setMinDays(e.target.value)}
          />
        </div>
      </div>

      {conDeuda.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {conDeuda.map((c) => (
            <div key={c.currency} className="rounded-md border px-3 py-2">
              <p className="text-lg font-semibold text-destructive">
                {formatAmount(c.overdueTotal, c.currency)}
              </p>
              <p className="text-xs text-muted-foreground">
                {c.enrollments} {c.enrollments === 1 ? "alumno" : "alumnos"} · {c.currency}
              </p>
            </div>
          ))}
        </div>
      )}

      {data.rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nadie con cuotas vencidas.
        </p>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader className="bg-subtle">
              <TableRow>
                <TableHead>Alumno</TableHead>
                <TableHead>Cohorte</TableHead>
                <TableHead className="text-right">Vencido</TableHead>
                <TableHead className="text-center">Cuotas</TableHead>
                <TableHead className="text-right">Atraso</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((r) => (
                <TableRow key={r.enrollmentId}>
                  <TableCell className="font-medium">{r.contact.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    <Link href={`/cohorts/${r.cohort.id}`} className="hover:underline">
                      {r.cohort.name}
                    </Link>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-medium text-destructive">
                    {formatAmount(r.overdueAmount, r.currency)}
                  </TableCell>
                  <TableCell className="text-center text-xs">{r.overdueCount}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={r.daysOverdue > 30 ? "destructive" : "warning"}>
                      {r.daysOverdue} d
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
