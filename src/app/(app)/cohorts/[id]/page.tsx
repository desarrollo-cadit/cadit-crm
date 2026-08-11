import { RosterClient } from "@/components/cohorts/roster-client";

export const dynamic = "force-dynamic";

export default async function CohortPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <RosterClient cohortId={id} />;
}
