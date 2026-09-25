"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { OfflineAttemptRow } from "@/server/offline-courses/attempts";
import type { AccessState, CourseState, OverrideAction } from "@/server/offline-courses/logic";
import { OfflineAttemptsTable } from "@/components/offline-courses/attempts-table";
import { cn } from "@/lib/utils";

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
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const res = await fetch(`/api/enrollments/${enrollmentId}/offline-courses`).catch(() => null);
    if (res?.ok) {
      const data = (await res.json()) as { courses: CourseState[]; attempts: OfflineAttemptRow[] };
      setCourses(data.courses);
      setAttempts(data.attempts);
    } else {
      setError("No se pudieron cargar los cursos offline");
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
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}

      {courses.length === 0 ? (
        <p className="text-xs text-muted-foreground">La biblioteca de cursos offline está vacía.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {courses.map((c) => {
            const toggle = toggleAction(c);
            const canReset = c.override !== null && toggle.action !== "clear";
            return (
              <li key={c.courseId} className="flex flex-wrap items-center gap-2 px-3 py-1.5 text-xs">
                <span className="flex-1 font-medium">{c.title}</span>
                <span className={cn(STATE_CLASS[c.state])}>{STATE_LABEL[c.state]}</span>
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
