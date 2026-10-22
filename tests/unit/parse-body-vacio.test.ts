import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseBody } from "@/lib/api";

/**
 * 2026-10-22 — `parseBody` con `emptyAs`: un pedido sin cuerpo vale como ese
 * objeto. Lo usa POST /api/cohorts/[id]/confirmation, que agregó `avisar`
 * opcional y tiene que seguir aceptando a los clientes que no mandan nada.
 * Sin `emptyAs`, un cuerpo vacío sigue siendo un error (como siempre).
 */
const schema = z.object({ avisar: z.boolean().optional() }).strict();
const pedido = (body?: string) =>
  new Request("http://x/api", { method: "POST", ...(body !== undefined ? { body } : {}) });

describe("parseBody con emptyAs", () => {
  it("sin cuerpo, vale emptyAs", async () => {
    const r = await parseBody(pedido(), schema, { emptyAs: {} });
    expect(r).toEqual({ ok: true, data: {} });
  });

  it("con cuerpo, lo valida igual", async () => {
    expect(await parseBody(pedido('{"avisar":false}'), schema, { emptyAs: {} })).toEqual({
      ok: true,
      data: { avisar: false },
    });
    expect((await parseBody(pedido('{"avisar":"no"}'), schema, { emptyAs: {} })).ok).toBe(false);
    expect((await parseBody(pedido("{roto"), schema, { emptyAs: {} })).ok).toBe(false);
  });

  it("sin emptyAs, un cuerpo vacío sigue siendo un error", async () => {
    expect((await parseBody(pedido(), schema)).ok).toBe(false);
  });
});
