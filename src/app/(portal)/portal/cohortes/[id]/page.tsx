import { PortalCohortClient } from "@/components/portal/portal-cohort-client";
import { leerPestana } from "@/lib/tab-param";
import { ALIAS_PORTAL_GRUPO, PESTANAS_PORTAL_GRUPO } from "@/lib/pestanas";

export const dynamic = "force-dynamic";

/**
 * 014 (T025) — Una cohorte del profesor: clases, evaluación y material.
 *
 * 2026-10-26 — `?tab=clases|evaluaciones|entregas|material` abre en esa pestaña.
 */
export default async function PortalCohortPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);
  return (
    <PortalCohortClient
      cohortId={id}
      initialTab={leerPestana(tab, PESTANAS_PORTAL_GRUPO, "clases", ALIAS_PORTAL_GRUPO)}
    />
  );
}
