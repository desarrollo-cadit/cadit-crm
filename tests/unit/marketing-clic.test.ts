import { beforeEach, describe, expect, it, vi } from "vitest";
import { derivarClave, firmarBaja, firmarClic } from "@/lib/marketing/link-token";

/**
 * 045 (T060; FR-023; US3-4) — Registrar un clic y devolver SOLO un destino
 * guardado de la misma campaña: no hay redirección abierta posible.
 */

const KEY = Buffer.alloc(32, 3).toString("base64");
const selectQueue: unknown[][] = [];
const inserts: Record<string, unknown>[] = [];

function chain() {
  const c: Record<string, unknown> = {};
  for (const m of ["from", "innerJoin", "leftJoin", "where", "orderBy", "limit"]) c[m] = () => c;
  (c as { then: unknown }).then = (resolve: (v: unknown) => void) =>
    Promise.resolve(selectQueue.shift() ?? []).then(resolve);
  return c;
}

vi.mock("@/lib/db", () => {
  const db = {
    select: () => chain(),
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        inserts.push(v);
        return Promise.resolve([]);
      },
    }),
  };
  return {
    getDb: () => db,
    getRootDb: () => db,
    schema: new Proxy({}, { get: (_t, tn) => new Proxy({}, { get: (_x, c) => `${String(tn)}.${String(c)}` }) }),
  };
});
vi.mock("@/lib/env", () => ({ getEnv: () => ({ ENCRYPTION_KEY: KEY }) }));

const k = derivarClave(KEY);

beforeEach(() => {
  selectQueue.length = 0;
  inserts.length = 0;
});

describe("registrarClic", () => {
  it("firma inválida → null sin tocar la base", async () => {
    const { registrarClic } = await import("@/server/marketing/unsubscribe");
    expect(await registrarClic("org_1", "mkr_1.firma-falsa", "mkl_1")).toBeNull();
    expect(inserts).toHaveLength(0);
  });

  it("un token de BAJA usado como clic → null", async () => {
    const { registrarClic } = await import("@/server/marketing/unsubscribe");
    expect(await registrarClic("org_1", firmarBaja(k, "mkr_1"), "mkl_1")).toBeNull();
  });

  it("enlace de OTRA campaña → null", async () => {
    selectQueue.push(
      [{ id: "mkr_1", campaignId: "mkc_1", status: "enviado", campaignStatus: "enviada" }],
      [{ id: "mkl_9", campaignId: "mkc_OTRA", url: "https://otra.test/" }]
    );
    const { registrarClic } = await import("@/server/marketing/unsubscribe");
    expect(await registrarClic("org_1", firmarClic(k, "mkr_1"), "mkl_9")).toBeNull();
    expect(inserts).toHaveLength(0);
  });

  it("destinatario enviado → registra el clic y devuelve la URL GUARDADA", async () => {
    selectQueue.push(
      [{ id: "mkr_1", campaignId: "mkc_1", status: "enviado", campaignStatus: "enviada" }],
      [{ id: "mkl_1", campaignId: "mkc_1", url: "https://a.test/" }],
      []
    );
    const { registrarClic } = await import("@/server/marketing/unsubscribe");
    expect(await registrarClic("org_1", firmarClic(k, "mkr_1"), "mkl_1")).toBe("https://a.test/");
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      organizationId: "org_1",
      campaignId: "mkc_1",
      recipientId: "mkr_1",
      linkId: "mkl_1",
    });
  });

  it("un segundo clic igual en menos de 10 s no se inserta, pero redirige", async () => {
    selectQueue.push(
      [{ id: "mkr_1", campaignId: "mkc_1", status: "enviado", campaignStatus: "enviada" }],
      [{ id: "mkl_1", campaignId: "mkc_1", url: "https://a.test/" }],
      [{ id: "mkk_reciente" }]
    );
    const { registrarClic } = await import("@/server/marketing/unsubscribe");
    expect(await registrarClic("org_1", firmarClic(k, "mkr_1"), "mkl_1")).toBe("https://a.test/");
    expect(inserts).toHaveLength(0);
  });

  it.each([
    ["destinatario no enviado", "pendiente", "enviando"],
    ["campaña cancelada", "enviado", "cancelada"],
  ])("%s → redirige sin sumar", async (_c, status, campaignStatus) => {
    selectQueue.push(
      [{ id: "mkr_1", campaignId: "mkc_1", status, campaignStatus }],
      [{ id: "mkl_1", campaignId: "mkc_1", url: "https://a.test/" }]
    );
    const { registrarClic } = await import("@/server/marketing/unsubscribe");
    expect(await registrarClic("org_1", firmarClic(k, "mkr_1"), "mkl_1")).toBe("https://a.test/");
    expect(inserts).toHaveLength(0);
  });

  it("destinatario inexistente → null", async () => {
    selectQueue.push([]);
    const { registrarClic } = await import("@/server/marketing/unsubscribe");
    expect(await registrarClic("org_1", firmarClic(k, "mkr_x"), "mkl_1")).toBeNull();
  });
});
