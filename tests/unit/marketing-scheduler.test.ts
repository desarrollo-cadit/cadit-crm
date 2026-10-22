import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MarketingSchedulerDeps } from "@/server/marketing/runner";

/**
 * 045 (T061, DV-003; US3-5) — Retomar campañas al arrancar y en la periódica.
 *
 * Con temporizadores simulados y dependencias inyectadas: qué se retoma lo
 * decide la base (`aRetomar`: `enviando` con el lease vencido o suelto y sin
 * pausa vigente — incluye las detenidas por el buzón sin permiso); que dos
 * procesos no se pisen lo decide el lease de `runCampaign`.
 */

vi.mock("@/lib/db", () => ({ getDb: () => ({}), getRootDb: () => ({}), schema: {} }));

let pendientes: { organizationId: string; campaignId: string }[];
let corridas: string[];
let logs: string[];

const deps = (over: Partial<MarketingSchedulerDeps> = {}): MarketingSchedulerDeps => ({
  env: { NEXT_RUNTIME: "nodejs" },
  tickSec: 60,
  aRetomar: async () => pendientes,
  run: async (_org, id) => {
    corridas.push(id);
  },
  log: (m) => logs.push(m),
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers();
  pendientes = [{ organizationId: "org_1", campaignId: "mkc_1" }];
  corridas = [];
  logs = [];
});

afterEach(async () => {
  const { stopMarketingScheduler } = await import("@/server/marketing/runner");
  stopMarketingScheduler();
  vi.useRealTimers();
});

describe("startMarketingOnBoot", () => {
  it("no arranca en tests ni en `next build`", async () => {
    const { startMarketingOnBoot } = await import("@/server/marketing/runner");
    expect(await startMarketingOnBoot(deps({ env: { VITEST: "true" } }))).toBe(false);
    expect(await startMarketingOnBoot(deps({ env: { NEXT_PHASE: "phase-production-build" } }))).toBe(false);
    expect(corridas).toEqual([]);
  });

  it("al arrancar retoma toda campaña `enviando` con lease vencido", async () => {
    pendientes = [
      { organizationId: "org_1", campaignId: "mkc_1" },
      { organizationId: "org_1", campaignId: "mkc_2" },
    ];
    const { startMarketingOnBoot } = await import("@/server/marketing/runner");
    expect(await startMarketingOnBoot(deps({ tickSec: 0 }))).toBe(true);
    await vi.runAllTimersAsync();
    expect(corridas).toEqual(["mkc_1", "mkc_2"]);
  });

  it("con `MARKETING_TICK_SEC = 0` solo corre al arrancar", async () => {
    const { startMarketingOnBoot } = await import("@/server/marketing/runner");
    await startMarketingOnBoot(deps({ tickSec: 0 }));
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(corridas).toEqual(["mkc_1"]);
  });

  it("la periódica vuelve a preguntar cada tick (pausas cumplidas, buzón que recuperó el permiso)", async () => {
    const { startMarketingOnBoot } = await import("@/server/marketing/runner");
    await startMarketingOnBoot(deps({ tickSec: 60 }));
    await vi.advanceTimersByTimeAsync(0);
    pendientes = [{ organizationId: "org_1", campaignId: "mkc_pausada" }];
    await vi.advanceTimersByTimeAsync(60_000);
    expect(corridas).toEqual(["mkc_1", "mkc_pausada"]);
  });

  it("un error no tumba el arranque ni la periódica", async () => {
    const { startMarketingOnBoot } = await import("@/server/marketing/runner");
    let primera = true;
    const ok = await startMarketingOnBoot(
      deps({
        aRetomar: async () => {
          if (primera) {
            primera = false;
            throw new Error("la base no está lista");
          }
          return pendientes;
        },
      })
    );
    expect(ok).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(corridas).toEqual(["mkc_1"]);
    expect(logs.some((l) => l.includes("[marketing]"))).toBe(true);
  });
});
