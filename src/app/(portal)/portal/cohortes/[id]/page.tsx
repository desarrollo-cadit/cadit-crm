import { PortalCohortClient } from "@/components/portal/portal-cohort-client";

export const dynamic = "force-dynamic";

/** 014 (T025) — Una cohorte del profesor: clases, evaluación y material. */
export default async function PortalCohortPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PortalCohortClient cohortId={id} />;
}
