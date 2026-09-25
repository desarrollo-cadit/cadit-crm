"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { OfflineAttemptRow } from "@/server/offline-courses/attempts";
import type {
  AccessState,
  CompletionSource,
  CourseState,
  OverrideAction,
} from "@/server/offline-courses/logic";
import type { StaffCourseProgress } from "@/server/offline-courses/progress";
import { OfflineAttemptsTable } from "@/components/offline-courses/attempts-table";

const STATE_LABEL: Record<AccessState, string> = {
  inherited: "Heredado de la cohorte",
  granted: "Agregado individualmente",
  revoked: "Quitado individualmente",
  none: "Sin acceso",
};

const STATE_CLASS: Record<AccessState, string> = {
  inherited: "text-text-2",
  granted: "text-success",
  revoked: "text-warning",
  none: "text-muted-foreground",
};

/**
 * The one button that flips access, and the smallest write that does it.
 * Removing an inherited course needs a revoke; removing an individual grant
 * on a course the cohort lacks is just dropping the grant — and the mirror
 * for adding. That keeps at most the row that has something to say.
 */
function toggleAction(c: CourseState): { label: string; action: OverrideAction } {
  const hasAccess = c.state === "inherited" || c.state === "granted";
  if (hasAccess) return { label: "Quitar", action: c.cohortHas ? "revoke" : "clear" };
  return { label: "Agregar", action: c.cohortHas ? "clear" : "grant" };
}

const SOURCE_LABEL: Record<CompletionSource, string> = {
  video: "vio el video",
  no_video: "tema sin video",
  staff: "marcado por el equipo",
};

/** "Completado (vio el video, 25/09/2026)". */
function completedLabel(t: StaffCourseProgress["topics"][number]): string {
  const detail = [
    t.completionSource ? SOURCE_LABEL[t.completionSource] : null,
    t.completedAt
      ? new Date(t.completedAt).toLocaleDateString("es-UY", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        })
      : null,
  ].filter(Boolean);
  return detail.length ? `Completado (${detail.join(", ")})` : "Completado";
}

/**
 * T9 — "X/Y temas · A/B cuestionarios · Terminado/En curso", and the topic
 * list behind a disclosure: 270 topics would bury the roster otherwise.
 * "Marcar como completado" is the fallback when the player cannot play for
 * this person; it records who did it.
 */
function CourseProgressRow({
  progress,
  canEdit,
  busy,
  onComplete,
}: {
  progress: StaffCourseProgress;
  canEdit: boolean;
  busy: boolean;
  onComplete: (topicId: string) => void;
}) {
  const c = progress.completion;
  return (
    <details className="w-full text-xs">
      <summary className="cursor-pointer select-none text-muted-foreground">
        {c.topicsDone}/{c.topicsTotal} temas · {c.quizzesPassed}/{c.quizzesTotal} cuestionarios ·{" "}
        <span className={c.completed ? "font-medium text-success" : "text-text-2"}>
          {c.completed ? "Terminado" : "En curso"}
        </span>
      </summary>
      {progress.topics.length === 0 ? (
        <p className="mt-1 text-muted-foreground">El curso no tiene temas.</p>
      ) : (
        <ol className="mt-1 divide-y rounded-md border">
          {progress.topics.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-2 px-2 py-1">
              <span className="flex-1">
                <span className="text-muted-foreground">{t.lessonTitle} · </span>
                {t.title}
              </span>
              {t.completed ? (
                <span className="text-success">{completedLabel(t)}</span>
              ) : (
                <>
                  <span className="text-muted-foreground">
                    {t.watchedRatio > 0 ? `Visto ${Math.floor(t.watchedRatio * 100)}%` : "Pendiente"}
                  </span>
                  {canEdit && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7"
                      disabled={busy}
                      onClick={() => onComplete(t.id)}
                    >
                      Marcar como completado
                    </Button>
                  )}
                </>
              )}
            </li>
          ))}
        </ol>
      )}
    </details>
  );
}

/**
 * cursos-offline (T4) — One student's library access inside the roster row:
 * every course with where its access comes from, the exceptions (with
 * `academico.editar`) and the student's attempt history.
 */
export function OfflineCoursesPanel({
  enrollmentId,
  canEdit,
}: {
  enrollmentId: string;
  /** `academico.editar`. */
  canEdit: boolean;
}) {
  const [courses, setCourses] = useState<CourseState[]>([]);
  const [attempts, setAttempts] = useState<OfflineAttemptRow[]>([]);
  const [progress, setProgress] = useState<StaffCourseProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  // Two errors, cleared by different events: a failed load goes away when a
  // reload succeeds; a failed change stays until the next change is tried
  // (the reload that follows it must not wipe the message).
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const res = await fetch(`/api/enrollments/${enrollmentId}/offline-courses`).catch(() => null);
    if (res?.ok) {
      const data = (await res.json()) as {
        courses: CourseState[];
        attempts: OfflineAttemptRow[];
        progress: StaffCourseProgress[];
      };
      setCourses(data.courses);
      setAttempts(data.attempts);
      setProgress(data.progress);
      setLoadError(null);
    } else {
      setLoadError("No se pudieron cargar los cursos offline");
    }
    setLoading(false);
  }, [enrollmentId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  async function apply(courseId: string, action: OverrideAction) {
    setBusy(courseId);
    setError(null);
    const res = await fetch(`/api/enrollments/${enrollmentId}/offline-courses`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ courseId, action }),
    }).catch(() => null);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      setError(body?.error?.message ?? "No se pudo cambiar el acceso");
    }
    await refetch();
    setBusy(null);
  }

  async function completeTopic(topicId: string) {
    setBusy(topicId);
    setError(null);
    const res = await fetch(
      `/api/enrollments/${enrollmentId}/offline-courses/topics/${topicId}/complete`,
      { method: "PUT" }
    ).catch(() => null);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      setError(body?.error?.message ?? "No se pudo marcar el tema como completado");
    }
    await refetch();
    setBusy(null);
  }

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-2/3" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium">Cursos offline</p>
      {[loadError, error].filter(Boolean).map((message) => (
        <p key={message} role="alert" className="text-xs text-destructive">
          {message}
        </p>
      ))}

      {courses.length === 0 ? (
        <p className="text-xs text-muted-foreground">La biblioteca de cursos offline está vacía.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {courses.map((c) => {
            const toggle = toggleAction(c);
            const canReset = c.override !== null && toggle.action !== "clear";
            const courseProgress = progress.find((p) => p.courseId === c.courseId);
            return (
              <li key={c.courseId} className="flex flex-wrap items-center gap-2 px-3 py-1.5 text-xs">
                <span className="flex-1 font-medium">{c.title}</span>
                <span className={STATE_CLASS[c.state]}>{STATE_LABEL[c.state]}</span>
                {canEdit && (
                  <span className="flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7"
                      disabled={busy !== null}
                      onClick={() => void apply(c.courseId, toggle.action)}
                    >
                      {toggle.label}
                    </Button>
                    {canReset && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7"
                        disabled={busy !== null}
                        title="Volver a lo que dice la cohorte"
                        onClick={() => void apply(c.courseId, "clear")}
                      >
                        Restablecer
                      </Button>
                    )}
                  </span>
                )}
                {courseProgress && (
                  <CourseProgressRow
                    progress={courseProgress}
                    canEdit={canEdit}
                    busy={busy !== null}
                    onComplete={(topicId) => void completeTopic(topicId)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs font-medium">Intentos de cuestionarios</p>
      <OfflineAttemptsTable attempts={attempts} showStudent={false} />
    </div>
  );
}
