"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { PortalAttendanceSheet } from "@/components/portal/portal-attendance-sheet";

type Cohort = {
  id: string;
  name: string | null;
  courseName: string;
  status: "planificada" | "en_curso" | "finalizada";
  role: "titular" | "suplente";
  students: number;
};

type ClassRow = {
  id: string | null;
  number: number;
  projected: boolean;
  date: string;
  startTime: string | null;
  endTime: string | null;
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

type Tab = "clases" | "evaluacion" | "material";

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
 * Tres pestañas y ninguna más: clases (donde toma asistencia), evaluación
 * (donde carga resultados) y material (de solo lectura). Todo lo que no está
 * es deliberado — inscribir, cobrar y emitir certificados son de la academia.
 */
export function PortalCohortClient({ cohortId }: { cohortId: string }) {
  const [tab, setTab] = useState<Tab>("clases");
  const [claseAbierta, setClaseAbierta] = useState<string | null>(null);
  const [datos, setDatos] = useState<ClassesPayload | null>(null);
  const [noEncontrada, setNoEncontrada] = useState(false);

  const refetch = useCallback(async () => {
    const res = await fetch(`/api/portal/cohorts/${cohortId}/classes`).catch(() => null);
    // 404 = no existe, o no es tuya. Desde acá son la misma cosa, y así tiene
    // que ser: distinguirlas le confirmaría al profesor que la cohorte existe.
    if (res?.status === 404) {
      setNoEncontrada(true);
      return;
    }
    if (res?.ok) setDatos((await res.json()) as ClassesPayload);
  }, [cohortId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  if (noEncontrada) {
    return (
      <div className="space-y-3">
        <Link href="/portal/dictado" className="inline-flex h-11 items-center gap-1 text-sm text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> Mis camadas
        </Link>
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="text-sm font-medium">Esa cohorte no está entre las tuyas</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Si tendría que estarlo, avisale a la academia.
          </p>
        </div>
      </div>
    );
  }

  if (!datos) return <Skeleton className="h-64 w-full" />;

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
          <ArrowLeft className="h-4 w-4" /> Mis camadas
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">
          {datos.cohort.courseName}
        </h1>
        <p className="text-sm text-muted-foreground">
          {datos.cohort.name ?? "Sin nombre de edición"} · {datos.cohort.students}{" "}
          {datos.cohort.students === 1 ? "alumno" : "alumnos"}
          {datos.cohort.role === "suplente" && " · suplencia"}
        </p>
      </div>

      <div className="flex gap-1 border-b">
        {(
          [
            { key: "clases", label: "Clases" },
            { key: "evaluacion", label: "Evaluación" },
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
        <Clases datos={datos} onAbrir={setClaseAbierta} />
      ) : tab === "evaluacion" ? (
        <Evaluacion cohortId={cohortId} />
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
          Estas clases son una proyección de los días declarados: todavía no
          existen. Cuando la academia genere el cronograma vas a poder tomar
          asistencia.
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

              {(c.meetingUrl || c.recordingUrl) && (
                <div className="flex gap-3 px-3 pb-3 text-xs">
                  {c.meetingUrl && (
                    <a
                      href={c.meetingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> Entrar a la clase
                    </a>
                  )}
                  {c.recordingUrl && (
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
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const res = await fetch(`/api/portal/cohorts/${cohortId}/grading`).catch(() => null);
    if (res?.ok) setDatos((await res.json()) as GradingPayload);
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
      setError(body?.error?.message ?? "No se pudo guardar el resultado.");
    } else {
      setError(null);
    }
    void refetch();
  }

  if (!datos) return <Skeleton className="h-40 w-full" />;

  if (datos.assessments.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Esta cohorte todavía no tiene evaluaciones cargadas. Las define la
        academia; cuando estén, vas a poder poner los resultados acá.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!datos.editable && (
        <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          La cohorte ya finalizó: los resultados se ven, no se cambian.
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
                      <option value="si">Aprobó</option>
                      <option value="no">No aprobó</option>
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

/** 014 (T029, FR-007) — Material y avisos, de solo lectura. */
function Material({ cohortId }: { cohortId: string }) {
  const [datos, setDatos] = useState<ContentPayload | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/portal/cohorts/${cohortId}/content`).catch(() => null);
      if (res?.ok) setDatos((await res.json()) as ContentPayload);
    })();
  }, [cohortId]);

  if (!datos) return <Skeleton className="h-40 w-full" />;

  const vacio = datos.announcements.length === 0 && datos.resources.length === 0;
  if (vacio) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Todavía no hay material ni avisos publicados para esta cohorte.
      </p>
    );
  }

  return (
    <div className="space-y-5">
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
            Material del curso
          </h2>
          <ul className="divide-y rounded-lg border">
            {datos.resources.map((r) => (
              <li key={r.id}>
                <a
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-12 items-center justify-between gap-2 px-3 text-sm hover:bg-accent"
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
