import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  startStaffNoticeScheduler,
  stopStaffNoticeScheduler,
  type StaffNoticeSchedulerDeps,
} from "@/server/staff-notices";

/**
 * 039 — La forma del lado servidor de los avisos internos: el temporizador
 * (mismo diseño que el de talleres) y las reglas que no se pueden romper sin
 * que nadie lo note.
 */

const leer = (...p: string[]) => readFileSync(path.join(process.cwd(), ...p), "utf8");
/** Sin comentarios: las reglas se miran sobre el código, no sobre lo que se dice de él. */
const codigo = (...p: string[]) =>
  leer(...p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

function deps(over: Partial<StaffNoticeSchedulerDeps> = {}): StaffNoticeSchedulerDeps {
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
  stopStaffNoticeScheduler();
  vi.useRealTimers();
});

describe("039 — el temporizador de los avisos internos", () => {
  it("con intervalo 0 no arranca (es el default)", () => {
    expect(startStaffNoticeScheduler(deps({ intervalMin: 0 }))).toBe(false);
  });

  it("arranca una sola vez", () => {
    expect(startStaffNoticeScheduler(deps())).toBe(true);
    expect(startStaffNoticeScheduler(deps())).toBe(false);
  });

  it("recorre cada organización aunque una falle", async () => {
    vi.useFakeTimers();
    const vistas: string[] = [];
    startStaffNoticeScheduler(
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

  it("si no puede leer las organizaciones, no lanza", async () => {
    vi.useFakeTimers();
    const logs: string[] = [];
    startStaffNoticeScheduler(
      deps({
        organizations: async () => {
          throw new Error("db caída");
        },
        log: (m) => logs.push(m),
      })
    );
    await vi.advanceTimersByTimeAsync(1);
    expect(logs.some((l) => l.includes("no se pudo leer organizaciones"))).toBe(true);
  });

  it("el arranque usa la guarda de Zoom (nunca en tests ni en `next build`)", () => {
    const boot = leer("src", "instrumentation-node.ts");
    const bloque = boot.slice(boot.indexOf("startStaffNoticesOnBoot"));
    expect(bloque).toMatch(/shouldStartScheduler\(process\.env\)/);
    expect(bloque).not.toMatch(/env\.NEXT_RUNTIME\s*===/);
    expect(leer("src", "instrumentation.ts")).toContain("startStaffNoticesOnBoot()");
  });

  it("el default del intervalo es 0 (apagado)", () => {
    expect(leer("src", "lib", "env.ts")).toMatch(
      /STAFF_NOTICES_INTERVAL_MIN: z\.coerce\.number\(\)\.int\(\)\.min\(0\)\.default\(0\)/
    );
  });
});

describe("039 — reglas estructurales", () => {
  it("el aviso a Soporte sale DESPUÉS del commit, nunca dentro del pedido", () => {
    const src = codigo("src", "server", "cohort-confirmation.ts");
    expect(src).toMatch(/onAfterCommit\(\(\) => \{\s*void enviarAviso\(/);
    expect(src).not.toMatch(/await enviarAviso\(/);
  });

  it("quitar la confirmación cancela los avisos de facturación pendientes", () => {
    const src = codigo("src", "server", "cohort-confirmation.ts");
    expect(src).toContain("cancelarAvisosDeFacturacion(organizationId, cohortId)");
    const notices = codigo("src", "server", "staff-notices.ts");
    const bloque = notices.slice(notices.indexOf("export async function cancelarAvisosDeFacturacion"));
    expect(bloque).toMatch(/\["facturacion_t7", "facturacion_t2"\]/);
    expect(bloque).toMatch(/\["pending", "failed", "skipped"\]/);
  });

  it("el correo se manda FUERA de la transacción (sendMail no está dentro de withOrganizationScope)", () => {
    const src = codigo("src", "server", "staff-notices.ts");
    const preparar = src.slice(
      src.indexOf("async function prepararEnvio"),
      src.indexOf("export async function mandarAviso")
    );
    expect(preparar).not.toContain("sendMail(");
    // 041 — El envío vive en `mandarAviso`, compartido con los avisos de cobranza.
    const mandar = src.slice(
      src.indexOf("export async function mandarAviso"),
      src.indexOf("export async function enviarAviso")
    );
    expect(mandar.indexOf("sendMail(")).toBeGreaterThan(-1);
    expect(mandar.indexOf("sendMail(")).toBeLessThan(mandar.indexOf("withOrganizationScope("));
    const enviar = src.slice(src.indexOf("export async function enviarAviso"));
    expect(enviar).toContain("return mandarAviso(");
  });

  it("el agente no deriva a Administración: el prompt y la acción siguen usando AREAS", () => {
    expect(codigo("src", "server", "ai", "actions.ts")).toContain("area: z.enum(AREAS)");
    expect(codigo("src", "server", "ai", "pipeline.ts")).toContain("getAreaConfigs(organizationId)");
    expect(codigo("src", "server", "ai", "pipeline.ts")).not.toContain("getAllAreaConfigs");
  });

  it("confirmar y quitar exigen `cohortes.confirmar`", () => {
    const route = codigo("src", "app", "api", "cohorts", "[id]", "confirmation", "route.ts");
    expect(route).toMatch(/export const POST = requireCapability\(\s*"cohortes\.confirmar"/);
    expect(route).toMatch(/export const DELETE = requireCapability\(\s*"cohortes\.confirmar"/);
  });
});
