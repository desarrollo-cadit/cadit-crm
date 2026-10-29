import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  startAssessmentReminderScheduler,
  stopAssessmentReminderScheduler,
  type AssessmentReminderSchedulerDeps,
} from "@/server/email/assessment-notices";

/**
 * 0084 — El temporizador del recordatorio de evaluaciones por correo: apagado
 * por defecto, idempotente, una organización que falla no frena a las demás,
 * y arranca con la misma guarda que las otras periódicas.
 */

function deps(over: Partial<AssessmentReminderSchedulerDeps> = {}): AssessmentReminderSchedulerDeps {
  return {
    intervalMin: 60,
    bootDelayMs: 0,
    organizations: async () => ["org_a", "org_b"],
    runOrg: async () => 0,
    log: () => {},
    ...over,
  };
}

afterEach(() => {
  stopAssessmentReminderScheduler();
  vi.useRealTimers();
});

describe("0084 — el temporizador del recordatorio de evaluaciones", () => {
  it("con intervalo 0 no arranca (es el default)", () => {
    expect(startAssessmentReminderScheduler(deps({ intervalMin: 0 }))).toBe(false);
  });

  it("arranca una sola vez", () => {
    expect(startAssessmentReminderScheduler(deps())).toBe(true);
    expect(startAssessmentReminderScheduler(deps())).toBe(false);
  });

  it("recorre cada organización aunque una falle", async () => {
    vi.useFakeTimers();
    const vistas: string[] = [];
    startAssessmentReminderScheduler(
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

  it("el arranque usa la guarda de las demás periódicas y está registrado", () => {
    const boot = readFileSync(path.join(process.cwd(), "src", "instrumentation-node.ts"), "utf8");
    const bloque = boot.slice(boot.indexOf("startAssessmentRemindersOnBoot"));
    expect(bloque).toMatch(/shouldStartScheduler\(process\.env\)/);
    const register = readFileSync(path.join(process.cwd(), "src", "instrumentation.ts"), "utf8");
    expect(register).toContain("await startAssessmentRemindersOnBoot()");
  });

  it("el default del intervalo es 0 (apagado) y el de días, 2", () => {
    const env = readFileSync(path.join(process.cwd(), "src", "lib", "env.ts"), "utf8");
    expect(env).toMatch(/ASSESSMENT_REMINDER_INTERVAL_MIN: z\.coerce\.number\(\)\.int\(\)\.min\(0\)\.default\(0\)/);
    expect(env).toMatch(/ASSESSMENT_REMINDER_DAYS: z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(30\)\.default\(2\)/);
  });

  it("el correo al alumno nunca va por WhatsApp", () => {
    const src = readFileSync(
      path.join(process.cwd(), "src", "server", "email", "assessment-notices.ts"),
      "utf8"
    );
    const imports = [...src.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
    expect(imports.filter((i) => /meta|whatsapp|inbox/i.test(i ?? ""))).toEqual([]);
    expect(src).toContain('from "@/lib/m365/client"');
  });
});
