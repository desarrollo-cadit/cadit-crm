import { getSessionOrNull } from "@/lib/auth/session";
import { RosterClient } from "@/components/cohorts/roster-client";

export const dynamic = "force-dynamic";

export default async function CohortPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSessionOrNull();
  const fullAccess = session?.role !== "soporte";
  return <RosterClient cohortId={id} canEnroll={fullAccess} />;
}
