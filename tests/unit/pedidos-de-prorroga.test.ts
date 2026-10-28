import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 0083 — Los pedidos de prórroga: el alumno pide, Coordinación decide.
 * Aprobar escribe la prórroga (motivo del alumno, autor = quien decide);
 * un pedido ya decidido no se vuelve a decidir; el acceso vencido es 404.
 */

const tablas: Record<string, unknown[]> = {};
const inserts: Array<{ tabla: string; values: Record<string, unknown>; upsert?: Record<string, unknown> }> = [];
const updates: Array<Record<string, unknown>> = [];
let updateDevuelve: unknown[] = [];
let insertDevuelve: unknown[] = [];

function chain() {
  let tabla = "";
  const c: Record<string, unknown> = {};
  c.from = (t: { __name: string }) => {
    tabla = t.__name;
    return c;
  };
  for (const m of ["innerJoin", "leftJoin", "where", "groupBy", "orderBy", "limit"]) c[m] = () => c;
  (c as { then: unknown }).then = (resolve: (v: unknown) => void) =>
    Promise.resolve(tablas[tabla] ?? []).then(resolve);
  return c;
}

vi.mock("@/lib/db", () => ({
  getRootDb: () => ({}),
  getDb: () => ({
    select: () => chain(),
    update: () => ({
      set: (s: Record<string, unknown>) => {
        updates.push(s);
        return { where: () => ({ returning: () => Promise.resolve(updateDevuelve) }) };
      },
    }),
    insert: (t: { __name: string }) => ({
      values: (values: Record<string, unknown>) => {
        const fila: { tabla: string; values: Record<string, unknown>; upsert?: Record<string, unknown> } = {
          tabla: t.__name,
          values,
        };
        inserts.push(fila);
        return {
          onConflictDoNothing: () => ({ returning: () => Promise.resolve(insertDevuelve) }),
          onConflictDoUpdate: (o: { set: Record<string, unknown> }) => {
            fila.upsert = o.set;
            return Promise.resolve([]);
          },
        };
      },
    }),
  }),
  schema: new Proxy(
    {},
    {
      get: (_t, tableName) =>
        new Proxy(
          {},
          {
            get: (_t2, col) => (col === "__name" ? String(tableName) : `${String(tableName)}.${String(col)}`),
          }
        ),
    }
  ),
}));

let vencido = false;
vi.mock("@/server/access-expiry", () => ({
  estadosDeAcceso: async (_org: string, ids: string[]) => new Map(ids.map((id) => [id, { vencido }])),
  zonaDeLaOrganizacion: async () => "America/Montevideo",
}));

vi.mock("@/server/submissions", async () => {
  const { classInstant } = await import("@/lib/schedule-time");
  return {
    componerPlazo: (p: { fecha: string; hora: string }, tz: string) =>
      classInstant(new Date(`${p.fecha}T00:00:00.000Z`), p.hora, tz),
    entregaFinalDeCohorte: async () => new Date("2026-12-16T02:59:00.000Z"),
    fechaVigente: (g: Date | null, i: Date | null) => (!g ? i : !i ? g : i > g ? i : g),
  };
});

beforeEach(() => {
  for (const k of Object.keys(tablas)) delete tablas[k];
  inserts.length = 0;
  updates.length = 0;
  updateDevuelve = [];
  insertDevuelve = [];
  vencido = false;
  vi.resetModules();
});

const ORG = "org_1";
const AHORA = new Date("2026-12-05T12:00:00.000Z");

describe("0083 — el alumno pide", () => {
  beforeEach(() => {
    tablas.assessment = [{ id: "asm_1", cohortId: "coh_1", dueAt: null }];
    tablas.enrollment = [{ id: "enr_1" }];
  });

  it("evaluación ajena (sin inscripción suya en el grupo): 404, no escribe", async () => {
    tablas.enrollment = [];
    const { pedirProrroga } = await import("@/server/extension-requests");
    const r = await pedirProrroga(ORG, "ct_1", "asm_1", { fecha: "2026-12-20", motivo: "Viaje" }, AHORA);
    expect(r).toMatchObject({ ok: false, status: 404 });
    expect(inserts).toEqual([]);
  });

  it("con el acceso vencido: 404 (CONTENIDO)", async () => {
    vencido = true;
    const { pedidoDelAlumno } = await import("@/server/extension-requests");
    expect(await pedidoDelAlumno(ORG, "ct_1", "asm_1", AHORA)).toBeNull();
  });

  it("una fecha que no pasa su plazo vigente (la entrega final heredada): 422", async () => {
    const { pedirProrroga } = await import("@/server/extension-requests");
    const r = await pedirProrroga(ORG, "ct_1", "asm_1", { fecha: "2026-12-15", motivo: "Viaje" }, AHORA);
    expect(r).toMatchObject({ ok: false, status: 422, code: "fecha_no_posterior" });
    expect(inserts).toEqual([]);
  });

  it("pide hasta las 23:59 del día, con su motivo", async () => {
    insertDevuelve = [
      {
        id: "exr_1",
        assessmentId: "asm_1",
        requestedDueAt: new Date("2026-12-21T02:59:00.000Z"),
        reason: "Viaje",
        status: "pendiente",
        decisionNote: null,
        decidedAt: null,
        createdAt: AHORA,
      },
    ];
    const { pedirProrroga } = await import("@/server/extension-requests");
    const r = await pedirProrroga(ORG, "ct_1", "asm_1", { fecha: "2026-12-20", motivo: " Viaje " }, AHORA);
    expect(r).toMatchObject({ ok: true, data: { status: "pendiente" } });
    expect(inserts[0]).toMatchObject({
      tabla: "assessmentExtensionRequest",
      values: { enrollmentId: "enr_1", reason: "Viaje", requestedDueAt: new Date("2026-12-21T02:59:00.000Z") },
    });
  });

  it("con un pedido pendiente (el índice parcial no inserta): 409", async () => {
    insertDevuelve = [];
    const { pedirProrroga } = await import("@/server/extension-requests");
    const r = await pedirProrroga(ORG, "ct_1", "asm_1", { fecha: "2026-12-20", motivo: "Viaje" }, AHORA);
    expect(r).toMatchObject({ ok: false, status: 409, code: "pedido_pendiente" });
  });
});

describe("0083 — Coordinación decide", () => {
  const pedida = new Date("2026-12-21T02:59:00.000Z");

  it("inexistente: 404", async () => {
    const { decidirPedido } = await import("@/server/extension-requests");
    const r = await decidirPedido(ORG, "exr_x", "usr_1", { decision: "rechazar" });
    expect(r).toMatchObject({ ok: false, status: 404 });
  });

  it("ya decidido (el update condicional no devuelve nada): 409 y no escribe la prórroga", async () => {
    tablas.assessmentExtensionRequest = [{ id: "exr_1", status: "aprobada", requestedDueAt: pedida }];
    updateDevuelve = [];
    const { decidirPedido } = await import("@/server/extension-requests");
    const r = await decidirPedido(ORG, "exr_1", "usr_1", { decision: "aprobar" });
    expect(r).toMatchObject({ ok: false, status: 409, code: "pedido_ya_decidido" });
    expect(inserts).toEqual([]);
  });

  it("aprobar escribe la prórroga con el motivo del alumno y quien decide como autor", async () => {
    tablas.assessmentExtensionRequest = [{ id: "exr_1", status: "pendiente", requestedDueAt: pedida }];
    updateDevuelve = [
      { id: "exr_1", status: "aprobada", assessmentId: "asm_1", enrollmentId: "enr_1", reason: "Viaje" },
    ];
    const { decidirPedido } = await import("@/server/extension-requests");
    const r = await decidirPedido(ORG, "exr_1", "usr_9", { decision: "aprobar" });
    expect(r).toMatchObject({ ok: true, data: { status: "aprobada", dueAt: pedida.toISOString() } });
    expect(updates[0]).toMatchObject({ status: "aprobada", decidedBy: "usr_9" });
    expect(inserts[0]).toMatchObject({
      tabla: "assessmentExtension",
      values: { assessmentId: "asm_1", enrollmentId: "enr_1", dueAt: pedida, reason: "Viaje", grantedBy: "usr_9" },
      upsert: { dueAt: pedida, reason: "Viaje", grantedBy: "usr_9" },
    });
  });

  it("aprobar con la fecha ajustada usa la ajustada", async () => {
    tablas.assessmentExtensionRequest = [{ id: "exr_1", status: "pendiente", requestedDueAt: pedida }];
    updateDevuelve = [
      { id: "exr_1", status: "aprobada", assessmentId: "asm_1", enrollmentId: "enr_1", reason: "Viaje" },
    ];
    const { decidirPedido } = await import("@/server/extension-requests");
    const r = await decidirPedido(ORG, "exr_1", "usr_9", {
      decision: "aprobar",
      plazo: { fecha: "2026-12-18", hora: "18:00" },
    });
    expect(r).toMatchObject({ ok: true, data: { dueAt: "2026-12-18T21:00:00.000Z" } });
  });

  it("rechazar no toca las prórrogas y guarda la nota", async () => {
    tablas.assessmentExtensionRequest = [{ id: "exr_1", status: "pendiente", requestedDueAt: pedida }];
    updateDevuelve = [
      { id: "exr_1", status: "rechazada", assessmentId: "asm_1", enrollmentId: "enr_1", reason: "Viaje" },
    ];
    const { decidirPedido } = await import("@/server/extension-requests");
    const r = await decidirPedido(ORG, "exr_1", "usr_9", { decision: "rechazar", nota: " Ya hubo una " });
    expect(r).toMatchObject({ ok: true, data: { status: "rechazada", dueAt: null } });
    expect(updates[0]).toMatchObject({ status: "rechazada", decisionNote: "Ya hubo una" });
    expect(inserts).toEqual([]);
  });
});
