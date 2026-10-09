import { mockGuard } from "@/lib/dev-guard";
import { zoomBases } from "@/lib/zoom";

/**
 * 030 — A dónde le habla ESTA app a Zoom (bases del adaptador; no son
 * secretas). El arnés E2E lo consulta antes de la sección de grabaciones y
 * aborta si no son las del zoom-mock: una corrida que olvidó las variables
 * le mandó credenciales de mentira a zoom.us. 404 en producción (mockGuard).
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const guard = mockGuard();
  if (guard) return guard;
  return Response.json(zoomBases());
}
