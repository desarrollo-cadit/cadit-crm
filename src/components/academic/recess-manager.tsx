"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarOff, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notify";

type Receso = {
  id: string;
  name: string;
  fromDate: string;
  toDate: string;
  cohortId: string | null;
  cohortName: string | null;
};

type Conservada = { id: string; cohortName: string; date: string; detalle: string };

/** "2026-12-15" → "15/12/2026", sin pasar por la zona del navegador. */
function dia(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/**
 * 034 (US2, FR-006..FR-011) — Los recesos: días en los que no hay clase.
 *
 * Una sola pieza para los dos lugares donde se cargan:
 *
 * - **Configuración › Recesos** (`cohortId` ausente): los de la ACADEMIA,
 *   que alcanzan a todas las cohortes.
 * - **La pestaña Clases de una cohorte** (`cohortId`): los de esa cohorte,
 *   más los de la academia a la vista (de sólo lectura acá: se editan donde
 *   alcanzan a todos).
 *
 * Al cargar un receso, el servidor borra las clases sin historia del rango y
 * devuelve las que conservó (con asistencia o grabación). Esas se muestran
 * con su motivo: una persona decide qué hacer con cada una. Las fechas de la
 * cohorte no cambian, y borrar un receso no recrea clases.
 */
export function RecessManager({
  cohortId,
  canEdit,
  onChanged,
}: {
  cohortId?: string;
  /** `academico.editar` — cargar y borrar recesos. */
  canEdit: boolean;
  /** Para que la lista de clases se recargue después de un cambio. */
  onChanged?: () => void;
}) {
  const [recesos, setRecesos] = useState<Receso[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [conservadas, setConservadas] = useState<Conservada[]>([]);

  const cargar = useCallback(async () => {
    const url = cohortId ? `/api/recesses?cohortId=${encodeURIComponent(cohortId)}` : "/api/recesses";
    const res = await fetch(url).catch(() => null);
    if (!res?.ok) {
      setError("No se pudieron cargar los recesos.");
      return;
    }
    setRecesos(((await res.json()) as { recesses: Receso[] }).recesses);
    setError(null);
  }, [cohortId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function crear() {
    setGuardando(true);
    const res = await fetch("/api/recesses", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: nombre, fromDate: desde, toDate: hasta, cohortId: cohortId ?? null }),
    }).catch(() => null);
    setGuardando(false);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      notify.error(body?.error?.message ?? "No se pudo cargar el receso");
      return;
    }
    const body = (await res.json()) as { deleted: number; kept: Conservada[] };
    notify.success("Receso cargado.", {
      description:
        body.deleted === 0
          ? "No había clases para sacar en esas fechas."
          : `Se ${body.deleted === 1 ? "borró 1 clase" : `borraron ${body.deleted} clases`} del cronograma.`,
    });
    setConservadas(body.kept);
    setNombre("");
    setDesde("");
    setHasta("");
    await cargar();
    onChanged?.();
  }

  async function borrar(r: Receso) {
    const res = await fetch(`/api/recesses/${r.id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      notify.error("No se pudo borrar el receso");
      return;
    }
    notify.success("Receso borrado.", {
      description: "Las clases no se recrean solas: aparecen cuando se regenere el cronograma.",
    });
    await cargar();
    onChanged?.();
  }

  const valido = nombre.trim() !== "" && desde !== "" && hasta !== "" && hasta >= desde;

  return (
    <section aria-label="Recesos" className="space-y-3">
      <div>
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <CalendarOff className="h-4 w-4" aria-hidden />
          {cohortId ? "Recesos de este grupo" : "Recesos de la academia"}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {cohortId
            ? "En estos días no se generan ni se proyectan clases de este grupo. Los recesos de la academia también aplican."
            : "En estos días ningún grupo genera ni proyecta clases. Las fechas de inicio y fin de los grupos no cambian."}
        </p>
      </div>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      {recesos && recesos.length > 0 ? (
        <ul className="divide-y rounded-md border text-sm">
          {recesos.map((r) => {
            const propio = cohortId ? r.cohortId === cohortId : r.cohortId === null;
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                <span className="font-medium text-foreground">{r.name}</span>
                <span className="text-muted-foreground">
                  {dia(r.fromDate)} — {dia(r.toDate)}
                </span>
                {r.cohortId === null && cohortId ? <Badge variant="secondary">Academia</Badge> : null}
                {canEdit && propio ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto"
                    aria-label={`Borrar el receso ${r.name}`}
                    onClick={() => void borrar(r)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : recesos ? (
        <p className="text-xs text-muted-foreground">No hay recesos cargados.</p>
      ) : null}

      {canEdit ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs text-muted-foreground">
            Nombre
            <Input
              value={nombre}
              placeholder="Receso de verano"
              onChange={(e) => setNombre(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Desde
            <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Hasta
            <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </label>
          <Button size="sm" disabled={!valido} loading={guardando} onClick={() => void crear()}>
            Cargar receso
          </Button>
        </div>
      ) : null}

      {/* FR-008 (escenario 3) — lo que no se borró, con su motivo, para decidir a mano. */}
      {conservadas.length > 0 ? (
        <div className="rounded-md border border-warning-border bg-warning-soft p-3 text-xs">
          <p className="font-medium text-foreground">
            {conservadas.length === 1
              ? "1 clase del receso no se borró porque tiene historia:"
              : `${conservadas.length} clases del receso no se borraron porque tienen historia:`}
          </p>
          <ul className="mt-1 space-y-0.5 text-muted-foreground">
            {conservadas.map((c) => (
              <li key={c.id}>
                {c.cohortName} — {dia(c.date)}: {c.detalle}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-muted-foreground">
            Revisalas en la pestaña Clases de cada grupo y suspendelas si corresponde.
          </p>
        </div>
      ) : null}
    </section>
  );
}
