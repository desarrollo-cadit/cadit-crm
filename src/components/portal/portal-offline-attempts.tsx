"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { OfflineAttemptsTable } from "@/components/offline-courses/attempts-table";
import type { OfflineAttemptRow } from "@/server/offline-courses/attempts";

/**
 * cursos-offline (T5) — The teacher's view of the cohort's offline-course
 * quizzes: who took which, the score and whether it passed. Never the answers.
 */
export function PortalOfflineAttempts({ cohortId }: { cohortId: string }) {
  const [attempts, setAttempts] = useState<OfflineAttemptRow[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/portal/cohorts/${cohortId}/offline-attempts`).catch(() => null);
      if (!res?.ok) return setError(true);
      setAttempts(((await res.json()) as { attempts: OfflineAttemptRow[] }).attempts);
    })();
  }, [cohortId]);

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">Cuestionarios de cursos offline</h2>
      {error ? (
        <p className="text-sm text-danger">No se pudieron cargar los intentos.</p>
      ) : attempts === null ? (
        <Skeleton className="h-16 w-full" />
      ) : (
        <OfflineAttemptsTable attempts={attempts} showStudent />
      )}
    </section>
  );
}
