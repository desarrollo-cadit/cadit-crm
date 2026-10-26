"use client";

import { useEffect, useState } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn, formatAmount } from "@/lib/utils";
import { useCssVar } from "@/components/use-css-var";
import { Skeleton } from "@/components/ui/skeleton";

type CurrencyTotal = { currency: string; total: number };
type MonthTotals = { month: string; totals: CurrencyTotal[] };

type FinanceDashboard = {
  currentMonth: MonthTotals;
  previousMonth: MonthTotals;
  /**
   * 008 — lo COBRADO, con la misma forma que lo facturado. Va al lado y no
   * en otra pantalla: el hueco entre los dos números ES el dato. Facturar
   * mucho y cobrar poco se tiene que ver de un vistazo.
   */
  collected?: { currentMonth: MonthTotals; previousMonth: MonthTotals };
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
  const [fallo, setFallo] = useState(false);
  const [currency, setCurrency] = useState<string | null>(null);
  const acento = useCssVar("--accent", "#3f5972");

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/dashboard/finance").catch(() => null);
      if (res?.status === 403) {
        setForbidden(true);
        return;
      }
      if (!res?.ok) {
        setFallo(true);
        return;
      }
      const json = (await res.json()) as FinanceDashboard;
      setData(json);
      setCurrency(json.currencies[0] ?? "UYU");
    })();
  }, []);

  if (forbidden || fallo) return null;
  // Mientras carga, el lugar de la tarjeta: que la grilla del mes no salte.
  if (!data || !currency) return <Skeleton className="h-36 w-full" />;

  const current = totalOf(data.currentMonth, currency);
  const previous = totalOf(data.previousMonth, currency);
  const collected = data.collected ? totalOf(data.collected.currentMonth, currency) : null;
  const diff = current - previous;
  const up = diff >= 0;
  const chartData = data.trend.map((point) => ({
    month: point.month,
    total: totalOf(point, currency),
  }));

  /**
   * 2026-10-26 — Tarjeta callada de "Este mes": la cifra del mes, lo cobrado
   * y la diferencia con el anterior, y la tendencia de 6 meses en chico. Es
   * información de lectura; lo que hay que hacer vive arriba, en Para resolver.
   */
  return (
    <div className="min-w-0 rounded-md border bg-muted px-4 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-text-2">Facturación</h3>
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
                    ? "bg-brand-soft text-brand-text"
                    : "text-muted-foreground hover:bg-accent"
                )}
              >
                {code}
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="mt-2 text-[22px] font-semibold leading-tight tabular-nums">
        {formatAmount(current, currency)}{" "}
        <span className="text-xs font-normal text-muted-foreground">facturado</span>
      </p>
      <p className="text-xs capitalize text-muted-foreground">{formatMonth(data.currentMonth.month)}</p>
      {collected !== null && (
        <p className="mt-1.5 text-sm">
          <span className="font-medium tabular-nums text-brand-text">{formatAmount(collected, currency)}</span>{" "}
          <span className="text-xs text-muted-foreground">
            cobrado
            {current > 0 ? ` (${Math.round((collected / current) * 100)}% de lo facturado)` : ""}
          </span>
        </p>
      )}
      <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs">
        {up ? (
          <TrendingUp className="h-3.5 w-3.5 text-success" aria-hidden />
        ) : (
          <TrendingDown className="h-3.5 w-3.5 text-destructive" aria-hidden />
        )}
        <span className={up ? "text-success" : "text-destructive"}>
          {up ? "+" : ""}
          {formatAmount(diff, currency)}
        </span>
        <span className="text-muted-foreground">
          frente a {formatMonth(data.previousMonth.month)}
        </span>
      </p>

      {/* 005 iteración 2 — tendencia de los últimos 6 meses (recharts, pedido explícito del dueño). */}
      {chartData.length > 0 && (
        <div className="mt-3 h-24">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
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
              {/* 021 — Era `#25D366`, el verde de WhatsApp, escrito a mano.
                  Recharts recibe un color, no una clase, así que se lee la
                  variable en runtime. */}
              <Bar dataKey="total" fill={acento} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
