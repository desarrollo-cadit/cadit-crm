import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * cursos-offline — The recognition routes. Same capability as the staff
 * override of one topic (`academico.editar`): recognizing a course is the
 * same kind of decision, at a larger scale.
 */

vi.mock("@/lib/db", () => ({
  getRootDb: () => ({
    transaction: async (fn: (tx: unknown) => unknown) => fn({ execute: async () => [] }),
  }),
  getDb: () => ({}),
  schema: new Proxy(
    {},
    { get: (_t, table) => new Proxy({}, { get: (_t2, col) => `${String(table)}.${String(col)}` }) }
  ),
}));

const recognizeForEnrollment = vi.fn();
const revokeRecognition = vi.fn();
vi.mock("@/server/offline-courses/recognition", () => ({
  recognizeForEnrollment: (...a: unknown[]) => recognizeForEnrollment(...a),
  revokeRecognition: (...a: unknown[]) => revokeRecognition(...a),
}));

class UnauthorizedError extends Error {}

function mockSession(session: { capabilities: string[] } | null) {
  vi.doMock("@/lib/auth/session", () => ({
    UnauthorizedError,
    requireSession: session
      ? vi.fn().mockResolvedValue({
          userId: "usr_1",
          organizationId: "org_1",
          role: "custom",
          capabilities: session.capabilities,
        })
      : vi.fn().mockRejectedValue(new UnauthorizedError("no session")),
  }));
}

const ctx = { params: Promise.resolve({ id: "enr_1" }) };
const ctxRevoke = { params: Promise.resolve({ id: "enr_1", recognitionId: "orec_1" }) };

function post(body: unknown) {
  return new Request("http://localhost/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const valid = { scope: "course", courseId: "ocrs_1", reason: "Completado en la academia anterior" };

beforeEach(() => {
  vi.resetModules();
  recognizeForEnrollment.mockReset();
  revokeRecognition.mockReset();
});

const loadPost = async () =>
  (await import("@/app/api/enrollments/[id]/offline-courses/recognitions/route")).POST;
const loadDelete = async () =>
  (await import("@/app/api/enrollments/[id]/offline-courses/recognitions/[recognitionId]/route")).DELETE;

describe("POST /api/enrollments/:id/offline-courses/recognitions", () => {
  it("without a session → 401", async () => {
    mockSession(null);
    const res = await (await loadPost())(post(valid), ctx);
    expect(res.status).toBe(401);
    expect(recognizeForEnrollment).not.toHaveBeenCalled();
  });

  it("with academico.ver only → 403, nothing written", async () => {
    mockSession({ capabilities: ["academico.ver"] });
    const res = await (await loadPost())(post(valid), ctx);
    expect(res.status).toBe(403);
    expect(recognizeForEnrollment).not.toHaveBeenCalled();
  });

  it("without a reason → 422 before touching anything", async () => {
    mockSession({ capabilities: ["academico.editar"] });
    const res = await (await loadPost())(post({ ...valid, reason: "  " }), ctx);
    expect(res.status).toBe(422);
    expect(recognizeForEnrollment).not.toHaveBeenCalled();
  });

  it("passes the trimmed request and the author", async () => {
    mockSession({ capabilities: ["academico.editar"] });
    recognizeForEnrollment.mockResolvedValue({ ok: true, data: { created: 1 } });
    const res = await (await loadPost())(post({ ...valid, reason: " Migración " }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ created: 1 });
    expect(recognizeForEnrollment).toHaveBeenCalledWith(
      "org_1",
      "enr_1",
      { scope: "course", courseId: "ocrs_1", reason: "Migración" },
      "usr_1"
    );
  });

  it("a course the enrollment does not read → 422 with its code and message", async () => {
    mockSession({ capabilities: ["academico.editar"] });
    recognizeForEnrollment.mockResolvedValue({
      ok: false,
      status: 422,
      code: "course_not_assigned",
      message: "El alumno no tiene acceso a este curso offline",
    });
    const res = await (await loadPost())(post(valid), ctx);
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error: { code: "course_not_assigned", message: "El alumno no tiene acceso a este curso offline" },
    });
  });
});

describe("DELETE /api/enrollments/:id/offline-courses/recognitions/:recognitionId", () => {
  it("without a session → 401; without academico.editar → 403", async () => {
    mockSession(null);
    expect((await (await loadDelete())(new Request("http://localhost/x", { method: "DELETE" }), ctxRevoke)).status).toBe(
      401
    );
    vi.resetModules();
    mockSession({ capabilities: ["academico.ver"] });
    expect((await (await loadDelete())(new Request("http://localhost/x", { method: "DELETE" }), ctxRevoke)).status).toBe(
      403
    );
    expect(revokeRecognition).not.toHaveBeenCalled();
  });

  it("revokes with the author", async () => {
    mockSession({ capabilities: ["academico.editar"] });
    revokeRecognition.mockResolvedValue({ ok: true, data: { revoked: true } });
    const res = await (await loadDelete())(new Request("http://localhost/x", { method: "DELETE" }), ctxRevoke);
    expect(res.status).toBe(200);
    expect(revokeRecognition).toHaveBeenCalledWith("org_1", "enr_1", "orec_1", "usr_1");
  });

  it("a recognition of someone else → 404", async () => {
    mockSession({ capabilities: ["academico.editar"] });
    revokeRecognition.mockResolvedValue({ ok: false, status: 404, code: "not_found", message: "Reconocimiento no encontrado" });
    const res = await (await loadDelete())(new Request("http://localhost/x", { method: "DELETE" }), ctxRevoke);
    expect(res.status).toBe(404);
  });
});
