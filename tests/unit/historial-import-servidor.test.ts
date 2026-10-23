import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FilaHistorica } from "@/lib/historial-import/planilla";

/**
 * 046 US6 (T051; FR-017…FR-020) — Aplicar una tanda y deshacer, con dobles
 * de base. Datos inventados.
 */

const selectQueue: unknown[][] = [];
type Insert = { table: string; values: unknown };
const inserts: Insert[] = [];
const updates: { table: string; set: Record<string, unknown> }[] = [];
const deletes: { table: string }[] = [];

const tabla = (t: unknown) => (t as { __table: string }).__table;

function chain() {
  const c: Record<string, unknown> = {};
  for (const m of ["from", "innerJoin", "leftJoin", "where", "orderBy", "limit"]) c[m] = () => c;
  (c as { then: unknown }).then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
    Promise.resolve(selectQueue.shift() ?? []).then(resolve, reject);
  return c;
}

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => chain(),
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        inserts.push({ table: tabla(table), values });
        const filas = (Array.isArray(values) ? values : [values]) as { id: string }[];
        const devolver = () => Promise.resolve(filas.map((v) => ({ id: v.id })));
        const conflicto = { returning: devolver, then: (r: (v: unknown) => void) => Promise.resolve([]).then(r) };
        return {
          onConflictDoNothing: () => conflicto,
          returning: devolver,
          then: (r: (v: unknown) => void) => Promise.resolve([]).then(r),
        };
      },
    }),
    update: (table: unknown) => ({
      set: (set: Record<string, unknown>) => {
        updates.push({ table: tabla(table), set });
        return { where: () => Promise.resolve([]) };
      },
    }),
    delete: (table: unknown) => {
      deletes.push({ table: tabla(table) });
      return { where: () => ({ returning: () => Promise.resolve([{ id: "hct_1" }, { id: "hct_2" }]) }) };
    },
  }),
  schema: new Proxy(
    {},
    {
      get: (_t, nombre) =>
        new Proxy({ __table: String(nombre) }, { get: (t, col) => (col === "__table" ? t.__table : `${String(nombre)}.${String(col)}`) }),
    }
  ),
}));

const { aplicarTanda, deshacerImportacion } = await import("@/server/historial-import");

function fila(p: Partial<FilaHistorica>): FilaHistorica {
  return {
    fila: 2,
    nombre: "Lucía",
    apellido: "Inventada",
    correo: "lucia@ejemplo.test",
    telefono: null,
    empresa: null,
    curso: "Revit Arquitectura",
    cursoOriginal: null,
    estudiante: false,
    edicion: null,
    fecha: "2021-03-15",
    vendedor: "",
    nota: null,
    ...p,
  };
}

function batch(p: Record<string, unknown> = {}) {
  return {
    id: "hib_1",
    sourceLabel: "planilla 2020–2024",
    fileName: "historial.csv",
    status: "aplicando",
    mapping: { cursos: { "Revit Arquitectura": "crs_arq" }, vendedores: {} },
    pendingRows: [fila({}), fila({ correo: "nuevo@ejemplo.test", empresa: "Estudio Inventado", fila: 3 })],
    totalRows: 2,
    processedRows: 0,
    problemRows: 1,
    contactsCreated: 0,
    contactsCompleted: 0,
    companiesCreated: 0,
    takingsCreated: 0,
    takingsExisting: 0,
    importedByName: "Dirección",
    createdAt: new Date("2026-10-23T12:00:00Z"),
    finishedAt: null,
    undoneAt: null,
    ...p,
  };
}

beforeEach(() => {
  selectQueue.length = 0;
  inserts.length = 0;
  updates.length = 0;
  deletes.length = 0;
});

describe("aplicarTanda", () => {
  it("importación ajena o inexistente → null", async () => {
    selectQueue.push([]);
    expect(await aplicarTanda("org_1", "hib_x")).toBeNull();
  });

  it("deshecha → no_aplicable, sin escribir", async () => {
    selectQueue.push([batch({ status: "deshecha" })]);
    expect(await aplicarTanda("org_1", "hib_1")).toEqual({ error: "no_aplicable" });
    expect(inserts).toEqual([]);
  });

  it("crea empresas, después contactos y después cursadas; completa sin pisar y termina la importación", async () => {
    selectQueue.push([batch()]); // la importación
    selectQueue.push([
      {
        id: "ct_lucia",
        firstName: "Lucía",
        lastName: null,
        email: "Lucia@Ejemplo.test",
        phone: null,
        waIdentity: "sinwa:ct_lucia",
        companyId: null,
      },
    ]); // contactos
    selectQueue.push([]); // empresas
    selectQueue.push([]); // cursadas ya existentes
    selectQueue.push([batch({ status: "aplicada", processedRows: 2 })]); // la importación, releída

    const r = await aplicarTanda("org_1", "hib_1");
    expect(r).toMatchObject({ status: "aplicada" });

    expect(inserts.map((i) => i.table)).toEqual(["company", "contact", "historicalCourseTaking"]);
    const [contacto] = inserts[1]!.values as Record<string, unknown>[];
    expect(contacto).toMatchObject({
      organizationId: "org_1",
      firstName: "Lucía",
      email: "nuevo@ejemplo.test",
      phone: null,
      source: "importacion:planilla-2020-2024",
    });
    expect(String(contacto!.waIdentity)).toMatch(/^sinwa:/);
    const cursadas = inserts[2]!.values as Record<string, unknown>[];
    expect(cursadas).toHaveLength(2);
    expect(cursadas[0]).toMatchObject({
      contactId: "ct_lucia",
      courseId: "crs_arq",
      batchId: "hib_1",
      dedupKey: "ct_lucia|curso:crs_arq|2021-03-15",
      sourceLabel: "planilla 2020–2024",
    });
    expect(cursadas[0]!.takenOn).toEqual(new Date("2021-03-15T00:00:00Z"));

    // Lucía ya existía: solo se completa su apellido vacío (con coalesce, nunca pisa).
    const deContacto = updates.filter((u) => u.table === "contact");
    expect(deContacto).toHaveLength(1);
    expect(Object.keys(deContacto[0]!.set).sort()).toEqual(["lastName", "updatedAt"]);

    const deLaImportacion = updates.find((u) => u.table === "historicalImportBatch")!.set;
    expect(deLaImportacion).toMatchObject({
      processedRows: 2,
      contactsCreated: 1,
      contactsCompleted: 1,
      companiesCreated: 1,
      takingsCreated: 2,
      takingsExisting: 0,
      status: "aplicada",
      pendingRows: null,
    });
  });
});

describe("deshacerImportacion", () => {
  it("borra solo las cursadas de esa importación y la marca deshecha", async () => {
    selectQueue.push([batch({ status: "aplicada" })]);
    selectQueue.push([batch({ status: "deshecha" })]);
    const r = await deshacerImportacion("org_1", "usr_1", "hib_1");
    expect(r).toMatchObject({ status: "deshecha" });
    expect(deletes.map((d) => d.table)).toEqual(["historicalCourseTaking"]);
    expect(updates[0]).toMatchObject({
      table: "historicalImportBatch",
      set: expect.objectContaining({ status: "deshecha", undoneBy: "usr_1", pendingRows: null }),
    });
  });

  it("importación ajena → null, sin borrar", async () => {
    selectQueue.push([]);
    expect(await deshacerImportacion("org_1", "usr_1", "hib_x")).toBeNull();
    expect(deletes).toEqual([]);
  });
});
