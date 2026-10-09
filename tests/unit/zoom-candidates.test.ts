import { describe, expect, it, vi } from "vitest";

/**
 * 030 US3 — Las clases que se ofrecen al asignar una grabación a mano.
 *
 * Lo que importa para quien asigna: las SUGERIDAS primero (las candidatas
 * del matcher y las clases reales del mismo día), las canceladas visibles
 * pero marcadas, y para cada clase QUÉ se reemplazaría si se elige.
 * Proyecciones nunca: no son filas, no se les puede escribir un enlace.
 */

vi.mock("@/lib/env", () => ({ getEnv: () => ({}) }));

const MVD = "America/Montevideo";

function fila(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    number: 1,
    cohortId: `coh_${id}`,
    cohortName: `Cohorte ${id}` as string | null,
    courseName: "Revit",
    date: new Date("2026-09-15T00:00:00Z"),
    startTime: "18:30" as string | null,
    canceledAt: null as Date | null,
    recordingUrl: null as string | null,
    recordingSource: null as "manual" | "zoom" | null,
    classRoomId: null as string | null,
    cohortRoomId: "aula_1" as string | null,
    ...extra,
  };
}

const ctx = (extra: Partial<{ rooms: Map<string, string>; recByClass: Map<string, string> }> = {}) => ({
  timezone: MVD,
  rooms: extra.rooms ?? new Map([["aula_1", "Zoom 1"], ["aula_2", "Zoom 2"]]),
  recByClass: extra.recByClass ?? new Map<string, string>(),
});

describe("toClassOption", () => {
  it("forma del contrato; inicio vía classInstant; aula efectiva por nombre", async () => {
    const { toClassOption } = await import("@/server/zoom/recordings");
    expect(toClassOption(fila("A1", { number: 3, classRoomId: "aula_2" }), ctx())).toEqual({
      id: "A1",
      number: 3,
      cohortId: "coh_A1",
      cohortName: "Cohorte A1",
      courseName: "Revit",
      date: "2026-09-15",
      startsAt: "2026-09-15T21:30:00.000Z",
      roomName: "Zoom 2",
      canceled: false,
      current: null,
    });
  });

  it("cohorte sin nombre propio se llama como el curso; sin horario → startsAt null", async () => {
    const { toClassOption } = await import("@/server/zoom/recordings");
    const o = toClassOption(fila("A1", { cohortName: null, startTime: null }), ctx());
    expect(o.cohortName).toBe("Revit");
    expect(o.startsAt).toBeNull();
  });

  it("current: otra grabación de Zoom, un enlace manual, o nada", async () => {
    const { toClassOption } = await import("@/server/zoom/recordings");
    const conZoom = toClassOption(
      fila("Z", { recordingUrl: "https://zoom.us/rec/share/x", recordingSource: "zoom" }),
      ctx({ recByClass: new Map([["Z", "zr_9"]]) })
    );
    expect(conZoom.current).toEqual({ kind: "zoom", recordingId: "zr_9" });
    const manual = toClassOption(fila("M", { recordingUrl: "https://drive.example.com/x", recordingSource: "manual" }), ctx());
    expect(manual.current).toEqual({ kind: "manual", recordingId: null });
    const viejo = toClassOption(fila("V", { recordingUrl: "https://drive.example.com/x", recordingSource: null }), ctx());
    expect(viejo.current).toEqual({ kind: "manual", recordingId: null });
  });

  it("cancelada se lista, marcada", async () => {
    const { toClassOption } = await import("@/server/zoom/recordings");
    expect(toClassOption(fila("X", { canceledAt: new Date() }), ctx()).canceled).toBe(true);
  });
});

describe("mergeSuggested — sugeridas primero, sin repetir", () => {
  it("candidatas del matcher (y la clase en conflicto) antes que las del mismo día", async () => {
    const { toClassOption, mergeSuggested } = await import("@/server/zoom/recordings");
    const o = (id: string, startsAt: string) => ({ ...toClassOption(fila(id), ctx()), startsAt });
    const out = mergeSuggested(
      [o("C2", "2026-09-15T21:30:00.000Z"), o("A2", "2026-09-15T21:30:00.000Z")],
      [o("A2", "2026-09-15T21:30:00.000Z"), o("B1", "2026-09-15T20:00:00.000Z"), o("D1", "2026-09-15T22:00:00.000Z")]
    );
    expect(out.map((x) => x.id)).toEqual(["A2", "C2", "B1", "D1"]);
  });
});

describe("candidatesQuerySchema", () => {
  it("q, date (AAAA-MM-DD) y cohortId opcionales; nada más", async () => {
    const { candidatesQuerySchema } = await import("@/server/zoom/recordings");
    expect(candidatesQuerySchema.safeParse({}).success).toBe(true);
    expect(candidatesQuerySchema.safeParse({ q: "revit", date: "2026-09-15", cohortId: "coh_1" }).success).toBe(true);
    expect(candidatesQuerySchema.safeParse({ date: "15/09" }).success).toBe(false);
    expect(candidatesQuerySchema.safeParse({ x: "1" }).success).toBe(false);
  });
});
