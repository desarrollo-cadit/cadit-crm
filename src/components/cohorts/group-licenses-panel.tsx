"use client";

import { useCallback, useEffect, useState } from "react";
import { Users, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ConfirmSendDialog } from "@/components/cohorts/confirm-send-dialog";
import { notify } from "@/lib/notify";
import type { GroupLicenseDto } from "@/server/group-licenses";

type Programa = { id: string; name: string };

/**
 * 035 (US1, FR-001..FR-005) — "Licencias para todo el grupo", arriba del
 * roster de la cohorte (común, especialización o módulo).
 *
 * Asignar al grupo le da una licencia a cada alumno activo, todo o nada; si
 * no alcanza el stock, el servidor dice cuántas faltan y no asigna ninguna.
 * Quitar libera sólo las del grupo. Con un programa en el grupo, la ficha de
 * cada alumno lo muestra "Asignado al grupo" sin control (FR-012).
 *
 * El faltante (alguien que se inscribió sin stock) se ve acá, en la fila de
 * cada alumno y en la vista de Licencias (FR-004/FR-016).
 */
export function GroupLicensesPanel({
  cohortId,
  canEdit,
  esEspecializacion = false,
  onChanged,
}: {
  cohortId: string;
  /** `academico.editar`, la capacidad de `POST/DELETE .../group-licenses`. */
  canEdit: boolean;
  esEspecializacion?: boolean;
  onChanged: () => void;
}) {
  const [programas, setProgramas] = useState<GroupLicenseDto[] | null>(null);
  const [catalogo, setCatalogo] = useState<Programa[]>([]);
  const [elegido, setElegido] = useState("");
  const [vence, setVence] = useState("");
  const [confirmar, setConfirmar] = useState<
    { kind: "asignar"; programa: Programa } | { kind: "quitar"; programa: GroupLicenseDto } | null
  >(null);
  const [busy, setBusy] = useState(false);

  const refetch = useCallback(async () => {
    const res = await fetch(`/api/cohorts/${cohortId}/group-licenses`).catch(() => null);
    if (!res?.ok) return;
    const body = (await res.json()) as { programas: GroupLicenseDto[] };
    setProgramas(body.programas);
  }, [cohortId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  useEffect(() => {
    if (!canEdit) return;
    void (async () => {
      const res = await fetch("/api/software").catch(() => null);
      if (!res?.ok) return;
      const body = (await res.json()) as { software: Programa[] };
      setCatalogo(body.software.map((s) => ({ id: s.id, name: s.name })));
    })();
  }, [canEdit]);

  async function leerError(res: Response | null, porDefecto: string) {
    const body = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
    return body?.error?.message ?? porDefecto;
  }

  async function asignar(programa: Programa) {
    setBusy(true);
    const res = await fetch(`/api/cohorts/${cohortId}/group-licenses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ softwareId: programa.id, expiresAt: vence || null }),
    }).catch(() => null);
    setBusy(false);
    setConfirmar(null);
    if (!res?.ok) {
      notify.error(await leerError(res, "No se pudo asignar al grupo"));
    } else {
      const data = (await res.json()) as { asignadas: number; convertidas: number };
      notify.success(
        `${programa.name} asignado al grupo (${data.asignadas} ${data.asignadas === 1 ? "alumno" : "alumnos"}).`,
        data.convertidas > 0
          ? { description: `${data.convertidas} ya lo tenían individual: pasaron a ser del grupo.` }
          : undefined
      );
      setElegido("");
      setVence("");
    }
    void refetch();
    onChanged();
  }

  async function quitar(programa: GroupLicenseDto) {
    setBusy(true);
    const res = await fetch(
      `/api/cohorts/${cohortId}/group-licenses/${encodeURIComponent(programa.softwareId)}`,
      { method: "DELETE" }
    ).catch(() => null);
    setBusy(false);
    setConfirmar(null);
    if (!res?.ok) notify.error(await leerError(res, "No se pudo quitar del grupo"));
    else {
      const data = (await res.json()) as { liberadas: number };
      notify.success(`${programa.name} quitado del grupo; ${data.liberadas} licencias volvieron al stock.`);
    }
    void refetch();
    onChanged();
  }

  if (!programas) return null;
  const libres = catalogo.filter((c) => !programas.some((p) => p.softwareId === c.id));
  if (programas.length === 0 && !canEdit) return null;

  return (
    <section className="rounded-lg border bg-card p-3 text-xs" aria-label="Licencias del grupo">
      <div className="flex flex-wrap items-center gap-2">
        <Users className="h-4 w-4 text-muted-foreground" aria-hidden />
        <span className="font-medium text-foreground">
          {esEspecializacion ? "Licencias para todo el programa" : "Licencias para todo el grupo"}:
        </span>
        {programas.length === 0 && <span className="text-muted-foreground">ninguna</span>}
        {programas.map((p) => (
          <span
            key={p.softwareId}
            className="flex items-center gap-1 rounded-full border bg-subtle px-2 py-0.5 text-foreground"
          >
            {p.name}
            {p.expiresAt && (
              <span className="text-muted-foreground">
                · vence {new Date(p.expiresAt).toLocaleDateString("es-UY")}
              </span>
            )}
            {p.faltan > 0 && (
              <Badge variant="warning" title="Alumnos del grupo sin licencia por falta de stock">
                faltan {p.faltan}
              </Badge>
            )}
            {canEdit && (
              <button
                type="button"
                aria-label={`Quitar ${p.name} del grupo`}
                title="Quitar del grupo (libera las licencias del grupo)"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setConfirmar({ kind: "quitar", programa: p })}
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            )}
          </span>
        ))}
        {canEdit && libres.length > 0 && (
          <span className="flex flex-wrap items-center gap-1.5">
            <Select
              className="h-7 w-auto px-1.5 py-0.5 text-xs"
              value={elegido}
              aria-label="Programa para todo el grupo"
              onChange={(ev) => setElegido(ev.target.value)}
            >
              <option value="">asignar al grupo…</option>
              {libres.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            {elegido && (
              <>
                <label className="flex items-center gap-1 text-muted-foreground">
                  vence (opcional)
                  <Input
                    type="date"
                    className="h-7 w-auto px-1.5 py-0.5 text-xs"
                    value={vence}
                    onChange={(ev) => setVence(ev.target.value)}
                  />
                </label>
                <Button
                  size="sm"
                  className="h-7"
                  onClick={() => {
                    const programa = libres.find((s) => s.id === elegido);
                    if (programa) setConfirmar({ kind: "asignar", programa });
                  }}
                >
                  Asignar al grupo
                </Button>
              </>
            )}
          </span>
        )}
      </div>
      {esEspecializacion && programas.length > 0 && (
        <p className="mt-1.5 text-muted-foreground">
          Vale como paquete para todo el programa. Si un módulo también lo asigna, la persona
          descuenta dos licencias.
        </p>
      )}

      {confirmar?.kind === "asignar" && (
        <ConfirmSendDialog
          title={`Asignar ${confirmar.programa.name} a todo el grupo`}
          confirmLabel="Asignar al grupo"
          busyLabel="Asignando…"
          busy={busy}
          onClose={() => setConfirmar(null)}
          onConfirm={() => void asignar(confirmar.programa)}
        >
          <p className="text-foreground">
            Cada alumno activo de la cohorte recibe una licencia y el stock baja en esa cantidad. Si
            no alcanza para todos, no se asigna ninguna.
          </p>
          <p>
            Quien ya la tenía individual pasa a tenerla por el grupo, sin descontar otra vez. Quien
            se inscriba después la recibe sola.
          </p>
        </ConfirmSendDialog>
      )}
      {confirmar?.kind === "quitar" && (
        <ConfirmSendDialog
          title={`Quitar ${confirmar.programa.name} del grupo`}
          confirmLabel="Quitar del grupo"
          busyLabel="Quitando…"
          busy={busy}
          onClose={() => setConfirmar(null)}
          onConfirm={() => void quitar(confirmar.programa)}
        >
          <p className="text-foreground">
            Se liberan las {confirmar.programa.asignadas} licencias del grupo y vuelven al stock.
          </p>
          <p>Las licencias individuales de otros programas no se tocan.</p>
        </ConfirmSendDialog>
      )}
    </section>
  );
}
