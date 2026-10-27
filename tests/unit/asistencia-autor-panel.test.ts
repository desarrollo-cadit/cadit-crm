import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * La asistencia que se marca desde el panel del staff guarda QUIÉN la marcó.
 * Hasta 2026-10-27 el PATCH pasaba `undefined` y la marca quedaba con
 * `recorded_by = NULL`: solo el portal del profesor dejaba autor.
 */

const markAttendance = vi.fn();

vi.mock("@/lib/db", () => ({
  getRootDb: () => ({
    transaction: async (fn: (tx: unknown) => unknown) => fn({ execute: async () => [] }),
  }),
  getDb: () => ({}),
  schema: {},
}));

vi.mock("@/lib/auth/session", () => {
  class UnauthorizedError extends Error {}
  return {
    UnauthorizedError,
    requireSession: vi.fn().mockResolvedValue({
      userId: "usr_coordinadora",
      organizationId: "org_1",
      role: "owner",
      capabilities: ["asistencia.editar"],
    }),
  };
});

vi.mock("@/server/attendance", () => ({
  markAttendance: (...args: unknown[]) => markAttendance(...args),
  cancelSession: vi.fn(),
}));
vi.mock("@/server/class-changes", () => ({ borrarClase: vi.fn() }));

const ctx = { params: Promise.resolve({ id: "cs_1" }) };

function patch(body: unknown) {
  return new Request("http://localhost/x", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/class-sessions/[id] — autor de la marca", () => {
  beforeEach(() => {
    markAttendance.mockReset();
    markAttendance.mockResolvedValue({ ok: true, data: { marked: 1 } });
  });

  it("pasa el usuario de la sesión como autor", async () => {
    const { PATCH } = await import("@/app/api/class-sessions/[id]/route");
    const res = await PATCH(
      patch({ attendance: [{ enrollmentId: "enr_1", status: "presente" }] }),
      ctx
    );
    expect(res.status).toBe(200);
    expect(markAttendance).toHaveBeenCalledTimes(1);
    expect(markAttendance.mock.calls[0]?.[3]).toBe("usr_coordinadora");
  });

  it("también con «Todos presentes» (solo sin marca)", async () => {
    const { PATCH } = await import("@/app/api/class-sessions/[id]/route");
    await PATCH(
      patch({
        attendance: [{ enrollmentId: "enr_1", status: "presente" }],
        onlyUnmarked: true,
      }),
      ctx
    );
    expect(markAttendance.mock.calls[0]?.[3]).toBe("usr_coordinadora");
    expect(markAttendance.mock.calls[0]?.[4]).toEqual({ soloSinMarca: true });
  });
});
