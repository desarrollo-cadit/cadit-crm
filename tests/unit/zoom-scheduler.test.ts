import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SchedulerDeps } from "@/server/zoom/scheduler";

/**
 * 030 US5 (DV-004) — La sincronización periódica.
 *
 * Con temporizadores simulados y dependencias inyectadas: lo que se fija es
 * la DECISIÓN — cuándo arranca, a quién sincroniza, que un tick que falla no
 * detiene los siguientes, que dos ticks del mismo proceso no se pisan y que
 * jamás arranca en los tests ni durante el `next build`. Que dos PROCESOS no
 * se pisen lo garantiza el lease (`zoom-sync.test.ts`): el tick llama a
 * `runSync`, que lo toma o se va.
 */

vi.mock("@/lib/env", () => ({ getEnv: () => ({ ZOOM_SYNC_INTERVAL_MIN: 0 }) }));

const MIN = 60_000;

let due: string[];
let ran: string[];
let logs: string[];
let runImpl: (orgId: string) => Promise<unknown>;

const deps = (over: Partial<SchedulerDeps> = {}): SchedulerDeps => ({
  intervalMin: 60,
  bootDelayMs: 30_000,
  dueOrganizations: async () => due,
  runOrg: (orgId) => {
    ran.push(orgId);
    return runImpl(orgId);
  },
  log: (m) => logs.push(m),
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers();
  due = ["org_1"];
  ran = [];
  logs = [];
  runImpl = async () => ({ ok: true });
});

afterEach(async () => {
  const { stopZoomScheduler } = await import("@/server/zoom/scheduler");
  stopZoomScheduler();
  vi.useRealTimers();
});

describe("cuándo arranca", () => {
  it("ZOOM_SYNC_INTERVAL_MIN=0 → no arranca ni agenda nada", async () => {
    const { startZoomScheduler } = await import("@/server/zoom/scheduler");
    expect(startZoomScheduler(deps({ intervalMin: 0 }))).toBe(false);
    await vi.advanceTimersByTimeAsync(10 * 60 * MIN);
    expect(ran).toEqual([]);
  });

  it("nunca en los tests ni durante el build de producción", async () => {
    const { shouldStartScheduler } = await import("@/server/zoom/scheduler");
    expect(shouldStartScheduler({ NEXT_RUNTIME: "nodejs" })).toBe(true);
    expect(shouldStartScheduler({ NEXT_RUNTIME: "nodejs", VITEST: "true" })).toBe(false);
    expect(shouldStartScheduler({ NEXT_RUNTIME: "nodejs", NODE_ENV: "test" })).toBe(false);
    expect(
      shouldStartScheduler({ NEXT_RUNTIME: "nodejs", NEXT_PHASE: "phase-production-build" })
    ).toBe(false);
    expect(shouldStartScheduler({ NEXT_RUNTIME: "edge" })).toBe(false);
  });

  it("arrancar dos veces no duplica el temporizador", async () => {
    const { startZoomScheduler } = await import("@/server/zoom/scheduler");
    expect(startZoomScheduler(deps())).toBe(true);
    expect(startZoomScheduler(deps())).toBe(false);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(ran).toEqual(["org_1"]);
  });

  it("los temporizadores quedan unref(): no retienen el proceso al apagarse", async () => {
    const unrefs: string[] = [];
    const realSetTimeout = globalThis.setTimeout;
    const realSetInterval = globalThis.setInterval;
    const spyT = vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void, ms?: number) => {
      const h = realSetTimeout(fn, ms);
      const orig = h.unref.bind(h);
      h.unref = () => {
        unrefs.push("timeout");
        return orig();
      };
      return h;
    }) as typeof setTimeout);
    const spyI = vi.spyOn(globalThis, "setInterval").mockImplementation(((fn: () => void, ms?: number) => {
      const h = realSetInterval(fn, ms);
      const orig = h.unref.bind(h);
      h.unref = () => {
        unrefs.push("interval");
        return orig();
      };
      return h;
    }) as typeof setInterval);
    const { startZoomScheduler } = await import("@/server/zoom/scheduler");
    startZoomScheduler(deps());
    spyT.mockRestore();
    spyI.mockRestore();
    expect(unrefs.sort()).toEqual(["interval", "timeout"]);
  });
});

describe("el tick", () => {
  it("primera pasada poco después del arranque (recupera lo que pasó con el servidor apagado), después cada intervalo", async () => {
    const { startZoomScheduler, tickEveryMs } = await import("@/server/zoom/scheduler");
    startZoomScheduler(deps());
    await vi.advanceTimersByTimeAsync(29_999);
    expect(ran).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(ran).toEqual(["org_1"]);
    await vi.advanceTimersByTimeAsync(tickEveryMs(60));
    expect(ran).toEqual(["org_1", "org_1"]);
  });

  it("revisa cada min(intervalo, 5 min): quién está vencido lo decide la base, no la memoria del proceso", async () => {
    const { tickEveryMs } = await import("@/server/zoom/scheduler");
    expect(tickEveryMs(1)).toBe(1 * MIN);
    expect(tickEveryMs(60)).toBe(5 * MIN);
  });

  it("sincroniza cada organización vencida, con el intervalo", async () => {
    due = ["org_1", "org_2"];
    const pedidos: number[] = [];
    const { startZoomScheduler } = await import("@/server/zoom/scheduler");
    startZoomScheduler(
      deps({
        dueOrganizations: async (intervalMin) => {
          pedidos.push(intervalMin);
          return due;
        },
      })
    );
    await vi.advanceTimersByTimeAsync(30_000);
    expect(ran).toEqual(["org_1", "org_2"]);
    expect(pedidos).toEqual([60]);
  });

  it("sin organizaciones vencidas no llama a runSync", async () => {
    due = [];
    const { startZoomScheduler } = await import("@/server/zoom/scheduler");
    startZoomScheduler(deps());
    await vi.advanceTimersByTimeAsync(30_000);
    expect(ran).toEqual([]);
  });

  it("una organización que falla no frena a las otras ni a los ticks siguientes", async () => {
    due = ["org_1", "org_2"];
    runImpl = async (org) => {
      if (org === "org_1") throw new Error("la base se cayó");
      return { ok: true };
    };
    const { startZoomScheduler, tickEveryMs } = await import("@/server/zoom/scheduler");
    startZoomScheduler(deps());
    await vi.advanceTimersByTimeAsync(30_000);
    expect(ran).toEqual(["org_1", "org_2"]);
    await vi.advanceTimersByTimeAsync(tickEveryMs(60));
    expect(ran).toEqual(["org_1", "org_2", "org_1", "org_2"]);
    expect(logs.some((l) => l.includes("org_1"))).toBe(true);
  });

  it("si leer las vencidas falla, el tick no lanza y el siguiente vuelve a intentar", async () => {
    let falla = true;
    const { startZoomScheduler, tickEveryMs } = await import("@/server/zoom/scheduler");
    startZoomScheduler(
      deps({
        dueOrganizations: async () => {
          if (falla) throw new Error("ECONNREFUSED");
          return ["org_1"];
        },
      })
    );
    await vi.advanceTimersByTimeAsync(30_000);
    expect(ran).toEqual([]);
    falla = false;
    await vi.advanceTimersByTimeAsync(tickEveryMs(60));
    expect(ran).toEqual(["org_1"]);
  });

  it("lease ocupado (corrida manual u otro proceso) → se salta sin error", async () => {
    runImpl = async () => ({ ok: false, error: "sync_en_curso", startedAt: new Date() });
    const { startZoomScheduler } = await import("@/server/zoom/scheduler");
    startZoomScheduler(deps());
    await vi.advanceTimersByTimeAsync(30_000);
    expect(ran).toEqual(["org_1"]);
    expect(logs.join("\n")).toMatch(/sync_en_curso/);
  });

  it("un tick que todavía corre no se solapa con el siguiente del mismo proceso", async () => {
    let soltar: () => void = () => undefined;
    runImpl = () => new Promise((r) => (soltar = () => r({ ok: true })));
    const { startZoomScheduler, tickEveryMs } = await import("@/server/zoom/scheduler");
    startZoomScheduler(deps({ intervalMin: 1 }));
    await vi.advanceTimersByTimeAsync(30_000);
    await vi.advanceTimersByTimeAsync(tickEveryMs(1) * 3);
    expect(ran).toEqual(["org_1"]);
    soltar();
    await vi.advanceTimersByTimeAsync(tickEveryMs(1));
    expect(ran).toEqual(["org_1", "org_1"]);
  });

  it("los logs no llevan secretos: solo organización y resultado", async () => {
    runImpl = async () => ({ ok: true, plan: { owner: "x", runs: [] } });
    const { startZoomScheduler } = await import("@/server/zoom/scheduler");
    startZoomScheduler(deps());
    await vi.advanceTimersByTimeAsync(30_000);
    expect(logs.join("\n")).not.toMatch(/secret|token|authorization|password/i);
  });
});
