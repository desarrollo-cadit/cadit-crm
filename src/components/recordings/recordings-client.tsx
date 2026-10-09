"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { RecordingRowDto, SyncStatusDto } from "@/server/zoom/recordings";
import { RecordingRowActions } from "./recording-row-actions";

export type RoomOption = { id: string; name: string };

const ESTADOS: Record<
  RecordingRowDto["assignment"]["state"],
  { label: string; variant: "success" | "warning" | "destructive" | "secondary" }
> = {
  asignada: { label: "Asignada", variant: "success" },
  ambigua: { label: "Ambigua", variant: "warning" },
  conflicto: { label: "En conflicto", variant: "destructive" },
  sin_clase: { label: "Sin clase", variant: "secondary" },
  pendiente: { label: "Pendiente", variant: "secondary" },
};

const CORRIDA: Record<string, string> = {
  corriendo: "Corriendo",
  ok: "Completa",
  parcial: "Parcial",
  error: "Con error",
};

async function mensajeDeError(res: Response | null, fallback: string) {
  const body = (await res?.json().catch(() => null)) as {
    error?: { code?: string; message?: string; startedAt?: string | null };
  } | null;
  return body?.error ?? { message: fallback };
}

/**
 * 030 US1 — Todas las grabaciones de Zoom en una tabla.
 *
 * Coordinación copia el enlace de una clase sin entrar a cinco cuentas de
 * Zoom. Las horas se muestran en la zona de la ACADEMIA, no la del navegador:
 * quien mira desde Asunción tiene que ver la misma hora que figura en el
 * cronograma.
 *
 * Densidad del panel de staff (se mira ocho horas por día): tabla compacta,
 * filtros en una línea, colores solo por tokens.
 */
export function RecordingsClient({
  timezone,
  rooms,
  canManage,
  canConfigure,
}: {
  timezone: string;
  rooms: RoomOption[];
  canManage: boolean;
  canConfigure: boolean;
}) {
  const [filters, setFilters] = useState({ connectionId: "", roomId: "", from: "", to: "", state: "" });
  const [rows, setRows] = useState<RecordingRowDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [status, setStatus] = useState<SyncStatusDto | null>(null);
  const [syncMsg, setSyncMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Cada consulta lleva un número; solo la ÚLTIMA puede escribir la tabla.
   * Sin esto, una respuesta lenta sin filtros que llega después de la
   * filtrada pisa el resultado, y la tabla muestra todo con los filtros puestos.
   */
  const seqRef = useRef(0);

  const fecha = useMemo(
    () => new Intl.DateTimeFormat("es-UY", { timeZone: timezone, dateStyle: "medium", timeStyle: "short" }),
    [timezone]
  );
  const hora = useMemo(
    () => new Intl.DateTimeFormat("es-UY", { timeZone: timezone, hour: "2-digit", minute: "2-digit" }),
    [timezone]
  );

  const query = useCallback(
    (cursor?: string) => {
      const p = new URLSearchParams();
      for (const [k, v] of Object.entries(filters)) if (v) p.set(k, v);
      if (cursor) p.set("cursor", cursor);
      return `/api/recordings?${p.toString()}`;
    },
    [filters]
  );

  const load = useCallback(async () => {
    const seq = ++seqRef.current;
    setLoading(true);
    const res = await fetch(query()).catch(() => null);
    if (seq !== seqRef.current) return;
    setLoading(false);
    if (!res?.ok) {
      setLoadError(true);
      return;
    }
    setLoadError(false);
    const data = (await res.json()) as { rows: RecordingRowDto[]; nextCursor: string | null; configured: boolean };
    if (seq !== seqRef.current) return;
    setRows(data.rows);
    setNextCursor(data.nextCursor);
    setConfigured(data.configured);
  }, [query]);

  async function loadMore() {
    if (!nextCursor) return;
    const seq = seqRef.current;
    const res = await fetch(query(nextCursor)).catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { rows: RecordingRowDto[]; nextCursor: string | null };
    if (seq !== seqRef.current) return;
    setRows((r) => [...r, ...data.rows]);
    setNextCursor(data.nextCursor);
  }

  const loadStatus = useCallback(async (): Promise<SyncStatusDto | null> => {
    const res = await fetch("/api/recordings/sync").catch(() => null);
    if (!res?.ok) return null;
    const data = (await res.json()) as SyncStatusDto;
    setStatus(data);
    return data;
  }, []);

  /** Mientras haya una corrida, se consulta cada 5 s; al terminar, se recarga la tabla. */
  const poll = useCallback(async () => {
    const s = await loadStatus();
    if (s?.running) {
      pollRef.current = setTimeout(() => void poll(), 5000);
      return;
    }
    setSyncing(false);
    void load();
  }, [load, loadStatus]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      const s = await loadStatus();
      if (s?.running) {
        setSyncing(true);
        pollRef.current = setTimeout(() => void poll(), 5000);
      }
    })();
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
    // Solo al montar: después el sondeo lo maneja `poll`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function sincronizar() {
    setSyncMsg(null);
    const res = await fetch("/api/recordings/sync", { method: "POST" }).catch(() => null);
    if (res?.status === 202) {
      setSyncing(true);
      setSyncMsg({ tone: "ok", text: "Sincronización iniciada. La tabla se actualiza cuando termine." });
      pollRef.current = setTimeout(() => void poll(), 1500);
      return;
    }
    const err = await mensajeDeError(res, "No pudimos iniciar la sincronización. Probá de nuevo en un momento.");
    if (err.code === "sync_en_curso") {
      setSyncing(true);
      setSyncMsg({
        tone: "error",
        text: err.startedAt
          ? `Ya hay una sincronización corriendo desde las ${hora.format(new Date(err.startedAt))}.`
          : "Ya hay una sincronización corriendo.",
      });
      pollRef.current = setTimeout(() => void poll(), 5000);
      return;
    }
    setSyncMsg({ tone: "error", text: err.message ?? "No pudimos iniciar la sincronización." });
  }

  const set = (k: keyof typeof filters) => (v: string) => setFilters((f) => ({ ...f, [k]: v }));
  const conexiones = status?.connections ?? [];

  return (
    <div className="flex h-full flex-col">
      <header className="space-y-3 border-b px-6 pb-3 pt-4">
        <Breadcrumb items={[{ label: "Gestión", href: null }, { label: "Grabaciones", href: null }]} />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <Video className="h-5 w-5" aria-hidden /> Grabaciones
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Las grabaciones en la nube de las aulas de Zoom, más recientes primero. Copiá el
              enlace sin entrar a Zoom; el video se sigue viendo en Zoom.
            </p>
          </div>
          {canManage && configured && (
            <Button onClick={() => void sincronizar()} disabled={syncing}>
              <RefreshCw className={syncing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              {syncing ? "Sincronizando…" : "Sincronizar"}
            </Button>
          )}
        </div>
        {syncMsg && (
          <p className={syncMsg.tone === "ok" ? "text-sm text-success" : "text-sm text-destructive"}>
            {syncMsg.text}
          </p>
        )}
        {conexiones.length > 0 && (
          <ul className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
            {conexiones.map((c) => (
              <li key={c.id}>
                <span className="font-medium text-foreground">{c.name}</span>
                {c.lastRun ? (
                  <>
                    {" "}
                    · última: {CORRIDA[c.lastRun.status] ?? c.lastRun.status}
                    {c.lastRun.finishedAt && <> el {fecha.format(new Date(c.lastRun.finishedAt))}</>}
                    {c.lastRun.status !== "corriendo" && <> · {c.lastRun.newCount} nuevas</>}
                    {c.lastRun.error && <span className="text-destructive"> · {c.lastRun.error}</span>}
                  </>
                ) : (
                  " · nunca sincronizada"
                )}
              </li>
            ))}
            {status?.periodicIntervalMin === 0 && <li>Sincronización automática apagada: solo con el botón.</li>}
          </ul>
        )}
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
        {!configured ? (
          <div className="rounded-md border border-dashed px-4 py-8 text-center">
            <p className="font-medium text-foreground">Conectá Zoom para ver las grabaciones acá</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Sin conexión el CRM funciona igual: el enlace de cada grabación se carga a mano en la clase.
            </p>
            {canConfigure ? (
              <Link href="/settings/zoom" className="mt-3 inline-block text-sm text-brand hover:underline">
                Ir a Configuración › Zoom
              </Link>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">Pedile a dirección que conecte las cuentas.</p>
            )}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-xs text-text-3">
                Cuenta
                <Select id="rec-connection" className="w-44" value={filters.connectionId} onChange={(e) => set("connectionId")(e.target.value)}>
                  <option value="">Todas</option>
                  {conexiones.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-text-3">
                Aula
                <Select id="rec-room" className="w-44" value={filters.roomId} onChange={(e) => set("roomId")(e.target.value)}>
                  <option value="">Todas</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-text-3">
                Desde
                <Input id="rec-from" type="date" className="w-40" value={filters.from} onChange={(e) => set("from")(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1 text-xs text-text-3">
                Hasta
                <Input id="rec-to" type="date" className="w-40" value={filters.to} onChange={(e) => set("to")(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1 text-xs text-text-3">
                Estado
                <Select id="rec-state" className="w-40" value={filters.state} onChange={(e) => set("state")(e.target.value)}>
                  <option value="">Todos</option>
                  <option value="pendiente">Pendiente</option>
                  <option value="asignada">Asignada</option>
                  <option value="ambigua">Ambigua</option>
                  <option value="conflicto">En conflicto</option>
                  <option value="sin_clase">Sin clase</option>
                  <option value="faltante">Ya no está en Zoom</option>
                </Select>
              </label>
            </div>

            {loadError && (
              <p className="text-sm text-destructive">
                No pudimos cargar las grabaciones. Podés recargar la página en un momento.
              </p>
            )}
            {loading && rows.length === 0 ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : rows.length === 0 && !loadError ? (
              <p className="rounded-md border border-dashed px-4 py-6 text-sm text-muted-foreground">
                No hay grabaciones con estos filtros.
                {canManage && " Si recién conectaste Zoom, apretá Sincronizar."}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Inicio</TableHead>
                    <TableHead>Aula</TableHead>
                    <TableHead>Cuenta</TableHead>
                    <TableHead>Tema</TableHead>
                    <TableHead>Duración</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Clase</TableHead>
                    <TableHead>Vence</TableHead>
                    <TableHead>Enlace</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const estado = ESTADOS[r.assignment.state];
                    const clase = r.assignment.classSession;
                    return (
                      <TableRow key={r.id} data-recording-id={r.id}>
                        <TableCell className="whitespace-nowrap">{fecha.format(new Date(r.startTime))}</TableCell>
                        <TableCell>{r.room?.name ?? <span className="text-muted-foreground">—</span>}</TableCell>
                        <TableCell>
                          {r.connection.name}
                          {r.connection.archived && (
                            <Badge variant="secondary" className="ml-1.5">
                              Archivada
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="max-w-56 truncate" title={r.topic ?? undefined}>
                          {r.topic ?? <span className="text-muted-foreground">Sin tema</span>}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {r.durationMin !== null ? `${r.durationMin} min` : "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            <Badge variant={estado.variant}>{estado.label}</Badge>
                            {r.assignment.mode === "manual" && <Badge variant="outline">Manual</Badge>}
                            {r.missingInZoom && <Badge variant="destructive">Ya no está en Zoom</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {clase ? (
                            <Link href={`/cohorts/${clase.cohortId}`} className="hover:underline">
                              {clase.cohortName} · clase {clase.number}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {r.autoDeleteDate ?? <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>
                          <RecordingRowActions playUrl={r.playUrl} passcode={r.passcode} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
            {nextCursor && (
              <Button variant="outline" size="sm" onClick={() => void loadMore()}>
                Ver más grabaciones
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
