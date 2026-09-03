import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 005 iteración 5: `saveSoftwarePhoto`/`getSoftwarePhoto` validan
 * mime/tamaño ANTES de tocar disco, 404 si el software no es de la
 * organización, y reusan `saveMediaFile`/`readMediaFile`
 * (`src/server/whatsapp/media.ts`) sin tocar la tabla `media_asset`
 * (específica de WhatsApp — no le sirve a un logo de producto).
 */

const selectQueue: unknown[][] = [];
const updates: { table: unknown; set: unknown }[] = [];

function thenableChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "where", "limit"]) {
    chain[m] = () => chain;
  }
  (chain as { then: unknown }).then = (resolve: (v: unknown) => void) =>
    Promise.resolve(rows).then(resolve);
  return chain;
}

vi.mock("@/lib/db", () => ({
  // 012 (T024) — `withAuth` abre la transacción del pedido con
  // `getRootDb().transaction()` para declarar `app.current_org`. Sin este
  // doble, cualquier prueba que atraviese el borde de autenticación falla
  // antes de llegar al handler.
  getRootDb: () => ({
    transaction: async (fn: (tx: unknown) => unknown) =>
      fn({ execute: async () => [] }),
  }),
  getDb: () => ({
    select: () => thenableChain(selectQueue.shift() ?? []),
    update: (table: unknown) => ({
      set: (set: unknown) => {
        updates.push({ table, set });
        return { where: () => Promise.resolve([]) };
      },
    }),
  }),
  schema: new Proxy(
    {},
    {
      get: (_t, tableName) =>
        new Proxy({}, { get: (_t2, col) => `${String(tableName)}.${String(col)}` }),
    }
  ),
}));

const saveMediaFile = vi.fn().mockResolvedValue("org_1/sw-photo-sw_1");
const readMediaFile = vi.fn().mockResolvedValue(Buffer.from("fake-image-bytes"));

vi.mock("@/server/whatsapp/media", () => ({
  MEDIA_LIMITS: {
    image: {
      maxBytes: 5 * 1024 * 1024,
      mimes: /^image\/(jpeg|png|webp)$/,
      label: "imagen (jpeg/png/webp, máx. 5 MB)",
    },
  },
  saveMediaFile: (...args: unknown[]) => saveMediaFile(...args),
  readMediaFile: (...args: unknown[]) => readMediaFile(...args),
}));

describe("saveSoftwarePhoto / getSoftwarePhoto (005 iteración 5)", () => {
  beforeEach(() => {
    selectQueue.length = 0;
    updates.length = 0;
    saveMediaFile.mockClear();
    readMediaFile.mockClear();
  });

  it("rechaza un mime type no soportado sin tocar disco ni DB", async () => {
    const { saveSoftwarePhoto } = await import("@/server/software");
    const result = await saveSoftwarePhoto("org_1", "sw_1", {
      mimeType: "application/pdf",
      sizeBytes: 1000,
      data: Buffer.from("x"),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("invalid_body");
    expect(saveMediaFile).not.toHaveBeenCalled();
  });

  it("rechaza un archivo que excede el límite de tamaño", async () => {
    const { saveSoftwarePhoto } = await import("@/server/software");
    const result = await saveSoftwarePhoto("org_1", "sw_1", {
      mimeType: "image/png",
      sizeBytes: 10 * 1024 * 1024,
      data: Buffer.from("x"),
    });

    expect(result.ok).toBe(false);
    expect(saveMediaFile).not.toHaveBeenCalled();
  });

  it("404 si el software no pertenece a la organización", async () => {
    selectQueue.push([]); // sin fila: no existe / no es de esta org
    const { saveSoftwarePhoto } = await import("@/server/software");
    const result = await saveSoftwarePhoto("org_1", "sw_ajeno", {
      mimeType: "image/png",
      sizeBytes: 1000,
      data: Buffer.from("x"),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(404);
    expect(saveMediaFile).not.toHaveBeenCalled();
  });

  it("guarda el archivo y marca photoMimeType", async () => {
    selectQueue.push([{ id: "sw_1" }]);
    const { saveSoftwarePhoto } = await import("@/server/software");
    const result = await saveSoftwarePhoto("org_1", "sw_1", {
      mimeType: "image/png",
      sizeBytes: 1000,
      data: Buffer.from("x"),
    });

    expect(result.ok).toBe(true);
    expect(saveMediaFile).toHaveBeenCalledWith("org_1", "sw-photo-sw_1", expect.any(Buffer));
    expect(updates[0]!.set).toMatchObject({ photoMimeType: "image/png" });
  });

  it("getSoftwarePhoto devuelve null sin tocar disco cuando no hay foto", async () => {
    selectQueue.push([{ photoMimeType: null }]);
    const { getSoftwarePhoto } = await import("@/server/software");
    const result = await getSoftwarePhoto("org_1", "sw_1");

    expect(result).toBeNull();
    expect(readMediaFile).not.toHaveBeenCalled();
  });

  it("getSoftwarePhoto lee el archivo cuando sí hay foto", async () => {
    selectQueue.push([{ photoMimeType: "image/webp" }]);
    const { getSoftwarePhoto } = await import("@/server/software");
    const result = await getSoftwarePhoto("org_1", "sw_1");

    expect(result?.mimeType).toBe("image/webp");
    expect(readMediaFile).toHaveBeenCalledWith("org_1", "sw-photo-sw_1");
  });
});
