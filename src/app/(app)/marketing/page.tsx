import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { getSessionOrNull } from "@/lib/auth/session";
import { sessionCapabilities } from "@/lib/capabilities";
import { withTenantTransaction } from "@/lib/db/with-tenant";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { listarAudiencias } from "@/server/marketing/audiences";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ tab?: string }> };

const PESTANAS = [
  { key: "campanas", label: "Campañas" },
  { key: "audiencias", label: "Audiencias" },
] as const;

/**
 * 045 — Marketing: campañas por correo a los contactos propios y las
 * audiencias con que se arman. Gate en el servidor con `marketing.ver`;
 * crear y editar, solo con `marketing.enviar` (lo decide el servidor).
 */
export default async function MarketingPage({ searchParams }: Props) {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  const caps = sessionCapabilities(session);
  if (!caps.includes("marketing.ver")) redirect("/");
  const canEdit = caps.includes("marketing.enviar");
  const { tab } = await searchParams;
  const activa = tab === "audiencias" ? "audiencias" : "campanas";

  const audiencias =
    activa === "audiencias"
      ? await withTenantTransaction(
          { organizationId: session.organizationId, userId: session.userId },
          () => listarAudiencias(session.organizationId)
        )
      : [];

  return (
    <div className="h-full space-y-4 overflow-y-auto p-6">
      <div>
        <h1 className="text-xl font-semibold">Marketing</h1>
        <p className="text-sm text-muted-foreground">
          Correos a tus contactos: leads, interesados y exalumnos.
        </p>
      </div>

      <nav className="flex gap-1 border-b" aria-label="Secciones de Marketing">
        {PESTANAS.map((p) => (
          <Link
            key={p.key}
            href={`/marketing?tab=${p.key}`}
            aria-current={activa === p.key ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm",
              activa === p.key
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {p.label}
          </Link>
        ))}
      </nav>

      {activa === "campanas" ? (
        <p className="text-sm text-muted-foreground">Todavía no hay campañas.</p>
      ) : (
        <section className="space-y-3">
          {canEdit && (
            <Link href="/marketing/audiencias/nueva" className={buttonVariants({ size: "sm" })}>
              <Plus className="h-4 w-4" aria-hidden />
              Nueva audiencia
            </Link>
          )}
          {audiencias.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no hay audiencias guardadas. Una audiencia es un conjunto de filtros que se
              vuelve a calcular cada vez que la usás.
            </p>
          ) : (
            <ul className="divide-y rounded-md border bg-card">
              {audiencias.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/marketing/audiencias/${a.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-accent"
                  >
                    <span className="truncate font-medium">{a.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {a.createdByName ? `${a.createdByName} · ` : ""}
                      {new Date(a.createdAt).toLocaleDateString("es-UY")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
