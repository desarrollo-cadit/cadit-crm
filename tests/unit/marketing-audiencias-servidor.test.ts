import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 045 (T022; FR-001…FR-005, FR-027) — El servidor de audiencias con dobles de
 * base: opciones de filtros, CRUD y la evaluación (exclusiones + página).
 *
 * El doble resuelve cada `select` recién cuando se lo espera (`await`), así
 * las subconsultas `exists(...)` —que se arman pero no se esperan— no
 * consumen la cola.
 */

const selectQueue: unknown[][] = [];
const inserts: { table: unknown; values: unknown }[] = [];
const updates: { table: unknown; set: Record<string, unknown> }[] = [];
const deletes: { table: unknown }[] = [];

function chain() {
  const c: Record<string, unknown> = {};
  for (const m of [
    "from",
    "innerJoin",
    "leftJoin",
    "where",
    "orderBy",
    "limit",
    "offset",
    "groupBy",
    "as",
  ]) {
    c[m] = () => c;
  }
  c.getSQL = () => ({ queryChunks: [] });
  (c as { then: unknown }).then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
    Promise.resolve(selectQueue.shift() ?? []).then(resolve, reject);
  return c;
}

vi.mock("@/lib/db", () => {
  const db = {
    select: () => chain(),
    selectDistinct: () => chain(),
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        inserts.push({ table, values });
        return Promise.resolve([values]);
      },
    }),
    update: (table: unknown) => ({
      set: (set: Record<string, unknown>) => {
        updates.push({ table, set });
        return { where: () => Promise.resolve([]) };
      },
    }),
    delete: (table: unknown) => {
      deletes.push({ table });
      return { where: () => Promise.resolve([]) };
    },
  };
  return {
    getRootDb: () => db,
    getDb: () => db,
    schema: new Proxy(
      {},
      {
        get: (_t, tableName) =>
          new Proxy(
            { __table: String(tableName) },
            {
              get: (target, col) =>
                col === "__table" ? target.__table : `${String(tableName)}.${String(col)}`,
            }
          ),
      }
    ),
  };
});

beforeEach(() => {
  selectQueue.length = 0;
  inserts.length = 0;
  updates.length = 0;
  deletes.length = 0;
});

const tabla = (t: unknown) => (t as { __table: string }).__table;

describe("opcionesDeFiltros", () => {
  it("sin formularios, grupos ni empresas → listas vacías, nunca error; siempre la opción WhatsApp", async () => {
    const { opcionesDeFiltros } = await import("@/server/marketing/audiences");
    const o = await opcionesDeFiltros("org_1");
    expect(o.sources).toEqual([{ value: "whatsapp", label: "WhatsApp", count: 0 }]);
    expect(o.stages).toEqual([]);
    expect(o.cohorts).toEqual([]);
    expect(o.courses).toEqual([]);
    expect(o.companies).toEqual([]);
  });

  it("cuenta personas distintas por origen (contacto o formulario) y suma WhatsApp", async () => {
    selectQueue.push(
      [
        { source: "formulario:Revit", contactId: "c1" },
        { source: "whatsapp", contactId: "c9" },
      ],
      [
        { source: "formulario:Revit", contactId: "c1" },
        { source: "formulario:Revit", contactId: "c2" },
        { source: "formulario:Taller BIM", contactId: "c3" },
      ],
      [{ contactId: "c4" }, { contactId: "c9" }]
    );
    const { opcionesDeFiltros } = await import("@/server/marketing/audiences");
    const o = await opcionesDeFiltros("org_1");
    expect(o.sources).toEqual([
      { value: "whatsapp", label: "WhatsApp", count: 2 },
      { value: "formulario:Revit", label: "Formulario: Revit", count: 2 },
      { value: "formulario:Taller BIM", label: "Formulario: Taller BIM", count: 1 },
    ]);
  });
});

describe("crearAudiencia", () => {
  it("nombre repetido (sin distinguir mayúsculas) → `duplicate`, sin insertar", async () => {
    selectQueue.push([{ id: "mka_otra" }]);
    const { crearAudiencia } = await import("@/server/marketing/audiences");
    const r = await crearAudiencia("org_1", "usr_1", { name: "Perdidos", filters: { v: 1 } });
    expect(r).toEqual({ ok: false, code: "duplicate" });
    expect(inserts).toHaveLength(0);
  });

  it("nombre libre → inserta con la organización y quien la creó", async () => {
    const creada = {
      id: "mka_1",
      name: "Perdidos",
      filters: { v: 1 },
      createdAt: new Date("2026-10-22T10:00:00Z"),
      createdByName: "Mariana",
    };
    selectQueue.push([], [creada]);
    const { crearAudiencia } = await import("@/server/marketing/audiences");
    const r = await crearAudiencia("org_1", "usr_1", { name: " Perdidos ", filters: { v: 1 } });
    expect(r.ok).toBe(true);
    expect(inserts).toHaveLength(1);
    expect(tabla(inserts[0]!.table)).toBe("marketingAudience");
    expect(inserts[0]!.values).toMatchObject({
      organizationId: "org_1",
      name: "Perdidos",
      createdBy: "usr_1",
      filters: { v: 1 },
    });
    if (r.ok) {
      expect(r.audience).toEqual({
        id: "mka_1",
        name: "Perdidos",
        filters: { v: 1 },
        createdAt: "2026-10-22T10:00:00.000Z",
        createdByName: "Mariana",
      });
    }
  });
});

describe("actualizarAudiencia", () => {
  it("sin ningún campo → `invalid_body` sin tocar la base", async () => {
    const { actualizarAudiencia } = await import("@/server/marketing/audiences");
    const r = await actualizarAudiencia("org_1", "mka_1", {});
    expect(r).toEqual({ ok: false, code: "invalid_body" });
    expect(updates).toHaveLength(0);
  });

  it("id ajeno o inexistente → `not_found`", async () => {
    selectQueue.push([]);
    const { actualizarAudiencia } = await import("@/server/marketing/audiences");
    expect(await actualizarAudiencia("org_1", "mka_x", { name: "Otro" })).toEqual({
      ok: false,
      code: "not_found",
    });
  });

  it("renombrar a un nombre ocupado → `duplicate`", async () => {
    selectQueue.push([{ id: "mka_1" }], [{ id: "mka_2" }]);
    const { actualizarAudiencia } = await import("@/server/marketing/audiences");
    expect(await actualizarAudiencia("org_1", "mka_1", { name: "Ocupado" })).toEqual({
      ok: false,
      code: "duplicate",
    });
    expect(updates).toHaveLength(0);
  });
});

describe("borrarAudiencia", () => {
  it("deja `audience_id = NULL` en las campañas, sin tocar sus filtros copiados, y la borra", async () => {
    selectQueue.push([{ id: "mka_1" }]);
    const { borrarAudiencia } = await import("@/server/marketing/audiences");
    expect(await borrarAudiencia("org_1", "mka_1")).toBe(true);
    const deCampana = updates.filter((u) => tabla(u.table) === "marketingCampaign");
    expect(deCampana).toHaveLength(1);
    expect(deCampana[0]!.set.audienceId).toBeNull();
    expect(Object.keys(deCampana[0]!.set)).not.toContain("filters");
    expect(deletes.map((d) => tabla(d.table))).toEqual(["marketingAudience"]);
  });

  it("inexistente → false", async () => {
    selectQueue.push([]);
    const { borrarAudiencia } = await import("@/server/marketing/audiences");
    expect(await borrarAudiencia("org_1", "mka_x")).toBe(false);
    expect(deletes).toHaveLength(0);
  });
});

describe("evaluarAudiencia", () => {
  const fila = (id: string, extra: Record<string, unknown> = {}) => ({
    contactId: id,
    firstName: id.toUpperCase(),
    lastName: null,
    email: `${id}@example.com`,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    archivedAt: null,
    prueba: false,
    baja: false,
    ...extra,
  });

  it("siempre excluye prueba y baja (por contacto o correo), y cuenta por motivo", async () => {
    selectQueue.push([
      fila("a"),
      fila("b", { prueba: true }),
      fila("c", { baja: true }),
      fila("d", { archivedAt: new Date() }),
      fila("e", { email: null }),
    ]);
    const { evaluarAudiencia } = await import("@/server/marketing/audiences");
    const r = await evaluarAudiencia("org_1", { v: 1 }, { page: 1, pageSize: 25 });
    expect(r.count).toBe(1);
    expect(r.excluded).toEqual({ prueba: 1, baja: 1, archivado: 1, sin_correo: 1, duplicado: 0 });
    expect(r.recipients).toEqual([{ contactId: "a", name: "A", email: "a@example.com" }]);
    expect(r.overCap).toBe(false);
  });

  it("pagina ordenando por nombre", async () => {
    selectQueue.push(
      Array.from({ length: 30 }, (_, i) => fila(`p${String(i).padStart(2, "0")}`))
    );
    const { evaluarAudiencia } = await import("@/server/marketing/audiences");
    const r = await evaluarAudiencia("org_1", { v: 1 }, { page: 2, pageSize: 25 });
    expect(r.count).toBe(30);
    expect(r.page).toBe(2);
    expect(r.pageSize).toBe(25);
    expect(r.recipients.map((x) => x.contactId)).toEqual(["p25", "p26", "p27", "p28", "p29"]);
  });

  it("con rango de fechas lee la zona de la organización antes de los candidatos", async () => {
    selectQueue.push([{ timezone: "America/Montevideo" }], [fila("a")]);
    const { evaluarAudiencia } = await import("@/server/marketing/audiences");
    const r = await evaluarAudiencia(
      "org_1",
      { v: 1, createdFrom: "2026-01-01", createdTo: "2026-01-31" },
      { page: 1, pageSize: 25 }
    );
    expect(r.count).toBe(1);
    expect(selectQueue).toHaveLength(0);
  });
});
