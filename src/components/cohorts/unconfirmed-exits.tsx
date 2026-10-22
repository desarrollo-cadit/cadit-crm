"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { PlanDeReprogramacion } from "@/lib/reprogramacion";
import { notify } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal, useDirty } from "@/components/ui/modal";

/**
 * Las dos salidas de un grupo que llegó a su fecha sin confirmarse (además de
 * «Confirmar grupo»): **Reprogramar** y **Borrar grupo**.
 *
 * Solo se dibujan con `academico.editar`: las dos rutas reescriben el grupo
 * (`POST /api/cohorts/[id]/reprogram`, `DELETE /api/cohorts/[id]`) y exigen
 * esa capacidad. Las dos muestran ANTES de confirmar lo que va a pasar, con
 * la misma decisión que después aplica el servidor.
 */

type DecisionDeBaja = { accion: "borrar" | "bloquear"; motivo: string };

async function mensajeDeError(res: Response | null, fallback: string): Promise<string> {
  const body = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? fallback;
}

/** "2026-11-10" de un ISO guardado a medianoche UTC. */
const dia = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

/** Corre un `YYYY-MM-DD` tantos días como haya entre `desde` y `hasta`. */
function correr(fecha: string, desde: string, hasta: string): string {
  const d = Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`);
  const t = Date.parse(`${fecha}T00:00:00Z`) + d;
  return Number.isNaN(t) ? fecha : new Date(t).toISOString().slice(0, 10);
}

export function UnconfirmedExits({
  cohortId,
  startDate,
  endDate,
}: {
  cohortId: string;
  startDate: string;
  endDate: string | null;
}) {
  const [abierto, setAbierto] = useState<"reprogramar" | "borrar" | null>(null);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setAbierto("reprogramar")}>
        Reprogramar
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setAbierto("borrar")}>
        Borrar grupo
      </Button>
      {abierto === "reprogramar" ? (
        <ReprogramDialog
          cohortId={cohortId}
          startDate={dia(startDate)}
          endDate={dia(endDate)}
          onClose={() => setAbierto(null)}
        />
      ) : null}
      {abierto === "borrar" ? <DeleteDialog cohortId={cohortId} onClose={() => setAbierto(null)} /> : null}
    </>
  );
}

function ReprogramDialog({
  cohortId,
  startDate,
  endDate,
  onClose,
}: {
  cohortId: string;
  startDate: string;
  endDate: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [inicio, setInicio] = useState("");
  const [fin, setFin] = useState(endDate);
  const [finTocado, setFinTocado] = useState(false);
  const [plan, setPlan] = useState<PlanDeReprogramacion | null>(null);
  const [revisando, setRevisando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const dirty = useDirty({ inicio, fin });

  // Vista previa: lo que va a pasar, con la misma regla que el servidor.
  useEffect(() => {
    if (!inicio) {
      setPlan(null);
      return;
    }
    let vigente = true;
    setRevisando(true);
    const q = new URLSearchParams({ startDate: inicio, endDate: fin });
    void fetch(`/api/cohorts/${cohortId}/reprogram?${q.toString()}`)
      .then(async (res) => (res.ok ? ((await res.json()) as { plan: PlanDeReprogramacion }).plan : null))
      .catch(() => null)
      .then((p) => {
        if (!vigente) return;
        setPlan(p);
        setRevisando(false);
      });
    return () => {
      vigente = false;
    };
  }, [cohortId, inicio, fin]);

  function cambiarInicio(valor: string) {
    setInicio(valor);
    // Mientras no se toque el fin, se corre con el inicio: misma duración.
    if (!finTocado && valor && endDate) setFin(correr(endDate, startDate, valor));
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (plan?.accion !== "reprogramar") return;
    setGuardando(true);
    const res = await fetch(`/api/cohorts/${cohortId}/reprogram`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ startDate: inicio, endDate: fin || null }),
    }).catch(() => null);
    setGuardando(false);
    if (!res?.ok) {
      notify.error(await mensajeDeError(res, "No se pudo reprogramar el grupo. Probá de nuevo en un momento."));
      return;
    }
    notify.success("Grupo reprogramado.");
    onClose();
    router.refresh();
  }

  return (
    <Modal
      onClose={onClose}
      dirty={dirty}
      busy={guardando}
      labelledBy="reprogram-title"
      className="border-border p-6 shadow-pop"
    >
      <h3 id="reprogram-title" className="text-base font-semibold tracking-tight">
        Reprogramar grupo
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Elegí las fechas nuevas. Los días y el horario no cambian, y las inscripciones quedan como
        están.
      </p>
      <form onSubmit={guardar} className="mt-5 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="reprogram-start">Nuevo inicio</Label>
            <Input
              id="reprogram-start"
              type="date"
              required
              autoFocus
              value={inicio}
              onChange={(e) => cambiarInicio(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reprogram-end">Nuevo fin</Label>
            <Input
              id="reprogram-end"
              type="date"
              value={fin}
              onChange={(e) => {
                setFinTocado(true);
                setFin(e.target.value);
              }}
            />
          </div>
        </div>

        <div aria-live="polite" className="min-h-10 text-sm">
          {!inicio ? (
            <p className="text-muted-foreground">Elegí la fecha de inicio para ver qué va a pasar.</p>
          ) : revisando ? (
            <p className="text-muted-foreground">Revisando…</p>
          ) : !plan ? (
            <p className="text-danger">No se pudo revisar el grupo. Probá de nuevo.</p>
          ) : plan.accion === "reprogramar" ? (
            <p className="text-foreground">{plan.mensaje}</p>
          ) : (
            <p className="rounded-md border border-danger-border bg-danger-soft px-3 py-2 text-danger">
              {plan.motivo}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={guardando} disabled={plan?.accion !== "reprogramar" || revisando}>
            Reprogramar
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteDialog({ cohortId, onClose }: { cohortId: string; onClose: () => void }) {
  const router = useRouter();
  const [decision, setDecision] = useState<DecisionDeBaja | null>(null);
  const [error, setError] = useState(false);
  const [borrando, setBorrando] = useState(false);

  useEffect(() => {
    let vigente = true;
    void fetch(`/api/cohorts/${cohortId}/delete-preview`)
      .then(async (res) => (res.ok ? ((await res.json()) as { decision: DecisionDeBaja }).decision : null))
      .catch(() => null)
      .then((d) => {
        if (!vigente) return;
        setDecision(d);
        setError(d === null);
      });
    return () => {
      vigente = false;
    };
  }, [cohortId]);

  async function borrar() {
    setBorrando(true);
    const res = await fetch(`/api/cohorts/${cohortId}`, { method: "DELETE" }).catch(() => null);
    setBorrando(false);
    if (!res?.ok) {
      notify.error(await mensajeDeError(res, "No se pudo borrar el grupo."));
      return;
    }
    notify.success("Grupo borrado.");
    router.push("/academico");
  }

  return (
    <Modal onClose={onClose} busy={borrando} labelledBy="delete-cohort-title" className="border-border p-6 shadow-pop">
      <h3 id="delete-cohort-title" className="text-base font-semibold tracking-tight">
        Borrar grupo
      </h3>
      <div aria-live="polite" className="mt-3 text-sm">
        {error ? (
          <p className="text-danger">No se pudo revisar el grupo. Probá de nuevo.</p>
        ) : !decision ? (
          <p className="text-muted-foreground">Revisando…</p>
        ) : decision.accion === "borrar" ? (
          <p className="text-foreground">{decision.motivo} No se puede deshacer.</p>
        ) : (
          <p className="rounded-md border border-danger-border bg-danger-soft px-3 py-2 text-danger">
            {decision.motivo}
          </p>
        )}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          type="button"
          variant="destructive"
          loading={borrando}
          disabled={decision?.accion !== "borrar"}
          onClick={() => void borrar()}
        >
          Borrar grupo
        </Button>
      </div>
    </Modal>
  );
}
