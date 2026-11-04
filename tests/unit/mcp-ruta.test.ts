import { beforeEach, describe, expect, it, vi } from "vitest";
import { nuevoToken } from "@/lib/mcp-token";

/**
 * 0092 — El borde HTTP del MCP remoto: sin token válido no entra nadie, con
 * uno válido contesta JSON-RPC y los errores internos no filtran nada.
 *
 * Sin base: el token se resuelve con un doble. La resolución en sí
 * (`resolverToken`) la cubre `mcp-tokens-servidor.test.ts`.
 */

vi.mock("@/lib/auth", () => ({ getAuth: () => ({ api: { getSession: vi.fn() } }) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth/on-signup", () => ({ resolveMembership: vi.fn() }));
vi.mock("@/lib/db", () => ({
  getRootDb: () => ({
    transaction: async (fn: (tx: unknown) => unknown) => fn({ execute: async () => [] }),
  }),
  getDb: () => ({}),
  schema: new Proxy({}, { get: () => ({}) }),
}));

const resolverToken = vi.fn();
vi.mock("@/server/mcp/tokens", () => ({
  resolverToken: (...args: unknown[]) => resolverToken(...args),
}));

const tareasDelDia = vi.fn();
vi.mock("@/server/tareas-del-dia", () => ({
  tareasDelDia: (...args: unknown[]) => tareasDelDia(...args),
}));

import { DELETE, GET, POST } from "@/app/api/mcp/route";

const TOKEN = nuevoToken().token;
const CTX = {
  tokenId: "mcpt_1",
  organizationId: "org_1",
  userId: "user_1",
  capacidades: ["academico.ver"],
};

function pedido(body: unknown, authorization: string | null = `Bearer ${TOKEN}`): Request {
  return new Request("http://localhost/api/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(authorization ? { authorization } : {}),
    },
    body: JSON.stringify(body),
  });
}

const LISTAR = { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} };

beforeEach(() => {
  resolverToken.mockReset();
  tareasDelDia.mockReset().mockResolvedValue([]);
  // El limitador vive en globalThis: cada prueba arranca con la ventana vacía.
  (globalThis as { __voceroRateLimit?: unknown }).__voceroRateLimit = undefined;
});

describe("POST /api/mcp — quién entra", () => {
  it("sin Authorization → 401 con WWW-Authenticate, sin consultar nada", async () => {
    const r = await POST(pedido(LISTAR, null));

    expect(r.status).toBe(401);
    expect(r.headers.get("www-authenticate")).toContain("Bearer");
    expect(resolverToken).not.toHaveBeenCalled();
  });

  it("con otro esquema o con un valor que no es un token nuestro → 401 sin consultar", async () => {
    expect((await POST(pedido(LISTAR, `Basic ${TOKEN}`))).status).toBe(401);
    expect((await POST(pedido(LISTAR, "Bearer abc"))).status).toBe(401);
    expect(resolverToken).not.toHaveBeenCalled();
  });

  it("token desconocido o revocado (el resolver devuelve null) → 401, y la respuesta no repite el token", async () => {
    resolverToken.mockResolvedValue(null);

    const r = await POST(pedido(LISTAR));

    expect(r.status).toBe(401);
    expect(resolverToken).toHaveBeenCalledWith(TOKEN);
    expect(await r.text()).not.toContain(TOKEN);
  });

  it("si resolver el token falla, 500 genérico sin detalle", async () => {
    const espia = vi.spyOn(console, "error").mockImplementation(() => {});
    resolverToken.mockRejectedValue(new Error("boom: conexión a la base"));

    const r = await POST(pedido(LISTAR));
    espia.mockRestore();

    expect(r.status).toBe(500);
    expect(await r.text()).not.toContain("boom");
  });

  it("los intentos fallidos se limitan (429) sin bloquear a un token válido", async () => {
    resolverToken.mockResolvedValue(null);
    for (let i = 0; i < 60; i++) expect((await POST(pedido(LISTAR))).status).toBe(401);
    expect((await POST(pedido(LISTAR))).status).toBe(429);

    resolverToken.mockResolvedValue(CTX);
    expect((await POST(pedido(LISTAR))).status).toBe(200);
  });
});

describe("POST /api/mcp — con un token válido", () => {
  beforeEach(() => resolverToken.mockResolvedValue(CTX));

  it("tools/list ofrece las herramientas que abre la capacidad del token como JSON", async () => {
    const r = await POST(pedido(LISTAR));

    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("application/json");
    const cuerpo = (await r.json()) as { result: { tools: { name: string }[] } };
    expect(cuerpo.result.tools.map((t) => t.name).sort()).toEqual(["tareas_de_hoy"]);
  });

  it("tools/call tareas_de_hoy lee con las capacidades del token", async () => {
    tareasDelDia.mockResolvedValue([{ ruleId: "leads", items: [] }]);

    const r = await POST(
      pedido({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "tareas_de_hoy", arguments: {} },
      })
    );

    expect(r.status).toBe(200);
    const cuerpo = (await r.json()) as { result: { content: { text: string }[] } };
    expect(JSON.parse(cuerpo.result.content[0]!.text)).toEqual({
      grupos: [{ ruleId: "leads", items: [] }],
    });
    expect(tareasDelDia).toHaveBeenCalledWith("org_1", ["academico.ver"]);
  });

  it("un rol sin la capacidad de la herramienta no la ve ni la puede llamar", async () => {
    resolverToken.mockResolvedValue({ ...CTX, capacidades: ["cobranza.ver"] });

    const r = await POST(
      pedido({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "tareas_de_hoy", arguments: {} },
      })
    );

    const cuerpo = (await r.json()) as { result?: { isError?: boolean }; error?: unknown };
    expect(cuerpo.result?.isError === true || cuerpo.error !== undefined).toBe(true);
    expect(tareasDelDia).not.toHaveBeenCalled();
  });
});

describe("GET y DELETE /api/mcp", () => {
  it("en modo sin estado no hay flujo SSE ni sesión: 405", async () => {
    for (const metodo of [GET, DELETE]) {
      const r = metodo();
      expect(r.status).toBe(405);
      expect(r.headers.get("allow")).toBe("POST");
    }
  });
});
