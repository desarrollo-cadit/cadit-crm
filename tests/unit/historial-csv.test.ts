import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { leerCsv } from "@/lib/historial-import/csv";
import { COLUMNAS_PLANILLA, leerPlanilla } from "@/lib/historial-import/planilla";

/**
 * 046 US6 (T047; FR-014) — Leer la planilla histórica. La fixture es
 * INVENTADA (`tests/fixtures/historial-planilla.csv`): nunca la planilla real.
 */

const FIXTURE = readFileSync(path.join(process.cwd(), "tests", "fixtures", "historial-planilla.csv"), "utf8");
const BOM = String.fromCharCode(0xfeff);

describe("leerCsv", () => {
  it("separa por comas y saltea la última línea vacía", () => {
    expect(leerCsv("a,b\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("quita el BOM", () => {
    expect(leerCsv(`${BOM}a,b\n1,2`)[0]).toEqual(["a", "b"]);
  });

  it("respeta comillas: comas, saltos de línea y comillas dobles adentro", () => {
    expect(leerCsv('a,b\n"uno, dos","dijo ""hola""\notra línea"\n')).toEqual([
      ["a", "b"],
      ["uno, dos", 'dijo "hola"\notra línea'],
    ]);
  });

  it("acepta CRLF", () => {
    expect(leerCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("conserva campos vacíos", () => {
    expect(leerCsv("a,b,c\n,,x")).toEqual([
      ["a", "b", "c"],
      ["", "", "x"],
    ]);
  });
});

describe("leerPlanilla", () => {
  it("rechaza un encabezado distinto o un archivo vacío", () => {
    expect(leerPlanilla("").ok).toBe(false);
    expect(leerPlanilla("nombre,apellido\nA,B").ok).toBe(false);
  });

  it("lee la fixture: filas válidas normalizadas y problemas con su número de fila", () => {
    const r = leerPlanilla(`${BOM}${FIXTURE}`);
    if (!r.ok) throw new Error(r.message);
    expect(r.total).toBe(8);
    expect(r.filas.map((f) => f.fila)).toEqual([2, 3, 4, 5]);
    expect(r.problemas).toEqual([
      { fila: 6, motivo: "Falta el nombre." },
      { fila: 7, motivo: "Falta el correo y el teléfono: no se puede reconocer a la persona." },
      { fila: 8, motivo: "La fecha no es un día válido (AAAA-MM-DD)." },
      { fila: 9, motivo: "Falta el curso." },
    ]);
    const [lucia, lucia2, martin, sofia] = r.filas;
    expect(lucia).toMatchObject({
      nombre: "Lucía",
      apellido: "Inventada",
      correo: "lucia.inventada@ejemplo.test",
      telefono: "59899000001",
      empresa: "Constructora Ficticia SA",
      curso: "Revit Arquitectura",
      cursoOriginal: "REVIT ARQ",
      estudiante: false,
      edicion: "9",
      fecha: "2021-03-15",
      vendedor: "CP",
      nota: null,
    });
    expect(lucia2).toMatchObject({ telefono: null, empresa: null, nota: "Pagó en dos cuotas, sin factura" });
    expect(martin).toMatchObject({ correo: null, estudiante: true, vendedor: "" });
    expect(sofia?.empresa).toBe("Estudio Falso, Arquitectos");
  });

  it("normaliza correo y teléfono escritos a mano", () => {
    const csv = `${COLUMNAS_PLANILLA.join(",")}\nA,B, ANA@Ejemplo.Test ,099 123 456,,Curso,,,,2021-01-01,,,`;
    const r = leerPlanilla(csv);
    if (!r.ok) throw new Error(r.message);
    expect(r.filas[0]).toMatchObject({ correo: "ana@ejemplo.test", telefono: "59899123456", fila: 2 });
  });

  it("un correo inválido no se adivina: sin teléfono es un problema; con teléfono se importa sin correo y se avisa", () => {
    const csv = [
      COLUMNAS_PLANILLA.join(","),
      "A,B,no-es-correo,,,Curso,,,,2021-01-01,,,7",
      "C,D,con espacio@x.test,099123456,,Curso,,,,2021-01-01,,,8",
    ].join("\n");
    const r = leerPlanilla(csv);
    if (!r.ok) throw new Error(r.message);
    expect(r.problemas).toEqual([
      { fila: 7, motivo: "El correo no es válido y no hay teléfono: no se puede reconocer a la persona." },
    ]);
    expect(r.filas).toEqual([expect.objectContaining({ fila: 8, correo: null, telefono: "59899123456" })]);
    expect(r.avisos).toEqual([{ fila: 8, motivo: "El correo no es válido: se importa sin correo, por el teléfono." }]);
  });

  it("una fila con otra cantidad de columnas es un problema", () => {
    const csv = `${COLUMNAS_PLANILLA.join(",")}\nA,B,c@d.test`;
    const r = leerPlanilla(csv);
    if (!r.ok) throw new Error(r.message);
    expect(r.problemas[0]?.motivo).toBe("La fila tiene 3 columnas; se esperaban 13.");
  });
});
