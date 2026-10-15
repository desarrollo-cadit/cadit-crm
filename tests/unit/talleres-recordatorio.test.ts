import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  startWorkshopReminderScheduler,
  stopWorkshopReminderScheduler,
  type ReminderSchedulerDeps,
} from "@/server/workshop-reminders";

/**
 * 033 (FR-020) — El temporizador del recordatorio: apagado por defecto,
 * idempotente, y una organización que falla no frena a las demás.
 */

function deps(over: Partial<ReminderSchedulerDeps> = {}): ReminderSchedulerDeps {
  return {
    intervalMin: 15,
    bootDelayMs: 0,
    organizations: async () => ["org_a", "org_b"],
    runOrg: async () => 0,
    log: () => {},
    ...over,
  };
}

afterEach(() => {
  stopWorkshopReminderScheduler();
  vi.useRealTimers();
});

describe("033 (FR-020) — el temporizador del recordatorio", () => {
  it("con intervalo 0 no arranca (es el default)", () => {
    expect(startWorkshopReminderScheduler(deps({ intervalMin: 0 }))).toBe(false);
  });

  it("arranca una sola vez", () => {
    expect(startWorkshopReminderScheduler(deps())).toBe(true);
    expect(startWorkshopReminderScheduler(deps())).toBe(false);
  });

  it("recorre cada organización aunque una falle", async () => {
    vi.useFakeTimers();
    const vistas: string[] = [];
    startWorkshopReminderScheduler(
      deps({
        runOrg: async (org) => {
          vistas.push(org);
          if (org === "org_a") throw new Error("boom");
          return 1;
        },
      })
    );
    await vi.advanceTimersByTimeAsync(1);
    expect(vistas).toEqual(["org_a", "org_b"]);
  });

  it("el arranque usa la guarda corregida de Zoom (no exige NEXT_RUNTIME en el env)", () => {
    const boot = readFileSync(path.join(process.cwd(), "src", "instrumentation-node.ts"), "utf8");
    const bloque = boot.slice(boot.indexOf("startWorkshopRemindersOnBoot"));
    expect(bloque).toMatch(/shouldStartScheduler\(process\.env\)/);
    expect(bloque).not.toMatch(/env\.NEXT_RUNTIME\s*===/);
  });

  it("el default del intervalo es 0 (apagado)", () => {
    const env = readFileSync(path.join(process.cwd(), "src", "lib", "env.ts"), "utf8");
    expect(env).toMatch(/WORKSHOP_REMINDER_INTERVAL_MIN: z\.coerce\.number\(\)\.int\(\)\.min\(0\)\.default\(0\)/);
  });
});
