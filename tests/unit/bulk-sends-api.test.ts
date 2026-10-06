import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 2026-10-05 — Las rutas del envío masivo por cohorte.
 *
 * Reusan las capacidades de las acciones individuales: los correos de
 * términos y bienvenida piden `inscripciones.ver` (igual que
 * `/api/enrollments/:id/emails`) y el acceso al portal pide
 * `accesos.gestionar` (igual que `/api/enrollments/:id/access`). Sin una
 * capacidad nueva: quien no podía mandarle el acceso a UNO no puede
 * mandárselo a todos.
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

const startBulkSend = vi.fn();
const bulkSendOverview = vi.fn();
const getBulkRun = vi.fn();
vi.mock("@/server/bulk-sends", () => ({
  startBulkSend: (...a: unknown[]) => startBulkSend(...a),
  bulkSendOverview: (...a: unknown[]) => bulkSendOverview(...a),
  getBulkRun: (...a: unknown[]) => getBulkRun(...a),
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

const ctx = { params: Promise.resolve({ id: "coh_1" }) };

function post(body: unknown) {
  return new Request("http://localhost/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetModules();
  startBulkSend.mockReset();
  bulkSendOverview.mockReset();
  getBulkRun.mockReset();
});

describe("POST /api/cohorts/:id/emails/bulk", () => {
  it("sin sesión → 401", async () => {
    mockSession(null);
    const { POST } = await import("@/app/api/cohorts/[id]/emails/bulk/route");
    const res = await POST(post({ kind: "terms" }), ctx);
    expect(res.status).toBe(401);
    expect(startBulkSend).not.toHaveBeenCalled();
  });

  it("sin inscripciones.ver → 403 sin arrancar nada", async () => {
    mockSession({ capabilities: ["accesos.gestionar"] });
    const { POST } = await import("@/app/api/cohorts/[id]/emails/bulk/route");
    const res = await POST(post({ kind: "terms" }), ctx);
    expect(res.status).toBe(403);
    expect(startBulkSend).not.toHaveBeenCalled();
  });

  it("no acepta el acceso al portal por esta puerta", async () => {
    mockSession({ capabilities: ["inscripciones.ver"] });
    const { POST } = await import("@/app/api/cohorts/[id]/emails/bulk/route");
    const res = await POST(post({ kind: "portal_access" }), ctx);
    expect(res.status).toBe(422);
    expect(startBulkSend).not.toHaveBeenCalled();
  });

  it("con permiso → 202 con el id de la corrida, y quién la pidió", async () => {
    mockSession({ capabilities: ["inscripciones.ver"] });
    startBulkSend.mockResolvedValue({ ok: true, data: { runId: "bsr_1" } });
    const { POST } = await import("@/app/api/cohorts/[id]/emails/bulk/route");
    const res = await POST(post({ kind: "welcome" }), ctx);
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ runId: "bsr_1" });
    expect(startBulkSend).toHaveBeenCalledWith("org_1", "coh_1", "welcome", "usr_1");
  });

  it("una corrida en curso → 409 con el motivo", async () => {
    mockSession({ capabilities: ["inscripciones.ver"] });
    startBulkSend.mockResolvedValue({
      ok: false,
      status: 409,
      code: "run_in_progress",
      message: "Ya hay un envío en curso",
    });
    const { POST } = await import("@/app/api/cohorts/[id]/emails/bulk/route");
    const res = await POST(post({ kind: "terms" }), ctx);
    expect(res.status).toBe(409);
  });
});

describe("POST /api/cohorts/:id/access/bulk", () => {
  it("sin accesos.gestionar → 403, aunque pueda mandar los otros correos", async () => {
    mockSession({ capabilities: ["inscripciones.ver"] });
    const { POST } = await import("@/app/api/cohorts/[id]/access/bulk/route");
    const res = await POST(post({}), ctx);
    expect(res.status).toBe(403);
    expect(startBulkSend).not.toHaveBeenCalled();
  });

  it("con accesos.gestionar → 202", async () => {
    mockSession({ capabilities: ["accesos.gestionar"] });
    startBulkSend.mockResolvedValue({ ok: true, data: { runId: "bsr_2" } });
    const { POST } = await import("@/app/api/cohorts/[id]/access/bulk/route");
    const res = await POST(post({}), ctx);
    expect(res.status).toBe(202);
    expect(startBulkSend).toHaveBeenCalledWith("org_1", "coh_1", "portal_access", "usr_1");
  });
});

describe("GET de una corrida", () => {
  const runCtx = { params: Promise.resolve({ id: "coh_1", runId: "bsr_2" }) };

  it("una corrida de acceso no se lee por la puerta de los correos", async () => {
    mockSession({ capabilities: ["inscripciones.ver"] });
    getBulkRun.mockResolvedValue({ id: "bsr_2", kind: "portal_access", cohortId: "coh_1" });
    const { GET } = await import("@/app/api/cohorts/[id]/emails/bulk/[runId]/route");
    const res = await GET(new Request("http://localhost/x"), runCtx);
    expect(res.status).toBe(404);
  });

  it("una corrida de otra cohorte → 404", async () => {
    mockSession({ capabilities: ["accesos.gestionar"] });
    getBulkRun.mockResolvedValue({ id: "bsr_2", kind: "portal_access", cohortId: "coh_9" });
    const { GET } = await import("@/app/api/cohorts/[id]/access/bulk/[runId]/route");
    const res = await GET(new Request("http://localhost/x"), runCtx);
    expect(res.status).toBe(404);
  });

  it("la corrida propia se devuelve", async () => {
    mockSession({ capabilities: ["accesos.gestionar"] });
    getBulkRun.mockResolvedValue({ id: "bsr_2", kind: "portal_access", cohortId: "coh_1" });
    const { GET } = await import("@/app/api/cohorts/[id]/access/bulk/[runId]/route");
    const res = await GET(new Request("http://localhost/x"), runCtx);
    expect(res.status).toBe(200);
  });
});
