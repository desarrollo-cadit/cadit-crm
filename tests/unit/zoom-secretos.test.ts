import { describe, expect, it, vi } from "vitest";

/**
 * 030 (principio I) — El Client Secret de Zoom y el código de acceso de una
 * grabación se guardan cifrados y NUNCA vuelven completos: lo único que sale
 * del servidor son los últimos 4. Se siembra un secreto centinela y se lo
 * busca en todo lo que el módulo devuelve.
 */

vi.mock("@/lib/env", () => ({
  getEnv: () => ({ ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") }),
}));

const SECRETO = "SECRETO-CENTINELA-zx91-1234";

describe("credenciales de la conexión", () => {
  it("sealClientSecret cifra y deja solo los últimos 4; openClientSecret lo recupera", async () => {
    const { sealClientSecret, openClientSecret } = await import("@/server/zoom/connections");
    const sealed = sealClientSecret(SECRETO);
    expect(sealed.last4).toBe("1234");
    expect(sealed.cipher).not.toContain(SECRETO);
    expect(sealed.iv).toBeTruthy();
    expect(sealed.tag).toBeTruthy();
    expect(
      openClientSecret({
        clientSecretCipher: sealed.cipher,
        clientSecretIv: sealed.iv,
        clientSecretTag: sealed.tag,
      })
    ).toBe(SECRETO);
  });

  it("toConnectionDto no lleva el secreto ni columnas cifradas", async () => {
    const { sealClientSecret, toConnectionDto } = await import("@/server/zoom/connections");
    const s = sealClientSecret(SECRETO);
    const dto = toConnectionDto(
      {
        id: "zc_1",
        organizationId: "org_1",
        name: "Zoom academia",
        accountId: "acc-1",
        clientId: "cli-1",
        clientSecretCipher: s.cipher,
        clientSecretIv: s.iv,
        clientSecretTag: s.tag,
        clientSecretLast4: s.last4,
        status: "ok",
        lastError: null,
        lastTestedAt: new Date("2026-10-01T10:00:00Z"),
        lastSyncAt: null,
        syncedThrough: null,
        archivedAt: null,
        createdBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      [{ id: "aula_1", name: "Zoom 1", zoomUserId: "u1", zoomUserEmail: "z1@x" }]
    );
    expect(dto).toEqual({
      id: "zc_1",
      name: "Zoom academia",
      accountId: "acc-1",
      clientId: "cli-1",
      clientSecretLast4: "1234",
      status: "ok",
      lastError: null,
      lastTestedAt: "2026-10-01T10:00:00.000Z",
      archived: false,
      rooms: [{ id: "aula_1", name: "Zoom 1", zoomUserId: "u1", zoomUserEmail: "z1@x" }],
    });
    const json = JSON.stringify(dto);
    expect(json).not.toContain(SECRETO);
    expect(json).not.toContain(s.cipher);
    expect(Object.keys(dto).some((k) => /secret$|cipher|_iv|Iv$|Tag$|_tag/i.test(k))).toBe(false);
  });

  it("un error de descifrado no incluye el texto cifrado", async () => {
    const { sealClientSecret, openClientSecret } = await import("@/server/zoom/connections");
    const s = sealClientSecret(SECRETO);
    const err = (() => {
      try {
        openClientSecret({
          clientSecretCipher: s.cipher,
          clientSecretIv: s.iv,
          clientSecretTag: Buffer.alloc(16).toString("base64"),
        });
      } catch (e) {
        return e as Error;
      }
      return null;
    })();
    expect(err).not.toBeNull();
    expect(err!.message).not.toContain(s.cipher);
    expect(err!.message).not.toContain(SECRETO);
  });
});

describe("código de acceso de la grabación", () => {
  it("sealPasscode / openPasscode ida y vuelta; null queda null", async () => {
    const { sealPasscode, openPasscode } = await import("@/server/zoom/connections");
    const sealed = sealPasscode("abc123");
    expect(sealed.passcodeCipher).not.toContain("abc123");
    expect(openPasscode(sealed)).toBe("abc123");
    expect(sealPasscode(null)).toEqual({ passcodeCipher: null, passcodeIv: null, passcodeTag: null });
    expect(openPasscode({ passcodeCipher: null, passcodeIv: null, passcodeTag: null })).toBeNull();
  });
});

/**
 * 030 US4 (T032) — Las RUTAS de Configuración › Zoom, invocadas con sesión
 * simulada y una base de mentira: ninguna respuesta lleva el secreto ni las
 * columnas cifradas, tampoco cuando Zoom falla en "Probar".
 */
describe("rutas /api/settings/zoom/* — el secreto no sale", () => {
  type Handler = (req: Request, ctx: unknown) => Promise<Response>;

  async function preparar() {
    vi.resetModules();
    // Se sella con el módulo de cifrado directo: importar `connections` acá lo
    // dejaría cacheado con la base REAL antes de los `doMock` de abajo.
    const { encryptSecret } = await import("@/lib/crypto");
    const s = { ...encryptSecret(SECRETO), last4: SECRETO.slice(-4) };
    const fila = {
      id: "zc_1",
      organizationId: "org_1",
      name: "Zoom academia",
      accountId: "acc-1",
      clientId: "cli-1",
      clientSecretCipher: s.cipher,
      clientSecretIv: s.iv,
      clientSecretTag: s.tag,
      clientSecretLast4: s.last4,
      status: "sin_probar",
      lastError: null,
      lastTestedAt: null,
      lastSyncAt: null,
      syncedThrough: null,
      archivedAt: null,
      createdBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Toda lectura devuelve la conexión, salvo las de unicidad (vacías) y las aulas.
    const chain = (rows: unknown[]) => {
      const c: Record<string, unknown> = {};
      for (const m of ["from", "where", "orderBy", "limit", "innerJoin", "leftJoin"]) c[m] = () => c;
      (c as { then: unknown }).then = (r: (v: unknown) => void) => Promise.resolve(rows).then(r);
      return c;
    };
    vi.doMock("@/lib/db", () => ({
      getRootDb: () => ({ transaction: async (fn: (tx: unknown) => unknown) => fn({ execute: async () => [] }) }),
      getDb: () => ({
        select: (cols?: Record<string, unknown>) =>
          chain(cols && "id" in cols && Object.keys(cols).length === 1 ? [] : cols ? [] : [fila]),
        insert: () => ({ values: (v: object) => ({ returning: async () => [{ ...fila, ...v }] }) }),
        update: () => ({
          set: (p: object) => {
            const w = { returning: async () => [{ ...fila, ...p }] };
            return { where: () => Object.assign(Promise.resolve([]), w) };
          },
        }),
      }),
      schema: new Proxy({}, { get: (_t, tb) => new Proxy({}, { get: (_t2, col) => `${String(tb)}.${String(col)}` }) }),
    }));
    vi.doMock("@/lib/auth/session", () => {
      class UnauthorizedError extends Error {}
      return {
        UnauthorizedError,
        requireSession: vi.fn().mockResolvedValue({ userId: "usr_1", organizationId: "org_1", role: "owner" }),
      };
    });
    return { s };
  }

  function sinSecreto(body: unknown, cipher: string) {
    const json = JSON.stringify(body);
    expect(json).not.toContain(SECRETO);
    expect(json).not.toContain(cipher);
    expect(json).not.toMatch(/clientSecret"|_cipher|_iv"|_tag"|Cipher|SecretIv|SecretTag/);
  }

  it("GET y POST", async () => {
    const { s } = await preparar();
    const mod = (await import("@/app/api/settings/zoom/connections/route")) as { GET: Handler; POST: Handler };
    const get = await mod.GET(new Request("http://x/api/settings/zoom/connections"), {});
    expect(get.status).toBe(200);
    const getBody = await get.json();
    expect(getBody.connections[0].clientSecretLast4).toBe("1234");
    sinSecreto(getBody, s.cipher);

    const post = await mod.POST(
      new Request("http://x/api/settings/zoom/connections", {
        method: "POST",
        body: JSON.stringify({ name: "Nueva", accountId: "acc-9", clientId: "c", clientSecret: SECRETO }),
      }),
      {}
    );
    expect(post.status).toBe(201);
    sinSecreto(await post.json(), s.cipher);
  });

  it("PATCH", async () => {
    const { s } = await preparar();
    const mod = (await import("@/app/api/settings/zoom/connections/[id]/route")) as { PATCH: Handler };
    const res = await mod.PATCH(
      new Request("http://x", { method: "PATCH", body: JSON.stringify({ clientSecret: "otro-secreto-0000" }) }),
      { params: Promise.resolve({ id: "zc_1" }) }
    );
    expect(res.status).toBe(200);
    sinSecreto(await res.json(), s.cipher);
  });

  it("POST /test con Zoom fallando no filtra el secreto", async () => {
    const { s } = await preparar();
    vi.doMock("@/lib/zoom", async (orig) => {
      const real = await orig<typeof import("@/lib/zoom")>();
      return {
        ...real,
        listUsers: vi.fn().mockRejectedValue(new real.ZoomError("credenciales_invalidas", "Zoom rechazó las credenciales.")),
      };
    });
    const mod = (await import("@/app/api/settings/zoom/connections/[id]/test/route")) as { POST: Handler };
    const res = await mod.POST(new Request("http://x", { method: "POST" }), {
      params: Promise.resolve({ id: "zc_1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, error: "credenciales_invalidas" });
    sinSecreto(body, s.cipher);
  });
});
