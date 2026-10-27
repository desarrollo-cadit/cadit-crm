"use client";

import { useCallback, useEffect, useState } from "react";
import { History, Search, Trash2, UserCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { notify } from "@/lib/notify";
import type { AjustesDeAsistenciaDto, NombreAprendidoDto } from "@/server/zoom/attendance-settings";

/**
 * Constitución 1.9.0 — Configuración › Zoom › Asistencia sugerida.
 *
 * Tres cosas, en el orden en que se usan: cuándo Zoom sugiere "presente",
 * buscar sugerencias para las clases pasadas que nunca tuvieron lista, y lo
 * que el sistema aprendió (con "Olvidar"). Nada de esto escribe asistencia:
 * la confirma una persona en la pestaña Asistencia de cada grupo.
 */

async function leerError(res: Response | null, fallback: string) {
  const body = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? fallback;
}

export function ZoomAttendanceSettings() {
  const [ajustes, setAjustes] = useState<AjustesDeAsistenciaDto | null>(null);
  const [error, setError] = useState(false);

  const leer = useCallback(async () => {
    const res = await fetch("/api/settings/zoom/attendance").catch(() => null);
    if (res?.ok) {
      setAjustes((await res.json()) as AjustesDeAsistenciaDto);
      setError(false);
    } else setError(true);
  }, []);

  useEffect(() => {
    void leer();
  }, [leer]);

  // Mientras hay una corrida o clases en cola, el avance se refresca solo.
  const activo = Boolean(ajustes && (ajustes.enCurso || ajustes.progreso.pendientes > 0));
  useEffect(() => {
    if (!activo) return;
    const t = setInterval(() => void leer(), 5000);
    return () => clearInterval(t);
  }, [activo, leer]);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Asistencia sugerida desde Zoom</h2>
        <p className="mt-1 max-w-prose text-sm text-text-2">
          Después de cada clase, Zoom informa quién se conectó y cuánto tiempo. El CRM lo cruza con la
          lista del grupo y deja la asistencia sugerida para que alguien la revise y la confirme. Nada se
          guarda sin esa confirmación.
        </p>
      </div>

      {error && (
        <p className="text-sm text-destructive">No se pudo leer la configuración de la asistencia sugerida.</p>
      )}
      {!ajustes && !error && <Skeleton className="h-40 w-full" />}
      {ajustes && (
        <>
          <Umbrales inicial={ajustes.umbrales} />
          <ClasesPasadas ajustes={ajustes} onCambio={() => void leer()} />
        </>
      )}
      <NombresAprendidos />
    </div>
  );
}

/* ============================================================ umbrales */

function Umbrales({ inicial }: { inicial: AjustesDeAsistenciaDto["umbrales"] }) {
  const [pct, setPct] = useState(String(inicial.minPct));
  const [piso, setPiso] = useState(String(inicial.minMinutes));
  const [conTarde, setConTarde] = useState(inicial.lateMinutes !== null);
  const [tarde, setTarde] = useState(String(inicial.lateMinutes ?? 15));
  const [guardando, setGuardando] = useState(false);

  const minPct = Number(pct);
  const minMinutes = Number(piso);
  const lateMinutes = conTarde ? Number(tarde) : null;
  const valido =
    Number.isInteger(minPct) &&
    minPct >= 1 &&
    minPct <= 100 &&
    Number.isInteger(minMinutes) &&
    minMinutes >= 0 &&
    minMinutes <= 600 &&
    (lateMinutes === null || (Number.isInteger(lateMinutes) && lateMinutes >= 1 && lateMinutes <= 180));

  const ejemplo = valido ? Math.max(minMinutes, Math.ceil((minPct / 100) * 120)) : null;

  async function guardar() {
    setGuardando(true);
    const res = await fetch("/api/settings/zoom/attendance", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ minPct, minMinutes, lateMinutes }),
    }).catch(() => null);
    setGuardando(false);
    if (!res?.ok) notify.error(await leerError(res, "No se pudieron guardar los umbrales."));
    else notify.success("Umbrales guardados. Se aplican a las sugerencias que todavía no se confirmaron.");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserCheck className="h-4 w-4 text-text-3" aria-hidden />
          Cuándo sugerir «Presente»
        </CardTitle>
        <CardDescription>
          Gana el mayor de los dos: un porcentaje de la clase o un mínimo de minutos.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="za-pct">Porcentaje de la clase conectado</Label>
            <div className="flex items-center gap-2">
              <Input id="za-pct" inputMode="numeric" className="w-24 tabular-nums" value={pct} onChange={(e) => setPct(e.target.value)} />
              <span className="text-sm text-text-2">%</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="za-piso">Y al menos</Label>
            <div className="flex items-center gap-2">
              <Input id="za-piso" inputMode="numeric" className="w-24 tabular-nums" value={piso} onChange={(e) => setPiso(e.target.value)} />
              <span className="text-sm text-text-2">minutos</span>
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox checked={conTarde} onChange={(e) => setConTarde(e.target.checked)} />
            Sugerir «Tarde» a quien entra tarde
          </label>
          {conTarde && (
            <div className="flex items-center gap-2 pl-6">
              <Input
                aria-label="Minutos de tolerancia antes de sugerir Tarde"
                inputMode="numeric"
                className="w-20 tabular-nums"
                value={tarde}
                onChange={(e) => setTarde(e.target.value)}
              />
              <span className="text-sm text-text-2">minutos después del inicio</span>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="text-xs text-text-2">
            {ejemplo !== null
              ? `En una clase de 2 horas, «Presente» pide ${ejemplo} minutos conectado.`
              : "El porcentaje va de 1 a 100 y los minutos de 0 a 600."}
          </p>
          <Button size="sm" loading={guardando} disabled={!valido} onClick={() => void guardar()}>
            Guardar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ============================================================ clases pasadas */

function ClasesPasadas({ ajustes, onCambio }: { ajustes: AjustesDeAsistenciaDto; onCambio: () => void }) {
  const [buscando, setBuscando] = useState(false);
  const p = ajustes.progreso;
  const total = p.pendientes + p.listas + p.noEncontradas + p.conProblemas + p.confirmadas;

  async function buscar() {
    setBuscando(true);
    const res = await fetch("/api/settings/zoom/attendance/backfill", { method: "POST" }).catch(() => null);
    setBuscando(false);
    if (!res?.ok) {
      notify.error(await leerError(res, "No se pudo empezar la búsqueda."));
      return;
    }
    const r = (await res.json()) as { encoladas: number; fueraDePlazo: number };
    notify.success(
      r.encoladas === 0
        ? "No hay clases nuevas para buscar: todas ya tienen lista o ya se buscaron."
        : `Buscando ${r.encoladas} ${r.encoladas === 1 ? "clase" : "clases"} en Zoom. Podés seguir trabajando.`
    );
    onCambio();
  }

  const piezas: { n: number; texto: string; variante: "secondary" | "success" | "warning" }[] = [
    { n: p.pendientes, texto: "en cola", variante: "secondary" },
    { n: p.listas, texto: "listas para revisar", variante: "success" },
    { n: p.noEncontradas, texto: "sin reunión en Zoom", variante: "secondary" },
    { n: p.conProblemas, texto: "con problemas", variante: "warning" },
    { n: p.confirmadas, texto: "confirmadas", variante: "secondary" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4 text-text-3" aria-hidden />
          Clases pasadas sin asistencia
        </CardTitle>
        <CardDescription>
          Busca en Zoom las clases ya dictadas en las que nadie pasó lista (hasta un año atrás: Zoom no
          guarda más). Las clases que ya tienen asistencia no se tocan. Las sugerencias aparecen en
          Inicio, en «Asistencia sugerida para revisar».
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {total > 0 ? (
          <ul className="flex flex-wrap gap-2" aria-live="polite">
            {piezas
              .filter((x) => x.n > 0)
              .map((x) => (
                <li key={x.texto}>
                  <Badge variant={x.variante} className="tabular-nums">
                    {x.n} {x.texto}
                  </Badge>
                </li>
              ))}
          </ul>
        ) : (
          <p className="text-sm text-text-2">Todavía no se buscó ninguna clase.</p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            loading={buscando}
            disabled={ajustes.enCurso}
            onClick={() => void buscar()}
          >
            {!buscando && <Search className="h-4 w-4" />}
            Buscar sugerencias para clases pasadas sin asistencia
          </Button>
          {ajustes.enCurso && <span className="text-xs text-text-2">Hay una lectura de Zoom en curso…</span>}
        </div>
      </CardContent>
    </Card>
  );
}

/* ============================================================ nombres aprendidos */

const TIPO: Record<NombreAprendidoDto["tipo"], string> = {
  correo: "correo",
  usuario_zoom: "usuario de Zoom",
  registrante: "registro",
  nombre: "nombre",
};

function NombresAprendidos() {
  const [q, setQ] = useState("");
  const [nombres, setNombres] = useState<NombreAprendidoDto[] | null>(null);
  const [olvidando, setOlvidando] = useState<string | null>(null);

  const leer = useCallback(async (busqueda: string) => {
    const res = await fetch(`/api/settings/zoom/aliases?q=${encodeURIComponent(busqueda)}`).catch(() => null);
    if (res?.ok) setNombres(((await res.json()) as { nombres: NombreAprendidoDto[] }).nombres);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void leer(q), 250);
    return () => clearTimeout(t);
  }, [q, leer]);

  async function olvidar(n: NombreAprendidoDto) {
    setOlvidando(n.id);
    const res = await fetch(`/api/settings/zoom/aliases/${n.id}`, { method: "DELETE" }).catch(() => null);
    setOlvidando(null);
    if (!res?.ok) {
      notify.error(await leerError(res, "No se pudo olvidar ese nombre."));
      return;
    }
    setNombres((xs) => xs?.filter((x) => x.id !== n.id) ?? null);
    notify.success(`Listo: «${n.nombreEnZoom}» ya no se reconoce.`);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Nombres aprendidos</CardTitle>
        <CardDescription>
          Cada vez que alguien confirma o corrige una sugerencia, el CRM recuerda con qué nombre entra cada
          persona («iPhone de Ana» es Ana). Si algo quedó mal aprendido, olvidalo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-3" aria-hidden />
          <Input
            aria-label="Buscar un nombre aprendido"
            placeholder="Buscar por nombre en Zoom o persona"
            className="pl-9"
            value={q}
            maxLength={100}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {nombres === null ? (
          <Skeleton className="h-24 w-full" />
        ) : nombres.length === 0 ? (
          <p className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-text-2">
            {q ? "Ningún nombre aprendido coincide con la búsqueda." : "Todavía no se aprendió ningún nombre."}
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {nombres.map((n) => (
              <li key={n.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    <span className="font-medium">{n.nombreEnZoom}</span>
                    <span className="text-text-3"> → </span>
                    {n.ignorar ? (
                      <span className="text-text-2">se ignora (equipo o dispositivo)</span>
                    ) : (
                      <span>{n.contacto ?? "—"}</span>
                    )}
                  </p>
                  <p className="text-xs text-text-3">
                    Por {TIPO[n.tipo]} · {n.llave} · confirmado {n.confirmaciones}{" "}
                    {n.confirmaciones === 1 ? "vez" : "veces"}
                    {n.rechazos > 0 && ` · corregido ${n.rechazos} ${n.rechazos === 1 ? "vez" : "veces"}`}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={olvidando === n.id}
                  onClick={() => void olvidar(n)}
                  aria-label={`Olvidar ${n.nombreEnZoom}`}
                >
                  {olvidando !== n.id && <Trash2 className="h-3.5 w-3.5" />}
                  Olvidar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
