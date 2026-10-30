"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal, useDirty } from "@/components/ui/modal";
import { notify } from "@/lib/notify";

export type EquipoEditable = {
  id: string;
  name: string;
  autodeskAlias: string | null;
  archived: boolean;
};

/** Un programa del catálogo con el cupo actual del equipo y lo que ya ocupa. */
export type CupoEditable = { softwareId: string; name: string; total: number; ocupadas: number };

async function leerError(res: Response | null, porDefecto: string) {
  const body = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? porDefecto;
}

/**
 * 0089 — Alta y edición de un equipo de licencias (Uruguay ATC, Paraguay
 * ATC…) y de su cupo en cada programa. El nombre es el que usa la academia; el
 * alias, el que figura en Autodesk (para reconocerlo al conciliar). Sólo con
 * `academico.editar`: las rutas `/api/license-teams*` lo exigen.
 *
 * El cupo no baja de lo que el equipo ya ocupa (el servidor lo rechaza igual:
 * 422 y no se guarda ninguno). Archivar un equipo que todavía se usa responde
 * 409 y el motivo se muestra.
 */
export function TeamForm({
  initial,
  cupos,
  onClose,
  onSaved,
}: {
  initial?: EquipoEditable | null;
  cupos: readonly CupoEditable[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [alias, setAlias] = useState(initial?.autodeskAlias ?? "");
  const [totales, setTotales] = useState<Record<string, string>>(() =>
    Object.fromEntries(cupos.map((c) => [c.softwareId, String(c.total)]))
  );
  const [saving, setSaving] = useState(false);
  const dirty = useDirty({ name, alias, totales });

  async function guardar() {
    if (!name.trim()) return;
    setSaving(true);
    let teamId = initial?.id ?? null;
    if (!teamId) {
      const res = await fetch("/api/license-teams", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), autodeskAlias: alias.trim() || null }),
      }).catch(() => null);
      if (!res?.ok) {
        setSaving(false);
        notify.error(await leerError(res, "No se pudo crear el equipo"));
        return;
      }
      teamId = ((await res.json()) as { team: { id: string } }).team.id;
    } else if (name.trim() !== initial?.name || (alias.trim() || null) !== initial?.autodeskAlias) {
      const res = await fetch(`/api/license-teams/${teamId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), autodeskAlias: alias.trim() || null }),
      }).catch(() => null);
      if (!res?.ok) {
        setSaving(false);
        notify.error(await leerError(res, "No se pudo guardar el equipo"));
        return;
      }
    }

    const seats = cupos
      .filter((c) => (totales[c.softwareId] ?? "").trim() !== String(c.total))
      .map((c) => ({ softwareId: c.softwareId, total: Number(totales[c.softwareId] || 0) }));
    if (seats.length > 0) {
      const res = await fetch(`/api/license-teams/${teamId}/seats`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ seats }),
      }).catch(() => null);
      if (!res?.ok) {
        setSaving(false);
        notify.error(await leerError(res, "No se pudo guardar el cupo"));
        // El equipo ya se guardó: se refresca la vista pero el diálogo sigue abierto.
        onSaved();
        return;
      }
    }
    setSaving(false);
    notify.success(initial ? "Equipo guardado." : "Equipo creado.");
    onSaved();
  }

  async function archivar(archived: boolean) {
    if (!initial) return;
    setSaving(true);
    const res = await fetch(`/api/license-teams/${initial.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ archived }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      notify.error(await leerError(res, "No se pudo cambiar el equipo"));
      return;
    }
    notify.success(archived ? "Equipo archivado." : "Equipo reactivado.");
    onSaved();
  }

  return (
    <Modal onClose={onClose} dirty={dirty} busy={saving} labelledBy="team-form-title">
      <h3 id="team-form-title" className="mb-4 font-semibold">
        {initial ? "Editar equipo de licencias" : "Nuevo equipo de licencias"}
      </h3>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="team-name">Nombre</Label>
          <Input
            id="team-name"
            value={name}
            placeholder="Uruguay ATC"
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="team-alias">Nombre en Autodesk (opcional)</Label>
          <Input
            id="team-alias"
            value={alias}
            placeholder="2026 ATC"
            onChange={(e) => setAlias(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Cupo por programa</p>
          {cupos.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Todavía no hay programas: cargalos y después definí cuántas licencias tiene el equipo.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {cupos.map((c) => (
                <li key={c.softwareId} className="flex items-center gap-2 text-sm">
                  <label htmlFor={`cupo-${c.softwareId}`} className="min-w-0 flex-1 truncate">
                    {c.name}
                  </label>
                  {c.ocupadas > 0 && (
                    <span className="text-xs text-muted-foreground">{c.ocupadas} ocupadas</span>
                  )}
                  <Input
                    id={`cupo-${c.softwareId}`}
                    type="number"
                    min={c.ocupadas}
                    className="h-8 w-24 text-right tabular-nums"
                    value={totales[c.softwareId] ?? "0"}
                    onChange={(e) =>
                      setTotales((t) => ({ ...t, [c.softwareId]: e.target.value }))
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-2">
        <div>
          {initial && (
            <Button variant="ghost" disabled={saving} onClick={() => void archivar(!initial.archived)}>
              {initial.archived ? "Reactivar equipo" : "Archivar equipo"}
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!name.trim() || saving} onClick={() => void guardar()}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
