import { afterEach, describe, expect, it, vi } from "vitest";
import { progresoDeTraidas } from "@/lib/zoom-attendance-estado";
import {
  startZoomAttendanceScheduler,
  stopZoomAttendanceScheduler,
  type AttendanceSchedulerDeps,
} from "@/server/zoom/attendance-scheduler";

/**
 * La periódica de la asistencia sugerida: apagada por defecto, una pasada
 * por organización con Zoom, nunca lanza. Y el avance que ve Configuración.
 */

afterEach(() => {
  stopZoomAttendanceScheduler();
  vi.useRealTimers();
});

function deps(extra: Partial<AttendanceSchedulerDeps> = {}): AttendanceSchedulerDeps & { logs: string[] } {
  const logs: string[] = [];
  return {
    intervalMin: 30,
    bootDelayMs: 1000,
    organizations: async () => ["org_a", "org_b"],
    runOrg: vi.fn(async () => ({ ok: true })),
    log: (m) => logs.push(m),
    logs,
    ...extra,
  };
}

describe("startZoomAttendanceScheduler", () => {
  it("con ZOOM_ATTENDANCE_INTERVAL_MIN=0 no arranca", () => {
    expect(startZoomAttendanceScheduler(deps({ intervalMin: 0 }))).toBe(false);
  });

  it("arranca una sola vez y en cada pasada corre cada organización", async () => {
    vi.useFakeTimers();
    const d = deps();
    expect(startZoomAttendanceScheduler(d)).toBe(true);
    expect(startZoomAttendanceScheduler(d)).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(d.runOrg).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    expect(d.runOrg).toHaveBeenCalledTimes(4);
  });

  it("una organización que falla no frena a las demás ni tumba el proceso", async () => {
    vi.useFakeTimers();
    const runOrg = vi.fn(async (org: string) => {
      if (org === "org_a") throw new Error("boom");
      return { ok: true };
    });
    const d = deps({ runOrg });
    startZoomAttendanceScheduler(d);
    await vi.advanceTimersByTimeAsync(1000);
    expect(runOrg).toHaveBeenCalledWith("org_b");
    expect(d.logs.some((l) => l.includes("org_a falló"))).toBe(true);
  });

  it("si no puede leer las organizaciones, lo dice y sigue", async () => {
    vi.useFakeTimers();
    const d = deps({
      organizations: async () => {
        throw new Error("db");
      },
    });
    startZoomAttendanceScheduler(d);
    await vi.advanceTimersByTimeAsync(1000);
    expect(d.logs.some((l) => l.includes("no se pudo leer"))).toBe(true);
  });
});

describe("progresoDeTraidas", () => {
  it("agrupa estados en lo que entiende una persona", () => {
    expect(
      progresoDeTraidas([
        { status: "pendiente", confirmada: false, n: 3 },
        { status: "no_lista", confirmada: false, n: 2 },
        { status: "lista", confirmada: false, n: 4 },
        { status: "lista", confirmada: true, n: 7 },
        { status: "sin_reunion", confirmada: false, n: 1 },
        { status: "fuera_de_plazo", confirmada: false, n: 5 },
        { status: "sin_permiso", confirmada: false, n: 1 },
      ])
    ).toEqual({ pendientes: 5, listas: 4, noEncontradas: 6, conProblemas: 1, confirmadas: 7 });
  });
});
