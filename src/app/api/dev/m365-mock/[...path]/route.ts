import { mockGuard } from "@/lib/dev-guard";
import { isFailing, pushMail } from "@/server/dev/m365-mock-state";

/**
 * 029 (DV-010) — Imitación de Entra ID + Microsoft Graph para el correo.
 *
 * El adaptador real (`src/lib/m365`) apunta acá cuando
 * `M365_LOGIN_BASE_URL = <app>/api/dev/m365-mock` y
 * `M365_GRAPH_BASE_URL = <app>/api/dev/m365-mock/v1.0`. No valida credenciales:
 * lo que se prueba es lo que el CRM manda, no a Microsoft.
 *
 * - `POST {tenant}/oauth2/v2.0/token` → token falso.
 * - `POST v1.0/users/{sender}/sendMail` → guarda el mensaje y responde 202,
 *   o 500 si el modo falla está activo (camino infeliz del self-test).
 */
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ path: string[] }> };

export async function POST(req: Request, { params }: Params) {
  const guard = mockGuard();
  if (guard) return guard;
  const { path } = await params;

  if (path.length === 4 && path[1] === "oauth2" && path[2] === "v2.0" && path[3] === "token") {
    return Response.json({ access_token: "mock", token_type: "Bearer", expires_in: 3600 });
  }

  if (path.length === 4 && path[0] === "v1.0" && path[1] === "users" && path[3] === "sendMail") {
    if (isFailing()) {
      return Response.json({ error: { message: "mock: fallo forzado" } }, { status: 500 });
    }
    const body = (await req.json().catch(() => null)) as
      | { message?: unknown; saveToSentItems?: boolean }
      | null;
    if (!body?.message) {
      return Response.json({ error: { message: "mock: falta message" } }, { status: 400 });
    }
    pushMail({
      from: decodeURIComponent(path[2] ?? ""),
      message: body.message,
      saveToSentItems: body.saveToSentItems ?? null,
    });
    return new Response(null, { status: 202 });
  }

  return Response.json({ error: { message: "mock: ruta desconocida" } }, { status: 404 });
}
