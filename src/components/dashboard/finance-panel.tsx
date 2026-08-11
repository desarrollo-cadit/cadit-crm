"use client";

import { useEffect, useState } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type TrendPoint = { month: string; total: number };

type FinanceDashboard = {
  currentMonth: { month: string; total: number };
  previousMonth: { month: string; total: number };
  /** 005 iteración 2 — últimos 6 meses, para el gráfico (revenueTrend). */
  trend: TrendPoint[];
};

function formatMoney(n: number) {
  return `$${n.toLocaleString("es-MX")}`;
}

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

/**
 * 005 (T039, US6, FR-019, FR-016) — panel de facturación del mes vs. el
 * anterior, solo para acceso completo. `GET /api/dashboard/finance` ya
 * responde 403 para `role: "soporte"` en el servidor (regla dura, T037) —
 * este componente además no se renderiza para ese rol (defensa en
 * profundidad, ver home page); si de todos modos se invoca, un 403 lo deja
 * simplemente sin mostrar nada.
 */
export function FinancePanel() {
  const [data, setData] = useState<FinanceDashboard | null>(null);
  const [forbidden, setForbidden] = useState(false);

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
    })();
  }, []);

  if (forbidden || !data) return null;

  const diff = data.currentMonth.total - data.previousMonth.total;
  const up = diff >= 0;

  return (
    <div className="rounded-lg border bg-card p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Facturación
      </p>
      <div className="mt-2 flex flex-wrap items-end gap-x-6 gap-y-3">
        <div>
          <p className="text-2xl font-semibold">{formatMoney(data.currentMonth.total)}</p>
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
            {formatMoney(diff)}
          </span>
          <span className="text-muted-foreground">
            vs. {formatMoney(data.previousMonth.total)} en {formatMonth(data.previousMonth.month)}
          </span>
        </div>
      </div>

      {/* 005 iteración 2 — tendencia de los últimos 6 meses (recharts, pedido explícito del dueño). */}
      {data.trend.length > 0 && (
        <div className="mt-4 h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.trend} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              <XAxis
                dataKey="month"
                tickFormatter={formatMonthShort}
                tick={{ fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis hide />
              <Tooltip
                formatter={(value) => formatMoney(Number(value ?? 0))}
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
