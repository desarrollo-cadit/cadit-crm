"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notify";

/**
 * 2026-10-21 — El correo de la licencia (`correoDeLicencia`), con una marca
 * cuando NO es el del alumno. Una sola pieza para el roster y la vista de
 * Licencias: el dato llega ya resuelto del servidor.
 */
export function LicenseEmailText({
  value,
}: {
  value: { email: string | null; distinto: boolean };
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1 text-xs">
      <span className={value.email ? "text-foreground" : "text-muted-foreground"}>
        {value.email ?? "sin correo"}
      </span>
      {value.distinto && (
        <span
          className="rounded-full border border-warning-border bg-warning-soft px-1.5 text-[11px] text-warning"
          title="La licencia va a otro correo que el del alumno"
        >
          otro correo
        </span>
      )}
    </span>
  );
}

/**
 * El correo de la licencia en la sección de licencias de una inscripción,
 * editable con `licencias.gestionar` (`PATCH /api/enrollments/[id]/license-email`).
 * Vacío = usar el correo del alumno.
 */
export function LicenseEmailField({
  enrollmentId,
  value,
  canEdit,
  onChanged,
}: {
  enrollmentId: string;
  value: { email: string | null; distinto: boolean; propio: string | null };
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value.propio ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/enrollments/${enrollmentId}/license-email`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ licenseEmail: draft.trim() || null }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as
        | { error?: { message?: string; fields?: { message: string }[] } }
        | null;
      notify.error(
        body?.error?.fields?.[0]?.message ??
          body?.error?.message ??
          "No se pudo guardar el correo de la licencia"
      );
      return;
    }
    notify.success("Correo de la licencia guardado.");
    setEditing(false);
    onChanged();
  }

  if (editing) {
    return (
      <span className="flex basis-full flex-wrap items-center gap-1.5">
        <label htmlFor={`lic-email-${enrollmentId}`}>Correo para la licencia:</label>
        <Input
          id={`lic-email-${enrollmentId}`}
          type="email"
          className="h-7 w-64 text-xs"
          placeholder="Vacío = el correo del alumno"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <Button size="sm" disabled={saving} onClick={() => void save()}>
          {saving ? "Guardando…" : "Guardar"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={saving}
          onClick={() => {
            setDraft(value.propio ?? "");
            setEditing(false);
          }}
        >
          Cancelar
        </Button>
      </span>
    );
  }

  return (
    <span className="flex basis-full flex-wrap items-center gap-1.5">
      <span>Correo de la licencia:</span>
      <LicenseEmailText value={value} />
      {canEdit && (
        <button
          type="button"
          aria-label="Editar el correo de la licencia"
          title="Si la licencia va a otro correo que el del alumno"
          className="text-muted-foreground hover:text-foreground"
          onClick={() => setEditing(true)}
        >
          <Pencil className="h-3 w-3" aria-hidden />
        </button>
      )}
    </span>
  );
}
