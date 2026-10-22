import { withOrganizationScope } from "@/lib/db/with-tenant";
import { UnsubscribeConfirm } from "@/components/marketing/unsubscribe-confirm";
import { getBranding } from "@/server/branding";
import { estadoDeEnlaceDeBaja, type EstadoDeEnlaceDeBaja } from "@/server/marketing/unsubscribe";
import { resolveSoleOrganizationId } from "@/server/public-catalog";

export const dynamic = "force-dynamic";

/**
 * 045 (FR-012, FR-014; DV-010, P-01) — Página PÚBLICA de baja de marketing.
 *
 * Fuera de `(app)` y `(portal)`: no exige sesión. Esta página solo LEE el
 * estado del enlace; la baja la registra el botón (POST). Así los escáneres de
 * seguridad que abren los enlaces del correo no dan de baja a nadie.
 *
 * No muestra el correo ni el nombre de la persona: un enlace reenviado no
 * revela de quién es. Firma alterada, destinatario inexistente u otra
 * organización dicen exactamente lo mismo.
 */
export default async function BajaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const orgId = await resolveSoleOrganizationId();
  const { estado, academia } = orgId
    ? await withOrganizationScope(orgId, "public:marketing-baja", async () => ({
        estado: await estadoDeEnlaceDeBaja(orgId, token),
        academia: (await getBranding(orgId)).name,
      }))
    : { estado: "invalido" as EstadoDeEnlaceDeBaja, academia: "" };

  return (
    <main className="flex min-h-screen items-center justify-center bg-subtle p-6">
      <div className="w-full max-w-md space-y-4 rounded-lg border bg-card p-6 shadow-sm">
        {estado === "valido" && (
          <>
            <h1 className="text-lg font-semibold">¿No querés recibir más correos de {academia}?</h1>
            <p className="text-sm text-muted-foreground">
              Seguirás recibiendo los correos de tus cursos (bienvenida, cuotas, acceso al portal).
            </p>
            <UnsubscribeConfirm token={token} />
          </>
        )}
        {estado === "ya_dado_de_baja" && (
          <h1 className="text-lg font-semibold">Ya no te enviamos correos de novedades.</h1>
        )}
        {estado === "prueba" && (
          <h1 className="text-lg font-semibold">Este es un correo de prueba: el enlace no da de baja a nadie.</h1>
        )}
        {estado === "invalido" && <h1 className="text-lg font-semibold">Este enlace no es válido.</h1>}
      </div>
    </main>
  );
}
