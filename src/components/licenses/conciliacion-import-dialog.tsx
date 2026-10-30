"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { notify } from "@/lib/notify";
import type { TipoDeCaso } from "@/lib/autodesk-import/conciliacion";
import type { ResumenDeImportacion, VistaPreviaDeImportacion } from "@/server/autodesk-import";

/**
 * 0091 — Importar el Excel de usuarios de Autodesk de UN equipo, en dos pasos:
 * primero se REVISA (el servidor lee el archivo, propone el equipo y el programa
 * de cada oferta, y cuenta qué casos saldrían; no escribe nada) y recién después
 * se IMPORTA. Importar guarda la foto; no toca ninguna licencia del campus: lo
 * que hay que resolver aparece en el reporte.
 */

const IGNORAR = "__ignorar__";

const CASO: Record<TipoDeCaso, string> = {
  coincide: "Coinciden",
  falta_en_campus: "En Autodesk y no marcadas en el campus",
  externo: "Externos (no están en el campus)",
  falta_en_autodesk: "Marcadas en el campus y no en Autodesk",
  en_otro_equipo: "Anotadas en otro equipo del campus",
  curso_terminado: "Con el curso terminado",
};

const ORDEN: TipoDeCaso[] = [
  "coincide",
  "falta_en_campus",
  "en_otro_equipo",
  "curso_terminado",
  "falta_en_autodesk",
  "externo",
];

type Equipo = { teamId: string; nombre: string; autodeskAlias: string | null };

async function leerError(res: Response | null, porDefecto: string) {
  const body = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? porDefecto;
}

export function ImportarArchivoDialog({
  equipos,
  programas,
  equipoInicial,
  onClose,
  onImported,
}: {
  equipos: readonly Equipo[];
  programas: readonly { id: string; name: string }[];
  equipoInicial: string;
  onClose: () => void;
  onImported: () => void;
}) {
  const [teamId, setTeamId] = useState(equipoInicial);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [vista, setVista] = useState<VistaPreviaDeImportacion | null>(null);
  /** clave de oferta → programa elegido ("" = sin elegir, IGNORAR = no se gestiona). */
  const [mapeo, setMapeo] = useState<Record<string, string>>({});
  const [guardarAlias, setGuardarAlias] = useState(true);
  const [revisando, setRevisando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);
  /** Para descartar la respuesta de una revisión que ya quedó vieja. */
  const version = useRef(0);

  const formulario = useCallback(
    (f: File, equipo: string, elegido: Record<string, string>) => {
      const form = new FormData();
      form.set("file", f);
      if (equipo) form.set("teamId", equipo);
      const mapeoEnviado: Record<string, string | null> = {};
      for (const [clave, valor] of Object.entries(elegido)) {
        if (valor === IGNORAR) mapeoEnviado[clave] = null;
        else if (valor) mapeoEnviado[clave] = valor;
      }
      form.set("mapeo", JSON.stringify(mapeoEnviado));
      return form;
    },
    []
  );

  const revisar = useCallback(
    async (f: File, equipo: string, elegido: Record<string, string>, reiniciarMapeo: boolean) => {
      const esta = ++version.current;
      setRevisando(true);
      setError(null);
      const res = await fetch("/api/license-imports/preview", {
        method: "POST",
        body: formulario(f, equipo, elegido),
      }).catch(() => null);
      if (esta !== version.current) return;
      setRevisando(false);
      if (!res?.ok) {
        setVista(null);
        setError(await leerError(res, "No se pudo leer el archivo"));
        return;
      }
      const { vistaPrevia } = (await res.json()) as { vistaPrevia: VistaPreviaDeImportacion };
      setVista(vistaPrevia);
      if (reiniciarMapeo) {
        setMapeo(
          Object.fromEntries(
            vistaPrevia.ofertas.map((o) => [o.clave, o.ignorada ? IGNORAR : (o.softwareId ?? "")])
          )
        );
      }
      // El archivo dice a qué equipo pertenece: si todavía no se eligió uno, se propone.
      if (!equipo && vistaPrevia.equipoPropuesto) {
        setTeamId(vistaPrevia.equipoPropuesto);
        void revisar(f, vistaPrevia.equipoPropuesto, elegido, false);
      }
    },
    [formulario]
  );

  useEffect(
    () => () => {
      // Al cerrar, cualquier revisión en vuelo queda vieja.
      version.current = -1;
    },
    []
  );

  function alElegirArchivo(f: File | null) {
    setArchivo(f);
    setVista(null);
    setMapeo({});
    if (f) void revisar(f, teamId, {}, true);
  }

  function alCambiarEquipo(id: string) {
    setTeamId(id);
    if (archivo) void revisar(archivo, id, mapeo, false);
  }

  function alCambiarOferta(clave: string, valor: string) {
    const nuevo = { ...mapeo, [clave]: valor };
    setMapeo(nuevo);
    if (archivo) void revisar(archivo, teamId, nuevo, false);
  }

  const sinElegir = vista?.ofertas.filter((o) => (mapeo[o.clave] ?? "") === "").length ?? 0;
  const puedeImportar = Boolean(archivo && vista && teamId && sinElegir === 0 && !revisando);

  async function importar() {
    if (!archivo || !puedeImportar) return;
    setImportando(true);
    const form = formulario(archivo, teamId, mapeo);
    form.set("guardarAlias", String(guardarAlias));
    const res = await fetch("/api/license-imports", { method: "POST", body: form }).catch(() => null);
    setImportando(false);
    if (!res?.ok) {
      notify.error(await leerError(res, "No se pudo importar el archivo"));
      return;
    }
    const { importacion } = (await res.json()) as { importacion: ResumenDeImportacion };
    const cerradas =
      importacion.tareasCerradas > 0
        ? ` ${importacion.tareasCerradas} ${importacion.tareasCerradas === 1 ? "tarea pendiente se cerró" : "tareas pendientes se cerraron"} sola${importacion.tareasCerradas === 1 ? "" : "s"}.`
        : "";
    notify.success(`Importadas ${importacion.licencias} licencias de Autodesk.${cerradas}`);
    onImported();
  }

  return (
    <Modal
      onClose={onClose}
      busy={importando}
      ariaLabel="Importar usuarios de Autodesk"
      className="max-h-[90vh] max-w-2xl overflow-y-auto"
    >
      <div className="space-y-4 p-5">
        <div>
          <h2 className="text-base font-semibold">Importar usuarios de Autodesk</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Subí el Excel de usuarios que exporta manage.autodesk.com, de un solo equipo. Se guarda una foto de ese
            día; no se cambia ninguna licencia del campus hasta que lo resuelvas en el reporte.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="importar-equipo">Equipo</Label>
            <Select id="importar-equipo" value={teamId} onChange={(ev) => alCambiarEquipo(ev.target.value)}>
              <option value="">— Elegir —</option>
              {equipos.map((e) => (
                <option key={e.teamId} value={e.teamId}>
                  {e.nombre}
                  {e.autodeskAlias ? ` (${e.autodeskAlias})` : ""}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="importar-archivo">Archivo (.xlsx o .csv)</Label>
            <input
              id="importar-archivo"
              ref={entrada}
              type="file"
              accept=".xlsx,.csv"
              className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-secondary file:px-3 file:py-1.5 file:text-xs file:font-medium"
              onChange={(ev) => alElegirArchivo(ev.target.files?.[0] ?? null)}
            />
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-md border border-danger-border bg-danger-soft p-2 text-sm text-danger">
            {error}
          </p>
        )}
        {revisando && <p className="text-xs text-muted-foreground">Revisando el archivo…</p>}

        {vista && (
          <div className="space-y-4">
            <p className="text-sm text-foreground">
              <span className="font-medium">{vista.archivo.personas}</span> personas,{" "}
              <span className="font-medium">{vista.archivo.sinLicencia}</span> sin ninguna licencia (administradores o
              invitados).
              {vista.archivo.filasSinCorreo > 0 &&
                ` ${vista.archivo.filasSinCorreo} filas sin un correo válido quedaron afuera.`}
            </p>

            {vista.avisoDeEquipo && (
              <p role="status" className="rounded-md border border-warning-border bg-warning-soft p-2 text-xs text-foreground">
                {vista.avisoDeEquipo}
              </p>
            )}
            {vista.puedeGuardarAlias && vista.archivo.teamAlias && (
              <label className="flex items-start gap-2 text-xs text-foreground">
                <input
                  type="checkbox"
                  className="mt-0.5 accent-primary"
                  checked={guardarAlias}
                  onChange={(ev) => setGuardarAlias(ev.target.checked)}
                />
                <span>
                  Guardar «{vista.archivo.teamAlias}» como el nombre de este equipo en Autodesk, para reconocerlo la
                  próxima vez.
                </span>
              </label>
            )}

            <section aria-label="Programa de cada oferta" className="space-y-2">
              <h3 className="text-sm font-medium">¿Qué programa del campus es cada oferta de Autodesk?</h3>
              <ul className="divide-y rounded-md border">
                {vista.ofertas.map((o) => (
                  <li key={o.clave} className="flex flex-wrap items-center gap-2 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{o.nombre}</p>
                      <p className="text-xs text-muted-foreground">
                        {o.personas} {o.personas === 1 ? "persona" : "personas"}
                        {o.origen === "sugerido" && " · sugerido: confirmalo"}
                        {o.origen === "guardado" && " · recordado"}
                      </p>
                    </div>
                    <Select
                      aria-label={`Programa de ${o.nombre}`}
                      className="w-56"
                      value={mapeo[o.clave] ?? ""}
                      onChange={(ev) => alCambiarOferta(o.clave, ev.target.value)}
                    >
                      <option value="">— Elegir —</option>
                      {programas.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                      <option value={IGNORAR}>No se gestiona en el campus</option>
                    </Select>
                  </li>
                ))}
              </ul>
            </section>

            {vista.conteo ? (
              <section aria-label="Qué saldría" className="space-y-2">
                <h3 className="text-sm font-medium">Qué saldría de este archivo</h3>
                <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
                  {ORDEN.map((t) => (
                    <li key={t} className="flex items-center justify-between gap-3 rounded-md bg-subtle px-3 py-1.5">
                      <span className="text-foreground">{CASO[t]}</span>
                      <span className="font-medium tabular-nums">{vista.conteo![t]}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : (
              <p className="text-xs text-muted-foreground">Elegí el equipo para ver qué saldría.</p>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t pt-3">
          <Button variant="outline" size="sm" onClick={onClose} disabled={importando}>
            Cancelar
          </Button>
          <Button size="sm" onClick={() => void importar()} disabled={!puedeImportar || importando}>
            <Upload className="h-4 w-4" aria-hidden /> {importando ? "Importando…" : "Importar"}
          </Button>
        </div>
        {vista && sinElegir > 0 && (
          <p className="text-right text-xs text-muted-foreground">
            Falta elegir el programa de {sinElegir} {sinElegir === 1 ? "oferta" : "ofertas"}.
          </p>
        )}
      </div>
    </Modal>
  );
}
