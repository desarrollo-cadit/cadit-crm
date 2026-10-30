"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { equipoInicial, recordarEquipo, TeamSelect, useEquiposDeLicencias } from "@/components/licenses/team-select";
import { notify } from "@/lib/notify";

type LicenciaDeProfesor = {
  id: string;
  softwareId: string;
  softwareName: string;
  teamId: string;
  teamName: string;
  assignedAt: string | null;
};

async function leerError(res: Response | null, porDefecto: string) {
  const body = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? porDefecto;
}

/**
 * 0088 — Las licencias de un profesor (Revit, AutoCAD…): quién de los
 * profesores tiene una asignada y de qué equipo sale. Cada una descuenta del
 * cupo de su equipo igual que la de un alumno, y se queda hasta que alguien la
 * libera: un profesor no tiene un curso que la termine.
 *
 * Todos los que ven Académico las miran; asignar y quitar es `canManage`
 * (`licencias.gestionar`), la capacidad de `PUT/DELETE
 * /api/teachers/[id]/license`. Es una pantalla de STAFF: el portal del
 * profesor no muestra licencias.
 */
export function TeacherLicensesDialog({
  teacher,
  canManage,
  onClose,
}: {
  teacher: { id: string; name: string; email: string | null };
  canManage: boolean;
  onClose: () => void;
}) {
  const [licencias, setLicencias] = useState<LicenciaDeProfesor[] | null>(null);
  const [catalogo, setCatalogo] = useState<{ id: string; name: string }[]>([]);
  const [softwareId, setSoftwareId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [busy, setBusy] = useState(false);
  const { equipos, recargar: recargarEquipos } = useEquiposDeLicencias(canManage);

  const refetch = useCallback(async () => {
    const res = await fetch(`/api/teachers/${teacher.id}/license`).catch(() => null);
    if (!res?.ok) return;
    setLicencias(((await res.json()) as { licenses: LicenciaDeProfesor[] }).licenses);
  }, [teacher.id]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  useEffect(() => {
    if (!canManage) return;
    void (async () => {
      const res = await fetch("/api/software").catch(() => null);
      if (!res?.ok) return;
      const body = (await res.json()) as { software: { id: string; name: string }[] };
      setCatalogo(body.software.map((s) => ({ id: s.id, name: s.name })));
    })();
  }, [canManage]);

  // El equipo arranca en el último que usó esta persona con cupo del programa.
  useEffect(() => {
    if (equipos && softwareId) setTeamId(equipoInicial(equipos, softwareId));
  }, [equipos, softwareId]);

  async function asignar() {
    if (!softwareId || !teamId) return;
    setBusy(true);
    const res = await fetch(`/api/teachers/${teacher.id}/license`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ softwareId, teamId }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      notify.error(await leerError(res, "No se pudo asignar la licencia"));
    } else {
      recordarEquipo(teamId);
      notify.success(`Licencia asignada a ${teacher.name}.`);
      setSoftwareId("");
    }
    void recargarEquipos();
    void refetch();
  }

  async function quitar(l: LicenciaDeProfesor) {
    setBusy(true);
    const res = await fetch(
      `/api/teachers/${teacher.id}/license?softwareId=${encodeURIComponent(l.softwareId)}`,
      { method: "DELETE" }
    ).catch(() => null);
    setBusy(false);
    if (!res?.ok) notify.error(await leerError(res, "No se pudo quitar la licencia"));
    else notify.success(`${l.softwareName} liberada: volvió al stock de ${l.teamName}.`);
    void recargarEquipos();
    void refetch();
  }

  const libres = catalogo.filter((c) => !licencias?.some((l) => l.softwareId === c.id));

  return (
    <Modal onClose={onClose} busy={busy} labelledBy="teacher-licenses-title" className="max-h-[90vh] max-w-lg overflow-y-auto">
      <h3 id="teacher-licenses-title" className="mb-1 font-semibold">
        Licencias de {teacher.name}
      </h3>
      <p className="mb-3 text-xs text-muted-foreground">
        Cada licencia descuenta del cupo de su equipo y se mantiene hasta que se la libera.
      </p>
      {!teacher.email && (
        <p
          role="status"
          className="mb-3 rounded-md border border-warning-border bg-warning-soft p-2 text-xs text-foreground"
        >
          Este profesor no tiene correo cargado. Puede tener licencia igual, pero al conciliar con
          Autodesk no se lo va a reconocer hasta que lo cargues en «Editar».
        </p>
      )}

      {!licencias ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : licencias.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tiene ninguna licencia asignada.</p>
      ) : (
        <ul className="divide-y rounded-lg border text-sm">
          {licencias.map((l) => (
            <li key={l.id} className="flex items-center gap-2 px-3 py-2">
              <span className="font-medium">{l.softwareName}</span>
              <span className="text-xs text-muted-foreground">· {l.teamName}</span>
              {canManage && (
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto h-7"
                  disabled={busy}
                  aria-label={`Quitar ${l.softwareName} a ${teacher.name}`}
                  onClick={() => void quitar(l)}
                >
                  Quitar
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <div className="mt-4 space-y-2 border-t pt-3">
          <Label htmlFor="teacher-license-software">Asignar una licencia</Label>
          {libres.length === 0 && catalogo.length > 0 ? (
            <p className="text-xs text-muted-foreground">Ya tiene todos los programas.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Select
                id="teacher-license-software"
                className="h-8 w-auto text-xs"
                value={softwareId}
                onChange={(ev) => setSoftwareId(ev.target.value)}
              >
                <option value="">Elegí un programa…</option>
                {libres.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
              {softwareId && equipos && equipos.length === 0 && (
                <span className="text-xs text-muted-foreground">
                  Creá un equipo de licencias en Licencias para poder asignar.
                </span>
              )}
              {softwareId && equipos && equipos.length > 0 && (
                <>
                  <TeamSelect
                    equipos={equipos}
                    softwareId={softwareId}
                    value={teamId}
                    onChange={setTeamId}
                    className="h-8 w-auto px-2 py-1 text-xs"
                    label="Equipo de licencias del profesor"
                  />
                  <Button size="sm" className="h-8" disabled={busy || !teamId} onClick={() => void asignar()}>
                    Asignar
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Cerrar
        </Button>
      </div>
    </Modal>
  );
}
