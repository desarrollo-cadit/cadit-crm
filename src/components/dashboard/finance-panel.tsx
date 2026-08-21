"use client";

import { useEffect, useState } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn, formatAmount } from "@/lib/utils";

type CurrencyTotal = { currency: string; total: number };
type MonthTotals = { month: string; totals: CurrencyTotal[] };

type FinanceDashboard = {
  currentMonth: MonthTotals;
  previousMonth: MonthTotals;
  /** 005 iteración 2 — últimos 6 meses, para el gráfico (revenueTrend). */
  trend: MonthTotals[];
  /** 007 — monedas con movimiento en la ventana; al menos una. */
  currencies: string[];
};

function formatMonth(key: string) {
  const [year, month] = key.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("es-MX", { month: "long", year: "numeric" });
}

function formatMonthShort(key: string) {
  const [year, month] = key.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("es-MX", { month: "short" });
}

/** Total de UNA moneda dentro de un mes; 0 si esa moneda no vendió. */
function totalOf(month: MonthTotals | undefined, currency: string): number {
  return month?.totals.find((t) => t.currency === currency)?.total ?? 0;
}

/**
 * 005 (T039, US6, FR-019, FR-016) — panel de facturación del mes vs. el
 * anterior, solo para acceso completo. `GET /api/dashboard/finance` ya
 * responde 403 para `role: "soporte"` en el servidor (regla dura, T037) —
 * este componente además no se renderiza para ese rol (defensa en
 * profundidad, ver home page); si de todos modos se invoca, un 403 lo deja
 * simplemente sin mostrar nada.
 *
 * 007 (corrección) — una moneda por vez. El endpoint ya no devuelve un total
 * único (sumaba pesos con guaraníes y dólares), así que el panel elige una
 * moneda y muestra su cifra, su delta y su tendencia. Las pestañas aparecen
 * SOLO si hay más de una moneda con movimiento: con una sola —el caso
 * habitual— la pantalla queda igual que antes. No se grafican juntas a
 * propósito: 4.000.000 PYG al lado de 150.000 UYU aplasta la barra chica y
 * sugiere una comparación que no existe sin tipo de cambio.
 */
export function FinancePanel() {
  const [data, setData] = useState<FinanceDashboard | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [currency, setCurrency] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/dashboard/finance").catch(() => null);
      if (res?.status === 403) {
        setForbidden(true);
        return;
      }
      if (!res?.ok) return;
      const json = (await res.json()) as FinanceDashboard;
      setData(json);
      setCurrency(json.currencies[0] ?? "UYU");
    })();
  }, []);

  if (forbidden || !data || !currency) return null;

  const current = totalOf(data.currentMonth, currency);
  const previous = totalOf(data.previousMonth, currency);
  const diff = current - previous;
  const up = diff >= 0;
  const chartData = data.trend.map((point) => ({
    month: point.month,
    total: totalOf(point, currency),
  }));

  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Facturación
        </p>
        {data.currencies.length > 1 && (
          <div className="flex gap-1" role="tablist" aria-label="Moneda">
            {data.currencies.map((code) => (
              <button
                key={code}
                type="button"
                role="tab"
                aria-selected={code === currency}
                onClick={() => setCurrency(code)}
                className={cn(
                  "rounded-md px-2 py-0.5 text-xs font-medium transition-colors",
                  code === currency
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                {code}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-end gap-x-6 gap-y-3">
        <div>
          <p className="text-2xl font-semibold">{formatAmount(current, currency)}</p>
          <p className="text-xs text-muted-foreground capitalize">
            {formatMonth(data.currentMonth.month)}
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-sm">
          {up ? (
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          ) : (
            <TrendingDown className="h-4 w-4 text-destructive" />
          )}
          <span className={up ? "text-emerald-500" : "text-destructive"}>
            {up ? "+" : ""}
            {formatAmount(diff, currency)}
          </span>
          <span className="text-muted-foreground">
            vs. {formatAmount(previous, currency)} en {formatMonth(data.previousMonth.month)}
          </span>
        </div>
      </div>

      {/* 005 iteración 2 — tendencia de los últimos 6 meses (recharts, pedido explícito del dueño). */}
      {chartData.length > 0 && (
        <div className="mt-4 h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              <XAxis
                dataKey="month"
                tickFormatter={formatMonthShort}
                tick={{ fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis hide />
              <Tooltip
                formatter={(value) => formatAmount(Number(value ?? 0), currency)}
                labelFormatter={(label) => formatMonth(String(label ?? ""))}
                contentStyle={{ fontSize: 12 }}
              />
              <Bar dataKey="total" fill="#25D366" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
