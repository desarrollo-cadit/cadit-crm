import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 045 (T035; FR-007a, FR-007b, DV-013) — Imágenes de campaña: tipo por bytes,
 * 5 MB, 20 por campaña, solo en borrador, token público de 256 bits.
 */

const selectQueue: unknown[][] = [];
const inserts: { values: Record<string, unknown> }[] = [];
const deletes: unknown[] = [];
const guardados: { org: string; asset: string }[] = [];
const borrados: { org: string; asset: string }[] = [];
let selects = 0;

function chain() {
  const c: Record<string, unknown> = {};
  for (const m of ["from", "innerJoin", "leftJoin", "where", "orderBy", "limit"]) c[m] = () => c;
  (c as { then: unknown }).then = (resolve: (v: unknown) => void) => {
    selects++;
    return Promise.resolve(selectQueue.shift() ?? []).then(resolve);
  };
  return c;
}

vi.mock("@/lib/db", () => {
  const db = {
    select: () => chain(),
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        inserts.push({ values });
        return Promise.resolve([values]);
      },
    }),
    delete: (t: unknown) => {
      deletes.push(t);
      return { where: () => Promise.resolve([]) };
    },
  };
  return {
    getDb: () => db,
    getRootDb: () => db,
    schema: new Proxy({}, { get: (_t, tn) => new Proxy({}, { get: (_x, c) => `${String(tn)}.${String(c)}` }) }),
  };
});

vi.mock("@/lib/env", () => ({ getEnv: () => ({ APP_BASE_URL: "https://crm.academia.test" }) }));

vi.mock("@/server/whatsapp/media", () => ({
  MEDIA_LIMITS: { image: { maxBytes: 5 * 1024 * 1024, mimes: /^image\/(jpeg|png|webp)$/, label: "imagen" } },
  saveMediaFile: async (org: string, asset: string) => {
    guardados.push({ org, asset });
    return `${org}/${asset}`;
  },
  readMediaFile: async () => Buffer.from([0xff, 0xd8, 0xff, 0x00]),
  deleteMediaFile: async (org: string, asset: string) => {
    borrados.push({ org, asset });
  },
}));

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const FALSO_PNG = Buffer.from("esto no es una imagen, aunque se llame foto.png");

beforeEach(() => {
  selectQueue.length = 0;
  inserts.length = 0;
  deletes.length = 0;
  guardados.length = 0;
  borrados.length = 0;
  selects = 0;
});

describe("subirImagen", () => {
  it("valida el tipo por los bytes: un `.png` falso → `invalid_body`, sin guardar", async () => {
    selectQueue.push([{ status: "borrador" }]);
    const { subirImagen } = await import("@/server/marketing/images");
    const r = await subirImagen("org_1", "usr_1", "mkc_1", { data: FALSO_PNG });
    expect(r).toMatchObject({ ok: false, code: "invalid_body" });
    expect(guardados).toHaveLength(0);
  });

  it("más de 5 MB → `invalid_body`", async () => {
    selectQueue.push([{ status: "borrador" }]);
    const { subirImagen } = await import("@/server/marketing/images");
    const grande = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]);
    expect(await subirImagen("org_1", "usr_1", "mkc_1", { data: grande })).toMatchObject({
      ok: false,
      code: "invalid_body",
    });
  });

  it("solo en borrador → `campana_no_editable`; campaña ajena → `not_found`", async () => {
    const { subirImagen } = await import("@/server/marketing/images");
    selectQueue.push([{ status: "enviada" }]);
    expect(await subirImagen("org_1", "usr_1", "mkc_1", { data: PNG })).toMatchObject({
      ok: false,
      code: "campana_no_editable",
    });
    selectQueue.push([]);
    expect(await subirImagen("org_1", "usr_1", "mkc_x", { data: PNG })).toMatchObject({
      ok: false,
      code: "not_found",
    });
  });

  it("máximo 20 por campaña → `demasiadas_imagenes`", async () => {
    selectQueue.push([{ status: "borrador" }], [{ total: 20 }]);
    const { subirImagen } = await import("@/server/marketing/images");
    expect(await subirImagen("org_1", "usr_1", "mkc_1", { data: PNG })).toMatchObject({
      ok: false,
      code: "demasiadas_imagenes",
    });
  });

  it("guarda como `marketing-image-<id>` con un token de 32 bytes en base64url y URL absoluta", async () => {
    selectQueue.push([{ status: "borrador" }], [{ total: 3 }]);
    const { subirImagen } = await import("@/server/marketing/images");
    const r = await subirImagen("org_1", "usr_1", "mkc_1", { data: PNG });
    expect(r.ok).toBe(true);
    const fila = inserts[0]!.values;
    expect(guardados).toEqual([{ org: "org_1", asset: `marketing-image-${fila.id as string}` }]);
    expect(fila).toMatchObject({
      organizationId: "org_1",
      campaignId: "mkc_1",
      mimeType: "image/png",
      sizeBytes: PNG.byteLength,
      createdBy: "usr_1",
    });
    expect(fila.publicToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    if (r.ok) {
      expect(r.image).toEqual({
        id: fila.id,
        url: `https://crm.academia.test/api/public/marketing/images/${fila.publicToken as string}`,
        sizeBytes: PNG.byteLength,
      });
    }
  });
});

describe("borrarImagen", () => {
  it("si un bloque la usa → `imagen_en_uso`", async () => {
    selectQueue.push(
      [{ status: "borrador", body: { v: 1, blocks: [{ type: "image", imageId: "mki_1", alt: "x" }] } }],
      [{ id: "mki_1" }]
    );
    const { borrarImagen } = await import("@/server/marketing/images");
    expect(await borrarImagen("org_1", "mkc_1", "mki_1")).toMatchObject({ ok: false, code: "imagen_en_uso" });
    expect(deletes).toHaveLength(0);
  });

  it("libre → borra el archivo y la fila", async () => {
    selectQueue.push([{ status: "borrador", body: { v: 1, blocks: [] } }], [{ id: "mki_1" }]);
    const { borrarImagen } = await import("@/server/marketing/images");
    expect(await borrarImagen("org_1", "mkc_1", "mki_1")).toEqual({ ok: true });
    expect(borrados).toEqual([{ org: "org_1", asset: "marketing-image-mki_1" }]);
    expect(deletes).toHaveLength(1);
  });
});

describe("imagenPorToken", () => {
  it.each(["", "corto", "a".repeat(44), `${"a".repeat(42)}!`, "../../etc/passwd"])(
    "un token con otra forma (%s) → null sin consultar la base",
    async (token) => {
      const { imagenPorToken } = await import("@/server/marketing/images");
      expect(await imagenPorToken("org_1", token)).toBeNull();
      expect(selects).toBe(0);
    }
  );

  it("token válido e inexistente → null", async () => {
    selectQueue.push([]);
    const { imagenPorToken } = await import("@/server/marketing/images");
    expect(await imagenPorToken("org_1", "a".repeat(43))).toBeNull();
  });

  it("token válido → los bytes y el tipo deducido de ellos", async () => {
    selectQueue.push([{ id: "mki_1" }]);
    const { imagenPorToken } = await import("@/server/marketing/images");
    const img = await imagenPorToken("org_1", "a".repeat(43));
    expect(img?.mimeType).toBe("image/jpeg");
  });
});
