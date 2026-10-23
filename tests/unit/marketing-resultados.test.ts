import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 045 (T059; FR-021, FR-022) — Métricas, tabla de destinatarios y clics por
 * enlace, con dobles de base.
 */

const selectQueue: unknown[][] = [];

function chain() {
  const c: Record<string, unknown> = {};
  for (const m of ["from", "innerJoin", "leftJoin", "where", "orderBy", "limit", "offset", "groupBy"]) c[m] = () => c;
  (c as { then: unknown }).then = (resolve: (v: unknown) => void) =>
    Promise.resolve(selectQueue.shift() ?? []).then(resolve);
  return c;
}

vi.mock("@/lib/db", () => ({
  getDb: () => ({ select: () => chain() }),
  getRootDb: () => ({ select: () => chain() }),
  schema: new Proxy({}, { get: (_t, tn) => new Proxy({}, { get: (_x, c) => `${String(tn)}.${String(c)}` }) }),
}));
vi.mock("@/server/marketing/runner", () => ({ runCampaign: async () => {} }));
vi.mock("@/server/branding", () => ({ getBranding: async () => ({ name: "A", accent: "#3f5972" }) }));

beforeEach(() => {
  selectQueue.length = 0;
});

describe("metricasDeCampana", () => {
  it("pendientes = pendiente + enviando; bajas, clics totales y personas únicas; pausa y error viajan", async () => {
    selectQueue.push(
      [{ status: "enviando", recipientCount: 10, pausedUntil: new Date("2026-10-22T12:00:00Z"), lastError: "sin permiso" }],
      [
        { status: "pendiente", n: 3 },
        { status: "enviando", n: 1 },
        { status: "enviado", n: 4 },
        { status: "fallido", n: 1 },
        { status: "omitido", n: 1 },
      ],
      [{ n: 2 }],
      [{ total: 9, unicos: 3 }]
    );
    const { metricasDeCampana } = await import("@/server/marketing/campaigns");
    expect(await metricasDeCampana("org_1", "mkc_1")).toEqual({
      status: "enviando",
      total: 10,
      pending: 4,
      sent: 4,
      failed: 1,
      skipped: 1,
      cancelled: 0,
      unsubscribes: 2,
      clicks: { total: 9, uniqueRecipients: 3 },
      pausedUntil: "2026-10-22T12:00:00.000Z",
      lastError: "sin permiso",
    });
  });

  it("campaña inexistente → null", async () => {
    const { metricasDeCampana } = await import("@/server/marketing/campaigns");
    expect(await metricasDeCampana("org_1", "mkc_x")).toBeNull();
  });
});

describe("destinatariosDeCampana", () => {
  it("en borrador la lista viene vacía", async () => {
    selectQueue.push([{ status: "borrador" }]);
    const { destinatariosDeCampana } = await import("@/server/marketing/campaigns");
    expect(await destinatariosDeCampana("org_1", "mkc_1", { page: 1, pageSize: 50 })).toEqual({
      recipients: [],
      total: 0,
      page: 1,
      pageSize: 50,
    });
  });

  it("`enviando` se muestra como pendiente; un contacto borrado se conserva; motivos legibles", async () => {
    selectQueue.push(
      [{ status: "enviando" }],
      [
        {
          id: "r1",
          firstName: "Ana",
          lastName: "Pérez",
          email: "ana@x.test",
          contactId: null,
          status: "enviando",
          reason: null,
          sentAt: null,
          unsubscribedAt: null,
          clickCount: 0,
        },
        {
          id: "r2",
          firstName: "Beto",
          lastName: null,
          email: "beto@x.test",
          contactId: "ct_2",
          status: "omitido",
          reason: "baja",
          sentAt: null,
          unsubscribedAt: null,
          clickCount: 0,
        },
        {
          id: "r3",
          firstName: "Caro",
          lastName: null,
          email: "caro@x.test",
          contactId: "ct_3",
          status: "enviado",
          reason: null,
          sentAt: new Date("2026-10-22T12:00:00Z"),
          unsubscribedAt: new Date("2026-10-22T13:00:00Z"),
          clickCount: 2,
        },
      ],
      [{ total: 3 }]
    );
    const { destinatariosDeCampana } = await import("@/server/marketing/campaigns");
    const r = await destinatariosDeCampana("org_1", "mkc_1", { page: 1, pageSize: 50 });
    expect(r.total).toBe(3);
    expect(r.recipients[0]).toEqual({
      id: "r1",
      name: "Ana Pérez",
      email: "ana@x.test",
      contactId: null,
      status: "pendiente",
      reason: null,
      sentAt: null,
      unsubscribedHere: false,
      clicked: false,
      clickCount: 0,
    });
    expect(r.recipients[1]).toMatchObject({ status: "omitido", reason: "Se había dado de baja" });
    expect(r.recipients[2]).toMatchObject({
      status: "enviado",
      sentAt: "2026-10-22T12:00:00.000Z",
      unsubscribedHere: true,
      clicked: true,
      clickCount: 2,
    });
  });
});

describe("RecipientsQuerySchema", () => {
  it("acepta los filtros del contrato y `pageSize` 50 | 100 | 500", async () => {
    const { RecipientsQuerySchema } = await import("@/server/marketing/campaigns");
    expect(
      RecipientsQuerySchema.safeParse({ status: "fallido", clicked: "true", q: "ana", page: "2", pageSize: "100" }).success
    ).toBe(true);
    expect(RecipientsQuerySchema.safeParse({ pageSize: "500" }).success).toBe(true);
    expect(RecipientsQuerySchema.safeParse({ pageSize: "25" }).success).toBe(false);
    expect(RecipientsQuerySchema.safeParse({ status: "enviando" }).success).toBe(false);
    expect(RecipientsQuerySchema.safeParse({ q: "x".repeat(101) }).success).toBe(false);
    expect(RecipientsQuerySchema.safeParse({ otro: "1" }).success).toBe(false);
  });
});

describe("enlacesDeCampana", () => {
  it("clics totales y personas únicas por enlace", async () => {
    selectQueue.push([{ status: "enviada" }], [{ id: "mkl_1", url: "https://a.test/", clicks: 5, uniqueRecipients: 2 }]);
    const { enlacesDeCampana } = await import("@/server/marketing/campaigns");
    expect(await enlacesDeCampana("org_1", "mkc_1")).toEqual([
      { id: "mkl_1", url: "https://a.test/", clicks: 5, uniqueRecipients: 2 },
    ]);
  });
});
