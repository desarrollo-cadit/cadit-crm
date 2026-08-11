"use client";

import { useState } from "react";
import type { SoftwareDto } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * 005 iteración 2 — alta/edición del catálogo de software desde la pestaña
 * "Software" de /academico (feedback en vivo: no había forma de ver/editar
 * el catálogo fuera del selector de camada). `initial` presente = edición
 * (PATCH `/api/software/:id`, que ya valida no bajar de lo asignado);
 * ausente = alta (POST `/api/software`).
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
  const [totalLicenses, setTotalLicenses] = useState(
    initial?.totalLicenses?.toString() ?? "0"
  );
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function uploadPhoto(id: string) {
    if (!photoFile) return;
    const body = new FormData();
    body.append("file", photoFile);
    await fetch(`/api/software/${id}/photo`, { method: "PUT", body }).catch(() => null);
  }

  async function submit() {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    const res = await fetch(initial ? `/api/software/${initial.id}` : "/api/software", {
      method: initial ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        totalLicenses: totalLicenses.trim() ? Number(totalLicenses) : 0,
      }),
    }).catch(() => null);
    if (!res?.ok) {
      setSaving(false);
      const body = (await res?.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      setError(body?.error?.message ?? "No se pudo guardar el software");
      return;
    }
    const id = initial?.id ?? ((await res.json()) as { software: { id: string } }).software.id;
    await uploadPhoto(id);
    setSaving(false);
    onSaved();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 font-semibold">
          {initial ? "Editar software" : "Nuevo software"}
        </h3>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="software-name">Nombre</Label>
            <Input id="software-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="software-total">Total de licencias</Label>
            <Input
              id="software-total"
              type="number"
              min={0}
              value={totalLicenses}
              onChange={(e) => setTotalLicenses(e.target.value)}
            />
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
        {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!name.trim() || saving} onClick={() => void submit()}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
