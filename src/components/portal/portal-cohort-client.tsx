"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Plus, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { PortalAttendanceSheet } from "@/components/portal/portal-attendance-sheet";
import { PortalOfflineAttempts } from "@/components/portal/portal-offline-attempts";
import { PortalSubmissions } from "@/components/portal/portal-submissions";
import { ZoomRecordingPlayer, isZoomRecording } from "@/components/portal/zoom-recording-player";
import { notify } from "@/lib/notify";

type Cohort = {
  id: string;
  name: string | null;
  courseName: string;
  status: "planificada" | "en_curso" | "finalizada";
  role: "titular" | "suplente";
  students: number;
  /**
   * 023 (FR-010) / 025 — El aula: SOLO el nombre. Ni la cuenta ni su enlace.
   * Es una etiqueta de "dónde te toca", no un botón de entrar.
   */
  virtualRoom: { name: string } | null;
  /**
   * 028 (FR-029) — El programa del que este módulo forma parte, para poder
   * titular la pantalla "Módulo 2 — Especialización en Proyectos BIM".
   * `null` en una cohorte suelta, que son 33 de las 41.
   */
  program: { name: string; position: number | null } | null;
};

export type ClassRow = {
  id: string | null;
  number: number;
  projected: boolean;
  date: string;
  startTime: string | null;
  endTime: string | null;
  /** Instante de fin ya resuelto en la zona de la academia; null sin horario. */
  endsAt: string | null;
  topic: string | null;
  canceled: boolean;
  cancelReason: string | null;
  meetingUrl: string | null;
  recordingUrl: string | null;
};

type ClassesPayload = {
  cohort: Cohort;
  editable: boolean;
  classes: { projected: boolean; cannotGenerateReason: string | null; classes: ClassRow[] };
};

type GradingPayload = {
  cohort: Cohort;
  editable: boolean;
  assessments: { id: string; name: string; position: number; required: boolean }[];
  students: { enrollmentId: string; name: string; results: Record<string, boolean | null> }[];
};

type ContentPayload = {
  cohort: Cohort;
  announcements: { id: string; title: string; body: string; authorName: string | null; createdAt: string }[];
  resources: { id: string; title: string; url: string; kind: string }[];
};

type Tab = "clases" | "evaluacion" | "entregas" | "material";

/**
 * 023 — Si esta clase puede recibir una grabación.
 *
 * Tres condiciones, y la tercera es la que faltaba: **la clase tiene que
 * haber OCURRIDO**. Ofrecer "cargar grabación" en la clase del 21 de
 * septiembre un 4 de septiembre es ofrecer algo imposible, y este repo llama
 * a eso "una puerta cerrada con cartel de bienvenida".
 *
 * Una proyección no tiene `id` —todavía no existe la fila— y una clase
 * cancelada no ofrece grabación aunque la tenga cargada (FR-005e de 013).
 *
 * 025 — Se mira `endsAt`, no `date`.
 *
 * `date` es la medianoche UTC del día de la clase, así que compararla contra
 * el reloj del navegador hacía aparecer el botón **el día anterior a las
 * 21:00** en Montevideo. El comentario decía "el día entero cuenta" y lo que
 * pasaba era otra cosa.
 *
 * `endsAt` ya viene resuelto por `classInstant()` en el servidor, que es el
 * único lugar del repo autorizado a componer una fecha de clase. El navegador
 * no tiene por qué saber en qué zona está la academia, y acá estaba
 * adivinándolo.
 *
 * Sin horario cargado no hay instante que comparar —6 de las 41 cohortes
 * están así— y ahí se deja pasar: no saber cuándo terminó no es lo mismo que
 * saber que no terminó, y bloquear al profesor por un dato que falta en la
 * cohorte lo manda de vuelta a pedir la carga por WhatsApp.
 */
export function puedeCargarGrabacion(c: ClassRow, ahora: number = Date.now()): boolean {
  if (!c.id || c.canceled) return false;
  if (!c.endsAt) return true;
  return new Date(c.endsAt).getTime() <= ahora;
}

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-UY", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
}

/**
 * 014 (T025) — La cohorte, como la ve el profesor.
 *
 * Cuatro pestañas: clases (donde toma asistencia y carga la grabación),
 * evaluaciones (donde carga resultados), entregas (donde lee y devuelve) y
 * material (donde también publica). Todo lo que no está es deliberado —
 * inscribir, cobrar y emitir certificados son de la academia.
 */
export function PortalCohortClient({ cohortId }: { cohortId: string }) {
  const [tab, setTab] = useState<Tab>("clases");
  const [claseAbierta, setClaseAbierta] = useState<string | null>(null);
  /** 023 — Qué clase se está por cargar/cambiar la grabación. */
  const [grabacion, setGrabacion] = useState<{
    classSessionId: string;
    actual: string | null;
  } | null>(null);
  const [datos, setDatos] = useState<ClassesPayload | null>(null);
  const [noEncontrada, setNoEncontrada] = useState(false);
  const [fallo, setFallo] = useState(false);

  const refetch = useCallback(async () => {
    const res = await fetch(`/api/portal/cohorts/${cohortId}/classes`).catch(() => null);
    // 404 = no existe, o no es tuya. Desde acá son la misma cosa, y así tiene
    // que ser: distinguirlas le confirmaría al profesor que la cohorte existe.
    if (res?.status === 404) {
      setNoEncontrada(true);
      return;
    }
    if (!res?.ok) {
      setFallo(true);
      return;
    }
    setFallo(false);
    setDatos((await res.json()) as ClassesPayload);
  }, [cohortId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  if (noEncontrada) {
    return (
      <div className="space-y-3">
        <Link href="/portal/dictado" className="inline-flex h-11 items-center gap-1 text-sm text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> Mis cohortes
        </Link>
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="text-sm font-medium">No encontramos esta cohorte entre las asignadas a tu cuenta</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Si creés que es un error, escribinos y lo revisamos.
          </p>
        </div>
      </div>
    );
  }

  if (!datos) {
    return fallo ? (
      <FalloDeCarga onRetry={() => void refetch()} />
    ) : (
      <Skeleton className="h-64 w-full" />
    );
  }

  if (claseAbierta) {
    return (
      <PortalAttendanceSheet
        classSessionId={claseAbierta}
        onBack={() => {
          setClaseAbierta(null);
          void refetch();
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <Link href="/portal/dictado" className="inline-flex h-11 items-center gap-1 text-sm text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> Mis cohortes
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">
          {datos.cohort.courseName}
        </h1>
        <p className="text-sm text-muted-foreground">
          {datos.cohort.program &&
            `${datos.cohort.program.name} · `}
          {datos.cohort.name ?? "Cohorte sin nombre"} · {datos.cohort.students}{" "}
          {datos.cohort.students === 1 ? "alumno" : "alumnos"}
          {datos.cohort.role === "suplente" && " · suplencia"}
        </p>

        {/*
          023 (FR-010) / 025 — En qué CUENTA le toca dictar, como etiqueta y
          NO como enlace.

          La primera versión la ponía como botón "entrar", y estaba mal: la
          sala del aula es el PMI de la cuenta, compartido por todas las
          cohortes que la usan. El profesor que entraba por ahí podía caer en
          la clase de otra cohorte. Para entrar está el enlace de CADA clase,
          que sale de la reunión recurrente de esta cohorte.
        */}
        {datos.cohort.virtualRoom && (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary px-2.5 py-1 text-xs text-text-2">
            <Video className="h-3.5 w-3.5" strokeWidth={1.8} />
            {datos.cohort.virtualRoom.name}
          </p>
        )}
      </div>

      <div className="flex gap-1 border-b">
        {(
          [
            { key: "clases", label: "Clases" },
            { key: "evaluacion", label: "Evaluaciones" },
            // 016 — Entregas va ANTES de Material: es trabajo pendiente del
            // profesor, y Material es consulta. Lo que hay que hacer primero.
            { key: "entregas", label: "Entregas" },
            { key: "material", label: "Material" },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            aria-pressed={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`h-11 flex-1 rounded-t-md px-3 text-sm font-medium transition-colors ${
              tab === t.key
                ? "border-b-2 border-brand bg-brand-tint text-brand-text"
                : "text-muted-foreground hover:bg-accent"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "clases" ? (
        <Clases
          datos={datos}
          onAbrir={setClaseAbierta}
          onGrabacion={(id, actual) => setGrabacion({ classSessionId: id, actual })}
        />
      ) : tab === "evaluacion" ? (
        <div className="space-y-6">
          <Evaluacion cohortId={cohortId} />
          <PortalOfflineAttempts cohortId={cohortId} />
        </div>
      ) : tab === "entregas" ? (
        <PortalSubmissions cohortId={cohortId} />
      ) : (
        <Material cohortId={cohortId} />
      )}

      {grabacion && (
        <DialogoGrabacion
          classSessionId={grabacion.classSessionId}
          actual={grabacion.actual}
          onClose={() => setGrabacion(null)}
          onSaved={() => {
            setGrabacion(null);
            void refetch();
          }}
        />
      )}
    </div>
  );
}

function Clases({
  datos,
  onAbrir,
  onGrabacion,
}: {
  datos: ClassesPayload;
  onAbrir: (id: string) => void;
  onGrabacion: (classSessionId: string, actual: string | null) => void;
}) {
  const filas = datos.classes.classes;
  // 030 — La grabación de Zoom abierta (una a la vez): el iframe se monta
  // recién al abrirla, no uno por clase.
  const [grabacionAbierta, setGrabacionAbierta] = useState<string | null>(null);

  if (filas.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Esta cohorte todavía no tiene cronograma.
        {datos.classes.cannotGenerateReason && (
          <span className="mt-2 block">{datos.classes.cannotGenerateReason}</span>
        )}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {datos.classes.projected && (
        // 013 — Una fila proyectada es un DIBUJO: no existe la clase todavía,
        // así que no se le puede tomar asistencia. Decirlo evita que el
        // profesor toque y no pase nada.
        <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          Estas clases son una proyección según los días previstos. Vas a
          poder registrar la asistencia cuando la academia genere el
          cronograma.
        </p>
      )}

      <ul className="divide-y rounded-lg border">
        {filas.map((c) => {
          const tocable = Boolean(c.id) && !c.projected;
          return (
            <li key={c.id ?? `p-${c.number}`}>
              <button
                type="button"
                disabled={!tocable}
                onClick={() => c.id && onAbrir(c.id)}
                className="flex w-full items-center justify-between gap-3 p-3 text-left disabled:opacity-60 enabled:hover:bg-accent"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    Clase {c.number}
                    <span className="ml-2 font-normal text-muted-foreground">
                      {fecha(c.date)}
                      {c.startTime && ` · ${c.startTime}`}
                    </span>
                  </p>
                  {c.topic && (
                    <p className="truncate text-xs text-muted-foreground">{c.topic}</p>
                  )}
                  {c.canceled && (
                    <p className="text-xs text-destructive">
                      Cancelada{c.cancelReason && `: ${c.cancelReason}`}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {c.projected && <Badge variant="secondary">proyectada</Badge>}
                  {c.canceled && <Badge variant="destructive">cancelada</Badge>}
                </div>
              </button>

              {(c.meetingUrl || c.recordingUrl || puedeCargarGrabacion(c)) && (
                <div className="flex flex-wrap items-center gap-3 px-3 pb-3 text-xs">
                  {c.meetingUrl && (
                    <a
                      href={c.meetingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> Ingresar a la clase
                    </a>
                  )}
                  {c.recordingUrl && c.id && isZoomRecording(c.recordingUrl) && (
                    <button
                      type="button"
                      aria-expanded={grabacionAbierta === c.id}
                      aria-controls={`grabacion-${c.id}`}
                      onClick={() => setGrabacionAbierta((a) => (a === c.id ? null : c.id!))}
                      className="inline-flex items-center gap-1 underline"
                    >
                      <Video className="h-3.5 w-3.5" />
                      {grabacionAbierta === c.id ? "Ocultar grabación" : "Ver grabación"}
                    </button>
                  )}
                  {c.recordingUrl && !(c.id && isZoomRecording(c.recordingUrl)) && (
                    <a
                      href={c.recordingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 underline"
                    >
                      <Video className="h-3.5 w-3.5" /> Grabación
                    </a>
                  )}
                  {/*
                    023 — Resuelve DV-001c de la 013: el que tiene el enlace de
                    la grabación en el portapapeles es el que ACABA de dar la
                    clase. Antes solo podía pegarlo coordinación, y eso
                    convertía cada grabación en un pedido por WhatsApp.
                    Una clase cancelada no ofrece grabación (FR-005e).
                  */}
                  {puedeCargarGrabacion(c) && (
                    <button
                      type="button"
                      onClick={() => onGrabacion(c.id!, c.recordingUrl)}
                      className="inline-flex items-center gap-1 text-muted-foreground underline hover:text-foreground"
                    >
                      <Video className="h-3.5 w-3.5" />
                      {c.recordingUrl ? "Cambiar grabación" : "Cargar grabación"}
                    </button>
                  )}
                </div>
              )}
              {c.recordingUrl && c.id && grabacionAbierta === c.id && (
                <ZoomRecordingPlayer
                  id={`grabacion-${c.id}`}
                  url={c.recordingUrl}
                  title={`Grabación de la clase ${c.number}`}
                  className="px-3 pb-3"
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * 014 (T028, FR-006/DV-002) — Carga de resultados.
 *
 * **No hay "agregar evaluación" y no es que esté escondido**: la ruta del
 * portal no expone POST. Las evaluaciones las define la academia, una vez por
 * cohorte, y el profesor las completa.
 */
function Evaluacion({ cohortId }: { cohortId: string }) {
  const [datos, setDatos] = useState<GradingPayload | null>(null);
  const [fallo, setFallo] = useState(false);

  const refetch = useCallback(async () => {
    const res = await fetch(`/api/portal/cohorts/${cohortId}/grading`).catch(() => null);
    if (!res?.ok) {
      setFallo(true);
      return;
    }
    setFallo(false);
    setDatos((await res.json()) as GradingPayload);
  }, [cohortId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  async function marcar(assessmentId: string, enrollmentId: string, valor: string) {
    const passed = valor === "" ? null : valor === "si";
    const res = await fetch(`/api/portal/assessments/${assessmentId}/results`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ results: [{ enrollmentId, passed }] }),
    }).catch(() => null);

    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      notify.error(body?.error?.message ?? "No se pudo guardar el resultado.");
    }
    void refetch();
  }

  if (!datos) {
    return fallo ? (
      <FalloDeCarga onRetry={() => void refetch()} />
    ) : (
      <Skeleton className="h-40 w-full" />
    );
  }

  if (datos.assessments.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Esta cohorte aún no tiene evaluaciones. La academia las define; una
        vez creadas, vas a poder registrar aquí los resultados.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {!datos.editable && (
        <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          La cohorte finalizó: los resultados están disponibles solo para
          consulta.
        </p>
      )}

      <ul className="divide-y rounded-lg border">
        {datos.students.map((s) => (
          <li key={s.enrollmentId} className="space-y-2 p-3">
            <p className="text-sm font-medium">{s.name}</p>
            <div className="space-y-2">
              {datos.assessments.map((a) => {
                const v = s.results[a.id];
                return (
                  <div key={a.id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      {a.name}
                      {!a.required && " (opcional)"}
                    </span>
                    <Select
                      aria-label={`${s.name}, ${a.name}`}
                      disabled={!datos.editable}
                      className="h-11 w-32 text-xs"
                      value={v === true ? "si" : v === false ? "no" : ""}
                      onChange={(e) => void marcar(a.id, s.enrollmentId, e.target.value)}
                    >
                      {/* El vacío NO es un reprobado (FR-005): tiene su propia
                          opción, y dice lo que significa. */}
                      <option value="">Sin corregir</option>
                      <option value="si">Aprobado</option>
                      <option value="no">No aprobado</option>
                    </Select>
                  </div>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * 014 (T029, FR-007) — Material y avisos de la cohorte. Los avisos se leen;
 * el material, además, lo puede publicar el profesor (023).
 */
function Material({ cohortId }: { cohortId: string }) {
  const [datos, setDatos] = useState<ContentPayload | null>(null);
  const [publicando, setPublicando] = useState(false);
  const [fallo, setFallo] = useState(false);

  const cargar = useCallback(async () => {
    const res = await fetch(`/api/portal/cohorts/${cohortId}/content`).catch(() => null);
    if (!res?.ok) {
      setFallo(true);
      return;
    }
    setFallo(false);
    setDatos((await res.json()) as ContentPayload);
  }, [cohortId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  if (!datos) {
    return fallo ? (
      <FalloDeCarga onRetry={() => void cargar()} />
    ) : (
      <Skeleton className="h-40 w-full" />
    );
  }

  const vacio = datos.announcements.length === 0 && datos.resources.length === 0;

  return (
    <div className="space-y-5">
      {/*
        023 — El botón va ARRIBA y también en el vacío: si el profesor no
        puede publicar nada, la pestaña es un cartel de "todavía no hay", y
        eso es lo que era antes de esta fase.
      */}
      <Button className="h-11 w-full" onClick={() => setPublicando(true)}>
        <Plus className="h-4 w-4" /> Publicar material
      </Button>

      {vacio && (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Todavía no hay material ni avisos publicados para esta cohorte.
        </p>
      )}

      {publicando && (
        <DialogoMaterial
          cohortId={cohortId}
          onClose={() => setPublicando(false)}
          onSaved={() => {
            setPublicando(false);
            void cargar();
          }}
        />
      )}
      {datos.announcements.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Avisos
          </h2>
          <ul className="space-y-2">
            {datos.announcements.map((a) => (
              <li key={a.id} className="rounded-lg border p-3">
                <p className="text-sm font-medium">{a.title}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                  {a.body}
                </p>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {a.authorName ?? "La academia"} ·{" "}
                  {new Date(a.createdAt).toLocaleDateString("es-UY")}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {datos.resources.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Material
          </h2>
          <ul className="divide-y rounded-lg border">
            {datos.resources.map((r) => (
              <li key={r.id}>
                <a
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-12 items-center justify-between gap-2 px-3 text-sm transition-colors hover:bg-accent"
                >
                  <span className="truncate">{r.title}</span>
                  <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/* ============================================================
 * 023 — Lo que el profesor CARGA
 * ============================================================ */

/**
 * Diálogo de la grabación de una clase.
 *
 * Vacío = borrar el enlace, y se dice con esas palabras: un campo que se
 * limpia sin avisar qué hace es cómo alguien borra por accidente lo que
 * acababa de pegar.
 */
function DialogoGrabacion({
  classSessionId,
  actual,
  onClose,
  onSaved,
}: {
  classSessionId: string;
  actual: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [url, setUrl] = useState(actual ?? "");
  const [guardando, setGuardando] = useState(false);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    const res = await fetch(`/api/portal/classes/${classSessionId}/recording`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recordingUrl: url.trim() || null }),
    }).catch(() => null);
    setGuardando(false);

    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      notify.error(body?.error?.message ?? "No se pudo guardar la grabación.");
      return;
    }
    notify.success("Grabación guardada.");
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-overlay p-4 sm:items-center">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-pop">
        <h3 className="text-base font-semibold tracking-tight">Grabación de la clase</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          El enlace a la grabación. Guardamos solo el enlace, no el video.
        </p>

        <form onSubmit={guardar} className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="grabacion-url">Enlace</Label>
            <Input
              id="grabacion-url"
              type="url"
              autoFocus
              className="h-11"
              placeholder="https://…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            {actual && (
              <p className="text-xs text-muted-foreground">
                Si dejás el campo vacío, se eliminará el enlace actual.
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" className="h-11" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" className="h-11" loading={guardando}>
              Guardar
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * 023 — El profesor publica material de SU cohorte.
 *
 * Cuelga de la COHORTE y no del curso: el material del curso es el programa
 * oficial de la academia y alcanza a las otras cohortes que lo dictan. Si el
 * profesor pudiera tocar ese, le cambiaría el curso a seis colegas.
 */
function DialogoMaterial({
  cohortId,
  onClose,
  onSaved,
}: {
  cohortId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState("guia");
  const [guardando, setGuardando] = useState(false);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    const res = await fetch(`/api/portal/cohorts/${cohortId}/resources`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: title.trim(), url: url.trim(), kind }),
    }).catch(() => null);
    setGuardando(false);

    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      notify.error(body?.error?.message ?? "No se pudo publicar el material.");
      return;
    }
    notify.success("Material publicado.");
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-overlay p-4 sm:items-center">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-pop">
        <h3 className="text-base font-semibold tracking-tight">Publicar material</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Lo van a ver los alumnos de esta cohorte. Funciona con enlaces de
          Drive, WeTransfer o Autodesk Docs; no guardamos archivos.
        </p>

        <form onSubmit={guardar} className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="material-title">Título</Label>
            <Input
              id="material-title"
              required
              autoFocus
              className="h-11"
              placeholder="Guía de la clase 3"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="material-url">Enlace</Label>
            <Input
              id="material-url"
              type="url"
              required
              className="h-11"
              placeholder="https://…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="material-kind">Tipo</Label>
            <Select
              id="material-kind"
              className="h-11"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              <option value="guia">Guía</option>
              <option value="ejemplo">Ejemplo</option>
              <option value="video">Video</option>
              <option value="enlace">Enlace</option>
            </Select>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" className="h-11" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" className="h-11" loading={guardando}>
              Publicar
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FalloDeCarga({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="space-y-3 rounded-lg border border-dashed p-6 text-center">
      <p className="text-sm text-destructive">
        No pudimos cargar la información. Suele ser algo momentáneo: en unos minutos debería aparecer.
      </p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Reintentar
      </Button>
    </div>
  );
}
