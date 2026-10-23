"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import type { MetricasDeRecompra } from "@/lib/marketing/recompra";
import { cn } from "@/lib/utils";

/**
 * 046 (US5; FR-011, FR-012, SC-004) — ¿Cuánto se recompra? Tasa de recompra,
 * tiempo promedio entre un curso y el siguiente, y qué cursos llevan más a
 * otro, para el período elegido. Las cifras las calcula el servidor con la
 * misma definición de "cursó" que la ficha y las audiencias.
 */

type Preset = "12m" | "anio" | "todo" | "medida";

const PRESETS: { key: Preset; label: string }[] = [
  { key: "12m", label: "Últimos 12 meses" },
  { key: "anio", label: "Este año" },
  { key: "todo", label: "Todo" },
  { key: "medida", label: "A medida" },
];

const dia = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function rangoDe(preset: Preset): { desde: string; hasta: string } {
  const hoy = new Date();
  if (preset === "12m") {
    const desde = new Date(hoy);
    desde.setFullYear(desde.getFullYear() - 1);
    desde.setDate(desde.getDate() + 1);
    return { desde: dia(desde), hasta: dia(hoy) };
  }
  if (preset === "anio") return { desde: `${hoy.getFullYear()}-01-01`, hasta: dia(hoy) };
  return { desde: "", hasta: "" };
}

export function RepurchaseView() {
  const [preset, setPreset] = useState<Preset>("12m");
  const [rango, setRango] = useState(() => rangoDe("12m"));
  const [data, setData] = useState<MetricasDeRecompra | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const pedido = useRef(0);

  useEffect(() => {
    const n = ++pedido.current;
    setCargando(true);
    const q = new URLSearchParams();
    if (rango.desde) q.set("desde", rango.desde);
    if (rango.hasta) q.set("hasta", rango.hasta);
    void (async () => {
      const res = await fetch(`/api/marketing/recompra?${q.toString()}`).catch(() => null);
      const body = await res?.json().catch(() => null);
      if (n !== pedido.current) return;
      setCargando(false);
      if (!res?.ok) {
        setError(body?.error?.message ?? "No se pudo calcular la recompra.");
        return;
      }
      setError(null);
      setData(body as MetricasDeRecompra);
    })();
  }, [rango]);

  function elegir(p: Preset) {
    setPreset(p);
    if (p !== "medida") setRango(rangoDe(p));
  }

  return (
    <section className="space-y-4" aria-label="Recompra" aria-busy={cargando}>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Período">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              aria-pressed={preset === p.key}
              onClick={() => elegir(p.key)}
              className={cn(
                "rounded-md border px-3 py-1.5 text-sm",
                preset === p.key
                  ? "border-primary bg-secondary font-medium"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        {preset === "medida" && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="recompra-desde" className="text-xs">
                Desde
              </Label>
              <Input
                id="recompra-desde"
                type="date"
                value={rango.desde}
                onChange={(e) => setRango((r) => ({ ...r, desde: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="recompra-hasta" className="text-xs">
                Hasta
              </Label>
              <Input
                id="recompra-hasta"
                type="date"
                value={rango.hasta}
                onChange={(e) => setRango((r) => ({ ...r, hasta: e.target.value }))}
              />
            </div>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {!data ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Cifra
              titulo="Tasa de recompra"
              valor={`${data.tasa.toLocaleString("es-UY")} %`}
              detalle={`${data.recompraron} de ${data.personas} ${data.personas === 1 ? "persona" : "personas"} con un curso en el período volvieron a comprar`}
            />
            <Cifra
              titulo="Tiempo entre cursos"
              valor={data.diasPromedioEntreCursos === null ? "—" : `${data.diasPromedioEntreCursos} días`}
              detalle={
                data.paresMedidos === 0
                  ? "Todavía no hay recompras en el período"
                  : `Promedio entre un curso y el siguiente (${data.paresMedidos} ${data.paresMedidos === 1 ? "caso" : "casos"})`
              }
            />
            <Cifra
              titulo="Personas con cursos"
              valor={String(data.personas)}
              detalle="Con al menos un curso que empezó en el período"
            />
          </div>

          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <caption className="px-3 py-2 text-left text-sm font-medium">
                Qué curso lleva a cuál (el siguiente que compraron)
              </caption>
              <thead className="bg-muted text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Después de</th>
                  <th className="px-3 py-2 font-medium">Compraron</th>
                  <th className="px-3 py-2 text-right font-medium">Personas</th>
                </tr>
              </thead>
              <tbody>
                {data.pares.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">
                      Sin recompras en este período.
                    </td>
                  </tr>
                ) : (
                  data.pares.map((p) => (
                    <tr key={`${p.fromCourseId}-${p.toCourseId}`} className="border-t">
                      <td className="px-3 py-2">{p.fromName}</td>
                      <td className="px-3 py-2">{p.toName}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{p.personas}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Cuenta lo que se dictó: los grupos que nunca salieron no son compras. Cada compra se fecha por el
            inicio de su grupo.
          </p>
        </>
      )}
    </section>
  );
}

function Cifra({ titulo, valor, detalle }: { titulo: string; valor: string; detalle: string }) {
  return (
    <div className="rounded-md border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className="text-2xl font-semibold tabular-nums">{valor}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detalle}</p>
    </div>
  );
}
