import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { leerXlsx, XlsxInvalido } from "@/lib/autodesk-import/xlsx";
import { claveDeOferta, leerArchivoDeAutodesk, sugerirPrograma } from "@/lib/autodesk-import/archivo";

/**
 * 0091 — El lector del Excel de usuarios de Autodesk. Todo con archivos
 * SINTÉTICOS: ningún nombre ni correo real entra al repositorio. El zip se arma
 * acá, a mano, igual que lo arma Excel (cabeceras locales + directorio central).
 */

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function crearZip(partes: Record<string, string>, opts: { deflate?: boolean } = {}): Uint8Array {
  const locales: Buffer[] = [];
  const centrales: Buffer[] = [];
  let offset = 0;
  for (const [nombre, texto] of Object.entries(partes)) {
    const nom = Buffer.from(nombre);
    const crudo = Buffer.from(texto, "utf8");
    const datos = opts.deflate ? deflateRawSync(crudo) : crudo;
    const metodo = opts.deflate ? 8 : 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(metodo, 8);
    local.writeUInt32LE(crc32(crudo), 14);
    local.writeUInt32LE(datos.length, 18);
    local.writeUInt32LE(crudo.length, 22);
    local.writeUInt16LE(nom.length, 26);
    locales.push(local, nom, datos);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(metodo, 10);
    central.writeUInt32LE(crc32(crudo), 16);
    central.writeUInt32LE(datos.length, 20);
    central.writeUInt32LE(crudo.length, 24);
    central.writeUInt16LE(nom.length, 28);
    central.writeUInt32LE(offset, 42);
    centrales.push(central, nom);
    offset += 30 + nom.length + datos.length;
  }
  const dirCentral = Buffer.concat(centrales);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(Object.keys(partes).length, 8);
  fin.writeUInt16LE(Object.keys(partes).length, 10);
  fin.writeUInt32LE(dirCentral.length, 12);
  fin.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locales, dirCentral, fin]));
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

/** Una hoja con texto en línea (`inlineStr`), como la que exporta Autodesk. */
function hojaEnLinea(filas: (string | number | null)[][]): string {
  const cols = "ABCDEFGHIJ";
  const xml = filas
    .map(
      (f, i) =>
        `<row r="${i + 1}">` +
        f
          .map((v, j) =>
            v === null
              ? ""
              : typeof v === "number"
                ? `<c r="${cols[j]}${i + 1}" t="n"><v>${v}</v></c>`
                : `<c r="${cols[j]}${i + 1}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`
          )
          .join("") +
        `</row>`
    )
    .join("");
  return `<?xml version="1.0"?><worksheet><sheetData>${xml}</sheetData></worksheet>`;
}

const ENCABEZADO = [
  "team_alias",
  "first_name",
  "last_name",
  "email",
  "autodesk_id",
  "role",
  "account_status",
  "offering_name",
  "product_name",
  "subscription_id",
];

function xlsxDeUsuarios(filas: (string | number | null)[][], opts: { deflate?: boolean } = {}): Uint8Array {
  return crearZip({ "xl/worksheets/sheet1.xml": hojaEnLinea([ENCABEZADO, ...filas]) }, opts);
}

const fila = (
  correo: string,
  oferta: string,
  producto = "Producto",
  extra: Partial<{ alias: string; nombre: string; apellido: string; rol: string }> = {}
) => [
  extra.alias ?? "Equipo Uno",
  extra.nombre ?? "Ana",
  extra.apellido ?? "Prueba",
  correo,
  "ana_id",
  extra.rol ?? "User",
  "Verified",
  oferta,
  producto,
  7.4190503615179e13,
];

describe("leerXlsx", () => {
  it("lee texto en línea (inlineStr), el formato del export de Autodesk", () => {
    const filas = leerXlsx(xlsxDeUsuarios([fila("ana@ejemplo.test", "Revit")]));
    expect(filas[0]).toEqual(ENCABEZADO);
    expect(filas[1]![3]).toBe("ana@ejemplo.test");
    expect(filas[1]![7]).toBe("Revit");
  });

  it("lee cadenas compartidas (sharedStrings), el formato de Excel", () => {
    const hoja =
      `<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>` +
      `<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>42</v></c></row></sheetData></worksheet>`;
    const compartidas =
      `<sst><si><t>email</t></si><si><t>offering_name</t></si><si><r><t>ana@</t></r><r><t>ejemplo.test</t></r></si></sst>`;
    const filas = leerXlsx(
      crearZip({ "xl/worksheets/sheet1.xml": hoja, "xl/sharedStrings.xml": compartidas }, { deflate: true })
    );
    expect(filas).toEqual([
      ["email", "offering_name"],
      ["ana@ejemplo.test", "42"],
    ]);
  });

  it("los números vuelven como el texto de la celda: la notación científica no se rehace", () => {
    const filas = leerXlsx(xlsxDeUsuarios([fila("ana@ejemplo.test", "Revit")]));
    expect(filas[1]![9]).toBe("74190503615179");
    const crudo = leerXlsx(
      crearZip({
        "xl/worksheets/sheet1.xml": `<worksheet><sheetData><row><c r="A1"><v>7.4190503615179E13</v></c></row></sheetData></worksheet>`,
      })
    );
    expect(crudo[0]![0]).toBe("7.4190503615179E13");
  });

  it("respeta las columnas vacías en el medio de una fila", () => {
    const filas = leerXlsx(
      crearZip({
        "xl/worksheets/sheet1.xml": `<worksheet><sheetData><row><c r="A1" t="inlineStr"><is><t>a</t></is></c><c r="C1" t="inlineStr"><is><t>c</t></is></c></row></sheetData></worksheet>`,
      })
    );
    expect(filas[0]).toEqual(["a", "", "c"]);
  });

  it("decodifica entidades XML", () => {
    const filas = leerXlsx(xlsxDeUsuarios([fila("ana@ejemplo.test", "AutoCAD & más")]));
    expect(filas[1]![7]).toBe("AutoCAD & más");
  });

  it("un archivo que no es un zip se rechaza", () => {
    expect(() => leerXlsx(new TextEncoder().encode("esto no es un xlsx"))).toThrow(XlsxInvalido);
  });

  it("un zip sin hojas se rechaza", () => {
    expect(() => leerXlsx(crearZip({ "otra/cosa.txt": "hola" }))).toThrow(XlsxInvalido);
  });
});

describe("leerArchivoDeAutodesk", () => {
  it("agrupa los sub-productos: la unidad es (correo, oferta)", () => {
    const r = leerArchivoDeAutodesk(
      "usuarios.xlsx",
      xlsxDeUsuarios([
        fila("ana@ejemplo.test", "Revit", "Rendering"),
        fila("ana@ejemplo.test", "Revit", "Twinmotion"),
        fila("ana@ejemplo.test", "Revit", "Forma"),
        fila("ana@ejemplo.test", "AutoCAD - including specialized toolsets", "AutoCAD"),
        fila("beto@ejemplo.test", "Revit", "Rendering"),
      ])
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.archivo.licencias).toHaveLength(3);
    expect(r.archivo.personas).toBe(2);
    expect(r.archivo.ofertas.map((o) => [o.nombre, o.personas])).toEqual([
      ["AutoCAD - including specialized toolsets", 1],
      ["Revit", 2],
    ]);
    expect(r.archivo.teamAlias).toBe("Equipo Uno");
  });

  it("quien no tiene oferta no ocupa asiento: se cuenta aparte", () => {
    const r = leerArchivoDeAutodesk(
      "usuarios.xlsx",
      xlsxDeUsuarios([
        fila("ana@ejemplo.test", "Revit"),
        fila("admin@ejemplo.test", "", "", { rol: "Primary Admin" }),
        fila("invitada@ejemplo.test", ""),
      ])
    );
    if (!r.ok) throw new Error("debía leerse");
    expect(r.archivo.licencias.map((l) => l.email)).toEqual(["ana@ejemplo.test"]);
    expect(r.archivo.personas).toBe(3);
    expect(r.archivo.sinLicencia).toBe(2);
  });

  it("el correo se normaliza a minúsculas y la fila sin correo válido queda afuera", () => {
    const r = leerArchivoDeAutodesk(
      "usuarios.xlsx",
      xlsxDeUsuarios([fila("  ANA@Ejemplo.TEST ", "Revit"), fila("sin-arroba", "Revit"), fila("", "Revit")])
    );
    if (!r.ok) throw new Error("debía leerse");
    expect(r.archivo.licencias.map((l) => l.email)).toEqual(["ana@ejemplo.test"]);
    expect(r.archivo.filasSinCorreo).toBe(2);
  });

  it("un archivo con VARIOS equipos es un 422 que los nombra", () => {
    const r = leerArchivoDeAutodesk(
      "usuarios.xlsx",
      xlsxDeUsuarios([
        fila("ana@ejemplo.test", "Revit", "P", { alias: "Uruguay ATC" }),
        fila("beto@ejemplo.test", "Revit", "P", { alias: "Paraguay ATC" }),
      ])
    );
    expect(r).toMatchObject({ ok: false, code: "equipos_varios" });
    if (!r.ok) expect(r.message).toMatch(/Uruguay ATC.*Paraguay ATC/);
  });

  it("sin las columnas email y offering_name → sin_columnas", () => {
    const r = leerArchivoDeAutodesk(
      "otro.xlsx",
      crearZip({ "xl/worksheets/sheet1.xml": hojaEnLinea([["a", "b"], ["1", "2"]]) })
    );
    expect(r).toMatchObject({ ok: false, code: "sin_columnas" });
  });

  it("basura, vacío y extensión rara → archivo_invalido", () => {
    expect(leerArchivoDeAutodesk("x.xlsx", new Uint8Array())).toMatchObject({ ok: false, code: "archivo_invalido" });
    expect(leerArchivoDeAutodesk("x.xlsx", new TextEncoder().encode("basura"))).toMatchObject({
      ok: false,
      code: "archivo_invalido",
    });
    expect(
      leerArchivoDeAutodesk("x.xlsx", new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5, 6]))
    ).toMatchObject({ ok: false, code: "archivo_invalido" });
  });

  it("acepta un .csv con las mismas columnas (con BOM y comillas)", () => {
    const csv =
      "﻿team_alias,first_name,last_name,email,offering_name\r\n" +
      'Equipo Uno,"Ana, la primera",Prueba,ana@ejemplo.test,Revit\r\n' +
      "Equipo Uno,Beto,Prueba,beto@ejemplo.test,Revit\r\n";
    const r = leerArchivoDeAutodesk("usuarios.csv", new TextEncoder().encode(csv));
    if (!r.ok) throw new Error("debía leerse");
    expect(r.archivo.licencias.map((l) => l.email)).toEqual(["ana@ejemplo.test", "beto@ejemplo.test"]);
    expect(r.archivo.licencias[0]!.firstName).toBe("Ana, la primera");
  });

  it("un archivo enorme se rechaza antes de leerlo", () => {
    const r = leerArchivoDeAutodesk("x.csv", new Uint8Array(16 * 1024 * 1024));
    expect(r).toMatchObject({ ok: false, code: "demasiado_grande" });
  });
});

describe("sugerirPrograma y claveDeOferta", () => {
  const programas = [
    { id: "sw_revit", name: "Revit" },
    { id: "sw_autocad", name: "AutoCAD" },
    { id: "sw_civil", name: "Civil 3D" },
  ];

  it("la llave no distingue tildes, mayúsculas ni espacios de más", () => {
    expect(claveDeOferta("  AutoCAD   -  Inclúding ")).toBe("autocad - including");
  });

  it("coincidencia exacta", () => {
    expect(sugerirPrograma("Revit", programas)).toBe("sw_revit");
    expect(sugerirPrograma("civil 3d", programas)).toBe("sw_civil");
  });

  it("«Programa - …» sugiere el programa", () => {
    expect(sugerirPrograma("AutoCAD - including specialized toolsets", programas)).toBe("sw_autocad");
  });

  it("«Revit LT» NO es «Revit»: sin sugerencia", () => {
    expect(sugerirPrograma("Revit LT", programas)).toBeNull();
  });

  it("una oferta desconocida no sugiere nada", () => {
    expect(sugerirPrograma("Navisworks Manage", programas)).toBeNull();
  });
});
