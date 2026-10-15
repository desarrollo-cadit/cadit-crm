"use client";

import { X } from "lucide-react";
import { Select } from "@/components/ui/select";
import { notify } from "@/lib/notify";

type Programa = { id: string; name: string };

/**
 * 034 (US5, FR-020..FR-022) — Las licencias de UNA inscripción, como lista.
 *
 * Hasta 033 había una sola: "asignar…" o "liberar". Ahora una inscripción
 * lleva varias, a lo sumo una por programa: el paquete de una especialización
 * (Revit, Navisworks y AutoCAD en la madre) o las de un módulo (en la hija).
 * Cada una descuenta del stock de su programa; sin stock, el servidor la
 * rechaza y el motivo se dice. Si el mismo programa queda en el paquete y en
 * un módulo, el servidor lo devuelve como advertencia —no lo bloquea— y se
 * muestra.
 *
 * Una sola pieza para el roster de una cohorte común, el paquete de la
 * especialización, las líneas por módulo y la pestaña Alumnos del módulo:
 * cuatro copias de "agregar/liberar" serían cuatro maneras de divergir.
 */
export function LicenseList({
  enrollmentId,
  assignedIds,
  options,
  canEdit,
  onChanged,
  label = "Licencias",
}: {
  enrollmentId: string;
  /** Los `softwareId` ya asignados a esta inscripción. */
  assignedIds: readonly string[];
  /** Los programas que se pueden asignar acá (los de la cohorte, o el catálogo). */
  options: readonly Programa[];
  /** `academico.editar`, la capacidad de `PUT/DELETE /api/enrollments/[id]/license`. */
  canEdit: boolean;
  onChanged: () => void;
  label?: string;
}) {
  const nombre = (id: string) => options.find((o) => o.id === id)?.name ?? "Programa";
  const libres = options.filter((o) => !assignedIds.includes(o.id));

  async function leerError(res: Response | null, porDefecto: string) {
    const body = (await res?.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;
    return body?.error?.message ?? porDefecto;
  }

  async function agregar(softwareId: string) {
    const res = await fetch(`/api/enrollments/${enrollmentId}/license`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ softwareId }),
    }).catch(() => null);
    if (!res?.ok) {
      notify.error(await leerError(res, "No se pudo asignar la licencia"));
      onChanged();
      return;
    }
    const body = (await res.json().catch(() => null)) as { warnings?: string[] } | null;
    const repetidas = body?.warnings ?? [];
    notify.success(
      "Licencia asignada.",
      repetidas.length > 0
        ? {
            description: `${repetidas.join(", ")} ya está también en el paquete o en un módulo de esta persona: descuenta del stock dos veces.`,
          }
        : undefined
    );
    onChanged();
  }

  async function liberar(softwareId: string) {
    const res = await fetch(
      `/api/enrollments/${enrollmentId}/license?softwareId=${encodeURIComponent(softwareId)}`,
      { method: "DELETE" }
    ).catch(() => null);
    if (!res?.ok) notify.error(await leerError(res, "No se pudo liberar la licencia"));
    else notify.success("Licencia liberada.");
    onChanged();
  }

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span>{label}:</span>
      {assignedIds.length === 0 && (!canEdit || libres.length === 0) ? (
        <span className="text-muted-foreground">
          {options.length === 0 ? "sin software declarado" : "ninguna"}
        </span>
      ) : null}
      {assignedIds.map((id) => (
        <span
          key={id}
          className="flex items-center gap-1 rounded-full border bg-card px-2 py-0.5 text-foreground"
        >
          {nombre(id)}
          {canEdit ? (
            <button
              type="button"
              aria-label={`Liberar la licencia de ${nombre(id)}`}
              title="Liberar (vuelve al stock)"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => void liberar(id)}
            >
              <X className="h-3 w-3" aria-hidden />
            </button>
          ) : null}
        </span>
      ))}
      {canEdit && libres.length > 0 ? (
        <Select
          className="h-7 w-auto px-1.5 py-0.5 text-xs"
          value=""
          aria-label={`Agregar licencia (${label})`}
          onChange={(ev) => {
            if (ev.target.value) void agregar(ev.target.value);
          }}
        >
          <option value="" disabled>
            agregar…
          </option>
          {libres.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      ) : null}
    </span>
  );
}
