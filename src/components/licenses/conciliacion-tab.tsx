"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Upload, Wand2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmSendDialog } from "@/components/cohorts/confirm-send-dialog";
import { ImportarArchivoDialog } from "@/components/licenses/conciliacion-import-dialog";
import { NotaDialog, VincularDialog } from "@/components/licenses/conciliacion-dialogs";
import { csvDeExternos, csvDePendientes } from "@/lib/autodesk-import/csv";
import { coincideConBusqueda } from "@/lib/contact-search";
import type {
  AccionDeCaso,
  CandidataDeAsignacion,
  EstadoDelCurso,
  TipoDeCaso,
  TipoDeTarea,
} from "@/lib/autodesk-import/conciliacion";
import type {
  CasoDto,
  EquipoDelReporte,
  PendienteDto,
  ReporteDeConciliacion,
  ResultadoDeLoSeguro,
} from "@/server/autodesk-import";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";

/**
 * 0091 — Conciliación con Autodesk: lo que dice manage.autodesk.com contra lo
 * que dice el campus, por equipo. Arriba, de cuándo es la foto y las cuentas
 * por programa; abajo, el trabajo en cuatro secciones: A resolver, Externos
 * (el reporte de Soporte), Pendientes en Autodesk y Verificadas.
 *
 * Nada se aplica solo salvo «Aplicar lo seguro», y siempre después de decir
 * cuántas son. El servidor vuelve a calcular cada caso al actuar: esta pantalla
 * nunca decide qué le corresponde a una persona. Sin `canManage` se ve igual,
 * sin botones.
 */

type Seccion = "resolver" | "externos" | "pendientes" | "verificadas";

const SECCIONES: { clave: Seccion; etiqueta: string }[] = [
  { clave: "resolver", etiqueta: "A resolver" },
  { clave: "externos", etiqueta: "Externos" },
  { clave: "pendientes", etiqueta: "Pendientes en Autodesk" },
  { clave: "verificadas", etiqueta: "Verificadas" },
];

const TIPO: Record<TipoDeCaso, { etiqueta: string; variante: "success" | "secondary" | "warning" | "destructive" }> = {
  coincide: { etiqueta: "Verificada", variante: "success" },
  falta_en_campus: { etiqueta: "Falta marcar en el campus", variante: "warning" },
  externo: { etiqueta: "Externo", variante: "secondary" },
  falta_en_autodesk: { etiqueta: "No está en Autodesk", variante: "warning" },
  en_otro_equipo: { etiqueta: "En otro equipo", variante: "warning" },
  curso_terminado: { etiqueta: "Curso terminado", variante: "destructive" },
};

const ACCION: Record<AccionDeCaso, string> = {
  asignar: "Marcar en el campus",
  desmarcar: "Desmarcar en el campus",
  mover: "Pasar a este equipo",
  pendiente_en_autodesk: "Pendiente en Autodesk",
  sacar_en_autodesk: "Sacar en Autodesk",
  mantener: "Mantener",
  omitir: "Omitir",
  vincular: "Vincular a una persona",
};

const TAREA: Record<TipoDeTarea, string> = {
  asignar_en_autodesk: "Asignar en Autodesk",
  sacar_en_autodesk: "Sacar en Autodesk",
};

const CURSO: Record<EstadoDelCurso, string> = {
  planificada: "por empezar",
  en_curso: "en curso",
  finalizada: "terminado",
  sin_fechas: "sin fechas",
};

const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit", year: "numeric" });

async function leerError(res: Response | null, porDefecto: string) {
  const body = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? porDefecto;
}

function descargar(nombre: string, contenido: string) {
  // El BOM hace que Excel abra el UTF-8 con sus tildes.
  const blob = new Blob(["﻿", contenido], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

const etiquetaDeCandidata = (c: CandidataDeAsignacion) => `${c.grupo} (${CURSO[c.curso]})`;

export function ConciliacionTab({ canManage }: { canManage: boolean }) {
  const [data, setData] = useState<ReporteDeConciliacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [equipoId, setEquipoId] = useState("");
  const [seccion, setSeccion] = useState<Seccion>("resolver");
  const [programa, setPrograma] = useState("");
  const [q, setQ] = useState("");
  const [verResueltos, setVerResueltos] = useState(false);
  const [importando, setImportando] = useState(false);
  const [busy, setBusy] = useState(false);
  const [nota, setNota] = useState<{ caso: CasoDto; accion: "mantener" | "omitir" } | null>(null);
  const [vincular, setVincular] = useState<CasoDto | null>(null);
  const [seguro, setSeguro] = useState<ResultadoDeLoSeguro | null>(null);
  /** La inscripción elegida para marcar, por caso (cuando la persona cursa más de una cosa). */
  const [inscripcion, setInscripcion] = useState<Record<string, string>>({});

  const refetch = useCallback(async () => {
    const res = await fetch("/api/license-imports").catch(() => null);
    if (!res?.ok) {
      setError("No se pudo cargar la conciliación");
      return;
    }
    setError(null);
    setData((await res.json()) as ReporteDeConciliacion);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const equipo: EquipoDelReporte | null = useMemo(() => {
    if (!data) return null;
    return (
      data.equipos.find((e) => e.teamId === equipoId) ??
      data.equipos.find((e) => e.ultimaImportacion) ??
      data.equipos[0] ??
      null
    );
  }, [data, equipoId]);

  const casos = useMemo(() => {
    if (!equipo) return [];
    return equipo.casos.filter(
      (c) =>
        (!programa || c.softwareId === programa) &&
        coincideConBusqueda(q, { texto: [c.nombre, c.email ?? ""] })
    );
  }, [equipo, programa, q]);

  const aResolver = casos.filter(
    (c) => c.tipo !== "externo" && c.tipo !== "coincide" && (c.estado === "a_resolver" || (verResueltos && c.estado !== "pendiente"))
  );
  const externos = casos.filter((c) => c.tipo === "externo");
  const verificadas = casos.filter((c) => c.tipo === "coincide");
  const pendientes: PendienteDto[] = useMemo(
    () =>
      (data?.pendientes ?? []).filter(
        (p) =>
          (!equipo || p.teamId === equipo.teamId) &&
          (!programa || p.softwareId === programa) &&
          coincideConBusqueda(q, { texto: [p.persona ?? "", p.email ?? ""] })
      ),
    [data, equipo, programa, q]
  );
  const cuentas: Record<Seccion, number> = {
    resolver: equipo?.casos.filter((c) => c.tipo !== "externo" && c.tipo !== "coincide" && c.estado === "a_resolver").length ?? 0,
    externos: equipo?.casos.filter((c) => c.tipo === "externo").length ?? 0,
    pendientes: (data?.pendientes ?? []).filter((p) => !equipo || p.teamId === equipo.teamId).length,
    verificadas: equipo?.casos.filter((c) => c.tipo === "coincide").length ?? 0,
  };

  async function aplicar(caso: CasoDto, accion: AccionDeCaso, extra: Record<string, string | undefined> = {}) {
    if (!equipo) return;
    setBusy(true);
    const res = await fetch("/api/license-imports/cases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ teamId: equipo.teamId, clave: caso.clave, accion, ...extra }),
    }).catch(() => null);
    setBusy(false);
    setNota(null);
    setVincular(null);
    if (!res?.ok) {
      notify.error(await leerError(res, "No se pudo aplicar la acción"));
    } else {
      notify.success(`${caso.nombre}: ${ACCION[accion].toLowerCase()} listo.`);
    }
    void refetch();
  }

  function elegir(caso: CasoDto, accion: AccionDeCaso) {
    if (accion === "mantener" || accion === "omitir") setNota({ caso, accion });
    else if (accion === "vincular") setVincular(caso);
    else if (accion === "asignar") {
      void aplicar(caso, accion, { enrollmentId: inscripcion[caso.clave] ?? caso.preseleccionada ?? undefined });
    } else void aplicar(caso, accion);
  }

  async function contarLoSeguro() {
    if (!equipo) return;
    setBusy(true);
    const res = await fetch("/api/license-imports/apply-safe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ teamId: equipo.teamId, soloContar: true }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      notify.error(await leerError(res, "No se pudo calcular qué se puede aplicar"));
      return;
    }
    setSeguro(((await res.json()) as { resultado: ResultadoDeLoSeguro }).resultado);
  }

  async function aplicarLoSeguro() {
    if (!equipo) return;
    setBusy(true);
    const res = await fetch("/api/license-imports/apply-safe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ teamId: equipo.teamId }),
    }).catch(() => null);
    setBusy(false);
    setSeguro(null);
    if (!res?.ok) {
      notify.error(await leerError(res, "No se pudo aplicar"));
    } else {
      const { resultado } = (await res.json()) as { resultado: ResultadoDeLoSeguro };
      if (resultado.fallidas.length > 0) {
        notify.warning(
          `Se aplicaron ${resultado.aplicadas}; ${resultado.fallidas.length} no se pudieron: ${resultado.fallidas
            .slice(0, 3)
            .map((f) => `${f.nombre} (${f.message})`)
            .join("; ")}`
        );
      } else {
        notify.success(`Se aplicaron ${resultado.aplicadas} cambios seguros.`);
      }
    }
    void refetch();
  }

  const equiposActivos = (data?.equipos ?? []).map((e) => ({
    teamId: e.teamId,
    nombre: e.nombre,
    autodeskAlias: e.autodeskAlias,
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-xs text-muted-foreground">
          Lo que dice manage.autodesk.com contra lo que dice el campus, por equipo. Importá el Excel de usuarios de
          cada equipo cuando quieras ver cómo están; el campus es una foto de ese día, no un espejo en vivo.
        </p>
        {canManage && data && data.equipos.length > 0 && (
          <Button size="sm" onClick={() => setImportando(true)}>
            <Upload className="h-4 w-4" aria-hidden /> Importar archivo de Autodesk
          </Button>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {!data ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      ) : data.equipos.length === 0 ? (
        <div role="status" className="rounded-lg border border-dashed bg-card p-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Todavía no hay equipos de licencias</p>
          <p className="mt-1">Creá los equipos en la pestaña Programas y después importá el archivo de cada uno.</p>
        </div>
      ) : (
        equipo && (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <label htmlFor="conc-equipo" className="text-xs text-muted-foreground">
                  Equipo
                </label>
                <Select id="conc-equipo" className="w-52" value={equipo.teamId} onChange={(ev) => setEquipoId(ev.target.value)}>
                  {data.equipos.map((e) => (
                    <option key={e.teamId} value={e.teamId}>
                      {e.nombre}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <label htmlFor="conc-programa" className="text-xs text-muted-foreground">
                  Programa
                </label>
                <Select id="conc-programa" className="w-48" value={programa} onChange={(ev) => setPrograma(ev.target.value)}>
                  <option value="">Todos</option>
                  {data.programas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </div>
              {!data.detalleOculto && (
                <div className="space-y-1">
                  <label htmlFor="conc-buscar" className="text-xs text-muted-foreground">
                    Buscar
                  </label>
                  <Input
                    id="conc-buscar"
                    className="w-56"
                    placeholder="Nombre o correo"
                    value={q}
                    onChange={(ev) => setQ(ev.target.value)}
                  />
                </div>
              )}
            </div>

            {!equipo.ultimaImportacion ? (
              <div role="status" className="rounded-lg border border-dashed bg-card p-4 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">{equipo.nombre} todavía no tiene una importación</p>
                <p className="mt-1">
                  {canManage
                    ? "Subí el Excel de usuarios de este equipo para ver qué coincide y qué no."
                    : "Pedile a Soporte que importe el archivo de este equipo."}
                </p>
              </div>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  Última importación: <span className="text-foreground">{fecha(equipo.ultimaImportacion.uploadedAt)}</span>
                  {equipo.ultimaImportacion.por ? `, por ${equipo.ultimaImportacion.por}` : ""} ·{" "}
                  {equipo.ultimaImportacion.licencias} licencias de {equipo.ultimaImportacion.personas} personas ·{" "}
                  {equipo.ultimaImportacion.fileName}
                </p>

                <Cuentas equipo={equipo} programa={programa} />

                {canManage && (
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => void contarLoSeguro()}>
                      <Wand2 className="h-4 w-4" aria-hidden /> Aplicar lo seguro
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      Solo lo que no tiene dos lecturas; antes te decimos cuántas son.
                    </span>
                  </div>
                )}

                {data.detalleOculto ? (
                  <p role="status" className="rounded-md bg-subtle p-3 text-xs text-muted-foreground">
                    Las personas y los correos del reporte se ven con el permiso de ver contactos. Las cuentas de arriba
                    sí están completas.
                  </p>
                ) : (
                  <>
                    <div className="inline-flex gap-1 rounded-lg bg-secondary p-1" role="group" aria-label="Secciones">
                      {SECCIONES.map((s) => (
                        <button
                          key={s.clave}
                          type="button"
                          aria-pressed={seccion === s.clave}
                          className={cn(
                            "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                            seccion === s.clave
                              ? "bg-card text-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                          onClick={() => setSeccion(s.clave)}
                        >
                          {s.etiqueta} <span className="tabular-nums">({cuentas[s.clave]})</span>
                        </button>
                      ))}
                    </div>

                    {seccion === "resolver" && (
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 text-xs text-muted-foreground">
                          <input
                            type="checkbox"
                            className="accent-primary"
                            checked={verResueltos}
                            onChange={(ev) => setVerResueltos(ev.target.checked)}
                          />
                          Mostrar también los resueltos
                        </label>
                        <ListaDeCasos
                          casos={aResolver}
                          vacio="No hay nada para resolver en este equipo."
                          canManage={canManage}
                          busy={busy}
                          inscripcion={inscripcion}
                          onInscripcion={(clave, id) => setInscripcion((p) => ({ ...p, [clave]: id }))}
                          onAccion={elegir}
                        />
                      </div>
                    )}

                    {seccion === "externos" && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs text-muted-foreground">
                            Tienen licencia en Autodesk y no están en el campus (ni como alumno ni como profesor).
                          </p>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={externos.length === 0}
                            onClick={() =>
                              descargar(
                                `externos-${equipo.nombre}.csv`,
                                csvDeExternos(externos.map((c) => ({ ...c, equipo: equipo.nombre })))
                              )
                            }
                          >
                            <Download className="h-4 w-4" aria-hidden /> Exportar CSV
                          </Button>
                        </div>
                        <ListaDeCasos
                          casos={externos}
                          vacio="No hay externos en este equipo."
                          canManage={canManage}
                          busy={busy}
                          inscripcion={inscripcion}
                          onInscripcion={(clave, id) => setInscripcion((p) => ({ ...p, [clave]: id }))}
                          onAccion={elegir}
                        />
                      </div>
                    )}

                    {seccion === "pendientes" && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs text-muted-foreground">
                            Lo que hay que hacer en manage.autodesk.com. Se cierra solo con la próxima importación en la
                            que ya figura hecho.
                          </p>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={pendientes.length === 0}
                            onClick={() => descargar(`pendientes-${equipo.nombre}.csv`, csvDePendientes(pendientes))}
                          >
                            <Download className="h-4 w-4" aria-hidden /> Exportar CSV
                          </Button>
                        </div>
                        <ListaDePendientes pendientes={pendientes} />
                      </div>
                    )}

                    {seccion === "verificadas" && (
                      <ListaDeCasos
                        casos={verificadas}
                        vacio="Todavía no hay licencias que coincidan."
                        canManage={false}
                        busy={busy}
                        inscripcion={inscripcion}
                        onInscripcion={() => {}}
                        onAccion={elegir}
                        verificadaEn={equipo.ultimaImportacion.uploadedAt}
                      />
                    )}
                  </>
                )}
              </>
            )}
          </>
        )
      )}

      {importando && data && (
        <ImportarArchivoDialog
          equipos={equiposActivos}
          programas={data.programas}
          equipoInicial={equipo?.teamId ?? ""}
          onClose={() => setImportando(false)}
          onImported={() => {
            setImportando(false);
            void refetch();
          }}
        />
      )}

      {nota && (
        <NotaDialog
          titulo={nota.accion === "mantener" ? "Mantener a propósito" : "Omitir este caso"}
          confirmar={nota.accion === "mantener" ? "Mantener" : "Omitir"}
          ayuda={
            nota.accion === "mantener"
              ? "Queda como está y no vuelve a aparecer como pendiente mientras no cambie algo."
              : "No se cambia nada. Vuelve a aparecer si la situación cambia."
          }
          busy={busy}
          onClose={() => setNota(null)}
          onConfirm={(texto) => void aplicar(nota.caso, nota.accion, { nota: texto || undefined })}
        />
      )}

      {vincular && vincular.email && (
        <VincularDialog
          correo={vincular.email}
          busy={busy}
          onClose={() => setVincular(null)}
          onConfirm={(persona) => void aplicar(vincular, "vincular", persona)}
        />
      )}

      {seguro && equipo && (
        <ConfirmSendDialog
          title="Aplicar lo seguro"
          confirmLabel="Aplicar"
          busyLabel="Aplicando…"
          busy={busy}
          onClose={() => setSeguro(null)}
          onConfirm={() => void aplicarLoSeguro()}
        >
          {seguro.porAccion.asignar + seguro.porAccion.desmarcar + seguro.porAccion.mover === 0 ? (
            <p className="text-foreground">No hay nada seguro para aplicar en {equipo.nombre}.</p>
          ) : (
            <ul className="list-disc space-y-1 pl-5 text-foreground">
              {seguro.porAccion.asignar > 0 && (
                <li>Marcar en el campus {seguro.porAccion.asignar} licencias que Autodesk ya tiene.</li>
              )}
              {seguro.porAccion.mover > 0 && (
                <li>Pasar a {equipo.nombre} {seguro.porAccion.mover} licencias que el campus tenía en otro equipo.</li>
              )}
              {seguro.porAccion.desmarcar > 0 && (
                <li>Desmarcar {seguro.porAccion.desmarcar} licencias de cursos terminados que Autodesk ya no tiene.</li>
              )}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            {seguro.verificadas} licencias ya coinciden y no se tocan. Lo ambiguo, los externos y lo pendiente en
            Autodesk quedan para que lo decidas vos.
          </p>
        </ConfirmSendDialog>
      )}
    </div>
  );
}

/** Las cuentas por programa del equipo: cupo, campus, Autodesk y lo que no cierra. */
function Cuentas({ equipo, programa }: { equipo: EquipoDelReporte; programa: string }) {
  const filas = equipo.resumen.filter((r) => !programa || r.softwareId === programa);
  if (filas.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <Table>
        <TableHeader className="bg-subtle">
          <TableRow>
            <TableHead>Programa</TableHead>
            <TableHead className="text-right">Cupo</TableHead>
            <TableHead className="text-right">Campus (alumnos / profesores)</TableHead>
            <TableHead className="text-right">En Autodesk</TableHead>
            <TableHead className="text-right">Solo en Autodesk</TableHead>
            <TableHead className="text-right">Externos</TableHead>
            <TableHead className="text-right">Solo en el campus</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filas.map((r) => (
            <TableRow key={r.softwareId}>
              <TableCell className="font-medium">
                {r.programa}
                {r.descuadre && (
                  <Badge variant="warning" className="ml-2">
                    No cierra
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">{r.cupo}</TableCell>
              <TableCell className="text-right tabular-nums">
                {r.ocupadasAlumnos + r.ocupadasProfesores}{" "}
                <span className="text-xs text-muted-foreground">
                  ({r.ocupadasAlumnos} / {r.ocupadasProfesores})
                </span>
              </TableCell>
              <TableCell className="text-right tabular-nums">{r.enAutodesk}</TableCell>
              <TableCell className={cn("text-right tabular-nums", r.soloAutodesk > 0 && "text-warning")}>
                {r.soloAutodesk}
              </TableCell>
              <TableCell className="text-right tabular-nums">{r.externos}</TableCell>
              <TableCell className={cn("text-right tabular-nums", r.soloCampus > 0 && "text-warning")}>
                {r.soloCampus}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="border-t px-3 py-2 text-xs text-muted-foreground">
        Los asientos «solo en Autodesk» restan de lo libre del equipo: Autodesk ya los dio aunque el campus no los
        cuente.
      </p>
    </div>
  );
}

function ListaDeCasos({
  casos,
  vacio,
  canManage,
  busy,
  inscripcion,
  onInscripcion,
  onAccion,
  verificadaEn,
}: {
  casos: readonly CasoDto[];
  vacio: string;
  canManage: boolean;
  busy: boolean;
  inscripcion: Record<string, string>;
  onInscripcion: (clave: string, enrollmentId: string) => void;
  onAccion: (caso: CasoDto, accion: AccionDeCaso) => void;
  verificadaEn?: string;
}) {
  if (casos.length === 0) {
    return <p className="rounded-lg border border-dashed bg-card p-4 text-sm text-muted-foreground">{vacio}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <Table>
        <TableHeader className="bg-subtle">
          <TableRow>
            <TableHead>Persona</TableHead>
            <TableHead>Programa</TableHead>
            <TableHead>Situación</TableHead>
            {(canManage || verificadaEn) && <TableHead className="text-right">{verificadaEn ? "Verificada" : "Qué hacer"}</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {casos.slice(0, 500).map((c) => {
            const libres = c.candidatas.filter((k) => k.bloqueo === null && k.curso !== "finalizada");
            const resuelto = c.estado === "resuelto" && c.resolucion;
            return (
              <TableRow key={c.clave}>
                <TableCell className="align-top">
                  <p className="font-medium">{c.nombre}</p>
                  {c.email && <p className="text-xs text-muted-foreground">{c.email}</p>}
                  {c.personaArchivada && <Badge variant="secondary">Dada de baja</Badge>}
                </TableCell>
                <TableCell className="align-top">{c.programa}</TableCell>
                <TableCell className="align-top">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant={TIPO[c.tipo].variante}>{TIPO[c.tipo].etiqueta}</Badge>
                    {c.tarea && <Badge variant="secondary">{TAREA[c.tarea.kind]}</Badge>}
                    {resuelto && (
                      <Badge variant="secondary">
                        {c.resolucion!.decision === "mantener" ? "Mantenido" : "Omitido"}
                      </Badge>
                    )}
                  </div>
                  {c.grupo && <p className="mt-1 text-xs text-muted-foreground">{c.grupo}</p>}
                  {c.nota && <p className="mt-1 text-xs text-muted-foreground">{c.nota}</p>}
                  {c.resolucion?.nota && <p className="mt-1 text-xs text-muted-foreground">«{c.resolucion.nota}»</p>}
                  {c.aparece && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Aparece desde {fecha(c.aparece.desde)} · en {c.aparece.n} de {c.aparece.de}{" "}
                      {c.aparece.de === 1 ? "importación" : "importaciones"}
                    </p>
                  )}
                  {c.tipo === "falta_en_campus" && c.candidatas.length > 0 && libres.length === 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Cursos: {c.candidatas.map(etiquetaDeCandidata).join(", ")}
                    </p>
                  )}
                </TableCell>
                {verificadaEn && (
                  <TableCell className="text-right align-top text-xs text-muted-foreground">{fecha(verificadaEn)}</TableCell>
                )}
                {canManage && !verificadaEn && (
                  <TableCell className="align-top">
                    {c.estado === "a_resolver" || c.tipo === "externo" ? (
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        {c.acciones.includes("asignar") && libres.length > 1 && (
                          <Select
                            aria-label={`Inscripción de ${c.nombre}`}
                            className="h-8 w-48 text-xs"
                            value={inscripcion[c.clave] ?? c.preseleccionada ?? ""}
                            onChange={(ev) => onInscripcion(c.clave, ev.target.value)}
                          >
                            <option value="">— Elegir curso —</option>
                            {libres.map((k) => (
                              <option key={k.enrollmentId} value={k.enrollmentId}>
                                {etiquetaDeCandidata(k)}
                              </option>
                            ))}
                          </Select>
                        )}
                        {c.acciones.map((a) => (
                          <Button
                            key={a}
                            size="sm"
                            className="h-8"
                            variant={a === c.sugerida ? "default" : "outline"}
                            disabled={
                              busy ||
                              (a === "asignar" && libres.length > 1 && !(inscripcion[c.clave] ?? c.preseleccionada))
                            }
                            onClick={() => onAccion(c, a)}
                          >
                            {ACCION[a]}
                          </Button>
                        ))}
                      </div>
                    ) : null}
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {casos.length > 500 && (
        <p className="border-t px-3 py-2 text-xs text-muted-foreground">
          Se muestran los primeros 500. Filtrá por programa o buscá para ver el resto.
        </p>
      )}
    </div>
  );
}

function ListaDePendientes({ pendientes }: { pendientes: readonly PendienteDto[] }) {
  if (pendientes.length === 0) {
    return (
      <p className="rounded-lg border border-dashed bg-card p-4 text-sm text-muted-foreground">
        No hay nada pendiente en Autodesk.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <Table>
        <TableHeader className="bg-subtle">
          <TableRow>
            <TableHead>Qué hacer en Autodesk</TableHead>
            <TableHead>Persona</TableHead>
            <TableHead>Programa</TableHead>
            <TableHead>Equipo</TableHead>
            <TableHead className="text-right">Desde</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pendientes.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-medium">{TAREA[p.kind]}</TableCell>
              <TableCell>
                {p.persona ?? "—"}
                {p.email && <p className="text-xs text-muted-foreground">{p.email}</p>}
                {!p.email && (
                  <p className="text-xs text-muted-foreground">Sin correo cargado: no se cierra sola.</p>
                )}
              </TableCell>
              <TableCell>{p.programa}</TableCell>
              <TableCell>{p.equipo}</TableCell>
              <TableCell className="text-right text-xs tabular-nums">{fecha(p.creadaEn)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
