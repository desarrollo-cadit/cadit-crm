"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Info } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { useCssVar } from "@/components/use-css-var";
import { cn, formatAmount } from "@/lib/utils";
import type { ReportesDto } from "@/server/reportes";

/**
 * 046 US8 (FR-027…FR-031) — La sección Reportes del inicio.
 *
 * Las cifras las arma el servidor con la derivación única del historial
 * (`/api/dashboard/reportes`); acá solo se dibujan. Gráficos según la skill
 * `dataviz`: un eje, marcas finas, colores de series por token en orden fijo
 * (`--chart-1…5`, validados en los dos temas), texto siempre en tinta de
 * texto, leyenda cuando hay más de una serie, y cada gráfico con su tabla
 * (los tonos claros bajo 3:1 lo exigen) y sus estados de carga y vacío.
 */

type Preset = "12m" | "anio" | "todo";
const PRESETS: { key: Preset; label: string }[] = [
  { key: "12m", label: "Últimos 12 meses" },
  { key: "anio", label: "Este año" },
  { key: "todo", label: "Todo el historial" },
];

const dia = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function rangoDe(p: Preset): { desde?: string; hasta?: string } {
  const hoy = new Date();
  if (p === "todo") return {};
  if (p === "anio") return { desde: `${hoy.getFullYear()}-01-01`, hasta: dia(hoy) };
  const desde = new Date(hoy);
  desde.setFullYear(desde.getFullYear() - 1);
  desde.setDate(desde.getDate() + 1);
  return { desde: dia(desde), hasta: dia(hoy) };
}

/**
 * Antes de leer los tokens (primer render), el color del texto: nunca un hex
 * escrito a mano (`tema-oscuro.test.ts`).
 */
const RESPALDO = "currentColor";

/** Los colores que Recharts necesita como valor (no acepta clases). */
function useTema() {
  const series = [
    useCssVar("--chart-1", RESPALDO),
    useCssVar("--chart-2", RESPALDO),
    useCssVar("--chart-3", RESPALDO),
    useCssVar("--chart-4", RESPALDO),
    useCssVar("--chart-5", RESPALDO),
  ];
  const texto2 = useCssVar("--text-2", RESPALDO);
  const grilla = useCssVar("--border", RESPALDO);
  const fondo = useCssVar("--bg", RESPALDO);
  const texto = useCssVar("--text", RESPALDO);
  const tooltip = {
    contentStyle: { fontSize: 12, background: fondo, border: `1px solid ${grilla}`, borderRadius: 6, color: texto },
    labelStyle: { color: texto },
    itemStyle: { color: texto },
    cursor: { fill: grilla, opacity: 0.4 },
  };
  const tick = { fontSize: 11, fill: texto2 };
  return { series, grilla, tick, tooltip, fondo };
}

export function ReportsPanel() {
  const [preset, setPreset] = useState<Preset>("12m");
  const [data, setData] = useState<ReportesDto | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pedido = useRef(0);

  useEffect(() => {
    const n = ++pedido.current;
    setCargando(true);
    const q = new URLSearchParams(rangoDe(preset));
    void (async () => {
      const res = await fetch(`/api/dashboard/reportes?${q.toString()}`).catch(() => null);
      const body = await res?.json().catch(() => null);
      if (n !== pedido.current) return;
      setCargando(false);
      if (!res?.ok) {
        setError(body?.error?.message ?? "No se pudieron calcular los reportes.");
        return;
      }
      setError(null);
      setData(body as ReportesDto);
    })();
  }, [preset]);

  const d = cargando ? null : data;

  return (
    <section className="space-y-3" aria-label="Reportes" aria-busy={cargando}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reportes</h2>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Período de los reportes">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              aria-pressed={preset === p.key}
              onClick={() => setPreset(p.key)}
              className={cn(
                "rounded-md border px-3 py-1 text-sm",
                preset === p.key ? "border-primary bg-secondary font-medium" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      {data && data.empresasExcluidas > 0 && (
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {data.empresasExcluidas === 1
            ? "Hay 1 empresa marcada «Excluir de los reportes»: sus cursadas no se cuentan."
            : `Hay ${data.empresasExcluidas} empresas marcadas «Excluir de los reportes»: sus cursadas no se cuentan.`}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <CursosMasCursados data={d} />
        <AlumnosPorPeriodo data={d} />
        <VentasPorAnio data={d} />
        <EmpresasVsParticulares data={d} />
        <EvolucionPorCurso data={d} />
        <EmpresasQueMasCapacitan data={d} />
        <VentasPorVendedor data={d} />
        <EmbudoPorOrigen data={d} />
        <Recompra data={d} />
        {d?.ingresosPorCurso && <IngresosPorCurso ingresos={d.ingresosPorCurso} />}
      </div>
    </section>
  );
}

/* ============================================================
 * Piezas
 * ============================================================ */

function Tarjeta({
  titulo,
  descripcion,
  cargando,
  vacio,
  acciones,
  tabla,
  children,
}: {
  titulo: string;
  descripcion?: string;
  cargando: boolean;
  vacio: boolean;
  acciones?: ReactNode;
  /** La misma información como tabla: nunca solo color. */
  tabla?: ReactNode;
  children: ReactNode;
}) {
  return (
    <article className="space-y-3 rounded-lg border bg-card p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{titulo}</h3>
          {descripcion && <p className="text-xs text-muted-foreground">{descripcion}</p>}
        </div>
        {acciones}
      </header>
      {cargando ? (
        <Skeleton className="h-48 w-full" />
      ) : vacio ? (
        <p className="flex h-24 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
          Sin datos en este período.
        </p>
      ) : (
        <>
          {children}
          {tabla && (
            <details className="text-sm">
              <summary className="cursor-pointer text-xs text-muted-foreground">Ver como tabla</summary>
              <div className="mt-2 overflow-x-auto">{tabla}</div>
            </details>
          )}
        </>
      )}
    </article>
  );
}

function Tabla({ columnas, filas }: { columnas: string[]; filas: (string | number)[][] }) {
  return (
    <table className="w-full text-xs">
      <thead className="text-left text-muted-foreground">
        <tr>
          {columnas.map((c, i) => (
            <th key={c} className={cn("px-2 py-1 font-medium", i > 0 && "text-right")}>
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {filas.map((f, i) => (
          <tr key={i} className="border-t">
            {f.map((v, j) => (
              <td key={j} className={cn("px-2 py-1", j > 0 && "text-right tabular-nums")}>
                {v}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Barras horizontales de una serie (rankings): el nombre se lee entero. */
function BarrasHorizontales({ filas, valor }: { filas: { label: string; n: number }[]; valor: string }) {
  const t = useTema();
  return (
    <div style={{ height: Math.max(120, filas.length * 28 + 24) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={filas} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid horizontal={false} stroke={t.grilla} />
          <XAxis type="number" allowDecimals={false} tick={t.tick} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="label" width={150} tick={t.tick} axisLine={false} tickLine={false} />
          <Tooltip {...t.tooltip} formatter={(v) => [String(v), valor]} />
          <Bar dataKey="n" name={valor} fill={t.series[0]} radius={[0, 4, 4, 0]} barSize={14} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Barras verticales de una serie (por año o trimestre). */
function BarrasVerticales({ filas, valor }: { filas: { label: string; n: number }[]; valor: string }) {
  const t = useTema();
  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={filas} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={t.grilla} />
          <XAxis dataKey="label" tick={t.tick} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} tick={t.tick} axisLine={false} tickLine={false} />
          <Tooltip {...t.tooltip} formatter={(v) => [String(v), valor]} />
          <Bar dataKey="n" name={valor} fill={t.series[0]} radius={[4, 4, 0, 0]} maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

type ConDatos = { data: ReportesDto | null };

function CursosMasCursados({ data }: ConDatos) {
  const [gratuitos, setGratuitos] = useState(false);
  const filas = (gratuitos ? data?.cursosMasCursados.conGratuitos : data?.cursosMasCursados.sinGratuitos) ?? [];
  return (
    <Tarjeta
      titulo="Cursos más cursados"
      descripcion="Los 10 con más cursadas; el resto, en «Otros»."
      cargando={!data}
      vacio={filas.length === 0}
      acciones={
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 accent-primary"
            checked={gratuitos}
            onChange={(e) => setGratuitos(e.target.checked)}
          />
          Incluir cursos gratuitos
        </label>
      }
      tabla={<Tabla columnas={["Curso", "Cursadas"]} filas={filas.map((f) => [f.label, f.cursadas])} />}
    >
      <BarrasHorizontales filas={filas.map((f) => ({ label: f.label, n: f.cursadas }))} valor="Cursadas" />
    </Tarjeta>
  );
}

function AlumnosPorPeriodo({ data }: ConDatos) {
  const [por, setPor] = useState<"anio" | "trimestre">("anio");
  const filas = (por === "anio" ? data?.alumnosPorPeriodo.porAnio : data?.alumnosPorPeriodo.porTrimestre) ?? [];
  return (
    <Tarjeta
      titulo="Alumnos"
      descripcion="Personas distintas que empezaron un curso."
      cargando={!data}
      vacio={filas.length === 0}
      acciones={
        <div className="flex gap-1" role="group" aria-label="Agrupar alumnos">
          {(["anio", "trimestre"] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={por === k}
              onClick={() => setPor(k)}
              className={cn(
                "rounded border px-2 py-0.5 text-xs",
                por === k ? "border-primary font-medium" : "text-muted-foreground"
              )}
            >
              {k === "anio" ? "Por año" : "Por trimestre"}
            </button>
          ))}
        </div>
      }
      tabla={<Tabla columnas={["Período", "Alumnos"]} filas={filas.map((f) => [f.periodo, f.alumnos])} />}
    >
      <BarrasVerticales filas={filas.map((f) => ({ label: f.periodo, n: f.alumnos }))} valor="Alumnos" />
    </Tarjeta>
  );
}

function VentasPorAnio({ data }: ConDatos) {
  const filas = data?.ventasPorAnio ?? [];
  return (
    <Tarjeta
      titulo="Cursos vendidos por año"
      descripcion="Sin cursos gratuitos."
      cargando={!data}
      vacio={filas.length === 0}
      tabla={<Tabla columnas={["Año", "Ventas"]} filas={filas.map((f) => [f.anio, f.ventas])} />}
    >
      <BarrasVerticales filas={filas.map((f) => ({ label: f.anio, n: f.ventas }))} valor="Ventas" />
    </Tarjeta>
  );
}

function EmpresasVsParticulares({ data }: ConDatos) {
  const t = useTema();
  const filas = data?.empresasVsParticulares ?? [];
  return (
    <Tarjeta
      titulo="Empresas y particulares por año"
      descripcion="Una venta es de empresa cuando la paga una empresa. Sin cursos gratuitos."
      cargando={!data}
      vacio={filas.length === 0}
      tabla={
        <Tabla columnas={["Año", "Empresas", "Particulares"]} filas={filas.map((f) => [f.anio, f.empresa, f.particular])} />
      }
    >
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={filas} margin={{ top: 4, right: 4, left: -16, bottom: 0 }} barGap={2}>
            <CartesianGrid vertical={false} stroke={t.grilla} />
            <XAxis dataKey="anio" tick={t.tick} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={t.tick} axisLine={false} tickLine={false} />
            <Tooltip {...t.tooltip} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="empresa" name="Empresas" fill={t.series[0]} radius={[4, 4, 0, 0]} maxBarSize={28} />
            <Bar dataKey="particular" name="Particulares" fill={t.series[1]} radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Tarjeta>
  );
}

const MAX_LINEAS = 5;

function EvolucionPorCurso({ data }: ConDatos) {
  const t = useTema();
  const ev = data?.evolucionPorCurso;
  const [elegidos, setElegidos] = useState<string[] | null>(null);
  // Por defecto, los 5 más cursados; al cambiar el período, vuelve al default.
  useEffect(() => setElegidos(null), [ev]);
  const activos = elegidos ?? ev?.top ?? [];
  const cursos = useMemo(() => new Map((ev?.cursos ?? []).map((c) => [c.courseId, c])), [ev]);
  const filas = (ev?.anios ?? []).map((anio) => ({
    anio,
    ...Object.fromEntries(activos.map((id) => [id, cursos.get(id)?.porAnio[anio] ?? 0])),
  }));

  const alternar = (id: string) =>
    setElegidos((prev) => {
      const actual = prev ?? ev?.top ?? [];
      if (actual.includes(id)) return actual.filter((x) => x !== id);
      return actual.length >= MAX_LINEAS ? actual : [...actual, id];
    });

  return (
    <Tarjeta
      titulo="Evolución por curso"
      descripcion={`Cursadas por año. Hasta ${MAX_LINEAS} cursos a la vez; sin cursos gratuitos.`}
      cargando={!data}
      vacio={!ev || ev.anios.length === 0}
      tabla={
        <Tabla
          columnas={["Curso", ...(ev?.anios ?? [])]}
          filas={activos.map((id) => [
            cursos.get(id)?.label ?? id,
            ...(ev?.anios ?? []).map((a) => cursos.get(id)?.porAnio[a] ?? 0),
          ])}
        />
      }
    >
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={filas} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={t.grilla} />
            <XAxis dataKey="anio" tick={t.tick} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={t.tick} axisLine={false} tickLine={false} />
            <Tooltip {...t.tooltip} cursor={{ stroke: t.grilla }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {activos.map((id, i) => (
              <Line
                key={id}
                type="monotone"
                dataKey={id}
                name={cursos.get(id)?.label ?? id}
                stroke={t.series[i % t.series.length]}
                strokeWidth={2}
                dot={{ r: 4, strokeWidth: 2, stroke: t.fondo, fill: t.series[i % t.series.length] }}
                activeDot={{ r: 5 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground">Elegir cursos</summary>
        <ul className="mt-2 grid max-h-40 gap-1 overflow-y-auto sm:grid-cols-2">
          {(ev?.cursos ?? []).map((c) => (
            <li key={c.courseId}>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-primary"
                  checked={activos.includes(c.courseId)}
                  disabled={!activos.includes(c.courseId) && activos.length >= MAX_LINEAS}
                  onChange={() => alternar(c.courseId)}
                />
                <span className="truncate">{c.label}</span>
                <span className="text-muted-foreground">{c.total}</span>
              </label>
            </li>
          ))}
        </ul>
      </details>
    </Tarjeta>
  );
}

function EmpresasQueMasCapacitan({ data }: ConDatos) {
  const filas = data?.empresasQueMasCapacitan ?? [];
  return (
    <Tarjeta
      titulo="Empresas que más capacitan"
      descripcion="Las 10 con más cursadas."
      cargando={!data}
      vacio={filas.length === 0}
      tabla={<Tabla columnas={["Empresa", "Cursadas"]} filas={filas.map((f) => [f.nombre, f.cursadas])} />}
    >
      <BarrasHorizontales filas={filas.map((f) => ({ label: f.nombre, n: f.cursadas }))} valor="Cursadas" />
    </Tarjeta>
  );
}

function VentasPorVendedor({ data }: ConDatos) {
  const filas = data?.ventasPorVendedor ?? [];
  const anios = [...new Set(filas.flatMap((f) => Object.keys(f.porAnio)))].sort();
  return (
    <Tarjeta
      titulo="Ventas por vendedor y año"
      descripcion="Sin cursos gratuitos. Las ventas sin vendedor cargado van aparte."
      cargando={!data}
      vacio={filas.length === 0}
    >
      <div className="overflow-x-auto">
        <Tabla
          columnas={["Vendedor", ...anios, "Total"]}
          filas={filas.map((f) => [f.vendedor, ...anios.map((a) => f.porAnio[a] ?? 0), f.total])}
        />
      </div>
    </Tarjeta>
  );
}

function EmbudoPorOrigen({ data }: ConDatos) {
  const filas = data?.embudoPorOrigen ?? [];
  return (
    <Tarjeta
      titulo="Embudo de leads por origen"
      descripcion="Contactos creados en el período y cuántos ya cursaron o están inscriptos."
      cargando={!data}
      vacio={filas.length === 0}
    >
      <Tabla
        columnas={["Origen", "Leads", "Inscriptos", "Conversión"]}
        filas={filas.map((f) => [f.origen, f.leads, f.inscriptos, `${f.conversion.toLocaleString("es-UY")} %`])}
      />
    </Tarjeta>
  );
}

function Recompra({ data }: ConDatos) {
  const r = data?.recompra;
  return (
    <Tarjeta
      titulo="Recompra"
      descripcion="Personas con un curso en el período que ya habían comprado otro."
      cargando={!data}
      vacio={!r || r.personas === 0}
    >
      <p className="text-3xl font-semibold tabular-nums">{r ? `${r.tasa.toLocaleString("es-UY")} %` : "—"}</p>
      <p className="text-xs text-muted-foreground">
        {r?.recompraron ?? 0} de {r?.personas ?? 0} personas
      </p>
      {r && r.pares.length > 0 && (
        <Tabla
          columnas={["Después de", "Compraron", "Personas"]}
          filas={r.pares.map((p) => [p.fromName, p.toName, p.personas])}
        />
      )}
    </Tarjeta>
  );
}

function IngresosPorCurso({ ingresos }: { ingresos: NonNullable<ReportesDto["ingresosPorCurso"]> }) {
  const [moneda, setMoneda] = useState(ingresos[0]?.currency ?? "");
  const actual = ingresos.find((i) => i.currency === moneda) ?? ingresos[0];
  const filas = actual?.cursos ?? [];
  return (
    <Tarjeta
      titulo="Ingresos cobrados por curso"
      descripcion="Pagos registrados en el período, por moneda (no se suman monedas distintas)."
      cargando={false}
      vacio={filas.length === 0}
      acciones={
        ingresos.length > 1 ? (
          <div className="flex gap-1" role="group" aria-label="Moneda">
            {ingresos.map((i) => (
              <button
                key={i.currency}
                type="button"
                aria-pressed={i.currency === actual?.currency}
                onClick={() => setMoneda(i.currency)}
                className={cn(
                  "rounded border px-2 py-0.5 text-xs",
                  i.currency === actual?.currency ? "border-primary font-medium" : "text-muted-foreground"
                )}
              >
                {i.currency}
              </button>
            ))}
          </div>
        ) : null
      }
    >
      <Tabla
        columnas={["Curso", "Cobrado"]}
        filas={filas.map((f) => [f.label, formatAmount(f.cobrado, actual?.currency ?? "UYU")])}
      />
    </Tarjeta>
  );
}
