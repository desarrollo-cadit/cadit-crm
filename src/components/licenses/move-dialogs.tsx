"use client";

import { useState } from "react";
import { ConfirmSendDialog } from "@/components/cohorts/confirm-send-dialog";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { notify } from "@/lib/notify";

/**
 * 0090 — Pasar un programa (o UNA licencia) de un equipo de licencias a otro.
 * El equipo equivocado es lo más común al principio: «AutoCAD figura en el
 * equipo 1 y es del 2». El servidor decide todo (cupo, stock, grupos); acá se
 * elige el destino y se cuenta qué va a pasar.
 */

/** Un equipo candidato a recibir, con lo que ya tiene del programa. */
export type DestinoDeEquipo = {
  id: string;
  name: string;
  /** El cupo del programa en ese equipo (0 si no lo tiene). */
  total: number;
  libres: number;
};

async function leerError(res: Response | null, porDefecto: string) {
  const body = (await res?.json().catch(() => null)) as
    | { error?: { code?: string; message?: string } }
    | null;
  return { code: body?.error?.code ?? null, message: body?.error?.message ?? porDefecto };
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function MoverProgramaDialog({
  programa,
  origen,
  destinos,
  onClose,
  onMoved,
}: {
  programa: { softwareId: string; name: string };
  origen: { id: string; name: string; total: number; asignadas: number };
  /** Los equipos activos distintos del de origen. */
  destinos: readonly DestinoDeEquipo[];
  onClose: () => void;
  onMoved: () => void;
}) {
  const [destinoId, setDestinoId] = useState(destinos[0]?.id ?? "");
  const [sumar, setSumar] = useState(false);
  /** El servidor dijo que el destino ya tiene el programa: hay que confirmar la suma. */
  const [pideSumar, setPideSumar] = useState(false);
  const [busy, setBusy] = useState(false);
  const destino = destinos.find((d) => d.id === destinoId);
  const yaTiene = pideSumar || (destino?.total ?? 0) > 0;

  async function mover() {
    if (!destino) return;
    setBusy(true);
    const res = await fetch(`/api/license-teams/${origen.id}/move-program`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ softwareId: programa.softwareId, toTeamId: destino.id, sumar }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const error = await leerError(res, "No se pudo mover el programa");
      if (error.code === "programa_en_destino") setPideSumar(true);
      notify.error(error.message);
      return;
    }
    const data = (await res.json()) as { movidas: number; total: number };
    notify.success(
      `${programa.name} pasó de ${origen.name} a ${destino.name}: ${plural(data.movidas, "licencia", "licencias")} y un cupo de ${data.total}.`
    );
    onMoved();
  }

  return (
    <ConfirmSendDialog
      title={`Mover ${programa.name} a otro equipo`}
      confirmLabel="Mover programa"
      busyLabel="Moviendo…"
      busy={busy}
      onClose={onClose}
      onConfirm={() => void mover()}
    >
      {destinos.length === 0 ? (
        <p className="text-foreground">No hay otro equipo activo al que mover. Creá uno primero.</p>
      ) : (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="mover-programa-destino">Equipo de destino</Label>
            <Select
              id="mover-programa-destino"
              value={destinoId}
              onChange={(ev) => {
                setDestinoId(ev.target.value);
                setSumar(false);
                setPideSumar(false);
              }}
            >
              {destinos.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                  {d.total > 0 ? ` · ya tiene ${d.total} de ${programa.name}` : ""}
                </option>
              ))}
            </Select>
          </div>
          <p className="text-foreground">
            Se mueven el cupo de {origen.total} y las licencias de {programa.name} de {origen.name}:{" "}
            {plural(origen.asignadas, "asignada", "asignadas")} hoy. Si el programa es de un grupo, ese grupo
            pasa a usar {destino?.name ?? "el equipo elegido"}.
          </p>
          {yaTiene && (
            <label className="flex items-start gap-2 rounded-md border border-warning-border bg-warning-soft p-2 text-xs text-foreground">
              <input
                type="checkbox"
                className="mt-0.5 accent-primary"
                checked={sumar}
                onChange={(ev) => setSumar(ev.target.checked)}
              />
              <span>
                {destino?.name} ya tiene {destino?.total ?? 0} de {programa.name}. Sumar los cupos
                ({destino?.total ?? 0} + {origen.total} = {(destino?.total ?? 0) + origen.total}). Si no
                lo marcás, no se mueve nada.
              </span>
            </label>
          )}
        </>
      )}
    </ConfirmSendDialog>
  );
}

export function MoverLicenciaDialog({
  licenseId,
  titular,
  programa,
  equipoActual,
  destinos,
  onClose,
  onMoved,
}: {
  licenseId: string;
  titular: string;
  programa: string;
  equipoActual: string;
  /** Los equipos activos distintos del actual, con lo libre de ESTE programa. */
  destinos: readonly DestinoDeEquipo[];
  onClose: () => void;
  onMoved: () => void;
}) {
  const [destinoId, setDestinoId] = useState(destinos.find((d) => d.libres > 0)?.id ?? destinos[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const destino = destinos.find((d) => d.id === destinoId);

  async function mover() {
    if (!destino) return;
    setBusy(true);
    const res = await fetch(`/api/licenses/${licenseId}/team`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ teamId: destino.id }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      notify.error((await leerError(res, "No se pudo cambiar el equipo")).message);
      return;
    }
    notify.success(`La licencia de ${titular} ahora sale de ${destino.name}.`);
    onMoved();
  }

  return (
    <ConfirmSendDialog
      title={`Cambiar de equipo la licencia de ${titular}`}
      confirmLabel="Cambiar de equipo"
      busyLabel="Cambiando…"
      busy={busy}
      onClose={onClose}
      onConfirm={() => void mover()}
    >
      {destinos.length === 0 ? (
        <p className="text-foreground">No hay otro equipo activo. Creá uno primero.</p>
      ) : (
        <>
          <p className="text-foreground">
            {programa} sale hoy de {equipoActual}. Pasa al cupo del equipo que elijas y descuenta ahí.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="mover-licencia-destino">Equipo de destino</Label>
            <Select
              id="mover-licencia-destino"
              value={destinoId}
              onChange={(ev) => setDestinoId(ev.target.value)}
            >
              {destinos.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} · {d.libres > 0 ? `${d.libres} libres` : "sin cupo"}
                </option>
              ))}
            </Select>
          </div>
        </>
      )}
    </ConfirmSendDialog>
  );
}
