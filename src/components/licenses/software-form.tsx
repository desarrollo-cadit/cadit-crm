"use client";

import { useState } from "react";
import type { SoftwareDto } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { notify } from "@/lib/notify";
import { Modal, useDirty } from "@/components/ui/modal";

/**
 * 005 iteración 2 — alta/edición del catálogo de software. Desde 2026-10-16
 * (pedido del dueño) vive en /licencias, junto al stock y a quién tiene cada
 * programa; antes era la pestaña "Software" de /academico. `initial` presente = edición
 * (PATCH `/api/software/:id`); ausente = alta (POST `/api/software`).
 *
 * 0089 — Acá ya no se carga el total: el cupo es de cada equipo de licencias
 * y se edita en «Editar equipo» (`TeamForm`).
 *
 * Iteración 5 (feedback en vivo: "adjuntar foto de los productos de
 * licencia... así es más fácil distinguir") — la foto se sube aparte
 * (multipart, `PUT /api/software/:id/photo`) DESPUÉS de guardar los datos,
 * porque en alta recién ahí existe un id.
 */
export function SoftwareForm({
  initial,
  onClose,
  onSaved,
}: {
  initial?: SoftwareDto | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const dirty = useDirty({ name, photoFile });

  async function uploadPhoto(id: string) {
    if (!photoFile) return;
    const body = new FormData();
    body.append("file", photoFile);
    await fetch(`/api/software/${id}/photo`, { method: "PUT", body }).catch(() => null);
  }

  async function submit() {
    if (!name.trim()) return;
    setSaving(true);
    const res = await fetch(initial ? `/api/software/${initial.id}` : "/api/software", {
      method: initial ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    }).catch(() => null);
    if (!res?.ok) {
      setSaving(false);
      const body = (await res?.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      notify.error(body?.error?.message ?? "No se pudo guardar el programa");
      return;
    }
    const id = initial?.id ?? ((await res.json()) as { software: { id: string } }).software.id;
    await uploadPhoto(id);
    setSaving(false);
    notify.success(initial ? "Programa guardado." : "Programa creado.");
    onSaved();
  }

  return (
    <Modal onClose={onClose} dirty={dirty} busy={saving} labelledBy="software-form-title">
        <h3 id="software-form-title" className="mb-4 font-semibold">
          {initial ? "Editar programa" : "Nuevo programa"}
        </h3>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="software-name">Nombre</Label>
            <Input id="software-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="software-photo">Foto (opcional)</Label>
            <div className="flex items-center gap-2.5">
              {initial?.hasPhoto && !photoFile && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/software/${initial.id}/photo`}
                  alt=""
                  className="h-9 w-9 shrink-0 rounded object-cover"
                />
              )}
              <Input
                id="software-photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!name.trim() || saving} onClick={() => void submit()}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </div>
    </Modal>
  );
}
