import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { claveDeStock } from "@/lib/license-team";

/**
 * 0089 — El lado servidor de la conciliación con Autodesk, con la base
 * reemplazada por un doble: los asientos ajenos restan del disponible, marcar a
 * quien Autodesk ya tiene es neto cero, y importar valida, recuerda y cierra
 * tareas. Archivos y personas SINTÉTICOS.
 */

const inserts: { table: unknown; values: unknown }[] = [];
const updates: { table: unknown; set: unknown }[] = [];
const deletes: { table: unknown }[] = [];
const selectQueue: unknown[][] = [];
let ajenos = new Map<string, number>();

function cadena(rows: unknown[]) {
  const c: Record<string, unknown> = {};
  for (const m of ["from", "innerJoin", "leftJoin", "where", "orderBy", "limit", "groupBy"]) c[m] = () => c;
  (c as { then: unknown }).then = (resolve: (v: unknown) => void) => Promise.resolve(rows).then(resolve);
  return c;
}

/** Algo que se puede `await`ar tal cual o seguir encadenando (`returning`, upserts). */
function escritura(devuelve: unknown[]) {
  const e: Record<string, unknown> = {
    returning: () => Promise.resolve(devuelve),
    onConflictDoUpdate: () => e,
    onConflictDoNothing: () => e,
  };
  (e as { then: unknown }).then = (resolve: (v: unknown) => void) => Promise.resolve(devuelve).then(resolve);
  return e;
}

vi.mock("@/lib/db", () => ({
  getRootDb: () => ({ transaction: async (fn: (tx: unknown) => unknown) => fn({ execute: async () => [] }) }),
  getDb: () => ({
    execute: async () => [],
    select: () => cadena(selectQueue.shift() ?? []),
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        inserts.push({ table, values });
        return escritura([{ ...(values as object) }]);
      },
    }),
    update: (table: unknown) => ({
      set: (set: unknown) => {
        updates.push({ table, set });
        return { where: () => escritura([{ id: "lic_updated", ...(set as object) }]) };
      },
    }),
    delete: (table: unknown) => {
      deletes.push({ table });
      return { where: () => escritura([]) };
    },
  }),
  schema: new Proxy(
    {},
    {
      get: (_t, tabla) =>
        new Proxy(
          { __tabla: String(tabla) },
          { get: (t, col) => (col === "__tabla" ? t.__tabla : `${String(tabla)}.${String(col)}`) }
        ),
    }
  ),
}));

vi.mock("@/server/license-ajenos", () => ({
  asientosAjenos: async () => ajenos,
  fotosDeLosEquipos: async () => new Map(),
}));

/** El nombre de la tabla de un registro del doble (`schema.<tabla>`). */
const tabla = (t: unknown) => (t as { __tabla: string }).__tabla;

beforeEach(() => {
  inserts.length = 0;
  updates.length = 0;
  deletes.length = 0;
  selectQueue.length = 0;
  ajenos = new Map();
});

const VIVA = new Date("2027-12-31T00:00:00.000Z");
const EMPEZO = new Date("2020-01-01T00:00:00.000Z");
const ocupada = (softwareId: string) => ({ softwareId, assigned: true, expiresAt: null, startDate: EMPEZO, endDate: VIVA });

describe("los asientos ajenos restan del disponible", () => {
  it("availableLicenses: cupo − ocupadas − lo que Autodesk tiene y el campus no cuenta", async () => {
    const { availableLicenses } = await import("@/server/licenses");
    ajenos = new Map([[claveDeStock("team_uy", "sw_1"), 2]]);
    selectQueue.push([{ name: "Revit", total: 10 }], [ocupada("sw_1"), ocupada("sw_1"), ocupada("sw_1")]);
    expect(await availableLicenses("org_1", "sw_1", "team_uy")).toEqual({
      softwareId: "sw_1",
      softwareName: "Revit",
      total: 10,
      assignedCount: 3,
      externos: 2,
      available: 5,
    });
  });

  it("sin importaciones no cambia nada", async () => {
    const { availableLicenses } = await import("@/server/licenses");
    selectQueue.push([{ name: "Revit", total: 10 }], [ocupada("sw_1")]);
    expect(await availableLicenses("org_1", "sw_1", "team_uy")).toMatchObject({ externos: 0, available: 9 });
  });

  it("los ajenos de OTRO programa no se mezclan", async () => {
    const { availableLicenses } = await import("@/server/licenses");
    ajenos = new Map([[claveDeStock("team_uy", "sw_2"), 4]]);
    selectQueue.push([{ name: "Revit", total: 10 }], []);
    expect(await availableLicenses("org_1", "sw_1", "team_uy")).toMatchObject({ externos: 0, available: 10 });
  });

  it("el inventario del inicio también los resta", async () => {
    const { listLicenseInventory } = await import("@/server/licenses");
    ajenos = new Map([
      [claveDeStock("team_uy", "sw_1"), 2],
      [claveDeStock("team_py", "sw_1"), 1],
    ]);
    selectQueue.push([{ id: "sw_1", name: "Revit", total: 110 }], [ocupada("sw_1"), ocupada("sw_1")]);
    expect(await listLicenseInventory("org_1")).toEqual([
      { softwareId: "sw_1", softwareName: "Revit", total: 110, assignedCount: 2, externos: 3, available: 105 },
    ]);
  });
});

describe("asignar a quien Autodesk ya tiene es neto cero", () => {
  /** Un equipo con cupo 2: 1 lo ocupa el campus y 1 lo tiene Autodesk (ajeno). Lleno. */
  function equipoLleno() {
    ajenos = new Map([[claveDeStock("team_uy", "sw_1"), 1]]);
    selectQueue.push(
      [{ id: "enr_1", parentEnrollmentId: null, cohortId: null, hadOwnLicense: false }], // sin cohorte: no se mira el grupo
      [{ id: "team_uy", name: "Uruguay ATC", archivedAt: null }],
      [{ name: "Revit", total: 2 }],
      [ocupada("sw_1")],
      [] // sin licencia previa
    );
  }

  it("normal: con el equipo lleno por un asiento ajeno, asignar es 409 no_stock", async () => {
    const { assignLicense } = await import("@/server/licenses");
    equipoLleno();
    const r = await assignLicense("org_1", "enr_1", "sw_1", "team_uy");
    expect(r).toMatchObject({ ok: false, status: 409, code: "no_stock" });
    expect(inserts).toHaveLength(0);
  });

  it("desde la conciliación (yaOcupaEnAutodesk): ese asiento ya era de esa persona, se asigna", async () => {
    const { assignLicense } = await import("@/server/licenses");
    equipoLleno();
    const r = await assignLicense("org_1", "enr_1", "sw_1", "team_uy", { yaOcupaEnAutodesk: true });
    expect(r.ok).toBe(true);
    expect(inserts).toHaveLength(1);
  });

  it("la excepción es de UN asiento: sin asientos ajenos, el equipo lleno sigue rechazando", async () => {
    const { assignLicense } = await import("@/server/licenses");
    selectQueue.push(
      [{ id: "enr_1", parentEnrollmentId: null, cohortId: null, hadOwnLicense: false }],
      [{ id: "team_uy", name: "Uruguay ATC", archivedAt: null }],
      [{ name: "Revit", total: 1 }],
      [ocupada("sw_1")],
      []
    );
    const r = await assignLicense("org_1", "enr_1", "sw_1", "team_uy", { yaOcupaEnAutodesk: true });
    expect(r).toMatchObject({ ok: false, status: 409, code: "no_stock" });
  });

  it("a un profesor, igual", async () => {
    const { assignTeacherLicense } = await import("@/server/licenses");
    ajenos = new Map([[claveDeStock("team_uy", "sw_1"), 1]]);
    selectQueue.push(
      [{ id: "tch_1" }],
      [{ id: "team_uy", name: "Uruguay ATC", archivedAt: null }],
      [{ name: "Revit", total: 1 }],
      [],
      []
    );
    const r = await assignTeacherLicense("org_1", "tch_1", "sw_1", "team_uy", { yaOcupaEnAutodesk: true });
    expect(r.ok).toBe(true);
  });

  it("pasar una licencia al equipo de Autodesk también es neto cero", async () => {
    const { moverLicenciaDeEquipo } = await import("@/server/licenses");
    ajenos = new Map([[claveDeStock("team_uy", "sw_1"), 1]]);
    const licencia = {
      id: "lic_1",
      teamId: "team_py",
      softwareId: "sw_1",
      source: "individual",
      assigned: true,
      expiresAt: null,
      teacherId: null,
    };
    selectQueue.push(
      [{ license: licencia, startDate: EMPEZO, endDate: VIVA }],
      [{ id: "team_uy", name: "Uruguay ATC", archivedAt: null }],
      [{ name: "Revit", total: 1 }],
      []
    );
    const r = await moverLicenciaDeEquipo("org_1", "lic_1", "team_uy", { yaOcupaEnAutodesk: true });
    expect(r.ok).toBe(true);
  });
});

/* ============================================================
 * Importar
 * ============================================================ */

import { deflateRawSync } from "node:zlib";

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function xlsx(filas: string[][]): Uint8Array {
  const cols = "ABCDEFGHIJ";
  const cab = ["team_alias", "first_name", "last_name", "email", "autodesk_id", "role", "account_status", "offering_name", "product_name"];
  const hoja =
    `<worksheet><sheetData>` +
    [cab, ...filas]
      .map(
        (f, i) =>
          `<row>` +
          f.map((v, j) => `<c r="${cols[j]}${i + 1}" t="inlineStr"><is><t>${v}</t></is></c>`).join("") +
          `</row>`
      )
      .join("") +
    `</sheetData></worksheet>`;
  const nombre = Buffer.from("xl/worksheets/sheet1.xml");
  const crudo = Buffer.from(hoja);
  const datos = deflateRawSync(crudo);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(crc32(crudo), 14);
  local.writeUInt32LE(datos.length, 18);
  local.writeUInt32LE(crudo.length, 22);
  local.writeUInt16LE(nombre.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(datos.length, 20);
  central.writeUInt32LE(crudo.length, 24);
  central.writeUInt16LE(nombre.length, 28);
  const dir = Buffer.concat([central, nombre]);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(1, 8);
  fin.writeUInt16LE(1, 10);
  fin.writeUInt32LE(dir.length, 12);
  fin.writeUInt32LE(30 + nombre.length + datos.length, 16);
  return new Uint8Array(Buffer.concat([local, nombre, datos, dir, fin]));
}

const u = (correo: string, oferta: string, alias = "Uruguay ATC") =>
  [alias, "Ana", "Prueba", correo, "id", "User", "Verified", oferta, "Producto"];

const EQUIPO = [{ id: "team_uy", name: "Uruguay ATC", archivedAt: null }];
const PROGRAMAS = [
  { id: "sw_revit", name: "Revit" },
  { id: "sw_autocad", name: "AutoCAD" },
];

describe("importarArchivo", () => {
  it("un equipo inexistente es 404; uno archivado, 422", async () => {
    const { importarArchivo } = await import("@/server/autodesk-import");
    const bytes = xlsx([u("ana@ejemplo.test", "Revit")]);
    selectQueue.push([]);
    expect(await importarArchivo("org_1", "u1", { nombre: "u.xlsx", bytes, teamId: "x", mapeo: {}, guardarAlias: false })).toMatchObject({
      ok: false,
      status: 404,
    });
    selectQueue.push([{ id: "team_uy", name: "Uruguay ATC", archivedAt: new Date() }]);
    expect(await importarArchivo("org_1", "u1", { nombre: "u.xlsx", bytes, teamId: "team_uy", mapeo: {}, guardarAlias: false })).toMatchObject({
      ok: false,
      status: 422,
      code: "equipo_archivado",
    });
  });

  it("una oferta sin programa elegido no se importa: 422 que la nombra, sin escribir nada", async () => {
    const { importarArchivo } = await import("@/server/autodesk-import");
    selectQueue.push(EQUIPO, PROGRAMAS, []);
    const r = await importarArchivo("org_1", "u1", {
      nombre: "u.xlsx",
      bytes: xlsx([u("ana@ejemplo.test", "Revit"), u("beto@ejemplo.test", "Navisworks Manage")]),
      teamId: "team_uy",
      mapeo: { revit: "sw_revit" },
      guardarAlias: false,
    });
    expect(r).toMatchObject({ ok: false, status: 422, code: "ofertas_sin_mapear" });
    if (!r.ok) expect(r.message).toContain("Navisworks Manage");
    expect(inserts).toHaveLength(0);
  });

  it("una sugerencia que nadie confirmó NO cuenta como elegida", async () => {
    const { importarArchivo } = await import("@/server/autodesk-import");
    // «Revit» coincide exacto con un programa, pero el cliente no mandó el mapeo.
    selectQueue.push(EQUIPO, PROGRAMAS, []);
    const r = await importarArchivo("org_1", "u1", {
      nombre: "u.xlsx",
      bytes: xlsx([u("ana@ejemplo.test", "Revit")]),
      teamId: "team_uy",
      mapeo: {},
      guardarAlias: false,
    });
    expect(r).toMatchObject({ ok: false, code: "ofertas_sin_mapear" });
  });

  it("guarda la foto (una fila por correo y programa), recuerda el mapeo y no toca ninguna licencia", async () => {
    const { importarArchivo } = await import("@/server/autodesk-import");
    selectQueue.push(EQUIPO, PROGRAMAS, [], [{ id: "lote_nuevo" }], []);
    const r = await importarArchivo("org_1", "u1", {
      nombre: "usuarios.xlsx",
      bytes: xlsx([
        u("ana@ejemplo.test", "Revit"),
        u("ana@ejemplo.test", "Revit"), // otro sub-producto de la misma licencia
        u("ana@ejemplo.test", "AutoCAD - including specialized toolsets"),
        u("beto@ejemplo.test", "Revit"),
        u("beto@ejemplo.test", "ReCap Pro"), // no se gestiona
      ]),
      teamId: "team_uy",
      mapeo: {
        revit: "sw_revit",
        "autocad - including specialized toolsets": "sw_autocad",
        "recap pro": null,
      },
      guardarAlias: false,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toMatchObject({ licencias: 3, personas: 2, ignoradas: 1, tareasCerradas: 0 });

    const tablas = inserts.map((i) => tabla(i.table));
    // Mapeo de las tres ofertas, un lote y sus filas.
    expect(tablas.filter((t) => t === "licenseOfferingMap").length).toBe(3);
    const lote = inserts.find((i) => tabla(i.table) === "licenseImportBatch")!.values as Record<string, unknown>;
    expect(lote).toMatchObject({ teamId: "team_uy", fileName: "usuarios.xlsx", people: 2, licenses: 3, ignored: 1 });
    const filas = inserts.find((i) => tabla(i.table) === "licenseImportRow")!.values as { email: string; softwareId: string }[];
    expect(filas.map((f) => `${f.email}|${f.softwareId}`).sort()).toEqual([
      "ana@ejemplo.test|sw_autocad",
      "ana@ejemplo.test|sw_revit",
      "beto@ejemplo.test|sw_revit",
    ]);
    // Importar NO escribe licencias del campus.
    expect(tablas).not.toContain("license");
    expect(updates.filter((x) => tabla(x.table) === "license")).toHaveLength(0);
  });

  it("conserva las últimas 6 importaciones del equipo y borra las más viejas", async () => {
    const { importarArchivo } = await import("@/server/autodesk-import");
    const lotes = Array.from({ length: 8 }, (_, i) => ({ id: `lote_${i}` }));
    selectQueue.push(EQUIPO, PROGRAMAS, [], lotes, []);
    await importarArchivo("org_1", "u1", {
      nombre: "u.xlsx",
      bytes: xlsx([u("ana@ejemplo.test", "Revit")]),
      teamId: "team_uy",
      mapeo: { revit: "sw_revit" },
      guardarAlias: false,
    });
    expect(deletes.filter((d) => tabla(d.table) === "licenseImportBatch")).toHaveLength(1);
  });

  it("con 6 o menos, no borra nada", async () => {
    const { importarArchivo } = await import("@/server/autodesk-import");
    selectQueue.push(EQUIPO, PROGRAMAS, [], Array.from({ length: 6 }, (_, i) => ({ id: `lote_${i}` })), []);
    await importarArchivo("org_1", "u1", {
      nombre: "u.xlsx",
      bytes: xlsx([u("ana@ejemplo.test", "Revit")]),
      teamId: "team_uy",
      mapeo: { revit: "sw_revit" },
      guardarAlias: false,
    });
    expect(deletes).toHaveLength(0);
  });

  it("cierra solas las tareas pendientes que el archivo ya muestra hechas", async () => {
    const { importarArchivo } = await import("@/server/autodesk-import");
    const tareaAsignar = {
      id: "tarea_1",
      teamId: "team_uy",
      softwareId: "sw_revit",
      kind: "asignar_en_autodesk",
      email: "ana@ejemplo.test",
      contactId: null,
      teacherId: null,
      personName: "Ana",
      createdAt: new Date("2026-10-01T00:00:00.000Z"),
    };
    const tareaSacar = { ...tareaAsignar, id: "tarea_2", kind: "sacar_en_autodesk", email: "beto@ejemplo.test" };
    selectQueue.push(EQUIPO, PROGRAMAS, [], [{ id: "lote_nuevo" }], [tareaAsignar, tareaSacar]);
    const r = await importarArchivo("org_1", "u1", {
      nombre: "u.xlsx",
      bytes: xlsx([u("ana@ejemplo.test", "Revit")]), // Ana ya aparece; Beto ya no
      teamId: "team_uy",
      mapeo: { revit: "sw_revit" },
      guardarAlias: false,
    });
    expect(r.ok && r.data.tareasCerradas).toBe(2);
    const cierre = updates.find((x) => tabla(x.table) === "licenseAutodeskTask")!.set as { status: string; closedByBatchId: string };
    expect(cierre.status).toBe("cerrada");
    expect(cierre.closedByBatchId).toMatch(/^lib_/);
  });

  it("guarda el alias del equipo solo si todavía no tenía uno", async () => {
    const { importarArchivo } = await import("@/server/autodesk-import");
    selectQueue.push(EQUIPO, PROGRAMAS, [], [{ autodeskAlias: null }], [{ id: "lote_nuevo" }], []);
    await importarArchivo("org_1", "u1", {
      nombre: "u.xlsx",
      bytes: xlsx([u("ana@ejemplo.test", "Revit")]),
      teamId: "team_uy",
      mapeo: { revit: "sw_revit" },
      guardarAlias: true,
    });
    const alias = updates.find((x) => tabla(x.table) === "licenseTeam")!.set as { autodeskAlias: string };
    expect(alias.autodeskAlias).toBe("Uruguay ATC");

    updates.length = 0;
    selectQueue.push(EQUIPO, PROGRAMAS, [], [{ autodeskAlias: "Otro nombre" }], [{ id: "lote_nuevo" }], []);
    await importarArchivo("org_1", "u1", {
      nombre: "u.xlsx",
      bytes: xlsx([u("ana@ejemplo.test", "Revit")]),
      teamId: "team_uy",
      mapeo: { revit: "sw_revit" },
      guardarAlias: true,
    });
    expect(updates.find((x) => tabla(x.table) === "licenseTeam")).toBeUndefined();
  });

  it("un archivo con dos equipos o basura es 422 antes de tocar la base", async () => {
    const { importarArchivo } = await import("@/server/autodesk-import");
    expect(
      await importarArchivo("org_1", "u1", {
        nombre: "u.xlsx",
        bytes: xlsx([u("ana@ejemplo.test", "Revit", "Uruguay ATC"), u("beto@ejemplo.test", "Revit", "Paraguay ATC")]),
        teamId: "team_uy",
        mapeo: {},
        guardarAlias: false,
      })
    ).toMatchObject({ ok: false, status: 422, code: "equipos_varios" });
    expect(
      await importarArchivo("org_1", "u1", {
        nombre: "u.xlsx",
        bytes: new TextEncoder().encode("basura"),
        teamId: "team_uy",
        mapeo: {},
        guardarAlias: false,
      })
    ).toMatchObject({ ok: false, status: 422, code: "archivo_invalido" });
    expect(inserts).toHaveLength(0);
  });
});

describe("vistaPreviaDeImportacion", () => {
  it("propone el equipo cuyo alias de Autodesk coincide con el del archivo", async () => {
    const { vistaPreviaDeImportacion } = await import("@/server/autodesk-import");
    selectQueue.push(PROGRAMAS, [], [
      { id: "team_py", name: "Paraguay ATC", autodeskAlias: "Paraguay ATC", archivedAt: null },
      { id: "team_uy", name: "Uruguay ATC", autodeskAlias: "uruguay atc", archivedAt: null },
    ]);
    const r = await vistaPreviaDeImportacion("org_1", {
      nombre: "u.xlsx",
      bytes: xlsx([u("ana@ejemplo.test", "Revit")]),
      mapeo: {},
      conDetalle: true,
    });
    expect(r.ok && r.data.equipoPropuesto).toBe("team_uy");
    expect(r.ok && r.data.importable).toBe(false);
  });

  it("avisa si el archivo es de otro equipo que el elegido", async () => {
    const { vistaPreviaDeImportacion } = await import("@/server/autodesk-import");
    selectQueue.push(PROGRAMAS, [], [
      { id: "team_py", name: "Paraguay ATC", autodeskAlias: "Paraguay ATC", archivedAt: null },
      { id: "team_uy", name: "Uruguay ATC", autodeskAlias: "Uruguay ATC", archivedAt: null },
    ]);
    const r = await vistaPreviaDeImportacion("org_1", {
      nombre: "u.xlsx",
      bytes: xlsx([u("ana@ejemplo.test", "Revit")]),
      teamId: "team_py",
      mapeo: {},
      conDetalle: true,
    });
    expect(r.ok && r.data.avisoDeEquipo).toMatch(/Uruguay ATC.*Paraguay ATC/);
  });

  it("ofrece guardar el alias cuando el equipo elegido no tiene uno", async () => {
    const { vistaPreviaDeImportacion } = await import("@/server/autodesk-import");
    selectQueue.push(PROGRAMAS, [], [{ id: "team_uy", name: "Uruguay ATC", autodeskAlias: null, archivedAt: null }]);
    const r = await vistaPreviaDeImportacion("org_1", {
      nombre: "u.xlsx",
      bytes: xlsx([u("ana@ejemplo.test", "Revit")]),
      teamId: "team_uy",
      mapeo: {},
      conDetalle: true,
    });
    expect(r.ok && r.data.puedeGuardarAlias).toBe(true);
    expect(r.ok && r.data.avisoDeEquipo).toBeNull();
  });

  it("el mapeo recordado gana, el sugerido se marca como tal y el enviado pisa a los dos", async () => {
    const { vistaPreviaDeImportacion } = await import("@/server/autodesk-import");
    selectQueue.push(
      PROGRAMAS,
      [{ clave: "autocad - including specialized toolsets", softwareId: "sw_autocad" }],
      [{ id: "team_uy", name: "Uruguay ATC", autodeskAlias: "Uruguay ATC", archivedAt: null }]
    );
    const r = await vistaPreviaDeImportacion("org_1", {
      nombre: "u.xlsx",
      bytes: xlsx([
        u("ana@ejemplo.test", "Revit"),
        u("ana@ejemplo.test", "AutoCAD - including specialized toolsets"),
        u("beto@ejemplo.test", "Navisworks Manage"),
      ]),
      teamId: "team_uy",
      mapeo: { "navisworks manage": null },
      conDetalle: true,
    });
    if (!r.ok) throw new Error("debía andar");
    const por = Object.fromEntries(r.data.ofertas.map((o) => [o.clave, o]));
    expect(por["revit"]).toMatchObject({ softwareId: "sw_revit", origen: "sugerido" });
    expect(por["autocad - including specialized toolsets"]).toMatchObject({ softwareId: "sw_autocad", origen: "guardado" });
    expect(por["navisworks manage"]).toMatchObject({ ignorada: true, origen: "enviado" });
    // En la vista previa la sugerencia cuenta como elegida (la pantalla la manda en el
    // mapeo); `importarArchivo` exige que se haya confirmado (ver más arriba).
    expect(r.data.importable).toBe(true);
  });

  it("sin contactos.ver no viajan personas ni correos: solo las cuentas", async () => {
    const { vistaPreviaDeImportacion } = await import("@/server/autodesk-import");
    selectQueue.push(PROGRAMAS, [], [{ id: "team_uy", name: "Uruguay ATC", autodeskAlias: null, archivedAt: null }]);
    const r = await vistaPreviaDeImportacion("org_1", {
      nombre: "u.xlsx",
      bytes: xlsx([u("afuera@otro.test", "Revit")]),
      teamId: "team_uy",
      mapeo: { revit: "sw_revit" },
      conDetalle: false,
    });
    if (!r.ok) throw new Error("debía andar");
    expect(r.data.detalleOculto).toBe(true);
    expect(r.data.casos).toEqual([]);
    expect(r.data.conteo?.externo).toBe(1);
    expect(JSON.stringify(r.data)).not.toContain("afuera@otro.test");
  });
});

/* ============================================================
 * Trabajar el reporte
 * ============================================================ */

const LOTE = [
  { id: "lote_1", fileName: "usuarios.xlsx", uploadedAt: new Date("2026-10-30T12:00:00.000Z"), licenses: 1, people: 1, por: "Soporte" },
];

/** Una importación guardada con un solo correo, y nada más en el campus (todo lo demás vacío). */
function cola(correo: string, resto: unknown[][] = []) {
  selectQueue.push(
    EQUIPO, // buscarEquipo
    LOTE,
    [{ email: correo, softwareId: "sw_revit", firstName: "Ana", lastName: "Prueba", offeringName: "Revit" }],
    ...resto
  );
}

const ACCION_BASE = { teamId: "team_uy", clave: "sw_revit|e:afuera@otro.test" };

describe("aplicarAccion", () => {
  it("un equipo que nunca importó: 409 sin_importacion", async () => {
    const { aplicarAccion } = await import("@/server/autodesk-import");
    selectQueue.push(EQUIPO, []);
    expect(await aplicarAccion("org_1", "u1", { ...ACCION_BASE, accion: "mantener" })).toMatchObject({
      ok: false,
      status: 409,
      code: "sin_importacion",
    });
  });

  it("un caso que ya no existe: 404 (la situación cambió)", async () => {
    const { aplicarAccion } = await import("@/server/autodesk-import");
    cola("otro@otro.test");
    expect(await aplicarAccion("org_1", "u1", { ...ACCION_BASE, accion: "mantener" })).toMatchObject({
      ok: false,
      status: 404,
    });
  });

  it("una acción que no le corresponde al caso se rechaza, aunque el cliente la mande", async () => {
    const { aplicarAccion } = await import("@/server/autodesk-import");
    cola("afuera@otro.test");
    const r = await aplicarAccion("org_1", "u1", { ...ACCION_BASE, accion: "desmarcar" });
    expect(r).toMatchObject({ ok: false, status: 422, code: "accion_no_permitida" });
    expect(updates).toHaveLength(0);
  });

  it("mantener un externo guarda la decisión con la huella de la situación y la nota", async () => {
    const { aplicarAccion } = await import("@/server/autodesk-import");
    cola("afuera@otro.test");
    const r = await aplicarAccion("org_1", "u1", { ...ACCION_BASE, accion: "mantener", nota: " Es del estudio " });
    expect(r.ok).toBe(true);
    const v = inserts.find((i) => tabla(i.table) === "licenseCaseResolution")!.values as Record<string, unknown>;
    expect(v).toMatchObject({
      teamId: "team_uy",
      softwareId: "sw_revit",
      subject: "e:afuera@otro.test",
      decision: "mantener",
      note: "Es del estudio",
      fingerprint: "externo",
      resolvedBy: "u1",
    });
  });

  it("«sacar en Autodesk» deja una tarea pendiente con el correo; no toca ninguna licencia", async () => {
    const { aplicarAccion } = await import("@/server/autodesk-import");
    cola("afuera@otro.test");
    const r = await aplicarAccion("org_1", "u1", { ...ACCION_BASE, accion: "sacar_en_autodesk" });
    expect(r.ok).toBe(true);
    const v = inserts.find((i) => tabla(i.table) === "licenseAutodeskTask")!.values as Record<string, unknown>;
    expect(v).toMatchObject({
      teamId: "team_uy",
      softwareId: "sw_revit",
      kind: "sacar_en_autodesk",
      subject: "e:afuera@otro.test",
      email: "afuera@otro.test",
      createdBy: "u1",
    });
    expect(inserts.map((i) => tabla(i.table))).not.toContain("license");
  });

  it("vincular recuerda el correo para la próxima importación", async () => {
    const { aplicarAccion } = await import("@/server/autodesk-import");
    // Las 4 lecturas de personas, las del equipo, otros equipos, decisiones y tareas; después, la persona elegida.
    cola("afuera@otro.test", [[], [], [], [], [], [], [], [], [{ id: "c1" }]]);
    const r = await aplicarAccion("org_1", "u1", { ...ACCION_BASE, accion: "vincular", contactId: "c1" });
    expect(r.ok).toBe(true);
    expect(inserts.find((i) => tabla(i.table) === "licenseEmailAlias")!.values).toMatchObject({
      organizationId: "org_1",
      email: "afuera@otro.test",
      contactId: "c1",
      teacherId: null,
    });
  });

  it("vincular exige UNA persona: un alumno o un profesor, no los dos ni ninguno", async () => {
    const { aplicarAccion } = await import("@/server/autodesk-import");
    cola("afuera@otro.test");
    expect(await aplicarAccion("org_1", "u1", { ...ACCION_BASE, accion: "vincular" })).toMatchObject({ ok: false, status: 422 });
    cola("afuera@otro.test");
    expect(
      await aplicarAccion("org_1", "u1", { ...ACCION_BASE, accion: "vincular", contactId: "c1", teacherId: "t1" })
    ).toMatchObject({ ok: false, status: 422 });
    expect(inserts).toHaveLength(0);
  });
});

describe("aplicarLoSeguro", () => {
  const ANA = {
    id: "c1",
    firstName: "Ana",
    lastName: "Prueba",
    email: "ana@ejemplo.test",
    secondaryEmail: null,
    archivedAt: null,
  };
  const INSCRIPCION = {
    id: "e1",
    contactId: "c1",
    cohortId: "ch1",
    hadOwnLicense: false,
    parentHadOwnLicense: null,
    licenseEmail: null,
    parentLicenseEmail: null,
    cohortName: "Grupo Uno",
    courseName: "Revit",
    startDate: EMPEZO,
    endDate: VIVA,
  };

  /** Ana está en Autodesk, cursa UN grupo en marcha y el campus todavía no le marcó la licencia. */
  function colaDeAna() {
    selectQueue.push(
      EQUIPO, // buscarEquipo
      LOTE,
      [{ email: "ana@ejemplo.test", softwareId: "sw_revit", firstName: "Ana", lastName: "Prueba", offeringName: "Revit" }],
      [{ id: "c1" }], // porContacto
      [], // porLicencia
      [], // porProfesor
      [], // alias
      [], // licencias del equipo
      [ANA], // contactos
      [INSCRIPCION], // inscripciones
      [], // licencias de esas inscripciones
      [], // programas del grupo
      [], // otros equipos
      [], // decisiones
      [] // tareas
    );
  }

  it("soloContar dice cuántas aplicaría y no escribe nada", async () => {
    const { aplicarLoSeguro } = await import("@/server/autodesk-import");
    colaDeAna();
    const r = await aplicarLoSeguro("org_1", "u1", "team_uy", { soloContar: true });
    expect(r).toMatchObject({ ok: true, data: { aplicadas: 0, porAccion: { asignar: 1, desmarcar: 0, mover: 0 } } });
    expect(inserts).toHaveLength(0);
  });

  it("asigna por la misma puerta de siempre, del equipo del archivo, y deja constancia del neto cero", async () => {
    const { aplicarLoSeguro } = await import("@/server/autodesk-import");
    colaDeAna();
    // Lo que lee assignLicense: la inscripción, el grupo, el equipo, el programa, lo ocupado, la licencia previa y las hijas.
    selectQueue.push(
      [{ id: "e1", parentEnrollmentId: null, cohortId: "ch1", hadOwnLicense: false }],
      [],
      EQUIPO,
      [{ name: "Revit", total: 1 }],
      [],
      [],
      []
    );
    // El cupo es 1 y Autodesk ya lo tiene ocupado (ese asiento era de Ana).
    ajenos = new Map([[claveDeStock("team_uy", "sw_revit"), 1]]);
    const r = await aplicarLoSeguro("org_1", "u1", "team_uy");
    expect(r).toMatchObject({ ok: true, data: { aplicadas: 1, fallidas: [], porAccion: { asignar: 1 } } });
    const licencia = inserts.find((i) => tabla(i.table) === "license")!.values as Record<string, unknown>;
    expect(licencia).toMatchObject({ enrollmentId: "e1", softwareId: "sw_revit", teamId: "team_uy", assigned: true });
  });

  it("si una falla (sin cupo de verdad), sigue con las demás y la informa", async () => {
    const { aplicarLoSeguro } = await import("@/server/autodesk-import");
    colaDeAna();
    selectQueue.push(
      [{ id: "e1", parentEnrollmentId: null, cohortId: "ch1", hadOwnLicense: false }],
      [],
      EQUIPO,
      [{ name: "Revit", total: 1 }],
      [ocupada("sw_revit")], // el cupo lo ocupa otra persona del campus
      []
    );
    const r = await aplicarLoSeguro("org_1", "u1", "team_uy");
    expect(r).toMatchObject({ ok: true, data: { aplicadas: 0 } });
    if (r.ok) {
      expect(r.data.fallidas).toEqual([
        { clave: "sw_revit|e:ana@ejemplo.test", nombre: "Ana Prueba", message: expect.stringContaining("No hay licencias") },
      ]);
    }
    expect(inserts.map((i) => tabla(i.table))).not.toContain("license");
  });

  it("un equipo sin importación → 409", async () => {
    const { aplicarLoSeguro } = await import("@/server/autodesk-import");
    selectQueue.push(EQUIPO, []);
    expect(await aplicarLoSeguro("org_1", "u1", "team_uy")).toMatchObject({ ok: false, status: 409, code: "sin_importacion" });
  });
});

/* ============================================================
 * Estructura
 * ============================================================ */

const leer = (...p: string[]) => readFileSync(path.join(process.cwd(), ...p), "utf8");

describe("migración 0089", () => {
  const sql = leer("drizzle", "0089_licencias_conciliacion.sql");
  const TABLAS = [
    "license_import_batch",
    "license_import_row",
    "license_offering_map",
    "license_email_alias",
    "license_case_resolution",
    "license_autodesk_task",
  ];

  it("las seis tablas nacen con RLS y la política tenant_isolation", () => {
    for (const t of TABLAS) {
      expect(sql, t).toMatch(new RegExp(`alter table "${t}" enable row level security`));
      expect(sql, t).toMatch(new RegExp(`create policy tenant_isolation on "${t}"`));
    }
  });

  it("es re-ejecutable: tablas e índices con if not exists, FKs contra pg_constraint, políticas con drop if exists", () => {
    for (const t of TABLAS) expect(sql, t).toMatch(new RegExp(`create table if not exists "${t}"`));
    expect(sql).not.toMatch(/create (unique )?index "/i);
    expect(sql).not.toMatch(/^create table "/im);
    expect(sql).toContain("pg_constraint");
    expect((sql.match(/drop policy if exists tenant_isolation/g) ?? []).length).toBe(TABLAS.length);
  });

  it("a lo sumo una tarea abierta por equipo, programa, tipo y persona", () => {
    expect(sql).toMatch(/license_autodesk_task_abierta_uq[\s\S]*where "license_autodesk_task"\."status" = 'abierta'/);
  });

  it("no hay backfill: no cambia ningún dato existente", () => {
    expect(sql).not.toMatch(/^\s*(update|delete from|insert into)\b/im);
  });
});

describe("las rutas declaran su capacidad", () => {
  it("leer el reporte es academico.ver; importar, previsualizar y actuar, licencias.gestionar", () => {
    expect(leer("src", "app", "api", "license-imports", "route.ts")).toMatch(/GET = requireCapability\("academico\.ver"/);
    expect(leer("src", "app", "api", "license-imports", "route.ts")).toMatch(/POST = requireCapability\("licencias\.gestionar"/);
    for (const r of ["preview", "cases", "apply-safe"]) {
      expect(leer("src", "app", "api", "license-imports", r, "route.ts"), r).toMatch(
        /POST = requireCapability\("licencias\.gestionar"/
      );
    }
  });

  it("las personas y correos del reporte dependen de contactos.ver", () => {
    expect(leer("src", "app", "api", "license-imports", "route.ts")).toMatch(/contactos\.ver/);
    expect(leer("src", "app", "api", "license-imports", "preview", "route.ts")).toMatch(/contactos\.ver/);
  });
});

describe("una sola puerta para las licencias del campus", () => {
  const fuente = leer("src", "server", "autodesk-import.ts");

  it("actuar sobre un caso pasa por assignLicense / unassignLicense / moverLicenciaDeEquipo", () => {
    for (const f of ["assignLicense", "assignTeacherLicense", "unassignLicense", "unassignTeacherLicense", "moverLicenciaDeEquipo"]) {
      expect(fuente, f).toMatch(new RegExp(`\\b${f}\\(`));
    }
  });

  it("jamás escribe la tabla license por su cuenta", () => {
    expect(fuente).not.toMatch(/\.(insert|update|delete)\(\s*schema\.license\s*\)/);
  });

  it("el servidor vuelve a calcular el caso: no confía en lo que mande el cliente", () => {
    expect(fuente).toMatch(/plan\.casos\.find\(\(c\) => c\.clave === accion\.clave\)/);
    expect(fuente).toMatch(/caso\.acciones\.includes\(accion\)/);
  });
});

describe("nada de esto llega a los portales", () => {
  it("ni el portal del profesor ni el del alumno importan la conciliación ni los asientos ajenos", () => {
    for (const f of ["teacher-portal.ts", "student-portal.ts"]) {
      const fuente = leer("src", "server", f);
      expect(fuente, f).not.toMatch(/autodesk-import|license-ajenos|license_import|licenseImport/);
    }
  });
});
