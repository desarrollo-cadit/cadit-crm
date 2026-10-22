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

const inserts: Record<string, unknown>[] = [];
const updates: Record<string, unknown>[] = [];

vi.mock("@/lib/db", () => {
  const db = {
    select: () => thenableChain(selectQueue.shift() ?? []),
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        inserts.push(v);
        return Promise.resolve([]);
      },
    }),
    update: () => ({
      set: (s: Record<string, unknown>) => {
        updates.push(s);
        return { where: () => Promise.resolve([]) };
      },
    }),
  };
  return {
    getRootDb: () => db,
    getDb: () => db,
    schema: new Proxy(
      {},
      {
        get: (_t, tableName) =>
          new Proxy({}, { get: (_t2, col) => `${String(tableName)}.${String(col)}` }),
      }
    ),
  };
});

// 045 (T090) — La escritura y la prueba del buzón: entorno, M365 y Graph dobles.
let m365 = true;
let resultadoGraph: Record<string, unknown> = { ok: true };
const enviados: Record<string, unknown>[] = [];
vi.mock("@/lib/env", () => ({ getEnv: () => ({ M365_SENDER: "Cursos@Academia.test" }) }));
vi.mock("@/lib/m365/client", () => ({ getM365Config: () => (m365 ? { sender: "cursos@academia.test" } : null) }));
vi.mock("@/server/marketing/send", () => ({
  enviarCorreoDeMarketing: async (input: Record<string, unknown>) => {
    enviados.push(input);
    return resultadoGraph;
  },
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

beforeEach(async () => {
  selectQueue.length = 0;
  wheres.length = 0;
  inserts.length = 0;
  updates.length = 0;
  enviados.length = 0;
  m365 = true;
  resultadoGraph = { ok: true };
  const { resetRateLimit } = await import("@/lib/rate-limit");
  resetRateLimit();
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

/* ============================================================
 * 045 (T090; FR-016; US5-1, US5-2) — Guardar y probar el buzón
 * ============================================================ */

const sesion = { organizationId: "org_1", userId: "usr_dir" };
const ENTRADA = {
  senderEmail: "  Novedades@Academia.test ",
  senderName: "Academia",
  footerAddress: "Av. Siempre Viva 742",
  footerContact: "hola@academia.test",
};

describe("guardarAjustes", () => {
  it("primera vez: inserta la fila de la organización con el buzón normalizado", async () => {
    selectQueue.push([], [], [{ ...COMPLETO, verifiedSender: null }]);
    const { guardarAjustes } = await import("@/server/marketing/settings");
    const r = await guardarAjustes(sesion, ENTRADA);
    expect(r.ok).toBe(true);
    expect(inserts[0]).toMatchObject({
      organizationId: "org_1",
      senderEmail: "novedades@academia.test",
      senderName: "Academia",
      updatedBy: "usr_dir",
    });
  });

  it("un buzón igual al operativo (comparado normalizado) → `buzon_no_separado`", async () => {
    const { guardarAjustes } = await import("@/server/marketing/settings");
    const r = await guardarAjustes(sesion, { ...ENTRADA, senderEmail: "cursos@academia.TEST" });
    expect(r).toMatchObject({ ok: false, code: "buzon_no_separado" });
    expect(r.ok === false && r.message).toContain("cursos@academia.test");
    expect(inserts).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it("cambiar el buzón borra la verificación en el mismo UPDATE", async () => {
    selectQueue.push([{ id: "mks_1", senderEmail: "viejo@academia.test" }], [], [COMPLETO]);
    const { guardarAjustes } = await import("@/server/marketing/settings");
    await guardarAjustes(sesion, ENTRADA);
    expect(updates[0]).toMatchObject({ senderEmail: "novedades@academia.test", verifiedSender: null, verifiedAt: null });
  });

  it("el mismo buzón conserva la verificación", async () => {
    selectQueue.push([{ id: "mks_1", senderEmail: "novedades@academia.test" }], [COMPLETO]);
    const { guardarAjustes } = await import("@/server/marketing/settings");
    await guardarAjustes(sesion, ENTRADA);
    expect(Object.keys(updates[0]!)).not.toContain("verifiedSender");
  });

  it("cambiar el buzón con una campaña enviándose → `campana_enviando`", async () => {
    selectQueue.push([{ id: "mks_1", senderEmail: "viejo@academia.test" }], [{ id: "mkc_1" }]);
    const { guardarAjustes } = await import("@/server/marketing/settings");
    expect(await guardarAjustes(sesion, ENTRADA)).toMatchObject({ ok: false, code: "campana_enviando" });
    expect(updates).toHaveLength(0);
  });
});

describe("probarBuzon", () => {
  it("sin buzón → `sin_buzon`; sin M365 → `m365_no_configurado`", async () => {
    const { probarBuzon } = await import("@/server/marketing/settings");
    selectQueue.push([]);
    expect(await probarBuzon(sesion)).toMatchObject({ ok: false, code: "sin_buzon" });
    m365 = false;
    selectQueue.push([COMPLETO]);
    expect(await probarBuzon(sesion)).toMatchObject({ ok: false, code: "m365_no_configurado" });
    expect(enviados).toHaveLength(0);
  });

  it("202 → manda DESDE el buzón A quien prueba, y verifica", async () => {
    selectQueue.push([COMPLETO], [{ email: "dir@academia.test" }]);
    const { probarBuzon } = await import("@/server/marketing/settings");
    expect(await probarBuzon(sesion)).toEqual({ ok: true, sentTo: "dir@academia.test" });
    expect(enviados[0]).toMatchObject({
      sender: "novedades@academia.test",
      to: "dir@academia.test",
      subject: "Prueba del buzón de marketing",
    });
    expect(updates[0]).toMatchObject({ verifiedSender: "novedades@academia.test", lastTestError: null });
    expect(updates[0]!.verifiedAt).toBeInstanceOf(Date);
  });

  it.each([
    [{ ok: false, code: "mailbox_denied", message: "403" }, "ApplicationAccessPolicy"],
    [{ ok: false, code: "mailbox_not_found", message: "404" }, "Ese buzón no existe en Microsoft 365."],
    [{ ok: false, code: "send_failed", message: "Mensaje de Graph" }, "Mensaje de Graph"],
  ])("un fallo (%o) se explica, se guarda y NO lanza", async (resultado, texto) => {
    resultadoGraph = resultado;
    selectQueue.push([COMPLETO], [{ email: "dir@academia.test" }]);
    const { probarBuzon } = await import("@/server/marketing/settings");
    const r = await probarBuzon(sesion);
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toContain(texto);
    expect(updates[0]).toMatchObject({ lastTestError: expect.stringContaining(texto) });
    expect(Object.keys(updates[0]!)).not.toContain("verifiedSender");
  });

  it("5 pruebas cada 10 minutos; la 6.ª → `too_many_requests`", async () => {
    const { probarBuzon } = await import("@/server/marketing/settings");
    for (let i = 0; i < 5; i++) {
      selectQueue.push([COMPLETO], [{ email: "dir@academia.test" }]);
      expect((await probarBuzon(sesion)).ok).toBe(true);
    }
    expect(await probarBuzon(sesion)).toMatchObject({ ok: false, code: "too_many_requests" });
  });
});
