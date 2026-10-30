"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { notify } from "@/lib/notify";
import { avisarQueCambiaronLasClases } from "@/lib/clases-cambiaron";
import {
  diaCorto,
  efectoDelReemplazo,
  type OpcionDeEntrega,
} from "@/lib/clase-de-reemplazo";

/**
 * 2026-10-30 — Suspender una clase y crear su clase de reemplazo.
 *
 * "Suspendida" es como se dice en pantalla lo que la base guarda como
 * cancelada (`class_session.canceled_at`): deja de contar para la asistencia
 * de todos y la historia se conserva. Suspender pide `asistencia.editar`
 * (`PATCH /api/class-sessions/[id]`); el reemplazo, `academico.editar`
 * (`POST …/reschedule`, el ÚNICO camino que crea una clase de reemplazo), que
 * es también la que mueve el fin y la entrega final del grupo.
 *
 * Lo usan la pestaña Asistencia y la pestaña Clases.
 */

export type ClaseASuspender = {
  id: string;
  number: number;
  /** El día de la clase (medianoche UTC, ISO). */
  date: string;
  startTime?: string | null;
  endTime?: string | null;
};

/** El día de clase es medianoche UTC: se formatea en UTC. */
function fechaDeClase(iso: string) {
  return new Date(iso).toLocaleDateString("es-UY", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  });
}

async function leerError(res: Response | null, porDefecto: string) {
  const body = (await res?.json().catch(() => null)) as
    | { error?: { code?: string; message?: string } }
    | null;
  return { code: body?.error?.code ?? null, message: body?.error?.message ?? porDefecto };
}

const SIN_PERMISO_DE_REEMPLAZO =
  "Crear la clase de reemplazo lo puede hacer quien tiene el permiso «Crear y editar cursos y grupos».";

/**
 * El diálogo de suspender: motivo → suspendida → (si puede) "Crear clase de
 * reemplazo" en el mismo diálogo.
 */
export function SuspenderClase({
  cohortId,
  clase,
  canReschedule,
  onClose,
  onChanged,
}: {
  cohortId: string;
  clase: ClaseASuspender;
  /** `academico.editar`. */
  canReschedule: boolean;
  onClose: () => void;
  /** Algo cambió en el servidor: quien abrió el diálogo recarga. */
  onChanged: () => void;
}) {
  const [paso, setPaso] = useState<"motivo" | "suspendida" | "reemplazo">("motivo");
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);

  async function suspender() {
    setBusy(true);
    const res = await fetch(`/api/class-sessions/${clase.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cancelReason: motivo.trim() }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      notify.error((await leerError(res, "No se pudo suspender la clase")).message);
      return;
    }
    notify.success("Clase suspendida: ya no cuenta para la asistencia.");
    setPaso("suspendida");
    onChanged();
  }

  return (
    <Modal
      onClose={onClose}
      busy={busy}
      dirty={paso === "motivo" && motivo.trim().length > 0}
      labelledBy="suspender-clase"
    >
      {paso === "motivo" ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (motivo.trim()) void suspender();
          }}
        >
          <h2 id="suspender-clase" className="pr-6 text-base font-semibold">
            Suspender la clase {clase.number} · {fechaDeClase(clase.date)}
          </h2>
          <p className="text-sm text-muted-foreground">
            Una clase suspendida deja de contar para la asistencia de todos. La asistencia ya
            cargada se conserva.
          </p>
          <Textarea
            autoFocus
            aria-label="Motivo de la suspensión"
            placeholder="¿Por qué se suspende?"
            value={motivo}
            maxLength={500}
            onChange={(e) => setMotivo(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={busy}>
              Volver
            </Button>
            <Button type="submit" variant="destructive" size="sm" loading={busy} disabled={!motivo.trim()}>
              Suspender clase
            </Button>
          </div>
        </form>
      ) : paso === "suspendida" ? (
        <div className="space-y-3">
          <h2 id="suspender-clase" className="pr-6 text-base font-semibold">
            Clase {clase.number} suspendida
          </h2>
          <p className="text-sm text-muted-foreground">
            ¿Se recupera en otro día? La clase de reemplazo queda vinculada a la suspendida.
          </p>
          {!canReschedule && <p className="text-sm text-muted-foreground">{SIN_PERMISO_DE_REEMPLAZO}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Listo
            </Button>
            {canReschedule && (
              <Button type="button" size="sm" onClick={() => setPaso("reemplazo")}>
                <CalendarClock className="h-4 w-4" aria-hidden />
                Crear clase de reemplazo
              </Button>
            )}
          </div>
        </div>
      ) : (
        <ClaseDeReemplazoForm
          cohortId={cohortId}
          clase={clase}
          tituloId="suspender-clase"
          onCancel={onClose}
          onDone={() => {
            onChanged();
            onClose();
          }}
        />
      )}
    </Modal>
  );
}

/** Reprogramar una suspendida que ya existía (pestaña Clases). */
export function ReprogramarClase({
  cohortId,
  clase,
  onClose,
  onChanged,
}: {
  cohortId: string;
  clase: ClaseASuspender;
  onClose: () => void;
  onChanged: () => void;
}) {
  return (
    <Modal onClose={onClose} labelledBy="reprogramar-clase">
      <ClaseDeReemplazoForm
        cohortId={cohortId}
        clase={clase}
        tituloId="reprogramar-clase"
        onCancel={onClose}
        onDone={() => {
          onChanged();
          onClose();
        }}
      />
    </Modal>
  );
}

type FechasDelGrupo = { endDate: string | null; deliveryDeadline: string | null };
type TipoDeEntrega = OpcionDeEntrega["tipo"];

/**
 * El formulario de la clase de reemplazo. Muestra ANTES de confirmar si el
 * día elegido pasa el fin del grupo y, con entrega final, pide qué hacer con
 * ella. Lo que se escribe lo recalcula el servidor (`planDeReemplazo`); acá
 * se usa la misma regla sólo para avisar.
 */
function ClaseDeReemplazoForm({
  cohortId,
  clase,
  tituloId,
  onCancel,
  onDone,
}: {
  cohortId: string;
  clase: ClaseASuspender;
  tituloId: string;
  onCancel: () => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const [fechas, setFechas] = useState<FechasDelGrupo | null>(null);
  const [errorDeCarga, setErrorDeCarga] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState(clase.startTime ?? "");
  const [endTime, setEndTime] = useState(clase.endTime ?? "");
  const [entrega, setEntrega] = useState<TipoDeEntrega | null>(null);
  const [otraFecha, setOtraFecha] = useState("");
  const [receso, setReceso] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const cargarFechas = useCallback(async () => {
    setErrorDeCarga(null);
    const res = await fetch(`/api/cohorts/${cohortId}`).catch(() => null);
    if (!res?.ok) {
      // "No pude leerlo" no es "no tiene fin": sin las fechas no se puede avisar.
      setErrorDeCarga("No se pudo leer el fin del grupo.");
      return;
    }
    const { cohort } = (await res.json()) as {
      cohort: { endDate: string | null; deliveryDeadline: string | null };
    };
    // Son días (medianoche UTC): el día es la parte de la fecha del ISO.
    setFechas({
      endDate: cohort.endDate?.slice(0, 10) ?? null,
      deliveryDeadline: cohort.deliveryDeadline?.slice(0, 10) ?? null,
    });
  }, [cohortId]);

  useEffect(() => {
    void cargarFechas();
  }, [cargarFechas]);

  const efecto =
    fechas && date
      ? efectoDelReemplazo({ endDate: fechas.endDate, deliveryDeadline: fechas.deliveryDeadline, reemplazo: date })
      : null;
  const finNuevo = efecto?.finNuevo ?? null;
  const otraFechaValida = Boolean(otraFecha && finNuevo && otraFecha > finNuevo);
  const entregaElegida =
    !efecto?.pideEntrega ||
    (entrega === "mantener" && efecto.mantenerPermitido) ||
    entrega === "correr" ||
    (entrega === "fecha" && otraFechaValida);
  const puedeEnviar = Boolean(fechas && date && entregaElegida);

  function opcionDeEntrega(): OpcionDeEntrega | null {
    if (!efecto?.pideEntrega || !entrega) return null;
    return entrega === "fecha" ? { tipo: "fecha", fecha: otraFecha } : { tipo: entrega };
  }

  async function crear(confirmRecess: boolean) {
    setBusy(true);
    const res = await fetch(`/api/class-sessions/${clase.id}/reschedule`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        date,
        startTime: startTime || null,
        endTime: endTime || null,
        confirmRecess,
        confirmEndExtension: Boolean(efecto?.extiendeFin),
        deliveryOption: opcionDeEntrega(),
      }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const { code, message } = await leerError(res, "No se pudo crear la clase de reemplazo");
      if (code === "en_receso") {
        setReceso(message);
        return;
      }
      // Las fechas del grupo cambiaron mientras tanto: se releen y se avisa de nuevo.
      if (code === "reemplazo_despues_del_fin" || code === "opcion_de_entrega_requerida") {
        void cargarFechas();
      }
      notify.error(message);
      return;
    }
    const { session } = (await res.json()) as {
      session: { endDate: string | null; deliveryDeadline: string | null };
    };
    const cambios = [
      session.endDate ? `El fin del grupo pasa a ser ${diaCorto(session.endDate)}.` : null,
      session.deliveryDeadline ? `La entrega final pasa a ser ${diaCorto(session.deliveryDeadline)}.` : null,
    ].filter(Boolean);
    notify.success("Clase de reemplazo creada.", {
      description: ["Queda vinculada a la suspendida.", ...cambios].join(" "),
    });
    avisarQueCambiaronLasClases(cohortId);
    if (session.endDate) router.refresh();
    onDone();
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (puedeEnviar) void crear(receso !== null);
      }}
    >
      <h2 id={tituloId} className="pr-6 text-base font-semibold">
        Clase de reemplazo de la {clase.number} · {fechaDeClase(clase.date)}
      </h2>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Día
          <Input
            type="date"
            autoFocus
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setReceso(null);
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Desde
          <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Hasta
          <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </label>
      </div>
      {!clase.startTime && !clase.endTime && (
        <p className="text-xs text-muted-foreground">Sin horario, usa el de la clase suspendida.</p>
      )}

      {errorDeCarga && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-danger-border bg-danger-soft px-3 py-2 text-sm">
          <span>{errorDeCarga}</span>
          <Button type="button" size="sm" variant="outline" onClick={() => void cargarFechas()}>
            Reintentar
          </Button>
        </div>
      )}

      {efecto?.extiendeFin && (
        <div className="space-y-2 rounded-md border border-warning-border bg-warning-soft p-3 text-sm">
          <p>{efecto.aviso}</p>
          {efecto.pideEntrega && fechas?.deliveryDeadline && finNuevo && (
            <fieldset className="space-y-1.5">
              <legend className="font-medium">
                La entrega final es el {diaCorto(fechas.deliveryDeadline)}. ¿Qué hacemos con ella?
              </legend>
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="entrega-final"
                  className="mt-1"
                  disabled={!efecto.mantenerPermitido}
                  checked={entrega === "mantener"}
                  onChange={() => setEntrega("mantener")}
                />
                <span>
                  No cambiar la entrega final
                  {!efecto.mantenerPermitido && (
                    <span className="block text-xs text-muted-foreground">
                      No se puede: tiene que quedar después del fin nuevo ({diaCorto(finNuevo)}).
                    </span>
                  )}
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="entrega-final"
                  className="mt-1"
                  checked={entrega === "correr"}
                  onChange={() => setEntrega("correr")}
                />
                <span>
                  Correrla los mismos días ({efecto.diasCorridos === 1 ? "1 día" : `${efecto.diasCorridos} días`}
                  ): queda el {efecto.entregaCorrida ? diaCorto(efecto.entregaCorrida) : ""}
                </span>
              </label>
              <label className="flex flex-wrap items-center gap-2">
                <input
                  type="radio"
                  name="entrega-final"
                  checked={entrega === "fecha"}
                  onChange={() => setEntrega("fecha")}
                />
                <span>Elegir otra fecha</span>
                {entrega === "fecha" && (
                  <Input
                    type="date"
                    aria-label="Nueva entrega final"
                    className="h-8 w-44"
                    value={otraFecha}
                    onChange={(e) => setOtraFecha(e.target.value)}
                  />
                )}
              </label>
              {entrega === "fecha" && otraFecha && !otraFechaValida && (
                <p className="text-xs text-danger">
                  Tiene que ser posterior al fin nuevo ({diaCorto(finNuevo)}).
                </p>
              )}
            </fieldset>
          )}
        </div>
      )}

      {receso && <p className="text-xs text-warning">{receso}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={busy}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" loading={busy} disabled={!puedeEnviar}>
          {receso ? "Confirmar igual" : efecto?.extiendeFin ? "Crear y mover el fin" : "Crear clase de reemplazo"}
        </Button>
      </div>
    </form>
  );
}
