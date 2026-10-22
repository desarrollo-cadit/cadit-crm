import { notFound, redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { sessionCapabilities } from "@/lib/capabilities";
import { withTenantTransaction } from "@/lib/db/with-tenant";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { AudienceBuilder } from "@/components/marketing/audience-builder";
import { obtenerAudiencia } from "@/server/marketing/audiences";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

/**
 * 045 (US1) — Una audiencia: filtros, cuenta en vivo, excluidos por motivo y
 * la lista. `[id] = "nueva"` para crear (solo con `marketing.enviar`).
 */
export default async function AudienciaPage({ params }: Props) {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  const caps = sessionCapabilities(session);
  if (!caps.includes("marketing.ver")) redirect("/");
  const canEdit = caps.includes("marketing.enviar");
  const { id } = await params;

  const nueva = id === "nueva";
  if (nueva && !canEdit) redirect("/marketing?tab=audiencias");
  const audiencia = nueva
    ? null
    : await withTenantTransaction(
        { organizationId: session.organizationId, userId: session.userId },
        () => obtenerAudiencia(session.organizationId, id)
      );
  if (!nueva && !audiencia) notFound();

  return (
    <div className="h-full space-y-4 overflow-y-auto p-6">
      <Breadcrumb
        items={[
          { label: "Marketing", href: "/marketing" },
          { label: "Audiencias", href: "/marketing?tab=audiencias" },
          { label: audiencia?.name ?? "Nueva audiencia", href: null },
        ]}
      />
      <h1 className="text-xl font-semibold">{audiencia?.name ?? "Nueva audiencia"}</h1>
      <AudienceBuilder initial={audiencia} canEdit={canEdit} />
    </div>
  );
}
