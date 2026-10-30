"use client";

import { useCallback, useEffect, useState } from "react";
import { useRefrescoDeClases } from "@/components/portal/use-refresco-de-clases";
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
import { CorrectionPanel } from "@/components/grading/correction-panel";
import { admiteAtajo, plantillaDe, type Template } from "@/lib/grading-template";
import { notify } from "@/lib/notify";
import { Modal, useDirty } from "@/components/ui/modal";
import { conZona } from "@/lib/schedule-time";
import type { PestanaPortalGrupo } from "@/lib/pestanas";
import { usePestanaEnUrl } from "@/components/use-pestana-en-url";
import { FinalResultsPanel } from "@/components/grading/final-results-panel";

type Cohort = {
  id: string;
  name: string | null;
  courseName: string;
  status: "planificada" | "en_curso" | "finalizada";
  role: "titular" | "suplente";
  tieneEvaluaciones?: boolean;
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
  /** Instante de inicio ya resuelto en la zona de la academia; null sin horario. */
  startsAt: string | null;
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
  classes: {
    projected: boolean;
    cannotGenerateReason: string | null;
    /** La zona de la academia: la hora de cada clase se dice en ella. */
    timezone: string;
    classes: ClassRow[];
  };
};

type GradingPayload = {
  cohort: Cohort;
  editable: boolean;
  /** 031 — Cada evaluación trae su plantilla (escala, mínimo, aprobación…). */
  assessments: ({ id: string; name: string; position: number; required: boolean } & Partial<Template>)[];
  students: {
    enrollmentId: string;
    name: string;
    results: Record<string, boolean | null>;
    scores?: Record<string, number | null>;
  }[];
};

type ContentPayload = {
  cohort: Cohort;
  announcements: { id: string; title: string; body: string; authorName: string | null; createdAt: string }[];
  resources: { id: string; title: string; url: string; kind: string }[];
};

type Tab = PestanaPortalGrupo;

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
 * Cuatro pestañas: clases (donde consulta la asistencia y mira las grabaciones),
 * evaluaciones (donde carga resultados), entregas (donde lee y devuelve) y
 * material (donde también publica). Todo lo que no está es deliberado —
 * inscribir, cobrar y emitir certificados son de la academia.
 */
export function PortalCohortClient({
  cohortId,
  initialTab = "clases",
}: {
  cohortId: string;
  /** 2026-10-26 — De `?tab=clases|evaluaciones|entregas|material`. */
  initialTab?: Tab;
}) {
  const [tab, setTab] = usePestanaEnUrl<Tab>(initialTab);
  const [claseAbierta, setClaseAbierta] = useState<string | null>(null);
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

  // El enlace de la clase aparece solo a la hora, sin recargar la página.
  useRefrescoDeClases(datos?.classes.classes ?? null, () => void refetch());

  if (noEncontrada) {
    return (
      <div className="space-y-3">
        <Link href="/portal/dictado" className="inline-flex h-11 items-center gap-1 text-sm text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> Mis grupos
        </Link>
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="text-sm font-medium">No encontramos este grupo entre los asignados a tu cuenta</p>
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
          <ArrowLeft className="h-4 w-4" /> Mis grupos
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">
          {datos.cohort.courseName}
        </h1>
        <p className="text-sm text-muted-foreground">
          {datos.cohort.program &&
            `${datos.cohort.program.name} · `}
          {datos.cohort.name ?? "Grupo sin nombre"} · {datos.cohort.students}{" "}
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
            { key: "evaluaciones", label: "Evaluaciones" },
            // 016 — Entregas va ANTES de Material: es trabajo pendiente del
            // profesor, y Material es consulta. Lo que hay que hacer primero.
            { key: "entregas", label: "Entregas" },
            // 0086 — El profesor confirma el resultado final de cada alumno.
            { key: "cierre", label: "Resultado final" },
            { key: "material", label: "Material" },
          ] as const
        )
          // 2026-10-29 — Taller sin evaluaciones: ni Evaluaciones ni Entregas (el Resultado final sigue).
          .filter(
            (t) =>
              datos.cohort.tieneEvaluaciones !== false ||
              (t.key !== "evaluaciones" && t.key !== "entregas")
          )
          .map((t) => (
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
        />
      ) : tab === "evaluaciones" ? (
        <div className="space-y-6">
          <Evaluacion cohortId={cohortId} />
          <PortalOfflineAttempts cohortId={cohortId} />
        </div>
      ) : tab === "entregas" ? (
        <PortalSubmissions cohortId={cohortId} />
      ) : tab === "cierre" ? (
        <FinalResultsPanel
          endpoint={`/api/portal/cohorts/${cohortId}/final-results`}
          canConfirm
          audiencia="profesor"
        />
      ) : (
        <Material cohortId={cohortId} />
      )}
    </div>
  );
}

function Clases({
  datos,
  onAbrir,
}: {
  datos: ClassesPayload;
  onAbrir: (id: string) => void;
}) {
  const filas = datos.classes.classes;
  // 030 — La grabación de Zoom abierta (una a la vez): el iframe se monta
  // recién al abrirla, no uno por clase.
  const [grabacionAbierta, setGrabacionAbierta] = useState<string | null>(null);

  if (filas.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Este grupo todavía no tiene cronograma.
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
        // así que no tiene asistencia que consultar. Decirlo evita que el
        // profesor toque y no pase nada.
        <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          Estas clases son una proyección según los días previstos. Vas a
          poder consultar la asistencia cuando la academia genere el
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
                      {c.startTime && ` · ${conZona(c.startTime, datos.classes.timezone)}`}
                    </span>
                  </p>
                  {c.topic && (
                    <p className="truncate text-xs text-muted-foreground">{c.topic}</p>
                  )}
                  {c.canceled && (
                    <p className="text-xs text-destructive">
                      Suspendida{c.cancelReason && `: ${c.cancelReason}`}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {c.projected && <Badge variant="secondary">proyectada</Badge>}
                  {c.canceled && <Badge variant="destructive">suspendida</Badge>}
                </div>
              </button>

              {(c.meetingUrl || c.recordingUrl) && (
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
  const [corrigiendo, setCorrigiendo] = useState<{
    assessmentId: string;
    assessmentName: string;
    enrollmentId: string;
    studentName: string;
  } | null>(null);

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
        Este grupo aún no tiene evaluaciones. La academia las define; una
        vez creadas, vas a poder registrar aquí los resultados.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {!datos.editable && (
        <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          El grupo finalizó: los resultados están disponibles solo para
          consulta.
        </p>
      )}

      {datos.editable && corrigiendo && (
        <section className="space-y-2 rounded-lg border p-3">
          <p className="text-sm font-medium">
            Corrección · {corrigiendo.assessmentName} · {corrigiendo.studentName}
          </p>
          <CorrectionPanel
            key={`${corrigiendo.assessmentId}-${corrigiendo.enrollmentId}`}
            endpoint={`/api/portal/assessments/${corrigiendo.assessmentId}/corrections/${corrigiendo.enrollmentId}`}
            onListo={() => {
              setCorrigiendo(null);
              void refetch();
            }}
            onCancelar={() => setCorrigiendo(null)}
          />
        </section>
      )}

      <ul className="divide-y rounded-lg border">
        {datos.students.map((s) => (
          <li key={s.enrollmentId} className="space-y-2 p-3">
            <p className="text-sm font-medium">{s.name}</p>
            <div className="space-y-2">
              {datos.assessments.map((a) => {
                const v = s.results[a.id];
                /*
                  031 (DV-005) — Una numérica, o una que requiere aprobación,
                  NO se carga con el desplegable: la ruta del atajo respondería
                  422 `usar_correccion`. La fila muestra lo PUBLICADO y abre el
                  formulario de corrección por la puerta del profesor — la
                  misma decisión que la planilla del staff, con `admiteAtajo`.
                */
                if (!admiteAtajo(plantillaDe(a))) {
                  const nota = s.scores?.[a.id] ?? null;
                  const texto =
                    nota !== null
                      ? `${nota}/100`
                      : v === true
                        ? "Aprobado"
                        : v === false
                          ? "No aprobado"
                          : "Sin corregir";
                  const tono =
                    v === true ? "text-success" : v === false ? "text-danger" : "text-muted-foreground";
                  return (
                    <div key={a.id} className="flex items-center justify-between gap-2">
                      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                        {a.name}
                        {!a.required && " (opcional)"}
                      </span>
                      {datos.editable ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className={`h-11 w-32 text-xs ${tono}`}
                          aria-label={`Corregir: ${s.name}, ${a.name}`}
                          onClick={() =>
                            setCorrigiendo({
                              assessmentId: a.id,
                              assessmentName: a.name,
                              enrollmentId: s.enrollmentId,
                              studentName: s.name,
                            })
                          }
                        >
                          {texto}
                        </Button>
                      ) : (
                        <span className={`w-32 text-center text-xs ${tono}`}>{texto}</span>
                      )}
                    </div>
                  );
                }
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
          Todavía no hay material ni avisos publicados para este grupo.
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
  const dirty = useDirty({ title, url, kind });

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
    <Modal
      onClose={onClose}
      dirty={dirty}
      busy={guardando}
      labelledBy="material-title-h"
      overlayClassName="items-end sm:items-center"
      className="border-border shadow-pop"
    >
        <h3 id="material-title-h" className="text-base font-semibold tracking-tight">Publicar material</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Lo van a ver los alumnos de este grupo. Funciona con enlaces de
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
    </Modal>
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
