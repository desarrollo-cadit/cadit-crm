import { notFound, redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { sessionCapabilities } from "@/lib/capabilities";
import { withTenantTransaction } from "@/lib/db/with-tenant";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { CampaignEditor } from "@/components/marketing/campaign-editor";
import { CampaignResults } from "@/components/marketing/campaign-results";
import { listarAudiencias } from "@/server/marketing/audiences";
import { obtenerCampana } from "@/server/marketing/campaigns";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

/**
 * 045 (US2) — Una campaña. `[id] = "nueva"` para crear (solo con
 * `marketing.enviar`). Se ve con `marketing.ver`; se edita con
 * `marketing.enviar` y solo mientras es borrador.
 */
export default async function CampanaPage({ params }: Props) {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  const caps = sessionCapabilities(session);
  if (!caps.includes("marketing.ver")) redirect("/");
  const canEdit = caps.includes("marketing.enviar");
  const { id } = await params;
  const nueva = id === "nueva";
  if (nueva && !canEdit) redirect("/marketing");

  const { campaign, audiences } = await withTenantTransaction(
    { organizationId: session.organizationId, userId: session.userId },
    async () => ({
      campaign: nueva ? null : await obtenerCampana(session.organizationId, id),
      audiences: (await listarAudiencias(session.organizationId)).map((a) => ({ id: a.id, name: a.name })),
    })
  );
  if (!nueva && !campaign) notFound();

  return (
    <div className="h-full space-y-4 overflow-y-auto p-6">
      <Breadcrumb
        items={[
          { label: "Marketing", href: "/marketing" },
          { label: "Campañas", href: "/marketing?tab=campanas" },
          { label: campaign?.name ?? "Nueva campaña", href: null },
        ]}
      />
      <h1 className="text-xl font-semibold">{campaign?.name ?? "Nueva campaña"}</h1>
      {campaign?.metrics && (
        <CampaignResults campaignId={campaign.id} initialMetrics={campaign.metrics} canCancel={canEdit} />
      )}
      <CampaignEditor initial={campaign} audiences={audiences} canEdit={canEdit} />
    </div>
  );
}
