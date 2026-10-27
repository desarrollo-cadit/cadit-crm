"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleCheck, EyeOff, Info, RefreshCw, TriangleAlert, UserX, Video, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { notify } from "@/lib/notify";
import {
  asignar,
  cuerpoDeConfirmacion,
  estadoInicial,
  minutosEnPantalla,
  personasDe,
  resumenDeConfirmacion,
  type EstadoDeMarca,
  type EstadoDeRevision,
} from "@/lib/zoom-attendance-review";
import type { ZoomAttendanceDto } from "@/server/zoom/attendance-review";

/**
 * Constitución 1.9.0 — "Sugerencia de Zoom" de UNA clase, en la pestaña
 * Asistencia del grupo.
 *
 * Zoom propone; una persona decide. Nada se guarda hasta "Confirmar
 * asistencia", y por defecto solo se completa a quien NO tiene marca: pisar
 * una marca existente pide tildarla. Lo que se corrige acá (asignar un
 * nombre, "no es esta persona", "es del equipo") se aprende para la próxima.
 *
 * Calma antes que alarma: los estados de Zoom se dicen en una línea, con la
 * acción que corresponde al lado, y la tabla aparece solo cuando hay algo
 * para revisar.
 */

const NOMBRE: Record<EstadoDeMarca, string> = {
  presente: "Presente",
  tarde: "Tarde",
  ausente: "Ausente",
  justificado: "Justificado",
};

const TONO_DE_MARCA: Record<EstadoDeMarca, string> = {
  presente: "text-success",
  tarde: "text-warning",
  ausente: "text-danger",
  justificado: "text-text-2",
};

type Sugerencia = NonNullable<ZoomAttendanceDto["sugerencia"]>;

function hora(iso: string, timeZone: string) {
  return new Date(iso).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone });
}

function minutosATexto(m: number) {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h} h` : `${h} h ${r} min`;
}

async function leerError(res: Response | null, fallback: string) {
  const body = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? fallback;
}

export function ZoomAttendanceReview({
  classSessionId,
  claseLabel,
  onConfirmado,
}: {
  classSessionId: string;
  /** "mar 21/10": la clase de la que se habla. */
  claseLabel: string;
  /** La planilla vuelve a leer las marcas. */
  onConfirmado: () => void;
}) {
  const [dto, setDto] = useState<ZoomAttendanceDto | null>(null);
  const [cargando, setCargando] = useState(true);
  const [trayendo, setTrayendo] = useState(false);
  const intentos = useRef(0);

  const leer = useCallback(async () => {
    const res = await fetch(`/api/class-sessions/${classSessionId}/zoom-attendance`).catch(() => null);
    if (res?.ok) setDto((await res.json()) as ZoomAttendanceDto);
    setCargando(false);
  }, [classSessionId]);

  useEffect(() => {
    setCargando(true);
    setDto(null);
    intentos.current = 0;
    void leer();
  }, [leer]);

  // Mientras Zoom busca, se vuelve a mirar cada 3 s (hasta ~2 minutos).
  const pendiente = dto?.traida?.estado === "pendiente";
  useEffect(() => {
    if (!pendiente) return;
    if (intentos.current >= 40) return;
    const t = setTimeout(() => {
      intentos.current++;
      void leer();
    }, 3000);
    return () => clearTimeout(t);
  }, [pendiente, dto, leer]);

  async function traer(instanceUuid?: string) {
    setTrayendo(true);
    const res = await fetch(`/api/class-sessions/${classSessionId}/zoom-attendance`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(instanceUuid ? { instanceUuid } : {}),
    }).catch(() => null);
    setTrayendo(false);
    if (!res || !res.ok) {
      notify.error(await leerError(res, "No se pudo consultar Zoom. Probá de nuevo."));
      return;
    }
    intentos.current = 0;
    await leer();
  }

  if (cargando) {
    return (
      <Marco claseLabel={claseLabel}>
        <Skeleton className="h-5 w-2/3" />
      </Marco>
    );
  }
  if (!dto) {
    return (
      <Marco claseLabel={claseLabel}>
        <p className="text-sm text-muted-foreground">No se pudo leer la sugerencia de Zoom.</p>
      </Marco>
    );
  }

  const t = dto.traida;

  // Sin Zoom conectado la planilla funciona como siempre: no se ocupa lugar
  // con un aviso en cada grupo (constitución 1.9.0 f, es opcional).
  if (!dto.zoomConectado && !t) return null;

  const botonTraer = (texto = "Traer de Zoom") => (
    <Button size="sm" variant="outline" loading={trayendo} disabled={dto.enCurso && !pendiente} onClick={() => void traer()}>
      {!trayendo && <RefreshCw className="h-3.5 w-3.5" />}
      {texto}
    </Button>
  );

  if (!t) {
    return (
      <Marco claseLabel={claseLabel} accion={botonTraer()}>
        <Linea icono={<Info className="h-4 w-4" />} tono="neutro">
          Todavía no se buscó esta clase en Zoom. Trae quién se conectó y cuánto tiempo estuvo; vos
          revisás y confirmás.
        </Linea>
      </Marco>
    );
  }

  if (t.revisadaEl) {
    return (
      <Marco claseLabel={claseLabel}>
        <Linea icono={<CircleCheck className="h-4 w-4" />} tono="exito">
          Asistencia confirmada desde Zoom
          {t.revisadaPor ? ` por ${t.revisadaPor}` : ""} el{" "}
          {new Date(t.revisadaEl).toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit", timeZone: dto.timeZone })}.
          Las marcas se corrigen en la planilla, como siempre.
        </Linea>
      </Marco>
    );
  }

  if (t.estado === "pendiente") {
    return (
      <Marco claseLabel={claseLabel}>
        <Linea icono={<RefreshCw className="h-4 w-4 motion-safe:animate-spin" />} tono="neutro">
          {t.mensaje}
        </Linea>
      </Marco>
    );
  }

  if (t.estado === "ambigua") {
    return (
      <Marco claseLabel={claseLabel}>
        <Linea icono={<Info className="h-4 w-4" />} tono="aviso">
          {t.mensaje}
        </Linea>
        <ul className="mt-3 space-y-1.5">
          {t.candidatas.map((c) => (
            <li key={c.uuid} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
              <span className="text-sm">
                <span className="font-medium tabular-nums">Empezó a las {hora(c.startTime, dto.timeZone)}</span>
                {c.topic && <span className="text-muted-foreground"> · {c.topic}</span>}
              </span>
              <Button size="sm" variant="secondary" loading={trayendo} onClick={() => void traer(c.uuid)}>
                Es esta
              </Button>
            </li>
          ))}
        </ul>
      </Marco>
    );
  }

  if (t.estado !== "lista" || !dto.sugerencia) {
    const tono = t.estado === "sin_permiso" ? "peligro" : t.estado === "no_lista" || t.estado === "error" ? "aviso" : "neutro";
    const reintentable = t.estado !== "fuera_de_plazo";
    return (
      <Marco claseLabel={claseLabel} accion={reintentable ? botonTraer("Volver a intentar") : undefined}>
        <Linea icono={tono === "neutro" ? <Info className="h-4 w-4" /> : <TriangleAlert className="h-4 w-4" />} tono={tono}>
          {t.mensaje} La asistencia se puede pasar a mano en la planilla.
        </Linea>
      </Marco>
    );
  }

  return (
    <Marco claseLabel={claseLabel}>
      <Revision
        key={t.traidaEl ?? "s"}
        classSessionId={classSessionId}
        s={dto.sugerencia}
        onConfirmado={() => {
          void leer();
          onConfirmado();
        }}
      />
    </Marco>
  );
}

/* ============================================================
 * Marco y línea de estado
 * ============================================================ */

function Marco({
  claseLabel,
  accion,
  children,
}: {
  claseLabel: string;
  accion?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={`Sugerencia de Zoom de la clase del ${claseLabel}`} className="rounded-lg border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-brand-tint text-brand-text">
            <Video className="h-3.5 w-3.5" aria-hidden />
          </span>
          Sugerencia de Zoom
          <span className="font-normal text-muted-foreground">· clase del {claseLabel}</span>
        </h3>
        {accion}
      </header>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

type Tono = "neutro" | "aviso" | "peligro" | "exito";

function Linea({ icono, tono, children }: { icono: React.ReactNode; tono: Tono; children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-sm leading-5">
      <span
        className={cn(
          "mt-0.5 shrink-0",
          tono === "neutro" && "text-text-3",
          tono === "aviso" && "text-warning",
          tono === "peligro" && "text-danger",
          tono === "exito" && "text-success"
        )}
        aria-hidden
      >
        {icono}
      </span>
      <span className={cn(tono === "neutro" ? "text-text-2" : "text-foreground")}>{children}</span>
    </p>
  );
}

/* ============================================================
 * La revisión
 * ============================================================ */

function Revision({
  classSessionId,
  s,
  onConfirmado,
}: {
  classSessionId: string;
  s: Sugerencia;
  onConfirmado: () => void;
}) {
  const [estado, setEstado] = useState<EstadoDeRevision>(() => estadoInicial(s));
  const [tocados, setTocados] = useState<Set<string>>(() => new Set());
  const [guardando, setGuardando] = useState(false);

  const nombreDe = useMemo(() => new Map(s.alumnos.map((a) => [a.enrollmentId, a.nombre])), [s.alumnos]);
  const sinAsignar = Object.entries(estado.asignacion)
    .filter(([, d]) => d === null)
    .map(([k]) => k);
  const ignoradas = Object.entries(estado.asignacion)
    .filter(([, d]) => d === "ignorar")
    .map(([k]) => k);
  const resumen = resumenDeConfirmacion(s, estado);
  const vistos = s.alumnos.filter((a) => personasDe(a.enrollmentId, estado.asignacion).length > 0).length;
  const candidatosDe = new Map(s.sinIdentificar.map((p) => [p.key, p]));

  function mover(key: string, destino: string | null | "ignorar") {
    setEstado((e) => asignar(e, s, key, destino, tocados));
  }

  async function confirmar() {
    setGuardando(true);
    const res = await fetch(`/api/class-sessions/${classSessionId}/zoom-attendance/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(cuerpoDeConfirmacion(s, estado)),
    }).catch(() => null);
    setGuardando(false);
    if (!res || !res.ok) {
      notify.error(await leerError(res, "No se pudo guardar la asistencia. No se cambió nada."));
      return;
    }
    const r = (await res.json()) as { escritas: number };
    notify.success(
      r.escritas === 1 ? "Se guardó 1 marca de asistencia." : `Se guardaron ${r.escritas} marcas de asistencia.`
    );
    onConfirmado();
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-2">
        Zoom vio a <strong className="font-semibold text-foreground">{vistos}</strong> de {s.alumnos.length} personas
        del grupo. Para «Presente» hacían falta {minutosATexto(s.umbralMinutos)} de {minutosATexto(s.duracionMinutos)}.
        Revisá lo que no te cierre y confirmá.
      </p>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="bg-subtle text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 text-left font-medium">Alumno</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">En Zoom</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">Tiempo</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">Asistencia</th>
            </tr>
          </thead>
          <tbody>
            {s.alumnos.map((a) => {
              const suyas = personasDe(a.enrollmentId, estado.asignacion);
              const { minutos, aproximado } = minutosEnPantalla(a.enrollmentId, estado.asignacion, s.personas);
              const elegido = estado.estados[a.enrollmentId] ?? a.sugerido;
              const conMarca = a.marcaActual !== null;
              const pisa = estado.pisar.includes(a.enrollmentId);
              const sinTocar = conMarca && !pisa;
              const original = a.personas.length > 0 && suyas.join() === a.personas.join();
              return (
                <tr key={a.enrollmentId} className={cn("border-t align-top", sinTocar && "bg-subtle")}>
                  <th scope="row" className="px-3 py-2.5 text-left font-medium">
                    <span className={cn(sinTocar && "text-text-2")}>{a.nombre}</span>
                    {a.posibles.length > 0 && suyas.length === 0 && (
                      <span className="mt-0.5 block text-xs font-normal text-text-3">Puede ser uno de los sin identificar</span>
                    )}
                  </th>
                  <td className="px-3 py-2.5">
                    {suyas.length === 0 ? (
                      <span className="text-text-3">No apareció</span>
                    ) : (
                      <ul className="flex flex-wrap gap-1.5">
                        {suyas.map((k) => (
                          <li key={k}>
                            <span className="inline-flex max-w-[16rem] items-center gap-1 rounded-full border bg-background py-0.5 pl-2.5 pr-1 text-xs">
                              <span className="truncate" title={s.personas[k]?.nombres.join(" · ")}>
                                {s.personas[k]?.nombres[0] ?? k}
                              </span>
                              <button
                                type="button"
                                onClick={() => mover(k, null)}
                                className="inline-flex h-5 w-5 items-center justify-center rounded-full text-text-3 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                aria-label={`${s.personas[k]?.nombres[0] ?? k} no es ${a.nombre}`}
                                title="No es esta persona"
                              >
                                <X className="h-3 w-3" aria-hidden />
                              </button>
                            </span>
                          </li>
                        ))}
                        {original && a.confianza && <Confianza nivel={a.confianza} coincidencia={a.coincidencia} />}
                      </ul>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <Tiempo minutos={minutos} umbral={s.umbralMinutos} duracion={s.duracionMinutos} aproximado={aproximado} />
                  </td>
                  <td className="px-3 py-2.5">
                    {conMarca && (
                      <p className="mb-1.5 text-xs text-text-2">
                        Ya tiene:{" "}
                        <span className={cn("font-medium", TONO_DE_MARCA[a.marcaActual!.status])}>
                          {NOMBRE[a.marcaActual!.status]}
                        </span>
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <Select
                        aria-label={`Asistencia de ${a.nombre}`}
                        value={elegido}
                        disabled={sinTocar}
                        onChange={(e) => {
                          const v = e.target.value as EstadoDeMarca;
                          setTocados((t) => new Set(t).add(a.enrollmentId));
                          setEstado((st) => ({ ...st, estados: { ...st.estados, [a.enrollmentId]: v } }));
                        }}
                        className={cn("h-8 w-36 text-sm font-medium", TONO_DE_MARCA[elegido])}
                      >
                        {(Object.keys(NOMBRE) as EstadoDeMarca[]).map((k) => (
                          <option key={k} value={k}>
                            {NOMBRE[k]}
                          </option>
                        ))}
                      </Select>
                      {conMarca && (
                        <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-text-2">
                          <Checkbox
                            checked={pisa}
                            onChange={(e) =>
                              setEstado((st) => ({
                                ...st,
                                pisar: e.target.checked
                                  ? [...st.pisar, a.enrollmentId]
                                  : st.pisar.filter((x) => x !== a.enrollmentId),
                              }))
                            }
                          />
                          Reemplazar
                        </label>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {sinAsignar.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold">Sin identificar</h4>
          <p className="mt-0.5 text-xs text-text-2">
            Se conectaron y no supimos quién son. Lo que elijas se recuerda para las próximas clases.
          </p>
          <ul className="mt-2 divide-y rounded-md border">
            {sinAsignar.map((k) => {
              const p = s.personas[k];
              const candidatos = candidatosDe.get(k)?.candidatos ?? [];
              return (
                <li key={k} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5">
                  <div className="min-w-[12rem] flex-1">
                    <p className="text-sm font-medium">{p?.nombres[0] ?? k}</p>
                    <p className="text-xs text-text-3">
                      {minutosATexto(p?.minutos ?? 0)} conectado
                      {candidatos.length > 1 && ` · ¿${candidatos.map((c) => c.nombre).join(" o ")}?`}
                    </p>
                  </div>
                  <Select
                    aria-label={`Asignar ${p?.nombres[0] ?? k} a alguien del grupo`}
                    value=""
                    onChange={(e) => e.target.value && mover(k, e.target.value)}
                    className="h-8 w-56 text-sm"
                  >
                    <option value="">Asignar a…</option>
                    {[...candidatos.map((c) => c.enrollmentId), ...s.alumnos.map((a) => a.enrollmentId)]
                      .filter((v, i, arr) => arr.indexOf(v) === i)
                      .map((enr) => (
                        <option key={enr} value={enr}>
                          {nombreDe.get(enr)}
                        </option>
                      ))}
                  </Select>
                  <Button size="sm" variant="ghost" onClick={() => mover(k, "ignorar")}>
                    <EyeOff className="h-3.5 w-3.5" />
                    Es del equipo o un dispositivo
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {(ignoradas.length > 0 || s.excluidas.length > 0) && (
        <p className="flex items-start gap-2 text-xs text-text-3">
          <UserX className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            No cuentan:{" "}
            {[
              ...s.excluidas.map((e) => `${e.nombres[0]} (${e.motivo === "equipo" ? "equipo" : "ignorado"})`),
              ...ignoradas.map((k) => `${s.personas[k]?.nombres[0] ?? k} (equipo o dispositivo)`),
            ].join(", ")}
            .{" "}
            {ignoradas.length > 0 && (
              <button
                type="button"
                className="underline underline-offset-2 hover:text-foreground"
                onClick={() => ignoradas.forEach((k) => mover(k, null))}
              >
                Deshacer
              </button>
            )}
          </span>
        </p>
      )}

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
        <p className="text-xs text-text-2">
          Se {resumen.aEscribir === 1 ? "guarda 1 marca" : `guardan ${resumen.aEscribir} marcas`}
          {resumen.aPisar > 0 && ` y se reemplaza${resumen.aPisar === 1 ? " 1" : `n ${resumen.aPisar}`}`}
          {resumen.sinTocar > 0 &&
            ` · ${resumen.sinTocar === 1 ? "1 persona ya tenía marca y no se toca" : `${resumen.sinTocar} personas ya tenían marca y no se tocan`}`}
          .
        </p>
        <Button loading={guardando} onClick={() => void confirmar()} disabled={resumen.aEscribir + resumen.aPisar === 0}>
          {!guardando && <CircleCheck className="h-4 w-4" />}
          Confirmar asistencia
        </Button>
      </footer>
    </div>
  );
}

function Confianza({
  nivel,
  coincidencia,
}: {
  nivel: "alta" | "media";
  coincidencia: "correo" | "aprendido" | "nombre" | null;
}) {
  const por =
    coincidencia === "correo" ? "por el correo" : coincidencia === "aprendido" ? "ya la conocemos" : "por el nombre";
  return (
    <li>
      <Badge
        variant={nivel === "alta" ? "success" : "warning"}
        className="px-2 py-0 text-[11px]"
        title={`Coincidencia ${nivel}: ${por}`}
      >
        {nivel === "alta" ? "Alta" : "Media"} · {por}
      </Badge>
    </li>
  );
}

/** Minutos conectado contra el umbral: la barra es el dato, no adorno. */
function Tiempo({
  minutos,
  umbral,
  duracion,
  aproximado,
}: {
  minutos: number;
  umbral: number;
  duracion: number;
  aproximado: boolean;
}) {
  const tope = Math.max(duracion, minutos, 1);
  const alcanza = minutos >= umbral;
  return (
    <div className="w-32">
      <p className="text-xs tabular-nums">
        {minutos === 0 ? <span className="text-text-3">—</span> : `${aproximado ? "≈ " : ""}${minutosATexto(minutos)}`}
      </p>
      <div
        className="relative mt-1 h-1.5 rounded-full bg-secondary"
        role="img"
        aria-label={`${minutos} de ${duracion} minutos; hacen falta ${umbral}`}
      >
        <div
          className={cn("h-full rounded-full", alcanza ? "bg-success" : "bg-warning")}
          style={{ width: `${Math.min(100, (minutos / tope) * 100)}%` }}
        />
        <div className="absolute -top-0.5 h-2.5 w-px bg-border-strong" style={{ left: `${(umbral / tope) * 100}%` }} />
      </div>
    </div>
  );
}
