import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { apiError } from "@/lib/api";
import { tokenDeBearer } from "@/lib/mcp-token";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolverToken, type ContextoMcp } from "@/server/mcp/tokens";
import { crearServidorMcp } from "@/server/mcp/tools";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * 0092 — El MCP remoto de CadIT (Streamable HTTP, modo sin estado).
 *
 * Es una superficie de ENTRADA: Claude (Code o un conector) le habla a esta
 * instancia; el CRM no depende de ningún servicio nuevo. Se autentica con
 * `Authorization: Bearer cadit_mcp_…`, un token que emite alguien con
 * `accesos.gestionar` (`/api/settings/mcp-tokens`) y que ES una persona del
 * equipo: sus capacidades salen de su rol, no de la ruta. Por eso esta ruta
 * está en la lista de excepciones de `route-capabilities.test.ts` (igual que
 * `/api/bot/*`): la capacidad la pide cada HERRAMIENTA (`HERRAMIENTAS`), que
 * es lo que `tests/unit/mcp-herramientas.test.ts` exige.
 *
 * Modo sin estado y respuesta JSON (no SSE): cada pedido arma su servidor y su
 * transporte y los cierra al terminar. La respuesta JSON es lo que permite que
 * la herramienta corra dentro de su transacción (RLS) antes de contestar.
 */

const ENCABEZADO_DE_AUTENTICACION = 'Bearer realm="cadit-mcp"';

function noAutorizado(): Response {
  const respuesta = apiError(401, "unauthorized", "Token inválido, revocado o ausente.");
  respuesta.headers.set("WWW-Authenticate", ENCABEZADO_DE_AUTENTICACION);
  return respuesta;
}

async function contextoDe(req: Request): Promise<ContextoMcp | null> {
  const token = tokenDeBearer(req.headers.get("authorization"));
  if (!token) return null;
  return resolverToken(token);
}

export async function POST(req: Request): Promise<Response> {
  let ctx: ContextoMcp | null;
  try {
    ctx = await contextoDe(req);
  } catch (err) {
    console.error("[mcp] no se pudo resolver el token:", err);
    return apiError(500, "internal", "Algo falló de nuestro lado. Probá de nuevo en unos minutos.");
  }

  if (!ctx) {
    // Los fallos se cuentan JUNTOS y recién después de verificar: un token
    // válido nunca queda bloqueado por quien prueba claves ajenas.
    const rl = checkRateLimit("mcp-auth-fail", { windowMs: 60_000, max: 60 });
    return rl.allowed ? noAutorizado() : apiError(429, "rate_limited", "Demasiadas solicitudes");
  }

  const rl = checkRateLimit(`mcp:${ctx.tokenId}`, { windowMs: 60_000, max: 120 });
  if (!rl.allowed) return apiError(429, "rate_limited", "Demasiadas solicitudes");

  const server = crearServidorMcp(ctx);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  try {
    await server.connect(transport);
    return await transport.handleRequest(req);
  } catch (err) {
    console.error("[mcp] error no controlado:", err);
    return apiError(500, "internal", "Algo falló de nuestro lado. Probá de nuevo en unos minutos.");
  } finally {
    await transport.close().catch(() => {});
    await server.close().catch(() => {});
  }
}

/** Sin estado no hay flujo SSE que abrir ni sesión que cerrar. */
function metodoNoPermitido(): Response {
  return Response.json(
    { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null },
    { status: 405, headers: { Allow: "POST" } }
  );
}

export const GET = metodoNoPermitido;
export const DELETE = metodoNoPermitido;
