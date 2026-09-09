"use client";

import { useCallback, useEffect, useState } from "react";
import { Archive, ExternalLink, Pencil, Plus, TriangleAlert, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * 023 (US1, US3) — Las aulas virtuales de la academia.
 *
 * Vive en su propio archivo y no dentro de `academic-client.tsx` porque ese ya
 * pasa las 700 líneas: sumarle doscientas más lo vuelve imposible de leer, y
 * esta pestaña no comparte estado con las otras.
 *
 * Lo primero de la pantalla no son las aulas: son los CHOQUES. El ABM lo mirás
 * una vez por año; el choque es lo que te arruina el martes.
 */

type Room = {
  id: string;
  name: string;
  url: string;
  accountEmail: string | null;
  notes: string | null;
  archivedAt: string | null;
  cohortCount: number;
};

type Clash = {
  roomId: string;
  roomName: string;
  startsAt: string;
  endsAt: string;
  otherStartsAt: string;
  otherEndsAt: string;
  cohortName: string;
  otherCohortName: string;
};

type FormState =
  | { mode: "create" }
  | { mode: "edit"; room: Room }
  | null;

function cuando(iso: string): string {
  return new Intl.DateTimeFormat("es-UY", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export function RoomsPanel() {
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [clashes, setClashes] = useState<Clash[]>([]);
  const [form, setForm] = useState<FormState>(null);
  const [error, setError] = useState<string | null>(null);
  const [verArchivadas, setVerArchivadas] = useState(false);

  const refetch = useCallback(async () => {
    const [r, c] = await Promise.all([
      fetch("/api/virtual-rooms").catch(() => null),
      fetch("/api/virtual-rooms/clashes").catch(() => null),
    ]);
    if (!r?.ok) {
      setError("No se pudieron cargar las aulas.");
      setRooms([]);
      return;
    }
    setError(null);
    setRooms(((await r.json()) as { rooms: Room[] }).rooms);
    if (c?.ok) setClashes(((await c.json()) as { clashes: Clash[] }).clashes);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  async function archivar(room: Room, archived: boolean) {
    const res = await fetch(`/api/virtual-rooms/${room.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ archived }),
    }).catch(() => null);
    if (!res?.ok) {
      setError("No se pudo cambiar el estado del aula.");
      return;
    }
    await refetch();
  }

  if (rooms === null) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  const visibles = verArchivadas ? rooms : rooms.filter((r) => !r.archivedAt);
  const archivadas = rooms.filter((r) => r.archivedAt).length;

  return (
    <div className="space-y-6">
      {error && (
        <p className="rounded-md border border-danger-border bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      {/*
        023 (US3, FR-006) — Los choques primero, y SOLO cuando existen. Un
        panel fijo que dice "todo en orden" deja de leerse a la tercera visita,
        y entonces el día que diga algo real tampoco se va a leer.
      */}
      {clashes.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-3">
            Se pisan ({clashes.length})
          </h3>
          <ul className="space-y-2">
            {clashes.map((c, i) => (
              <li
                key={`${c.roomId}-${i}`}
                className="flex items-start gap-2.5 rounded-lg border border-warning-border bg-warning-soft p-3.5"
              >
                <TriangleAlert
                  className="mt-0.5 h-4 w-4 shrink-0 text-warning"
                  strokeWidth={2}
                />
                <p className="text-sm text-text-2">
                  <span className="font-medium">{c.roomName}</span>:{" "}
                  {c.cohortName} ({cuando(c.startsAt)}–{cuando(c.endsAt)}) se
                  superpone con {c.otherCohortName} ({cuando(c.otherStartsAt)}–
                  {cuando(c.otherEndsAt)}).
                </p>
              </li>
            ))}
          </ul>
          {/*
            El choque avisa, no bloquea (FR-006): coordinación sabe cosas que
            el sistema no —que esa clase se movió, que ese día es feriado—.
          */}
          <p className="text-xs text-text-3">
            El sistema no lo impide: puede haber un motivo que no conoce.
            Cambiá el aula de una de las dos clases para resolverlo.
          </p>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-3">
            Aulas ({visibles.length})
          </h3>
          <div className="flex items-center gap-2">
            {archivadas > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setVerArchivadas((v) => !v)}
              >
                {verArchivadas ? "Ocultar" : "Ver"} las de baja ({archivadas})
              </Button>
            )}
            <Button size="sm" onClick={() => setForm({ mode: "create" })}>
              <Plus className="h-4 w-4" /> Nueva aula
            </Button>
          </div>
        </div>

        {visibles.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <p className="text-sm font-medium">Todavía no cargaste ninguna aula</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Cargá acá tus salas de reunión —una por cuenta de Zoom— y asignalas
              a cada cohorte. A partir de ahí el sistema sabe quién usa cada una y
              te avisa cuando dos clases se pisan.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {visibles.map((room) => (
              <li
                key={room.id}
                className={cn(
                  "flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3",
                  room.archivedAt && "bg-subtle"
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {room.name}
                    {room.archivedAt && (
                      <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[10.5px] font-medium text-text-2">
                        de baja
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs text-text-3">
                    {room.accountEmail ? `${room.accountEmail} · ` : ""}
                    {room.url}
                  </p>
                </div>

                <span className="shrink-0 text-xs text-text-3">
                  {room.cohortCount === 0
                    ? "sin cohortes"
                    : `${room.cohortCount} cohorte${room.cohortCount === 1 ? "" : "s"}`}
                </span>

                <div className="flex shrink-0 items-center gap-1">
                  <a
                    href={room.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Abrir ${room.name}`}
                    title="Abrir la sala"
                    className="rounded-md p-2 text-text-3 transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <ExternalLink className="h-4 w-4" strokeWidth={1.7} />
                  </a>
                  <button
                    type="button"
                    aria-label={`Editar ${room.name}`}
                    title="Editar"
                    className="rounded-md p-2 text-text-3 transition-colors hover:bg-accent hover:text-foreground"
                    onClick={() => setForm({ mode: "edit", room })}
                  >
                    <Pencil className="h-4 w-4" strokeWidth={1.7} />
                  </button>
                  {/*
                    FR-009 — La baja es LÓGICA y por eso el icono no es un
                    tacho: una clase pasada que se dictó acá conserva la
                    evidencia de dónde fue.
                  */}
                  <button
                    type="button"
                    aria-label={
                      room.archivedAt ? `Reactivar ${room.name}` : `Dar de baja ${room.name}`
                    }
                    title={room.archivedAt ? "Reactivar" : "Dar de baja"}
                    className="rounded-md p-2 text-text-3 transition-colors hover:bg-accent hover:text-foreground"
                    onClick={() => void archivar(room, !room.archivedAt)}
                  >
                    {room.archivedAt ? (
                      <Undo2 className="h-4 w-4" strokeWidth={1.7} />
                    ) : (
                      <Archive className="h-4 w-4" strokeWidth={1.7} />
                    )}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {form && (
        <RoomForm
          state={form}
          onClose={() => setForm(null)}
          onSaved={async () => {
            setForm(null);
            await refetch();
          }}
        />
      )}
    </div>
  );
}

function RoomForm({
  state,
  onClose,
  onSaved,
}: {
  state: NonNullable<FormState>;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const editando = state.mode === "edit";
  const [name, setName] = useState(editando ? state.room.name : "");
  const [url, setUrl] = useState(editando ? state.room.url : "");
  const [accountEmail, setAccountEmail] = useState(
    editando ? (state.room.accountEmail ?? "") : ""
  );
  const [notes, setNotes] = useState(editando ? (state.room.notes ?? "") : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const cuerpo = {
      name: name.trim(),
      url: url.trim(),
      accountEmail: accountEmail.trim() || null,
      notes: notes.trim() || null,
    };

    const res = await fetch(
      editando ? `/api/virtual-rooms/${state.room.id}` : "/api/virtual-rooms",
      {
        method: editando ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(cuerpo),
      }
    ).catch(() => null);
    setSaving(false);

    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      setError(data?.error?.message ?? "No se pudo guardar el aula.");
      return;
    }
    await onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-pop">
        <h3 className="text-base font-semibold tracking-tight">
          {editando ? "Editar aula" : "Nueva aula"}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Una por cada cuenta de Zoom. El enlace es el de la sala permanente
          (PMI): es el que va a abrir el alumno.
        </p>

        <form onSubmit={guardar} className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="room-name">Nombre</Label>
            <Input
              id="room-name"
              required
              autoFocus
              placeholder="Zoom 1"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="room-url">Enlace de la sala</Label>
            <Input
              id="room-url"
              type="url"
              required
              placeholder="https://zoom.us/j/0000000000"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="room-account">Cuenta (opcional)</Label>
            <Input
              id="room-account"
              type="email"
              placeholder="cuenta1@cadit.uy"
              value={accountEmail}
              onChange={(e) => setAccountEmail(e.target.value)}
            />
            {/* No viaja a los portales: es para saber cuál renovar. */}
            <p className="text-xs text-text-3">
              Para saber a cuál pedirle la grabación o cuál renovar. El alumno no
              la ve.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="room-notes">Notas (opcional)</Label>
            <Input
              id="room-notes"
              placeholder="Plan Pro, hasta 300 participantes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {error && (
            <p className="rounded-md border border-danger-border bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" loading={saving}>
              {editando ? "Guardar" : "Crear aula"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
