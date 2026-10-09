import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 030 (contrato zoom-adapter.md) — El cliente S2S de Zoom con `fetch` y reloj
 * inyectados: NUNCA sale a la red. Lo que se fija acá es lo que no se ve en
 * la pantalla hasta que pasa en producción: el token cacheado, la política de
 * reintentos, los tramos de ≤ 30 días y que ningún error filtre un secreto.
 */

const env: Record<string, string | undefined> = {};
vi.mock("@/lib/env", () => ({ getEnv: () => ({ ...env }) }));

const SECRETO = "SECRETO-CENTINELA-9f8e7d";
const TOKEN = "TOKEN-CENTINELA-1a2b3c";
const creds = {
  connectionId: "zc_1",
  accountId: "acc-1",
  clientId: "cli-1",
  clientSecret: SECRETO,
};

type Call = { url: string; init: RequestInit; at: number };
let calls: Call[] = [];
let clock = 1_000_000;
let sleeps: number[] = [];

/** Respuestas de la API (no del token) en orden; el token siempre sale bien salvo override. */
let apiQueue: (() => Response)[] = [];
let tokenResponder: () => Response = () =>
  Response.json({ access_token: TOKEN, token_type: "bearer", expires_in: 3600 });

const fakeFetch = vi.fn(async (url: string, init: RequestInit = {}) => {
  calls.push({ url, init, at: clock });
  if (url.includes("/oauth/token")) return tokenResponder();
  const next = apiQueue.shift();
  if (!next) {
    return url.includes("/recordings")
      ? Response.json({ meetings: [], next_page_token: "" })
      : Response.json({ users: [], next_page_token: "" });
  }
  return next();
});

async function client() {
  const mod = await import("@/lib/zoom/client");
  mod.resetZoomClient();
  mod.configureZoomClient({
    fetch: fakeFetch as unknown as typeof fetch,
    now: () => clock,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      clock += ms;
    },
    random: () => 0,
  });
  return mod;
}

const apiCalls = () => calls.filter((c) => !c.url.includes("/oauth/token"));
const tokenCalls = () => calls.filter((c) => c.url.includes("/oauth/token"));

beforeEach(() => {
  calls = [];
  sleeps = [];
  apiQueue = [];
  clock = 1_000_000;
  fakeFetch.mockClear();
  tokenResponder = () =>
    Response.json({ access_token: TOKEN, token_type: "bearer", expires_in: 3600 });
  for (const k of Object.keys(env)) delete env[k];
});

describe("token Server-to-Server", () => {
  it("POST a {OAUTH_BASE}/oauth/token con account_credentials y Basic auth", async () => {
    const { getAccessToken } = await client();
    const t = await getAccessToken(creds);
    expect(t).toBe(TOKEN);
    const [call] = tokenCalls();
    expect(call!.url).toBe(
      "https://zoom.us/oauth/token?grant_type=account_credentials&account_id=acc-1"
    );
    expect(call!.init.method).toBe("POST");
    const auth = new Headers(call!.init.headers).get("authorization");
    expect(auth).toBe(`Basic ${Buffer.from(`cli-1:${SECRETO}`).toString("base64")}`);
  });

  it("cachea por conexión hasta expires_in − 60 s y renueva al vencer", async () => {
    const { getAccessToken } = await client();
    await getAccessToken(creds);
    clock += (3600 - 61) * 1000;
    await getAccessToken(creds);
    expect(tokenCalls()).toHaveLength(1);
    clock += 2000;
    await getAccessToken(creds);
    expect(tokenCalls()).toHaveLength(2);
    // otra conexión, otro token
    await getAccessToken({ ...creds, connectionId: "zc_2" });
    expect(tokenCalls()).toHaveLength(3);
  });

  it("forgetToken invalida el caché", async () => {
    const { getAccessToken, forgetToken } = await client();
    await getAccessToken(creds);
    forgetToken("zc_1");
    await getAccessToken(creds);
    expect(tokenCalls()).toHaveLength(2);
  });

  it("credenciales rechazadas → credenciales_invalidas sin filtrar el secreto", async () => {
    tokenResponder = () =>
      Response.json(
        { reason: `Invalid client_id or client_secret ${SECRETO}`, error: "invalid_client" },
        { status: 400 }
      );
    const { getAccessToken } = await client();
    const err = await getAccessToken(creds).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "credenciales_invalidas" });
    expect(String((err as Error).message)).not.toContain(SECRETO);
  });

  it("bases desde ZOOM_API_BASE_URL / ZOOM_OAUTH_BASE_URL", async () => {
    env.ZOOM_API_BASE_URL = "http://localhost:3005/api/dev/zoom-mock/v2/";
    env.ZOOM_OAUTH_BASE_URL = "http://localhost:3005/api/dev/zoom-mock";
    apiQueue.push(() => Response.json({ users: [], next_page_token: "" }));
    const { listUsers } = await client();
    await listUsers(creds);
    expect(tokenCalls()[0]!.url.startsWith("http://localhost:3005/api/dev/zoom-mock/oauth/token?")).toBe(true);
    expect(apiCalls()[0]!.url.startsWith("http://localhost:3005/api/dev/zoom-mock/v2/users?")).toBe(true);
  });
});

describe("política de reintentos", () => {
  it("401 → forgetToken + UN reintento con token nuevo", async () => {
    apiQueue.push(() => new Response("{}", { status: 401 }));
    apiQueue.push(() => Response.json({ users: [], next_page_token: "" }));
    const { listUsers } = await client();
    await expect(listUsers(creds)).resolves.toEqual([]);
    expect(tokenCalls()).toHaveLength(2);
  });

  it("401 persistente → credenciales_invalidas", async () => {
    apiQueue.push(() => new Response("{}", { status: 401 }));
    apiQueue.push(() => new Response("{}", { status: 401 }));
    const { listUsers } = await client();
    await expect(listUsers(creds)).rejects.toMatchObject({ code: "credenciales_invalidas" });
  });

  it("429 respeta Retry-After y se recupera", async () => {
    apiQueue.push(() => new Response("{}", { status: 429, headers: { "retry-after": "2" } }));
    apiQueue.push(() => Response.json({ users: [], next_page_token: "" }));
    const { listUsers } = await client();
    await expect(listUsers(creds)).resolves.toEqual([]);
    expect(sleeps).toContain(2000);
  });

  it("429 agota en 3 intentos → limite_de_tasa", async () => {
    for (let i = 0; i < 3; i++) apiQueue.push(() => new Response("{}", { status: 429 }));
    const { listUsers } = await client();
    await expect(listUsers(creds)).rejects.toMatchObject({ code: "limite_de_tasa" });
    expect(apiCalls()).toHaveLength(3);
  });

  it("5xx y error de red con backoff; máx. 3 → zoom_caido", async () => {
    apiQueue.push(() => new Response("{}", { status: 500 }));
    apiQueue.push(() => {
      throw new TypeError("fetch failed");
    });
    apiQueue.push(() => new Response("{}", { status: 503 }));
    const { listUsers } = await client();
    await expect(listUsers(creds)).rejects.toMatchObject({ code: "zoom_caido" });
    expect(apiCalls()).toHaveLength(3);
    // backoff exponencial: 1 s, 2 s (+ jitter 0)
    expect(sleeps.filter((s) => s >= 1000)).toEqual([1000, 2000]);
  });

  it.each([
    [403, "sin_permiso"],
    [404, "usuario_inexistente"],
    [400, "respuesta_invalida"],
  ])("%i → %s sin reintento", async (status, code) => {
    apiQueue.push(() => new Response("{}", { status }));
    const { listUsers } = await client();
    await expect(listUsers(creds)).rejects.toMatchObject({ code });
    expect(apiCalls()).toHaveLength(1);
  });

  it("JSON que no valida → respuesta_invalida", async () => {
    apiQueue.push(() => Response.json({ users: "no-es-una-lista" }));
    const { listUsers } = await client();
    await expect(listUsers(creds)).rejects.toMatchObject({ code: "respuesta_invalida" });
  });

  it("espaciado ≥ 200 ms entre pedidos de la misma conexión", async () => {
    apiQueue.push(() =>
      Response.json({ users: [{ id: "u1", email: "a@x", type: 1, status: "active" }], next_page_token: "t2" })
    );
    apiQueue.push(() =>
      Response.json({ users: [{ id: "u2", email: "b@x", type: 1, status: "active" }], next_page_token: "" })
    );
    const { listUsers } = await client();
    await listUsers(creds);
    const [a, b] = apiCalls();
    expect(b!.at - a!.at).toBeGreaterThanOrEqual(200);
  });

  it("ningún ZoomError contiene el secreto, el token ni el header Authorization", async () => {
    const { listUsers } = await client();
    const mensajes: string[] = [];
    for (const status of [401, 403, 404, 400, 429, 500]) {
      apiQueue = [];
      for (let i = 0; i < 3; i++)
        apiQueue.push(
          () =>
            new Response(JSON.stringify({ message: `eco ${SECRETO} ${TOKEN}` }), { status })
        );
      const err = (await listUsers(creds).catch((e: unknown) => e)) as Error;
      mensajes.push(err.message);
    }
    for (const m of mensajes) {
      expect(m).not.toContain(SECRETO);
      expect(m).not.toContain(TOKEN);
      expect(m.toLowerCase()).not.toContain("authorization");
      expect(m.toLowerCase()).not.toContain("bearer");
    }
  });
});

describe("listUsers / listUserRecordings", () => {
  it("listUsers pagina con status=active&page_size=300", async () => {
    apiQueue.push(() =>
      Response.json({
        users: [{ id: "u1", email: "a@x", first_name: "Ana", last_name: "Paz", type: 2, status: "active" }],
        next_page_token: "tok2",
      })
    );
    apiQueue.push(() =>
      Response.json({
        users: [{ id: "u2", email: "b@x", display_name: "Beto", type: 1, status: "active" }],
        next_page_token: "",
      })
    );
    const { listUsers } = await client();
    const users = await listUsers(creds);
    expect(users).toEqual([
      { id: "u1", email: "a@x", displayName: "Ana Paz", type: 2, status: "active" },
      { id: "u2", email: "b@x", displayName: "Beto", type: 1, status: "active" },
    ]);
    const [p1, p2] = apiCalls().map((c) => new URL(c.url));
    expect(p1!.pathname).toBe("/v2/users");
    expect(p1!.searchParams.get("status")).toBe("active");
    expect(p1!.searchParams.get("page_size")).toBe("300");
    expect(p1!.searchParams.has("next_page_token")).toBe(false);
    expect(p2!.searchParams.get("next_page_token")).toBe("tok2");
    expect(new Headers(apiCalls()[0]!.init.headers).get("authorization")).toBe(`Bearer ${TOKEN}`);
  });

  it("listUserRecordings parte 90 días en tramos ≤ 30 días y entrega una página por iteración", async () => {
    const meeting = (uuid: string) => ({
      uuid,
      id: 9990000001,
      host_id: "u1",
      host_email: "zoom1@x",
      topic: "Revit",
      start_time: "2026-09-01T21:34:00Z",
      duration: 120,
      total_size: 1000,
      recording_count: 2,
      share_url: "https://zoom.us/rec/share/AAA",
      recording_play_passcode: "abc",
      password: "123",
      auto_delete_date: "2026-12-01",
      recording_files: [],
    });
    // tramo 1: dos páginas; el resto vacíos
    apiQueue.push(() => Response.json({ meetings: [meeting("a")], next_page_token: "p2" }));
    apiQueue.push(() => Response.json({ meetings: [meeting("b")], next_page_token: "" }));
    const { listUserRecordings } = await client();
    const paginas: string[][] = [];
    for await (const page of listUserRecordings(creds, "u1", { from: "2026-07-01", to: "2026-09-28" })) {
      paginas.push(page.map((m) => m.uuid));
    }
    expect(paginas.filter((p) => p.length > 0)).toEqual([["a"], ["b"]]);

    const urls = apiCalls().map((c) => new URL(c.url));
    expect(urls.every((u) => u.pathname === "/v2/users/u1/recordings")).toBe(true);
    expect(urls.every((u) => u.searchParams.get("trash") === "false")).toBe(true);
    const tramos = [
      ...new Map(urls.map((u) => [u.searchParams.get("from"), u.searchParams.get("to")])).entries(),
    ];
    expect(tramos[0]).toEqual(["2026-07-01", "2026-07-30"]);
    expect(tramos.at(-1)![1]).toBe("2026-09-28");
    for (const [f, t] of tramos) {
      const dias = (Date.parse(`${t}T00:00:00Z`) - Date.parse(`${f}T00:00:00Z`)) / 86_400_000 + 1;
      expect(dias).toBeLessThanOrEqual(30);
    }
    // contiguos, sin huecos ni solapes
    for (let i = 1; i < tramos.length; i++) {
      const prevTo = Date.parse(`${tramos[i - 1]![1]}T00:00:00Z`);
      expect(Date.parse(`${tramos[i]![0]}T00:00:00Z`) - prevTo).toBe(86_400_000);
    }
    expect(urls[1]!.searchParams.get("next_page_token")).toBe("p2");
  });

  it("mapea la reunión a tipos propios", async () => {
    apiQueue.push(() =>
      Response.json({
        meetings: [
          {
            uuid: "uu/1==",
            id: 2220000002,
            host_id: "u2",
            topic: null,
            start_time: "2026-09-02T21:32:00Z",
            duration: 90,
            share_url: "https://zoom.us/rec/share/B",
            recording_play_passcode: "abc123",
          },
        ],
        next_page_token: "",
      })
    );
    const { listUserRecordings } = await client();
    const it = listUserRecordings(creds, "u2", { from: "2026-09-01", to: "2026-09-03" });
    const first = await it.next();
    expect(first.value).toEqual([
      {
        uuid: "uu/1==",
        meetingId: "2220000002",
        hostId: "u2",
        hostEmail: null,
        topic: null,
        startTime: new Date("2026-09-02T21:32:00Z"),
        durationMin: 90,
        totalSizeBytes: null,
        fileCount: null,
        shareUrl: "https://zoom.us/rec/share/B",
        playPasscode: "abc123",
        password: null,
        autoDeleteDate: null,
      },
    ]);
  });
});
