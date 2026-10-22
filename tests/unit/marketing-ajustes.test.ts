import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 045 (T010, contracts/marketing-settings.md) — Lectura de los ajustes de
 * marketing: qué falta para poder enviar, y un DTO en el que la credencial de
 * M365 jamás viaja (constitución I): solo un booleano.
 */

const selectQueue: unknown[][] = [];
const wheres: unknown[] = [];

function thenableChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "innerJoin", "leftJoin", "orderBy", "limit"]) {
    chain[m] = () => chain;
  }
  chain.where = (w: unknown) => {
    wheres.push(w);
    return chain;
  };
  (chain as { then: unknown }).then = (resolve: (v: unknown) => void) =>
    Promise.resolve(rows).then(resolve);
  return chain;
}

vi.mock("@/lib/db", () => ({
  getRootDb: () => ({}),
  getDb: () => ({ select: () => thenableChain(selectQueue.shift() ?? []) }),
  schema: new Proxy(
    {},
    {
      get: (_t, tableName) =>
        new Proxy({}, { get: (_t2, col) => `${String(tableName)}.${String(col)}` }),
    }
  ),
}));

const COMPLETO = {
  senderEmail: "novedades@academia.test",
  senderName: "Academia",
  footerAddress: "Av. Siempre Viva 742, Montevideo",
  footerContact: "hola@academia.test",
  verifiedSender: "novedades@academia.test",
  verifiedAt: new Date("2026-10-20T12:00:00Z"),
  lastTestAt: new Date("2026-10-20T12:00:00Z"),
  lastTestError: null,
};

beforeEach(() => {
  selectQueue.length = 0;
  wheres.length = 0;
});

describe("preparacionParaEnviar", () => {
  it("todo cargado, verificado y con M365 → ok", async () => {
    const { preparacionParaEnviar } = await import("@/server/marketing/settings");
    expect(preparacionParaEnviar(COMPLETO, true)).toEqual({ ok: true, missing: [] });
  });

  it.each(["senderEmail", "senderName", "footerAddress", "footerContact"] as const)(
    "sin %s → falta `buzon`",
    async (campo) => {
      const { preparacionParaEnviar } = await import("@/server/marketing/settings");
      const r = preparacionParaEnviar({ ...COMPLETO, [campo]: null }, true);
      expect(r.ok).toBe(false);
      expect(r.missing).toContain("buzon");
    }
  );

  it("un buzón distinto del verificado → `buzon_sin_verificar`", async () => {
    const { preparacionParaEnviar } = await import("@/server/marketing/settings");
    const r = preparacionParaEnviar({ ...COMPLETO, verifiedSender: "otro@academia.test" }, true);
    expect(r).toEqual({ ok: false, missing: ["buzon_sin_verificar"] });
    const nunca = preparacionParaEnviar({ ...COMPLETO, verifiedSender: null }, true);
    expect(nunca.missing).toEqual(["buzon_sin_verificar"]);
  });

  it("sin M365 → `m365`", async () => {
    const { preparacionParaEnviar } = await import("@/server/marketing/settings");
    expect(preparacionParaEnviar(COMPLETO, false)).toEqual({ ok: false, missing: ["m365"] });
  });

  it("nada configurado: un buzón ausente no cuenta como verificado", async () => {
    const { preparacionParaEnviar, AJUSTES_VACIOS } = await import("@/server/marketing/settings");
    const r = preparacionParaEnviar(AJUSTES_VACIOS, false);
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(["buzon", "m365"]);
  });
});

describe("toMarketingSettingsDto", () => {
  it("la credencial no viaja: solo `m365Configured`", async () => {
    const { toMarketingSettingsDto } = await import("@/server/marketing/settings");
    const dto = toMarketingSettingsDto(COMPLETO, {
      m365Configured: true,
      operationalSender: "cursos@academia.test",
    });
    expect(Object.keys(dto).sort()).toEqual(
      [
        "senderEmail",
        "senderName",
        "footerAddress",
        "footerContact",
        "verified",
        "verifiedAt",
        "lastTestAt",
        "lastTestError",
        "m365Configured",
        "operationalSender",
        "ready",
      ].sort()
    );
    const texto = JSON.stringify(dto).toLowerCase();
    expect(texto).not.toContain("secret");
    expect(texto).not.toContain("clientid");
    expect(texto).not.toContain("tenant");
  });

  it("calcula `verified` y `ready`", async () => {
    const { toMarketingSettingsDto } = await import("@/server/marketing/settings");
    const listo = toMarketingSettingsDto(COMPLETO, { m365Configured: true, operationalSender: null });
    expect(listo.verified).toBe(true);
    expect(listo.ready).toBe(true);
    expect(listo.verifiedAt).toBe("2026-10-20T12:00:00.000Z");

    const sinVerificar = toMarketingSettingsDto(
      { ...COMPLETO, verifiedSender: "viejo@academia.test" },
      { m365Configured: true, operationalSender: null }
    );
    expect(sinVerificar.verified).toBe(false);
    expect(sinVerificar.ready).toBe(false);

    const sinM365 = toMarketingSettingsDto(COMPLETO, { m365Configured: false, operationalSender: null });
    expect(sinM365.verified).toBe(true);
    expect(sinM365.ready).toBe(false);
  });
});

describe("getMarketingSettings", () => {
  it("sin fila → todo null", async () => {
    selectQueue.push([]);
    const { getMarketingSettings } = await import("@/server/marketing/settings");
    const s = await getMarketingSettings("org_1");
    expect(s).toEqual({
      senderEmail: null,
      senderName: null,
      footerAddress: null,
      footerContact: null,
      verifiedSender: null,
      verifiedAt: null,
      lastTestAt: null,
      lastTestError: null,
    });
    expect(wheres).toHaveLength(1);
  });

  it("con fila → la devuelve", async () => {
    selectQueue.push([COMPLETO]);
    const { getMarketingSettings } = await import("@/server/marketing/settings");
    expect(await getMarketingSettings("org_1")).toEqual(COMPLETO);
  });
});
