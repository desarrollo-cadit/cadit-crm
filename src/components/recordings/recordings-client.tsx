"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, FileText, RefreshCw, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDuration } from "@/lib/duration";
import { paginationItems } from "@/lib/pagination";
import { cn } from "@/lib/utils";
import type { RecordingRowDto, RecordingsPage, SyncStatusDto } from "@/server/zoom/recordings";
import { AssignDialog } from "./assign-dialog";
import { RecordingRowActions } from "./recording-row-actions";
import { SyncStatus } from "./sync-status";

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

const TAMANIOS = [25, 50, 100] as const;
const COLUMNAS = 9;

async function mensajeDeError(res: Response | null, fallback: string) {
  const body = (await res?.json().catch(() => null)) as {
    error?: { code?: string; message?: string; startedAt?: string | null };
  } | null;
  return body?.error ?? { message: fallback };
}

/**
 * Los filtros, la página, el tamaño y el orden viven en la URL: recargar,
 * volver atrás o pasarle el enlace a otra persona muestra la MISMA tabla.
 */
type Vista = {
  connectionId: string;
  roomId: string;
  from: string;
  to: string;
  state: string;
  page: number;
  pageSize: (typeof TAMANIOS)[number];
  sort: "desc" | "asc";
};

function leerVista(sp: URLSearchParams): Vista {
  const n = Number(sp.get("pageSize"));
  const page = Number(sp.get("page"));
  return {
    connectionId: sp.get("connectionId") ?? "",
    roomId: sp.get("roomId") ?? "",
    from: sp.get("from") ?? "",
    to: sp.get("to") ?? "",
    state: sp.get("state") ?? "",
    page: Number.isInteger(page) && page > 1 ? page : 1,
    pageSize: (TAMANIOS as readonly number[]).includes(n) ? (n as Vista["pageSize"]) : 25,
    sort: sp.get("sort") === "asc" ? "asc" : "desc",
  };
}

/** Solo lo que difiere del valor por defecto: URLs cortas y estables. */
function escribirVista(v: Vista): URLSearchParams {
  const p = new URLSearchParams();
  for (const k of ["connectionId", "roomId", "from", "to", "state"] as const) if (v[k]) p.set(k, v[k]);
  if (v.page > 1) p.set("page", String(v.page));
  if (v.pageSize !== 25) p.set("pageSize", String(v.pageSize));
  if (v.sort !== "desc") p.set("sort", v.sort);
  return p;
}

/**
 * 030 US1 — Todas las grabaciones de Zoom en una tabla de datos de verdad.
 *
 * Coordinación copia el enlace de una clase sin entrar a cinco cuentas de
 * Zoom. Las horas se muestran en la zona de la ACADEMIA, no la del navegador:
 * quien mira desde Asunción tiene que ver la misma hora que figura en el
 * cronograma.
 *
 * Addendum (pedido del dueño: "no es tabla realmente, no tiene paginación"):
 * paginación numerada con total y tamaño de página, orden por fecha,
 * encabezado fijo, filtros en la URL y scroll horizontal SOLO dentro del
 * contenedor de la tabla en el celular.
 *
 * Densidad del panel de staff (se mira ocho horas por día): tabla compacta,
 * colores solo por tokens.
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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const vista = useMemo(() => leerVista(new URLSearchParams(searchParams.toString())), [searchParams]);

  const [data, setData] = useState<Omit<RecordingsPage, "configured"> | null>(null);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [status, setStatus] = useState<SyncStatusDto | null>(null);
  const [syncMsg, setSyncMsg] = useState<{ tone: "ok" | "error"; text: string; linkToSettings?: boolean } | null>(
    null
  );
  const [syncing, setSyncing] = useState(false);
  /** La grabación cuyo panel de asignación está abierto (uno a la vez). */
  const [abierta, setAbierta] = useState<string | null>(null);
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

  /**
   * La vista pedida que la URL todavía no refleja. `router.replace` no es
   * inmediato: dos cambios seguidos (aula y después fecha) partirían los dos
   * de la URL vieja y el segundo borraría el primero. Se suelta cuando la URL
   * ya dice lo mismo.
   */
  const pendienteRef = useRef<Vista | null>(null);
  useEffect(() => {
    const p = pendienteRef.current;
    if (p && escribirVista(p).toString() === escribirVista(vista).toString()) pendienteRef.current = null;
  }, [vista]);

  const navegar = useCallback(
    (cambios: Partial<Vista>) => {
      const base = pendienteRef.current ?? vista;
      // Cambiar un filtro, el tamaño o el orden vuelve a la página 1.
      const reinicia = Object.keys(cambios).some((k) => k !== "page");
      const nueva: Vista = { ...base, ...cambios, ...(reinicia && cambios.page === undefined ? { page: 1 } : {}) };
      pendienteRef.current = nueva;
      const qs = escribirVista(nueva).toString();
      setAbierta(null);
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, vista]
  );

  const apiQuery = useMemo(() => {
    const p = escribirVista(vista);
    // La API siempre recibe tamaño y orden explícitos.
    p.set("pageSize", String(vista.pageSize));
    p.set("sort", vista.sort);
    if (!p.has("page")) p.set("page", "1");
    return `/api/recordings?${p.toString()}`;
  }, [vista]);

  const load = useCallback(async () => {
    const seq = ++seqRef.current;
    setLoading(true);
    const res = await fetch(apiQuery).catch(() => null);
    if (seq !== seqRef.current) return;
    if (!res?.ok) {
      setLoading(false);
      setLoadError(true);
      return;
    }
    const body = (await res.json()) as RecordingsPage;
    if (seq !== seqRef.current) return;
    setLoading(false);
    setLoadError(false);
    setConfigured(body.configured);
    setData({
      rows: body.rows,
      total: body.total,
      page: body.page,
      pageSize: body.pageSize,
      totalPages: body.totalPages,
    });
  }, [apiQuery]);

  const loadStatus = useCallback(async (): Promise<SyncStatusDto | null> => {
    const res = await fetch("/api/recordings/sync").catch(() => null);
    if (!res?.ok) return null;
    const body = (await res.json()) as SyncStatusDto;
    setStatus(body);
    return body;
  }, []);

  /**
   * US5 — Un solo sondeo del estado. Mientras haya una corrida (del botón o
   * de la periódica, que arranca sola en el servidor) se consulta cada 5 s;
   * sin corrida, cada minuto, para enterarse de la periódica. Cuando una
   * corrida pasa de "corriendo" a terminada, se recarga la tabla.
   */
  const corriaRef = useRef(false);
  const sondeoRef = useRef<() => Promise<void>>(async () => undefined);
  const programar = useCallback((ms: number) => {
    if (pollRef.current) clearTimeout(pollRef.current);
    pollRef.current = setTimeout(() => void sondeoRef.current(), ms);
  }, []);
  sondeoRef.current = async () => {
    const s = await loadStatus();
    if (s?.running) {
      corriaRef.current = true;
      setSyncing(true);
      programar(5000);
      return;
    }
    if (corriaRef.current) {
      corriaRef.current = false;
      setSyncing(false);
      void load();
    }
    programar(60_000);
  };

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void sondeoRef.current();
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, []);

  async function sincronizar() {
    setSyncMsg(null);
    const res = await fetch("/api/recordings/sync", { method: "POST" }).catch(() => null);
    if (res?.status === 202) {
      setSyncing(true);
      corriaRef.current = true;
      setSyncMsg({ tone: "ok", text: "Sincronización iniciada. La tabla se actualiza cuando termine." });
      programar(1500);
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
      corriaRef.current = true;
      programar(5000);
      return;
    }
    setSyncMsg({
      tone: "error",
      text: err.message ?? "No pudimos iniciar la sincronización.",
      linkToSettings: err.code === "sin_aulas" && canConfigure,
    });
  }

  const conexiones = status?.connections ?? [];
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const paginaActual = data?.page ?? vista.page;
  const totalPaginas = data?.totalPages ?? 1;
  const desde = total === 0 ? 0 : (paginaActual - 1) * vista.pageSize + 1;
  const hasta = Math.min(total, paginaActual * vista.pageSize);
  const hayFiltros = Boolean(vista.connectionId || vista.roomId || vista.from || vista.to || vista.state);

  return (
    <div className="flex h-full min-w-0 flex-col">
      <header className="space-y-3 border-b px-4 pb-3 pt-4 md:px-6">
        <Breadcrumb items={[{ label: "Gestión", href: null }, { label: "Grabaciones", href: null }]} />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <Video className="h-5 w-5" aria-hidden /> Grabaciones
              {data && configured && (
                <span className="text-sm font-normal text-muted-foreground" data-recordings-total={total}>
                  {total} {total === 1 ? "grabación" : "grabaciones"}
                </span>
              )}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Las grabaciones en la nube de las aulas de Zoom. Copiá el enlace sin entrar a Zoom; el
              video se sigue viendo en Zoom.
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
          <p
            role="status"
            data-sync-msg
            className={syncMsg.tone === "ok" ? "text-sm text-success" : "text-sm text-destructive"}
          >
            {syncMsg.text}
            {syncMsg.linkToSettings && (
              <>
                {" "}
                <Link href="/settings/zoom" className="font-medium text-brand hover:underline">
                  Ir a Configuración › Zoom
                </Link>
              </>
            )}
          </p>
        )}
        <SyncStatus status={status} timezone={timezone} />
      </header>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4 md:overflow-hidden md:px-6">
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
              <label className="flex w-full flex-col gap-1 text-xs text-text-3 sm:w-44">
                Cuenta
                <Select
                  id="rec-connection"
                  value={vista.connectionId}
                  onChange={(e) => navegar({ connectionId: e.target.value })}
                >
                  <option value="">Todas</option>
                  {conexiones.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="flex w-full flex-col gap-1 text-xs text-text-3 sm:w-44">
                Aula
                <Select id="rec-room" value={vista.roomId} onChange={(e) => navegar({ roomId: e.target.value })}>
                  <option value="">Todas</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="flex flex-1 flex-col gap-1 text-xs text-text-3 sm:w-40 sm:flex-none">
                Desde
                <Input id="rec-from" type="date" value={vista.from} onChange={(e) => navegar({ from: e.target.value })} />
              </label>
              <label className="flex flex-1 flex-col gap-1 text-xs text-text-3 sm:w-40 sm:flex-none">
                Hasta
                <Input id="rec-to" type="date" value={vista.to} onChange={(e) => navegar({ to: e.target.value })} />
              </label>
              <label className="flex w-full flex-col gap-1 text-xs text-text-3 sm:w-40">
                Estado
                <Select id="rec-state" value={vista.state} onChange={(e) => navegar({ state: e.target.value })}>
                  <option value="">Todos</option>
                  <option value="pendiente">Pendiente</option>
                  <option value="asignada">Asignada</option>
                  <option value="ambigua">Ambigua</option>
                  <option value="conflicto">En conflicto</option>
                  <option value="sin_clase">Sin clase</option>
                  <option value="faltante">Ya no está en Zoom</option>
                </Select>
              </label>
              {hayFiltros && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navegar({ connectionId: "", roomId: "", from: "", to: "", state: "" })}
                >
                  Quitar filtros
                </Button>
              )}
            </div>

            {loadError && (
              <p className="text-sm text-destructive">
                No pudimos cargar las grabaciones. Podés recargar la página en un momento.
              </p>
            )}

            {loading && !data ? (
              <div className="space-y-2" aria-busy="true">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : rows.length === 0 && !loadError ? (
              <p className="rounded-md border border-dashed px-4 py-6 text-sm text-muted-foreground">
                {hayFiltros ? "No hay grabaciones con estos filtros." : "Todavía no hay grabaciones."}
                {canManage && !hayFiltros && " Si recién vinculaste las aulas, apretá Sincronizar."}
              </p>
            ) : (
              <>
                {/*
                  El scroll (vertical y horizontal) vive en el contenedor de la
                  tabla: así el encabezado queda fijo y, en el celular, lo que
                  se desplaza de costado es la tabla y no la página.
                */}
                <Table
                  data-recordings-table
                  aria-busy={loading}
                  containerClassName={cn(
                    "max-h-[70vh] min-h-0 shrink-0 rounded-md border transition-opacity md:max-h-none md:shrink",
                    loading && "opacity-60"
                  )}
                  className="min-w-[1100px]"
                >
                  <TableHeader className="sticky top-0 z-10 bg-card">
                    <TableRow className="hover:bg-transparent">
                      <TableHead aria-sort={vista.sort === "desc" ? "descending" : "ascending"}>
                        <button
                          type="button"
                          data-sort-toggle
                          onClick={() => navegar({ sort: vista.sort === "desc" ? "asc" : "desc" })}
                          className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-foreground"
                          title={vista.sort === "desc" ? "Más recientes primero" : "Más antiguas primero"}
                        >
                          Inicio
                          {vista.sort === "desc" ? (
                            <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                          ) : (
                            <ArrowUp className="h-3.5 w-3.5" aria-hidden />
                          )}
                        </button>
                      </TableHead>
                      <TableHead>Duración</TableHead>
                      <TableHead>Aula</TableHead>
                      <TableHead>Tema</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Clase</TableHead>
                      <TableHead>Cuenta</TableHead>
                      <TableHead>Vence</TableHead>
                      <TableHead>Enlace</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => {
                      const estado = ESTADOS[r.assignment.state];
                      const clase = r.assignment.classSession;
                      const destacada = r.assignment.state === "ambigua" || r.assignment.state === "conflicto";
                      const duracion = formatDuration(r.durationMin);
                      return (
                        <Fragment key={r.id}>
                          <TableRow
                            data-recording-id={r.id}
                            data-state={r.assignment.state}
                            className={destacada ? "bg-warning-soft" : undefined}
                          >
                            <TableCell className="whitespace-nowrap">{fecha.format(new Date(r.startTime))}</TableCell>
                            <TableCell className="whitespace-nowrap">
                              {duracion ? (
                                <span className="font-semibold text-foreground" data-duration>
                                  {duracion}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {r.room?.name ?? <span className="text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell className="max-w-56">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="truncate" title={r.topic ?? undefined} data-topic>
                                  {r.topic ?? <span className="text-muted-foreground">Sin tema</span>}
                                </span>
                                {r.hasTranscript && (
                                  <Badge variant="outline" data-transcript title="La grabación tiene transcripción en Zoom">
                                    <FileText className="mr-1 h-3 w-3" aria-hidden />
                                    Transcripción
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                <Badge variant={estado.variant}>{estado.label}</Badge>
                                {r.assignment.mode === "manual" ? (
                                  <Badge variant="outline">Manual</Badge>
                                ) : r.assignment.state === "asignada" ? (
                                  <Badge variant="outline">Automática</Badge>
                                ) : null}
                                {r.missingInZoom && <Badge variant="destructive">Ya no está en Zoom</Badge>}
                              </div>
                            </TableCell>
                            <TableCell>
                              {clase ? (
                                <Link href={`/cohorts/${clase.cohortId}`} className="whitespace-nowrap hover:underline">
                                  {clase.cohortName} · clase {clase.number}
                                </Link>
                              ) : r.assignment.state === "ambigua" ? (
                                /* Lo dudoso no se adivina: se muestra para que una persona elija. */
                                <span className="text-xs text-foreground">
                                  ¿Cuál?{" "}
                                  {r.assignment.candidates.map((c) => `${c.cohortName} · clase ${c.number}`).join(" o ")}
                                </span>
                              ) : r.assignment.state === "conflicto" && r.assignment.conflictWith ? (
                                <span className="text-xs text-foreground">
                                  {r.assignment.conflictWith.cohortName} · clase {r.assignment.conflictWith.number} ya
                                  tiene grabación
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {r.connection.name}
                              {r.connection.archived && (
                                <Badge variant="secondary" className="ml-1.5">
                                  Archivada
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {r.autoDeleteDate ?? <span className="text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell>
                              <RecordingRowActions
                                playUrl={r.playUrl}
                                passcode={r.passcode}
                                onAssign={canManage ? () => setAbierta(abierta === r.id ? null : r.id) : undefined}
                                assigned={r.assignment.classSession !== null}
                              />
                            </TableCell>
                          </TableRow>
                          {abierta === r.id && (
                            <TableRow className="hover:bg-transparent">
                              <TableCell colSpan={COLUMNAS} className="bg-background">
                                <AssignDialog
                                  row={r}
                                  timezone={timezone}
                                  onChanged={(nueva) =>
                                    setData((d) =>
                                      d ? { ...d, rows: d.rows.map((x) => (x.id === nueva.id ? nueva : x)) } : d
                                    )
                                  }
                                  onClose={() => setAbierta(null)}
                                />
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>

                <nav
                  aria-label="Paginación de grabaciones"
                  className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground"
                >
                  <p data-pagination-summary>
                    {desde}–{hasta} de {total} · página {paginaActual} de {totalPaginas}
                  </p>
                  <div className="flex flex-wrap items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label="Página anterior"
                      disabled={paginaActual <= 1 || loading}
                      onClick={() => navegar({ page: paginaActual - 1 })}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    {paginationItems(paginaActual, totalPaginas).map((p, i) =>
                      p === "…" ? (
                        <span key={`e${i}`} className="px-1.5" aria-hidden>
                          …
                        </span>
                      ) : (
                        <Button
                          key={p}
                          size="sm"
                          variant={p === paginaActual ? "default" : "ghost"}
                          aria-current={p === paginaActual ? "page" : undefined}
                          data-page={p}
                          className="min-w-8 px-2"
                          disabled={loading && p !== paginaActual}
                          onClick={() => p !== paginaActual && navegar({ page: p })}
                        >
                          {p}
                        </Button>
                      )
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label="Página siguiente"
                      disabled={paginaActual >= totalPaginas || loading}
                      onClick={() => navegar({ page: paginaActual + 1 })}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <label className="ml-2 flex items-center gap-1.5">
                      Por página
                      <Select
                        id="rec-page-size"
                        className="h-8 w-20"
                        value={String(vista.pageSize)}
                        onChange={(e) => navegar({ pageSize: Number(e.target.value) as Vista["pageSize"] })}
                      >
                        {TAMANIOS.map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </Select>
                    </label>
                  </div>
                </nav>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
