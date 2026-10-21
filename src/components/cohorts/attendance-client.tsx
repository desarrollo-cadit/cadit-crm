"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { CalendarPlus, Ban, Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ItemDeMenu, MenuFlotante } from "@/components/ui/floating-menu";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { notify } from "@/lib/notify";
import type { AttendanceStatus, EstadoDeClase } from "@/lib/attendance-percentage";
import {
  ESTADOS_DE_ASISTENCIA,
  LETRA_DE_ESTADO,
  NOMBRE_DE_ESTADO,
  admiteTodosPresentes,
  etiquetaDeCelda,
  nivelDePorcentaje,
  presentesDeLaClase,
  siguienteEstado,
  sinMarcarEnLaClase,
  textoTodosPresentes,
  type NivelDePorcentaje,
} from "@/lib/attendance-grid";

type Session = {
  id: string;
  number: number;
  date: string;
  hours: number | null;
  topic: string | null;
  canceledAt: string | null;
  cancelReason: string | null;
  estado: EstadoDeClase;
  /** Alguien pasó lista: solo entonces la clase cuenta para el %. */
  tomada: boolean;
};

type Student = {
  enrollmentId: string;
  contactName: string;
  percentage: number | null;
  meetsMinimum: boolean | null;
  bySession: Partial<Record<string, AttendanceStatus>>;
};

type Sheet = {
  minAttendancePct: number | null;
  sessions: Session[];
  students: Student[];
};

/** El color de cada marca, solo con tokens (los mismos pares que `Badge`). */
const STATUS_CLASS: Record<AttendanceStatus, string> = {
  presente: "border-success-border bg-success-soft text-success",
  tarde: "border-warning-border bg-warning-soft text-warning",
  ausente: "border-danger-border bg-danger-soft text-danger",
  justificado: "border-border bg-secondary text-text-2",
};

const NIVEL_CLASS: Record<NivelDePorcentaje, string> = {
  sin_datos: "text-muted-foreground",
  sin_minimo: "text-foreground",
  bajo: "border-danger-border bg-danger-soft text-danger",
  ok: "border-success-border bg-success-soft text-success",
};

/** El día de clase es medianoche UTC: se formatea en UTC (dia-de-clase-utc). */
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
}

function formatWeekday(iso: string) {
  return new Date(iso)
    .toLocaleDateString("es-UY", { weekday: "short", timeZone: "UTC" })
    .replace(".", "");
}

function fechaCorta(s: Session) {
  return `${formatWeekday(s.date)} ${formatDate(s.date)}`;
}

/** Una clase se edita si ya se dio o es hoy; las futuras y canceladas no. */
function editableLaClase(s: Session) {
  return s.estado === "dictada" || s.estado === "hoy";
}

type DestinoDeMenu =
  | { kind: "celda"; sessionId: string; enrollmentId: string }
  | { kind: "columna"; sessionId: string };

type Menu = DestinoDeMenu & { x: number; y: number };

/**
 * 009 / 2026-10-21 — Planilla de asistencia de un grupo, compacta como una
 * hoja de cálculo.
 *
 * Una clase por columna y un alumno por fila. El nombre y el encabezado quedan
 * fijos y el desplazamiento horizontal vive DENTRO de la tabla, nunca en la
 * página. Cada celda es una letra (P/T/A/J, "·" sin marca): clic o Enter abre
 * un menú chico; las letras P, T, A y J marcan directo y las flechas mueven.
 *
 * El porcentaje lo calcula el servidor (`attendancePercentage`): solo cuentan
 * las clases YA DICTADAS. Las futuras se ven atenuadas y no se editan.
 *
 * 040 (DV-008) — `canEdit` = `asistencia.editar` (pasar lista, cancelar una
 * clase, generar el cronograma). Sin ella (rol Ventas) la planilla se lee.
 */
export function AttendanceClient({
  cohortId,
  canEdit = false,
}: {
  cohortId: string;
  canEdit?: boolean;
}) {
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [confirmar, setConfirmar] = useState<Session | null>(null);
  const [cancelar, setCancelar] = useState<Session | null>(null);
  const gridRef = useRef<HTMLTableElement>(null);

  const refetch = useCallback(async () => {
    const res = await fetch(`/api/cohorts/${cohortId}/attendance`).catch(() => null);
    if (res?.ok) setSheet((await res.json()) as Sheet);
    setLoading(false);
  }, [cohortId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  async function readError(res: Response | null, fallback: string) {
    const body = (await res?.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;
    return body?.error?.message ?? fallback;
  }

  async function generateSchedule() {
    setBusy(true);
    const res = await fetch(`/api/cohorts/${cohortId}/attendance`, {
      method: "POST",
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) notify.error(await readError(res, "No se pudo generar el cronograma"));
    else notify.success("Cronograma generado.");
    void refetch();
  }

  async function mark(sessionId: string, enrollmentId: string, status: AttendanceStatus) {
    // Optimista: la letra cambia al toque; el % lo recalcula el servidor.
    setSheet((prev) =>
      prev
        ? {
            ...prev,
            students: prev.students.map((s) =>
              s.enrollmentId === enrollmentId
                ? { ...s, bySession: { ...s.bySession, [sessionId]: status } }
                : s
            ),
          }
        : prev
    );
    const res = await fetch(`/api/class-sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ attendance: [{ enrollmentId, status }] }),
    }).catch(() => null);
    if (!res?.ok) notify.error(await readError(res, "No se pudo guardar la asistencia"));
    void refetch();
  }

  async function marcarTodosPresentes(s: Session) {
    if (!sheet) return;
    const faltan = sinMarcarEnLaClase(sheet.students, s.id);
    setBusy(true);
    const res = await fetch(`/api/class-sessions/${s.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        onlyUnmarked: true,
        attendance: faltan.map((a) => ({ enrollmentId: a.enrollmentId, status: "presente" })),
      }),
    }).catch(() => null);
    setBusy(false);
    setConfirmar(null);
    if (!res?.ok) {
      notify.error(await readError(res, "No se pudo marcar la asistencia"));
    } else {
      const { marked } = (await res.json().catch(() => ({ marked: faltan.length }))) as {
        marked: number;
      };
      notify.success(
        marked === 1 ? "1 alumno marcado como presente." : `${marked} alumnos marcados como presentes.`
      );
    }
    void refetch();
  }

  async function cancelSession(s: Session, reason: string) {
    setBusy(true);
    const res = await fetch(`/api/class-sessions/${s.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cancelReason: reason }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      notify.error(await readError(res, "No se pudo cancelar la clase"));
      return;
    }
    setCancelar(null);
    notify.success("Clase cancelada: ya no cuenta para la asistencia.");
    void refetch();
  }

  /** Flechas: mueven el foco por la grilla como en una planilla. */
  function moverFoco(fila: number, col: number) {
    const el = gridRef.current?.querySelector<HTMLElement>(
      `[data-fila="${fila}"][data-col="${col}"]`
    );
    el?.focus();
  }

  function abrirMenu(e: { currentTarget: HTMLElement }, m: DestinoDeMenu) {
    const r = e.currentTarget.getBoundingClientRect();
    setMenu({ ...m, x: r.left, y: r.bottom + 4 });
  }

  if (loading) {
    return (
      <div className="space-y-2 p-6">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!sheet) {
    return <p className="p-6 text-sm text-muted-foreground">No se pudo cargar la asistencia.</p>;
  }

  if (sheet.sessions.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm font-medium">Este grupo todavía no tiene cronograma</p>
        <p className="max-w-md text-xs text-muted-foreground">
          Se genera una clase por cada día de cursada declarado, entre la fecha de
          inicio y la de fin. Es una acción explícita: dar de alta cuarenta clases
          sin querer es difícil de deshacer.
        </p>
        {canEdit && (
          <Button loading={busy} onClick={() => void generateSchedule()}>
            {!busy && <CalendarPlus className="h-4 w-4" />}
            {busy ? "Generando…" : "Generar cronograma"}
          </Button>
        )}
      </div>
    );
  }

  const dictadas = sheet.sessions.filter((s) => s.estado === "dictada").length;
  const conLista = sheet.sessions.filter((s) => s.estado === "dictada" && s.tomada).length;
  const menuSession = menu ? sheet.sessions.find((s) => s.id === menu.sessionId) : undefined;
  const menuAlumno =
    menu?.kind === "celda"
      ? sheet.students.find((st) => st.enrollmentId === menu.enrollmentId)
      : undefined;

  return (
    <div className="space-y-3 p-6">
      <p className="text-xs text-muted-foreground">
        {dictadas} de {sheet.sessions.length} clases dictadas · asistencia tomada en {conLista} ·{" "}
        {sheet.minAttendancePct === null
          ? "sin mínimo de asistencia definido"
          : `mínimo para aprobar: ${sheet.minAttendancePct}%`}
      </p>

      <div className="max-h-[calc(100vh-16rem)] max-w-full overflow-auto rounded-lg border">
        <table
          ref={gridRef}
          className="border-separate border-spacing-0 text-xs"
          aria-label="Planilla de asistencia"
        >
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 top-0 z-30 min-w-[12rem] border-b border-r bg-subtle px-3 py-1.5 text-left font-medium text-muted-foreground"
              >
                Alumno
              </th>
              {sheet.sessions.map((s) => (
                <th
                  key={s.id}
                  scope="col"
                  className={cn(
                    "sticky top-0 z-20 border-b bg-subtle px-0.5 py-1 text-center font-medium",
                    s.estado === "futura" && "text-muted-foreground",
                    s.estado === "cancelada" && "text-danger"
                  )}
                >
                  <EncabezadoDeClase
                    s={s}
                    canEdit={canEdit}
                    onOpen={(e) => abrirMenu(e, { kind: "columna", sessionId: s.id })}
                  />
                </th>
              ))}
              <th
                scope="col"
                className="sticky right-0 top-0 z-30 border-b border-l bg-subtle px-2 py-1.5 text-right font-medium text-muted-foreground"
                title={
                  sheet.minAttendancePct === null
                    ? "Sin mínimo de asistencia"
                    : `Mínimo para aprobar: ${sheet.minAttendancePct}%`
                }
              >
                %
              </th>
            </tr>
          </thead>
          <tbody>
            {sheet.students.map((st, fila) => (
              <tr key={st.enrollmentId} className="group">
                <th
                  scope="row"
                  className="sticky left-0 z-10 h-8 max-w-[16rem] truncate border-b border-r bg-card px-3 text-left font-medium group-hover:bg-accent"
                  title={st.contactName}
                >
                  {st.contactName}
                </th>
                {sheet.sessions.map((s, col) => {
                  const status = st.bySession[s.id] ?? null;
                  const editable = canEdit && editableLaClase(s);
                  const etiqueta = etiquetaDeCelda(st.contactName, fechaCorta(s), status);
                  return (
                    <td
                      key={s.id}
                      className={cn(
                        "h-8 border-b px-0.5 text-center group-hover:bg-accent",
                        s.estado === "futura" && "bg-subtle",
                        s.estado === "cancelada" && "bg-subtle"
                      )}
                    >
                      <button
                        type="button"
                        data-fila={fila}
                        data-col={col}
                        aria-label={
                          s.estado === "cancelada"
                            ? `${etiqueta} (clase cancelada)`
                            : s.estado === "futura"
                              ? `${etiqueta} (clase futura)`
                              : etiqueta
                        }
                        aria-haspopup={editable ? "menu" : undefined}
                        aria-disabled={!editable || undefined}
                        title={editable ? `${etiqueta} · P, T, A o J para marcar` : etiqueta}
                        onClick={(e) => {
                          if (editable) abrirMenu(e, { kind: "celda", sessionId: s.id, enrollmentId: st.enrollmentId });
                        }}
                        onKeyDown={(e: KeyboardEvent<HTMLButtonElement>) => {
                          const mover: Record<string, [number, number]> = {
                            ArrowRight: [fila, col + 1],
                            ArrowLeft: [fila, col - 1],
                            ArrowDown: [fila + 1, col],
                            ArrowUp: [fila - 1, col],
                          };
                          const destino = mover[e.key];
                          if (destino) {
                            e.preventDefault();
                            moverFoco(destino[0], destino[1]);
                            return;
                          }
                          if (!editable) return;
                          const letra = e.key.toLowerCase();
                          const directo = ESTADOS_DE_ASISTENCIA.find(
                            (k) => LETRA_DE_ESTADO[k].toLowerCase() === letra
                          );
                          if (directo) {
                            e.preventDefault();
                            void mark(s.id, st.enrollmentId, directo);
                          } else if (e.key === " ") {
                            e.preventDefault();
                            void mark(s.id, st.enrollmentId, siguienteEstado(status));
                          }
                        }}
                        className={cn(
                          "inline-flex h-6 w-7 items-center justify-center rounded border text-[11px] font-semibold leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          status ? STATUS_CLASS[status] : "border-transparent text-muted-foreground",
                          editable ? "cursor-pointer hover:border-border-strong" : "cursor-default",
                          s.estado === "futura" && "opacity-50",
                          s.estado === "cancelada" && "line-through"
                        )}
                      >
                        {status ? LETRA_DE_ESTADO[status] : "·"}
                      </button>
                    </td>
                  );
                })}
                <td className="sticky right-0 z-10 h-8 border-b border-l bg-card px-2 text-right group-hover:bg-accent">
                  <Porcentaje pct={st.percentage} minimo={sheet.minAttendancePct} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th
                scope="row"
                className="sticky bottom-0 left-0 z-30 border-r border-t bg-subtle px-3 py-1.5 text-left font-medium text-muted-foreground"
              >
                Presentes
              </th>
              {sheet.sessions.map((s) => {
                const { presentes, total } = presentesDeLaClase(sheet.students, s.id);
                const cuenta = (s.estado === "dictada" || s.estado === "hoy") && s.tomada;
                return (
                  <td
                    key={s.id}
                    className="sticky bottom-0 z-20 border-t bg-subtle px-0.5 py-1.5 text-center tabular-nums text-muted-foreground"
                    title={
                      cuenta
                        ? `${presentes} presentes de ${total} alumnos`
                        : s.estado === "dictada"
                          ? "Nadie pasó lista: la clase no cuenta para el %"
                          : undefined
                    }
                  >
                    {cuenta ? `${presentes}/${total}` : "—"}
                  </td>
                );
              })}
              <td className="sticky bottom-0 right-0 z-30 border-l border-t bg-subtle" />
            </tr>
          </tfoot>
        </table>
      </div>

      <Leyenda />

      {menu && menuSession && (
        <MenuFlotante x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
          {menu.kind === "celda" && menuAlumno ? (
            <>
              <p className="px-2 py-1 text-[11px] text-muted-foreground">
                {menuAlumno.contactName} · {fechaCorta(menuSession)}
              </p>
              {ESTADOS_DE_ASISTENCIA.map((k) => (
                <ItemDeMenu
                  key={k}
                  onSelect={() => {
                    setMenu(null);
                    void mark(menuSession.id, menuAlumno.enrollmentId, k);
                  }}
                >
                  <span
                    className={cn(
                      "inline-flex h-5 w-6 items-center justify-center rounded border text-[11px] font-semibold",
                      STATUS_CLASS[k]
                    )}
                  >
                    {LETRA_DE_ESTADO[k]}
                  </span>
                  {NOMBRE_DE_ESTADO[k]}
                  {menuAlumno.bySession[menuSession.id] === k && (
                    <Check className="ml-auto h-3.5 w-3.5" aria-label="actual" />
                  )}
                </ItemDeMenu>
              ))}
            </>
          ) : menu.kind === "columna" ? (
            <MenuDeColumna
              s={menuSession}
              sinMarcar={sinMarcarEnLaClase(sheet.students, menuSession.id).length}
              onTodosPresentes={() => {
                setMenu(null);
                setConfirmar(menuSession);
              }}
              onCancelar={() => {
                setMenu(null);
                setCancelar(menuSession);
              }}
            />
          ) : null}
        </MenuFlotante>
      )}

      {confirmar && (
        <Modal onClose={() => setConfirmar(null)} busy={busy} labelledBy="todos-presentes">
          <ConfirmarTodosPresentes
            s={confirmar}
            n={sinMarcarEnLaClase(sheet.students, confirmar.id).length}
            busy={busy}
            onCancel={() => setConfirmar(null)}
            onConfirm={() => void marcarTodosPresentes(confirmar)}
          />
        </Modal>
      )}

      {cancelar && (
        <CancelarClase
          s={cancelar}
          busy={busy}
          onClose={() => setCancelar(null)}
          onConfirm={(motivo) => void cancelSession(cancelar, motivo)}
        />
      )}
    </div>
  );
}

function EncabezadoDeClase({
  s,
  canEdit,
  onOpen,
}: {
  s: Session;
  canEdit: boolean;
  onOpen: (e: { currentTarget: HTMLElement }) => void;
}) {
  const estado =
    s.estado === "cancelada"
      ? `Cancelada${s.cancelReason ? `: ${s.cancelReason}` : ""}`
      : s.estado === "futura"
        ? "Todavía no se dio"
        : s.estado === "hoy"
          ? "Hoy"
          : "Dictada";
  const titulo = [`Clase ${s.number} · ${fechaCorta(s)}`, s.topic, estado].filter(Boolean).join(" · ");
  const contenido = (
    <span className={cn("flex flex-col items-center leading-tight", s.estado === "cancelada" && "line-through")}>
      <span className="text-[10px] uppercase tracking-wide">{formatWeekday(s.date)}</span>
      <span className="tabular-nums">{formatDate(s.date)}</span>
    </span>
  );
  if (!canEdit) {
    return (
      <span className="inline-flex min-w-[2.25rem] justify-center px-1" title={titulo}>
        {contenido}
      </span>
    );
  }
  return (
    <button
      type="button"
      title={titulo}
      aria-label={`${titulo}. Acciones de la clase`}
      aria-haspopup="menu"
      onClick={onOpen}
      className="inline-flex min-w-[2.25rem] items-center gap-0.5 rounded px-1 py-0.5 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {contenido}
      <ChevronDown className="h-3 w-3 shrink-0 opacity-60" aria-hidden />
    </button>
  );
}

function MenuDeColumna({
  s,
  sinMarcar,
  onTodosPresentes,
  onCancelar,
}: {
  s: Session;
  sinMarcar: number;
  onTodosPresentes: () => void;
  onCancelar: () => void;
}) {
  const puede = admiteTodosPresentes(s.estado, sinMarcar);
  const motivo =
    s.estado === "cancelada"
      ? "La clase está cancelada"
      : s.estado === "futura"
        ? "La clase todavía no se dio"
        : "Todos tienen marca en esta clase";
  return (
    <>
      <p className="px-2 py-1 text-[11px] text-muted-foreground">
        Clase {s.number} · {fechaCorta(s)}
        {s.estado === "cancelada" && s.cancelReason ? ` · Cancelada: ${s.cancelReason}` : ""}
      </p>
      <ItemDeMenu onSelect={onTodosPresentes} disabled={!puede} hint={puede ? undefined : motivo}>
        <Check className="h-3.5 w-3.5" aria-hidden />
        Todos presentes{puede ? ` (${sinMarcar})` : ""}
      </ItemDeMenu>
      {s.estado !== "cancelada" && (
        <ItemDeMenu onSelect={onCancelar}>
          <Ban className="h-3.5 w-3.5" aria-hidden />
          Cancelar clase…
        </ItemDeMenu>
      )}
    </>
  );
}

function ConfirmarTodosPresentes({
  s,
  n,
  busy,
  onCancel,
  onConfirm,
}: {
  s: Session;
  n: number;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="space-y-3">
      <h2 id="todos-presentes" className="pr-6 text-base font-semibold">
        Todos presentes · clase del {fechaCorta(s)}
      </h2>
      <p className="text-sm">
        {textoTodosPresentes(n)}. Las marcas ya cargadas (ausentes, tardes, justificadas) no se
        tocan.
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={busy}>
          Cancelar
        </Button>
        <Button size="sm" onClick={onConfirm} loading={busy} disabled={n === 0}>
          {n === 1 ? "Marcar 1 presente" : `Marcar ${n} presentes`}
        </Button>
      </div>
    </div>
  );
}

function CancelarClase({
  s,
  busy,
  onClose,
  onConfirm,
}: {
  s: Session;
  busy: boolean;
  onClose: () => void;
  onConfirm: (motivo: string) => void;
}) {
  const [motivo, setMotivo] = useState("");
  return (
    <Modal onClose={onClose} busy={busy} dirty={motivo.trim().length > 0} labelledBy="cancelar-clase">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (motivo.trim()) onConfirm(motivo.trim());
        }}
      >
        <h2 id="cancelar-clase" className="pr-6 text-base font-semibold">
          Cancelar la clase del {fechaCorta(s)}
        </h2>
        <p className="text-sm text-muted-foreground">
          Una clase cancelada deja de contar para la asistencia de todos. La asistencia ya cargada se
          conserva.
        </p>
        <Textarea
          autoFocus
          aria-label="Motivo de la cancelación"
          placeholder="¿Por qué se cancela?"
          value={motivo}
          maxLength={500}
          onChange={(e) => setMotivo(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={busy}>
            Volver
          </Button>
          <Button type="submit" variant="destructive" size="sm" loading={busy} disabled={!motivo.trim()}>
            Cancelar clase
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function Porcentaje({ pct, minimo }: { pct: number | null; minimo: number | null }) {
  const nivel = nivelDePorcentaje(pct, minimo);
  if (pct === null) {
    return (
      <span className="text-muted-foreground" title="Sin registrar: todavía no hay clases dictadas con asistencia tomada">
        —<span className="sr-only">sin registrar</span>
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex min-w-[2.75rem] justify-end rounded border border-transparent px-1.5 py-0.5 font-semibold tabular-nums",
        NIVEL_CLASS[nivel]
      )}
      title={
        nivel === "bajo"
          ? `Debajo del mínimo (${minimo}%)`
          : minimo === null
            ? "Sin mínimo definido"
            : `Mínimo ${minimo}%`
      }
    >
      {pct}%
    </span>
  );
}

function Leyenda() {
  return (
    <div className="space-y-1 text-xs text-muted-foreground">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {ESTADOS_DE_ASISTENCIA.map((k) => (
          <span key={k} className="inline-flex items-center gap-1">
            <span
              className={cn(
                "inline-flex h-5 w-6 items-center justify-center rounded border text-[11px] font-semibold",
                STATUS_CLASS[k]
              )}
              aria-hidden
            >
              {LETRA_DE_ESTADO[k]}
            </span>
            {NOMBRE_DE_ESTADO[k]}
            {k === "tarde" ? " (cuenta como presente)" : ""}
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <span className="inline-flex h-5 w-6 items-center justify-center" aria-hidden>
            ·
          </span>
          Sin registrar
        </span>
      </p>
      <p>
        El porcentaje cuenta solo las clases ya dictadas en las que se tomó asistencia. Las
        canceladas, las futuras, las dictadas sin lista y las anteriores a la inscripción de cada
        alumno (si no tiene marca) no cuentan. En una clase con lista, quien quedó sin marca cuenta
        como ausente.
      </p>
    </div>
  );
}

