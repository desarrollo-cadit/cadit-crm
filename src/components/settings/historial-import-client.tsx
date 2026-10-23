"use client";

import { useState } from "react";
import { AlertTriangle, FileUp, RotateCcw, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select } from "@/components/ui/select";
import { notify } from "@/lib/notify";
import type { ProblemaDeFila } from "@/lib/historial-import/planilla";
import type { Mapeo } from "@/lib/historial-import/plan";
import type { AnalisisDto, ImportacionDto, VistaPreviaDto } from "@/server/historial-import";

/**
 * 046 US6 (FR-014…FR-020) — Ajustes › Importar historial.
 *
 * Tres pasos: (1) asociar cada curso y cada vendedor de la planilla,
 * (2) vista previa sin escribir nada, (3) confirmar y aplicar por tandas. El
 * archivo se lee en el navegador y se manda al servidor de la instancia; nada
 * sale a otro servicio. Lo que se decide (contactos, empresas, cursadas) lo
 * decide el servidor con el mismo plan en la vista previa y al aplicar.
 */

const ESTADO: Record<ImportacionDto["status"], { label: string; variant: "secondary" | "success" | "outline" }> = {
  aplicando: { label: "Sin terminar", variant: "secondary" },
  aplicada: { label: "Aplicada", variant: "success" },
  deshecha: { label: "Deshecha", variant: "outline" },
};

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-UY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

async function pedir<T>(url: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  const res = await fetch(url, init).catch(() => null);
  const body = await res?.json().catch(() => null);
  if (!res?.ok) return { ok: false, message: body?.error?.message ?? "No se pudo completar el pedido." };
  return { ok: true, data: body as T };
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export function HistorialImportClient({ initial }: { initial: ImportacionDto[] }) {
  const [importaciones, setImportaciones] = useState(initial);
  const [archivo, setArchivo] = useState<{ nombre: string; csv: string } | null>(null);
  const [analisis, setAnalisis] = useState<AnalisisDto | null>(null);
  const [mapeo, setMapeo] = useState<Mapeo>({ cursos: {}, vendedores: {} });
  const [vista, setVista] = useState<VistaPreviaDto | null>(null);
  const [ocupado, setOcupado] = useState<null | "analizando" | "previsualizando" | "aplicando">(null);
  const [enCurso, setEnCurso] = useState<ImportacionDto | null>(null);

  function reemplazar(i: ImportacionDto) {
    setImportaciones((prev) => [i, ...prev.filter((x) => x.id !== i.id)]);
  }

  async function elegirArchivo(file: File | undefined) {
    if (!file) return;
    setOcupado("analizando");
    setAnalisis(null);
    setVista(null);
    const csv = await file.text();
    const r = await pedir<AnalisisDto>("/api/historial/importaciones/analizar", json({ csv }));
    setOcupado(null);
    if (!r.ok) {
      notify.error(r.message);
      return;
    }
    setArchivo({ nombre: file.name, csv });
    setAnalisis(r.data);
    setMapeo({
      cursos: Object.fromEntries(r.data.cursos.map((c) => [c.label, c.sugerido])),
      vendedores: Object.fromEntries(r.data.vendedores.map((v) => [v.raw, v.sugerido])),
    });
  }

  async function previsualizar() {
    if (!archivo) return;
    setOcupado("previsualizando");
    const r = await pedir<VistaPreviaDto>(
      "/api/historial/importaciones/vista-previa",
      json({ csv: archivo.csv, mapeo })
    );
    setOcupado(null);
    if (!r.ok) {
      notify.error(r.message);
      return;
    }
    setVista(r.data);
  }

  /** Pide tandas hasta que la importación queda aplicada. Si se corta, queda "Continuar". */
  async function aplicarHastaTerminar(i: ImportacionDto) {
    setOcupado("aplicando");
    let actual = i;
    setEnCurso(actual);
    while (actual.status === "aplicando") {
      const r = await pedir<ImportacionDto>(`/api/historial/importaciones/${actual.id}/aplicar`, { method: "POST" });
      if (!r.ok) {
        notify.error(`${r.message} Podés continuar desde donde quedó.`);
        break;
      }
      actual = r.data;
      setEnCurso(actual);
      reemplazar(actual);
    }
    setOcupado(null);
    if (actual.status === "aplicada") {
      notify.success("Historial importado.");
      setEnCurso(null);
      setArchivo(null);
      setAnalisis(null);
      setVista(null);
    }
  }

  async function confirmar() {
    if (!archivo || !vista) return;
    if (
      !window.confirm(
        `¿Importar ${vista.cursadas.nuevas} cursadas? Se crean ${vista.contactos.crear} contactos y ${vista.empresas.crear} empresas. ¿Hiciste el respaldo de la base?`
      )
    ) {
      return;
    }
    setOcupado("aplicando");
    const r = await pedir<ImportacionDto>(
      "/api/historial/importaciones",
      json({ csv: archivo.csv, mapeo, fileName: archivo.nombre })
    );
    if (!r.ok) {
      setOcupado(null);
      notify.error(r.message);
      return;
    }
    reemplazar(r.data);
    await aplicarHastaTerminar(r.data);
  }

  async function deshacer(i: ImportacionDto) {
    if (
      !window.confirm(
        "¿Deshacer esta importación? Se borran sus cursadas históricas. Los contactos y las empresas que creó quedan."
      )
    ) {
      return;
    }
    const r = await pedir<ImportacionDto>(`/api/historial/importaciones/${i.id}`, { method: "DELETE" });
    if (!r.ok) {
      notify.error(r.message);
      return;
    }
    reemplazar(r.data);
    notify.success("Importación deshecha.");
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Importar historial</h1>
        <p className="text-sm text-muted-foreground">
          La planilla de cursadas 2020–2024. Cada fila queda como un registro histórico en la ficha de la persona: no
          se crean grupos ni inscripciones. De los contactos que ya existen solo se completan datos vacíos.
        </p>
        <p className="flex items-start gap-2 text-sm text-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          Antes de importar, hacé un respaldo de la base. Deshacer borra las cursadas, no los contactos ni las empresas
          creados.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Elegí el archivo y asociá cursos y vendedores</CardTitle>
          <CardDescription>
            Un CSV con las columnas nombre, apellido, correo, telefono, empresa, curso, curso_original, estudiante,
            edicion, fecha, vendedor, nota y fila_planilla.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent">
            <FileUp className="h-4 w-4" aria-hidden />
            {ocupado === "analizando" ? "Leyendo…" : archivo ? `Archivo: ${archivo.nombre}` : "Elegir archivo CSV"}
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              disabled={ocupado !== null}
              onChange={(e) => void elegirArchivo(e.target.files?.[0])}
            />
          </label>

          {analisis && (
            <>
              <p className="text-sm text-muted-foreground">
                {analisis.filasValidas} de {analisis.totalFilas} filas se pueden importar.
                {analisis.avisos.length > 0 ? ` ${analisis.avisos.length} van sin correo (correo mal escrito).` : ""}
              </p>
              <Problemas titulo="Filas que no se van a importar" filas={analisis.problemas} />

              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <caption className="px-3 py-2 text-left font-medium">Cursos de la planilla</caption>
                  <thead className="bg-muted text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">En la planilla</th>
                      <th className="px-3 py-2 text-right font-medium">Filas</th>
                      <th className="px-3 py-2 font-medium">Curso del catálogo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analisis.cursos.map((c) => (
                      <tr key={c.label} className="border-t">
                        <td className="px-3 py-2">{c.label}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{c.filas}</td>
                        <td className="px-3 py-2">
                          <Select
                            aria-label={`Curso del catálogo para ${c.label}`}
                            value={mapeo.cursos[c.label] ?? ""}
                            onChange={(e) => {
                              setVista(null);
                              setMapeo((m) => ({ ...m, cursos: { ...m.cursos, [c.label]: e.target.value || null } }));
                            }}
                          >
                            <option value="">Dejar como texto</option>
                            {analisis.catalogo.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.name}
                              </option>
                            ))}
                          </Select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {analisis.vendedores.length > 0 && (
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <caption className="px-3 py-2 text-left font-medium">Vendedores de la planilla</caption>
                    <thead className="bg-muted text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">En la planilla</th>
                        <th className="px-3 py-2 text-right font-medium">Filas</th>
                        <th className="px-3 py-2 font-medium">Vendedor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analisis.vendedores.map((v) => (
                        <tr key={v.raw} className="border-t">
                          <td className="px-3 py-2">{v.raw}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{v.filas}</td>
                          <td className="px-3 py-2">
                            <Select
                              aria-label={`Vendedor para ${v.raw}`}
                              value={mapeo.vendedores[v.raw] ?? ""}
                              onChange={(e) => {
                                setVista(null);
                                setMapeo((m) => ({
                                  ...m,
                                  vendedores: { ...m.vendedores, [v.raw]: e.target.value || null },
                                }));
                              }}
                            >
                              <option value="">Sin vendedor</option>
                              {analisis.sellers.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name}
                                </option>
                              ))}
                            </Select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <Button onClick={() => void previsualizar()} loading={ocupado === "previsualizando"} disabled={ocupado !== null}>
                Ver la vista previa
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {vista && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Vista previa</CardTitle>
            <CardDescription>Todavía no se escribió nada.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <Cifra titulo="Contactos nuevos" valor={vista.contactos.crear} />
              <Cifra titulo="Contactos a completar" valor={vista.contactos.completar} />
              <Cifra titulo="Contactos sin cambios" valor={vista.contactos.sinCambios} />
              <Cifra titulo="Empresas nuevas" valor={vista.empresas.crear} />
              <Cifra titulo="Cursadas nuevas" valor={vista.cursadas.nuevas} />
              <Cifra titulo="Cursadas que ya estaban" valor={vista.cursadas.yaPresentes} />
            </dl>
            <Problemas titulo="Filas que no se van a importar" filas={vista.problemas} />
            <Problemas titulo="Filas que se importan sin correo" filas={vista.avisos} />
            <div className="space-y-2">
              <p className="text-sm font-medium">3. Confirmar</p>
              <Button onClick={() => void confirmar()} loading={ocupado === "aplicando"} disabled={ocupado !== null}>
                Importar {vista.cursadas.nuevas} cursadas
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {enCurso && (
        <Card>
          <CardContent className="space-y-2 pt-6">
            <p className="text-sm">
              Aplicando: {enCurso.processedRows} de {enCurso.totalRows} filas
            </p>
            <Progress
              value={enCurso.totalRows === 0 ? 100 : (enCurso.processedRows / enCurso.totalRows) * 100}
              label="Avance de la importación"
            />
          </CardContent>
        </Card>
      )}

      <section className="space-y-3" aria-label="Importaciones hechas">
        <h2 className="text-base font-semibold">Importaciones hechas</h2>
        {importaciones.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no se importó ninguna planilla.</p>
        ) : (
          <ul className="divide-y rounded-md border bg-card">
            {importaciones.map((i) => (
              <li key={i.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0 space-y-1 text-sm">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{i.fileName ?? i.sourceLabel}</span>
                    <Badge variant={ESTADO[i.status].variant}>{ESTADO[i.status].label}</Badge>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {fechaHora(i.createdAt)}
                    {i.importedByName ? ` · ${i.importedByName}` : ""} · {i.processedRows} de {i.totalRows} filas
                    {i.problemRows > 0 ? ` · ${i.problemRows} con problemas` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {i.takingsCreated} cursadas nuevas · {i.takingsExisting} ya estaban · {i.contactsCreated} contactos
                    nuevos · {i.contactsCompleted} completados · {i.companiesCreated} empresas nuevas
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {i.status === "aplicando" && (
                    <Button variant="outline" size="sm" disabled={ocupado !== null} onClick={() => void aplicarHastaTerminar(i)}>
                      <RotateCcw className="h-4 w-4" aria-hidden />
                      Continuar
                    </Button>
                  )}
                  {i.status !== "deshecha" && (
                    <Button variant="outline" size="sm" disabled={ocupado !== null} onClick={() => void deshacer(i)}>
                      <Undo2 className="h-4 w-4" aria-hidden />
                      Deshacer esta importación
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Cifra({ titulo, valor }: { titulo: string; valor: number }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <dt className="text-xs text-muted-foreground">{titulo}</dt>
      <dd className="text-xl font-semibold tabular-nums">{valor}</dd>
    </div>
  );
}

const MAX_A_LA_VISTA = 50;

function Problemas({ titulo, filas }: { titulo: string; filas: ProblemaDeFila[] }) {
  if (filas.length === 0) return null;
  return (
    <details className="rounded-md border px-3 py-2 text-sm">
      <summary className="cursor-pointer font-medium">
        {titulo} ({filas.length})
      </summary>
      <ul className="mt-2 space-y-1">
        {filas.slice(0, MAX_A_LA_VISTA).map((p) => (
          <li key={`${p.fila}-${p.motivo}`} className="text-muted-foreground">
            Fila {p.fila}: {p.motivo}
          </li>
        ))}
      </ul>
      {filas.length > MAX_A_LA_VISTA && (
        <p className="mt-1 text-xs text-muted-foreground">Y {filas.length - MAX_A_LA_VISTA} más.</p>
      )}
    </details>
  );
}
