"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Library } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import type { OfflineAttemptRow } from "@/server/offline-courses/attempts";
import type { OfflineCourseSummary } from "@/server/offline-courses/library";
import { OfflineAttemptsTable } from "@/components/offline-courses/attempts-table";
import { OfflineCourseStatusBadge } from "@/components/offline-courses/status-badge";

async function readError(res: Response | null, fallback: string) {
  const body = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? fallback;
}

/**
 * cursos-offline (T4) — The cohort's "Cursos offline" tab.
 *
 * The multi-check says which library courses the WHOLE cohort inherits;
 * per-student exceptions live in the roster (expanded row). Saving replaces
 * the set. Without `academico.editar` the checks are read-only — the PUT has
 * its own `requireCapability`, this only decides what the person sees.
 */
export function CohortOfflineCoursesClient({
  cohortId,
  canEdit,
}: {
  cohortId: string;
  /** `academico.editar`. */
  canEdit: boolean;
}) {
  const [courses, setCourses] = useState<OfflineCourseSummary[]>([]);
  const [saved, setSaved] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [attempts, setAttempts] = useState<OfflineAttemptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const [assignedRes, attemptsRes] = await Promise.all([
      fetch(`/api/cohorts/${cohortId}/offline-courses`).catch(() => null),
      fetch(`/api/cohorts/${cohortId}/offline-attempts`).catch(() => null),
    ]);
    if (!assignedRes?.ok) {
      setError(await readError(assignedRes, "No se pudieron cargar los cursos offline"));
    } else {
      const data = (await assignedRes.json()) as {
        courseIds: string[];
        courses: OfflineCourseSummary[];
      };
      setCourses(data.courses);
      setSaved(data.courseIds);
      setSelected(new Set(data.courseIds));
    }
    if (attemptsRes?.ok) {
      const data = (await attemptsRes.json()) as { attempts: OfflineAttemptRow[] };
      setAttempts(data.attempts);
    }
    setLoading(false);
  }, [cohortId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const dirty = useMemo(
    () => saved.length !== selected.size || saved.some((id) => !selected.has(id)),
    [saved, selected]
  );

  function toggle(id: string, on: boolean) {
    setNotice(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/cohorts/${cohortId}/offline-courses`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ courseIds: [...selected] }),
    }).catch(() => null);
    if (res?.ok) {
      const data = (await res.json()) as { courseIds: string[] };
      setSaved(data.courseIds);
      setSelected(new Set(data.courseIds));
      setNotice("Cambios guardados.");
    } else {
      setError(await readError(res, "No se pudieron guardar los cursos"));
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="space-y-2 p-6">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-2/3" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <section className="space-y-3" aria-labelledby="offline-asignados">
        <header>
          <h3 id="offline-asignados" className="flex items-center gap-2 text-sm font-semibold">
            <Library className="h-4 w-4" aria-hidden />
            Cursos offline de la cohorte
          </h3>
          <p className="text-xs text-muted-foreground">
            Todos los alumnos de la cohorte heredan los cursos marcados. Las excepciones por
            alumno se manejan desde la pestaña «Alumnos», abriendo su fila.
          </p>
        </header>

        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}

        {courses.length === 0 ? (
          <p className="text-sm text-muted-foreground">La biblioteca de cursos offline está vacía.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {courses.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-4 py-2">
                <label className="flex flex-1 items-center gap-3 text-sm">
                  <Checkbox
                    checked={selected.has(c.id)}
                    disabled={!canEdit || saving}
                    onChange={(ev) => toggle(c.id, ev.target.checked)}
                  />
                  <span>{c.title}</span>
                </label>
                <OfflineCourseStatusBadge status={c.status} />
                <Link
                  href={`/cursos-offline/${c.id}`}
                  className="text-xs text-muted-foreground underline hover:text-foreground"
                >
                  Ver contenido
                </Link>
              </li>
            ))}
          </ul>
        )}

        {canEdit ? (
          <div className="flex items-center gap-3">
            <Button size="sm" disabled={!dirty || saving} onClick={() => void save()}>
              {saving ? "Guardando…" : "Guardar"}
            </Button>
            {dirty && !saving && (
              <span className="text-xs text-muted-foreground">Hay cambios sin guardar.</span>
            )}
            {notice && !dirty && (
              <span role="status" className="text-xs text-muted-foreground">
                {notice}
              </span>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Solo lectura: asignar cursos requiere permiso para editar lo académico.
          </p>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="offline-intentos">
        <h3 id="offline-intentos" className="text-sm font-semibold">
          Intentos de cuestionarios
        </h3>
        <OfflineAttemptsTable attempts={attempts} showStudent />
      </section>
    </div>
  );
}
