"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { avisarQueCambiaronLasClases } from "@/lib/clases-cambiaron";
import { avisoDeExtension, efectoDeLote } from "@/lib/clase-de-reemplazo";
import { notify } from "@/lib/notify";

/**
 * 2026-11-05 — Crear los reemplazos de TODAS las clases suspendidas que todavía
 * no tienen uno, en una sola pantalla.
 *
 * Cada suspendida llega con el día sugerido (el servidor las calcula en fila,
 * salteando recesos y feriados, para que no caigan el mismo día). Se puede
 * aceptar la sugerencia, poner otra fecha o ignorar esa clase (queda sin
 * reemplazo). Si el último día pasa el fin del grupo, el fin se estira y la
 * entrega final se corre los mismos días: se muestra ANTES de confirmar, una
 * sola vez para todo el lote. Todo o nada (`POST /api/cohorts/[id]/replacements`).
 */

type SuspendidaSugerida = {
  id: string;
  number: number;
  /** "YYYY-MM-DD". */
  date: string;
  startTime: string | null;
  endTime: string | null;
  cancelReason: string | null;
  suggested: string | null;
};

type Sugerencias = {
  endDate: string | null;
  deliveryDeadline: string | null;
  classes: SuspendidaSugerida[];
};

/** Qué se hace con cada suspendida. */
type Eleccion = { modo: "sugerida" | "fecha" | "ignorar"; fecha: string };

type Problema = { code: string; message: string };

/** El día es "YYYY-MM-DD": se formatea en UTC para que no caiga un día antes. */
function dia(ymd: string) {
  return new Date(`${ymd}T00:00:00.000Z`).toLocaleDateString("es-UY", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  });
}

const DIA_VALIDO = /^\d{4}-\d{2}-\d{2}$/;

export function CrearReemplazos({
  cohortId,
  onClose,
  onChanged,
}: {
  cohortId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const router = useRouter();
  const [datos, setDatos] = useState<Sugerencias | null>(null);
  const [errorDeCarga, setErrorDeCarga] = useState<string | null>(null);
  const [elecciones, setElecciones] = useState<Record<string, Eleccion>>({});
  const [problemas, setProblemas] = useState<Record<string, Problema>>({});
  const [confirmadas, setConfirmadas] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const cargar = useCallback(async () => {
    setErrorDeCarga(null);
    const res = await fetch(`/api/cohorts/${cohortId}/replacements`).catch(() => null);
    if (!res?.ok) {
      setErrorDeCarga("No se pudieron leer las clases suspendidas.");
      return;
    }
    const body = (await res.json()) as Sugerencias;
    setDatos(body);
    setProblemas({});
    setConfirmadas(new Set());
    setElecciones(
      Object.fromEntries(
        body.classes.map((c) => [c.id, { modo: c.suggested ? "sugerida" : "fecha", fecha: "" } satisfies Eleccion])
      )
    );
  }, [cohortId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /** El día que va a tener el reemplazo de cada fila; `null` = ignorada o sin fecha válida. */
  const diaDe = useCallback(
    (c: SuspendidaSugerida): string | null => {
      const e = elecciones[c.id];
      if (!e || e.modo === "ignorar") return null;
      const d = e.modo === "sugerida" ? c.suggested : e.fecha;
      return d && DIA_VALIDO.test(d) ? d : null;
    },
    [elecciones]
  );

  const resumen = useMemo(() => {
    if (!datos) return null;
    const activas = datos.classes.filter((c) => elecciones[c.id]?.modo !== "ignorar");
    const fechas = activas.map(diaDe);
    const completas = fechas.filter((f): f is string => f !== null);
    const repetidas = new Set(completas).size !== completas.length;
    const efecto = efectoDeLote({
      endDate: datos.endDate,
      deliveryDeadline: datos.deliveryDeadline,
      fechas: completas,
    });
    return {
      cantidad: activas.length,
      sinFecha: fechas.length - completas.length,
      repetidas,
      aviso: efecto.extiendeFin
        ? avisoDeExtension({ endDate: efecto.finNuevo, deliveryDeadline: efecto.entregaCorrida })
        : null,
    };
  }, [datos, elecciones, diaDe]);

  function elegir(id: string, cambio: Partial<Eleccion>) {
    setElecciones((prev) => {
      const actual = prev[id];
      return actual ? { ...prev, [id]: { ...actual, ...cambio } } : prev;
    });
    setProblemas((prev) => {
      if (!(id in prev)) return prev;
      const { [id]: _quitado, ...resto } = prev;
      return resto;
    });
  }

  function aceptarTodas() {
    if (!datos) return;
    setElecciones(
      Object.fromEntries(
        datos.classes.map((c) => [c.id, { modo: c.suggested ? "sugerida" : "fecha", fecha: "" } satisfies Eleccion])
      )
    );
    setProblemas({});
  }

  const puedeCrear = Boolean(resumen && resumen.cantidad > 0 && resumen.sinFecha === 0 && !resumen.repetidas);

  async function crear() {
    if (!datos) return;
    setBusy(true);
    const res = await fetch(`/api/cohorts/${cohortId}/replacements`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        items: datos.classes.map((c) => ({
          classId: c.id,
          date: diaDe(c),
          confirmRecess: confirmadas.has(c.id),
        })),
      }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as {
        error?: { code?: string; message?: string };
        rows?: { classId: string; code: string; message: string }[];
      } | null;
      if (body?.rows?.length) {
        setProblemas(Object.fromEntries(body.rows.map((r) => [r.classId, { code: r.code, message: r.message }])));
      }
      notify.error(body?.error?.message ?? "No se pudieron crear los reemplazos");
      return;
    }
    const hecho = (await res.json()) as {
      created: unknown[];
      ignored: number;
      endDate: string | null;
      aviso: string | null;
    };
    const n = hecho.created.length;
    notify.success(n === 1 ? "Se creó 1 clase de reemplazo." : `Se crearon ${n} clases de reemplazo.`, {
      description: [
        hecho.ignored > 0 ? `${hecho.ignored === 1 ? "1 quedó" : `${hecho.ignored} quedaron`} sin reemplazo.` : null,
        hecho.aviso,
      ]
        .filter(Boolean)
        .join(" ") || undefined,
    });
    avisarQueCambiaronLasClases(cohortId);
    if (hecho.endDate) router.refresh();
    onChanged();
    onClose();
  }

  return (
    <Modal onClose={onClose} busy={busy} labelledBy="crear-reemplazos" className="w-full max-w-2xl p-5">
      <div className="space-y-3">
        <h2 id="crear-reemplazos" className="pr-6 text-base font-semibold">
          Crear clases de reemplazo
        </h2>

        {errorDeCarga ? (
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-danger-border bg-danger-soft px-3 py-2 text-sm">
            <span>{errorDeCarga}</span>
            <Button type="button" size="sm" variant="outline" onClick={() => void cargar()}>
              Reintentar
            </Button>
          </div>
        ) : !datos ? (
          <p className="text-sm text-muted-foreground">Buscando las clases suspendidas…</p>
        ) : datos.classes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay clases suspendidas sin reemplazo.</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Cada clase suspendida tiene un día sugerido: el próximo día de cursada, uno después del
              otro, sin contar recesos ni feriados. Aceptalo, poné otra fecha o ignorá esa clase.
            </p>
            <div className="flex justify-end">
              <Button type="button" size="sm" variant="outline" onClick={aceptarTodas} disabled={busy}>
                Aceptar todas las sugerencias
              </Button>
            </div>

            <ul className="max-h-[50vh] space-y-2 overflow-y-auto">
              {datos.classes.map((c) => {
                const e = elecciones[c.id] ?? { modo: "sugerida", fecha: "" };
                const problema = problemas[c.id];
                const ignorada = e.modo === "ignorar";
                const valor = e.modo === "sugerida" ? (c.suggested ?? "") : e.fecha;
                return (
                  <li key={c.id} className="space-y-1.5 rounded-md border p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-medium">Clase {c.number}</span>
                        <span className="text-muted-foreground">
                          {" "}
                          · suspendida el {dia(c.date)}
                          {c.startTime && c.endTime ? ` · ${c.startTime}–${c.endTime}` : ""}
                        </span>
                        {c.cancelReason && (
                          <span className="block text-xs text-muted-foreground">{c.cancelReason}</span>
                        )}
                      </div>
                      {ignorada ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Sin reemplazo</span>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => elegir(c.id, { modo: c.suggested ? "sugerida" : "fecha" })}
                          >
                            Reponer
                          </Button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <Input
                            type="date"
                            aria-label={`Día del reemplazo de la clase ${c.number}`}
                            className="h-8 w-40"
                            value={valor}
                            onChange={(ev) => elegir(c.id, { modo: "fecha", fecha: ev.target.value })}
                          />
                          {e.modo === "fecha" && c.suggested && (
                            <Button type="button" size="sm" variant="ghost" onClick={() => elegir(c.id, { modo: "sugerida" })}>
                              Usar la sugerida ({dia(c.suggested)})
                            </Button>
                          )}
                          <Button type="button" size="sm" variant="ghost" onClick={() => elegir(c.id, { modo: "ignorar" })}>
                            Ignorar
                          </Button>
                        </div>
                      )}
                    </div>
                    {!ignorada && !c.suggested && (
                      <p className="text-xs text-muted-foreground">
                        El grupo no declara días de cursada: elegí el día a mano.
                      </p>
                    )}
                    {problema && (
                      <div className="space-y-1 text-xs text-warning">
                        <p>{problema.message}</p>
                        {problema.code === "en_receso" && (
                          <label className="flex items-center gap-2 text-foreground">
                            <input
                              type="checkbox"
                              checked={confirmadas.has(c.id)}
                              onChange={(ev) =>
                                setConfirmadas((prev) => {
                                  const sig = new Set(prev);
                                  if (ev.target.checked) sig.add(c.id);
                                  else sig.delete(c.id);
                                  return sig;
                                })
                              }
                            />
                            Dar clase igual ese día
                          </label>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            {resumen?.aviso ? (
              <p className="rounded-md border border-warning-border bg-warning-soft px-3 py-2 text-sm">
                {resumen.aviso}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Con estos días no cambia el fin del grupo.</p>
            )}
            {resumen?.repetidas && (
              <p className="text-xs text-danger">Dos clases caen el mismo día: elegí días distintos.</p>
            )}
            {resumen && resumen.sinFecha > 0 && (
              <p className="text-xs text-danger">
                {resumen.sinFecha === 1 ? "Falta el día de 1 clase" : `Faltan los días de ${resumen.sinFecha} clases`}: elegilo o ignorala.
              </p>
            )}
          </>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          {datos && datos.classes.length > 0 && (
            <Button type="button" size="sm" loading={busy} disabled={!puedeCrear} onClick={() => void crear()}>
              {resumen && resumen.cantidad === 1 ? "Crear 1 reemplazo" : `Crear ${resumen?.cantidad ?? 0} reemplazos`}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
