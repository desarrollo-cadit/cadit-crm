import { z } from "zod";
import { parseBody, requireCapability } from "@/lib/api";
import { getSessionOrNull } from "@/lib/auth/session";
import { withOrganizationScope } from "@/lib/db/with-tenant";
import { isValidHex, resolveAccentSet } from "@/lib/branding";
import { getBranding, saveBranding } from "@/server/branding";

export const dynamic = "force-dynamic";

/**
 * GET público: el login necesita la marca ANTES de autenticarse, así que no
 * puede pedir capacidad. Está declarado como excepción en
 * `tests/unit/route-capabilities.test.ts`, con el motivo.
 *
 * Con sesión, la lectura va DENTRO del alcance de la organización. La app se
 * conecta como `cadit_app`, que está sujeto a RLS: sin `app.current_org`
 * declarada la consulta devuelve cero filas **sin ningún error**, y acá el
 * síntoma sería que la marca de la organización se cae al default sin que
 * nadie se entere. Sin sesión no hay alcance que declarar y `getBranding`
 * resuelve por la única organización de la instancia.
 */
export async function GET() {
  const session = await getSessionOrNull();

  const branding = session
    ? await withOrganizationScope(session.organizationId, `branding:${session.userId}`, () =>
        getBranding(session.organizationId)
      )
    : await getBranding();

  return Response.json({ branding, accentSet: resolveAccentSet(branding.accent) });
}

const putSchema = z.object({
  name: z.string().trim().min(1).max(30),
  accent: z.string().refine(isValidHex, "Color hex inválido (#rrggbb)"),
});

export const PUT = requireCapability(
  "configuracion.editar",
  async (session, req: Request) => {
  /**
   * 012 (T029) — Se eliminó el `session.role !== "owner"` que había acá.
   *
   * Era redundante y, peor, frágil: `requireCapability("configuracion.editar")`
   * ya decide esto, y esa capacidad es justamente la que define "puede tocar
   * la configuración de la instancia". La comparación por nombre habría dejado
   * al dueño AFUERA en cuanto su rol pasara de `owner` a `direccion` — un 403
   * en su propia pantalla de marca, sin que ningún test lo notara.
   */
  const body = await parseBody(req, putSchema);
  if (!body.ok) return body.response;
  await saveBranding(session.organizationId, body.data);
  return Response.json({ ok: true });
});
