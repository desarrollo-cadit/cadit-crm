"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Select } from "@/components/ui/select";
import {
  equipoInicial,
  libresDe,
  TeamSelect,
  useEquiposDeLicencias,
} from "@/components/licenses/team-select";
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
 *
 * 035 (FR-008/FR-012) — Lo asignado al GRUPO de la cohorte figura "Asignado
 * al grupo", sin control: no se libera por alumno ni se ofrece para agregar
 * (el servidor lo rechazaría con 409). Si la persona es del grupo y no tiene
 * la licencia —se inscribió sin stock—, se ve el faltante (FR-004).
 *
 * 0089 — Cada licencia sale del cupo de un EQUIPO (Uruguay ATC, Paraguay
 * ATC…): antes de «agregar…» se elige el equipo, que arranca en el último que
 * usó esta persona y muestra cuántas libres tiene de cada programa.
 */
export function LicenseList({
  enrollmentId,
  assignedIds,
  options,
  canEdit,
  onChanged,
  label = "Licencias",
  group = [],
  bloqueo = null,
}: {
  /**
   * 2026-10-23 — Por qué no se puede asignar (p. ej. "Tenía licencia
   * propia"): sin selector, con el motivo a la vista. El servidor lo rechaza
   * igual (422 `licencia_propia`); esto evita ofrecer lo que va a fallar.
   */
  bloqueo?: string | null;
  enrollmentId: string;
  /** Los `softwareId` ya asignados a esta inscripción. */
  assignedIds: readonly string[];
  /** Los programas que se pueden asignar acá (los de la cohorte, o el catálogo). */
  options: readonly Programa[];
  /** `licencias.gestionar`, la capacidad de `PUT/DELETE /api/enrollments/[id]/license`. */
  canEdit: boolean;
  onChanged: () => void;
  label?: string;
  /** 035 — Los programas asignados al grupo de la cohorte de esta inscripción. */
  group?: readonly Programa[];
}) {
  const nombre = (id: string) =>
    [...options, ...group].find((o) => o.id === id)?.name ?? "Programa";
  const delGrupo = new Set(group.map((g) => g.id));
  const individuales = assignedIds.filter((id) => !delGrupo.has(id));
  const libres = options.filter((o) => !assignedIds.includes(o.id) && !delGrupo.has(o.id));

  const { equipos, recargar } = useEquiposDeLicencias(canEdit);
  const [teamId, setTeamId] = useState("");
  useEffect(() => {
    if (equipos && !teamId) setTeamId(equipoInicial(equipos, null));
  }, [equipos, teamId]);
  const equipo = equipos?.find((e) => e.id === teamId) ?? null;

  async function leerError(res: Response | null, porDefecto: string) {
    const body = (await res?.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;
    return body?.error?.message ?? porDefecto;
  }

  async function agregar(softwareId: string) {
    if (!teamId) {
      notify.error("Elegí el equipo de licencias del que sale.");
      return;
    }
    const res = await fetch(`/api/enrollments/${enrollmentId}/license`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ softwareId, teamId }),
    }).catch(() => null);
    void recargar();
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
    void recargar();
    onChanged();
  }

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span>{label}:</span>
      {group.map((g) =>
        assignedIds.includes(g.id) ? (
          <span
            key={g.id}
            className="flex items-center gap-1 rounded-full border bg-subtle px-2 py-0.5 text-foreground"
            title="Se asigna y se quita desde el grupo, no por alumno"
          >
            {g.name}
            <span className="text-muted-foreground">· Asignado al grupo</span>
          </span>
        ) : (
          <span
            key={g.id}
            className="rounded-full border border-warning-border bg-warning-soft px-2 py-0.5 text-warning"
            title="Es del grupo, pero no había stock cuando se inscribió"
          >
            {g.name} · del grupo, sin licencia por falta de stock
          </span>
        )
      )}
      {assignedIds.length === 0 && group.length === 0 && (!canEdit || libres.length === 0) ? (
        <span className="text-muted-foreground">
          {options.length === 0 ? "sin software declarado" : "ninguna"}
        </span>
      ) : null}
      {individuales.map((id) => (
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
      {canEdit && libres.length > 0 && bloqueo ? (
        <Select
          className="h-7 w-auto px-1.5 py-0.5 text-xs"
          value=""
          disabled
          title={bloqueo}
          aria-label={`Agregar licencia (${label}): ${bloqueo}`}
        >
          <option value="">agregar…</option>
        </Select>
      ) : null}
      {canEdit && libres.length > 0 && bloqueo ? (
        <span className="text-muted-foreground">{bloqueo}</span>
      ) : null}
      {canEdit && libres.length > 0 && !bloqueo && equipos && equipos.length === 0 ? (
        <span className="text-muted-foreground">
          Creá un equipo de licencias en Licencias para poder asignar.
        </span>
      ) : null}
      {canEdit && libres.length > 0 && !bloqueo && equipos && equipos.length > 0 ? (
        <>
          <TeamSelect
            equipos={equipos}
            softwareId={null}
            value={teamId}
            onChange={setTeamId}
            label={`Equipo de licencias (${label})`}
          />
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
            {libres.map((s) => {
              const quedan = equipo ? libresDe(equipo, s.id) : 0;
              return (
                <option key={s.id} value={s.id} disabled={quedan <= 0}>
                  {s.name} · {quedan > 0 ? `${quedan} libres` : "sin cupo"}
                </option>
              );
            })}
          </Select>
        </>
      ) : null}
    </span>
  );
}
