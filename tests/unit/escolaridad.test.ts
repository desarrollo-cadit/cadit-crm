import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  armarEscolaridad,
  renderEscolaridadHtml,
  type CursadaInput,
  type EscolaridadInput,
} from "@/lib/escolaridad";

/**
 * 031 (T036, US5, DV-011) — La escolaridad: un documento sobre una PERSONA.
 *
 * Las reglas que más importan son las de los defaults optimistas (CLAUDE.md):
 * una evaluación sin corregir es "Pendiente", nunca "No aprobada"; una cursada
 * sin un solo dato es "Sin datos", nunca "Aprobado". Y lo que no debe estar
 * —cobranza, teléfono, correo— no está porque el input ni lo trae.
 */

const EMITIDA = new Date("2026-10-14T15:00:00.000Z");

function cursada(p: Partial<CursadaInput> & { enrollmentId: string }): CursadaInput {
  return {
    parentEnrollmentId: null,
    curso: "Revit",
    cohorte: "Revit 2026",
    desde: new Date("2026-03-01T00:00:00.000Z"),
    hasta: new Date("2026-06-30T00:00:00.000Z"),
    asistenciaPct: 90,
    minAsistenciaPct: 75,
    dispensa: null,
    posicion: null,
    evaluaciones: [],
    ...p,
  };
}

function input(cursadas: CursadaInput[]): EscolaridadInput {
  return {
    academia: "CAD IT",
    alumno: { nombre: "Ana Pérez", documento: "1.234.567-8" },
    emitidaEl: EMITIDA,
    cursadas,
  };
}

const NUMERICA_80 = { nombre: "Trabajo final", obligatoria: true, escala: "numeric" as const, nota: 80, aprobada: true };

describe("armarEscolaridad — el estado de cada cursada", () => {
  it("un curso aprobado y otro en curso: cada uno con sus notas y su estado", () => {
    const e = armarEscolaridad(
      input([
        cursada({ enrollmentId: "e1", evaluaciones: [NUMERICA_80] }),
        cursada({
          enrollmentId: "e2",
          curso: "AutoCAD",
          cohorte: "AutoCAD 2026",
          desde: new Date("2026-08-01T00:00:00.000Z"),
          hasta: null,
          evaluaciones: [
            { nombre: "Parcial", obligatoria: true, escala: "pass_fail", nota: null, aprobada: true },
            { nombre: "Final", obligatoria: true, escala: "numeric", nota: null, aprobada: null },
          ],
        }),
      ])
    );

    expect(e.cursadas.map((c) => [c.curso, c.estado])).toEqual([
      ["Revit", "aprobado"],
      ["AutoCAD", "pendiente"],
    ]);
    expect(e.cursadas[0]!.evaluaciones[0]).toMatchObject({ nota: 80, aprobada: true });
  });

  it("una evaluación sin resultado oficial es pendiente, NUNCA desaprobada", () => {
    const e = armarEscolaridad(
      input([
        cursada({
          enrollmentId: "e1",
          evaluaciones: [{ nombre: "Final", obligatoria: true, escala: "pass_fail", nota: null, aprobada: null }],
        }),
      ])
    );
    expect(e.cursadas[0]!.estado).toBe("pendiente");
    expect(e.cursadas[0]!.evaluaciones[0]!.aprobada).toBeNull();
  });

  it("sin evaluaciones obligatorias ni asistencia: `sin_datos`, no «aprobado»", () => {
    const e = armarEscolaridad(input([cursada({ enrollmentId: "e1", asistenciaPct: null })]));
    expect(e.cursadas[0]!.estado).toBe("sin_datos");
  });

  it("una opcional desaprobada no define el estado", () => {
    const e = armarEscolaridad(
      input([
        cursada({
          enrollmentId: "e1",
          evaluaciones: [
            NUMERICA_80,
            { nombre: "Extra", obligatoria: false, escala: "pass_fail", nota: null, aprobada: false },
          ],
        }),
      ])
    );
    expect(e.cursadas[0]!.estado).toBe("aprobado");
    expect(e.cursadas[0]!.evaluaciones).toHaveLength(2);
  });

  it("una obligatoria desaprobada reprueba", () => {
    const e = armarEscolaridad(
      input([
        cursada({
          enrollmentId: "e1",
          evaluaciones: [{ ...NUMERICA_80, nota: 40, aprobada: false }],
        }),
      ])
    );
    expect(e.cursadas[0]!.estado).toBe("reprobado");
  });

  it("orden cronológico por inicio de la cohorte, aunque lleguen desordenadas", () => {
    const e = armarEscolaridad(
      input([
        cursada({ enrollmentId: "tarde", curso: "B", desde: new Date("2026-08-01T00:00:00.000Z") }),
        cursada({ enrollmentId: "temprano", curso: "A", desde: new Date("2025-03-01T00:00:00.000Z") }),
      ])
    );
    expect(e.cursadas.map((c) => c.curso)).toEqual(["A", "B"]);
  });

  it("una especialización compone sus módulos con `programApprovalState`", () => {
    const e = armarEscolaridad(
      input([
        cursada({ enrollmentId: "madre", curso: "EBIM", cohorte: "EBIM 14", asistenciaPct: null }),
        cursada({
          enrollmentId: "m2",
          parentEnrollmentId: "madre",
          curso: "Módulo Dynamo",
          posicion: 2,
          asistenciaPct: null,
        }),
        cursada({
          enrollmentId: "m1",
          parentEnrollmentId: "madre",
          curso: "Módulo Revit",
          posicion: 1,
          evaluaciones: [NUMERICA_80],
        }),
      ])
    );

    // Las hijas no aparecen sueltas: una sola fila para la especialización.
    expect(e.cursadas).toHaveLength(1);
    const madre = e.cursadas[0]!;
    expect(madre.modulos?.map((m) => [m.curso, m.estado])).toEqual([
      ["Módulo Revit", "aprobado"],
      ["Módulo Dynamo", "sin_datos"],
    ]);
    // Un módulo sin datos deja la especialización pendiente, nunca aprobada.
    expect(madre.estado).toBe("pendiente");
    // No existe "la asistencia de la especialización".
    expect(madre.asistenciaPct).toBeNull();
  });

  it("no hay nota final ponderada en ningún lado", () => {
    const e = armarEscolaridad(input([cursada({ enrollmentId: "e1", evaluaciones: [NUMERICA_80] })]));
    const claves = JSON.stringify(e);
    expect(claves).not.toMatch(/promedio|ponderad|notaFinal/i);
  });
});

describe("renderEscolaridadHtml — el documento", () => {
  const html = (cursadas: CursadaInput[], alumno?: EscolaridadInput["alumno"]) =>
    renderEscolaridadHtml(
      armarEscolaridad({ ...input(cursadas), ...(alumno ? { alumno } : {}) }),
      "America/Montevideo"
    );

  it("escapa todo lo que interpola", () => {
    const h = html(
      [
        cursada({
          enrollmentId: "e1",
          curso: "<script>alert(1)</script>",
          evaluaciones: [{ ...NUMERICA_80, nombre: "TP \"1\" & <b>" }],
        }),
      ],
      { nombre: "<img src=x onerror=alert(1)>", documento: null }
    );
    expect(h).not.toContain("<script>alert(1)</script>");
    expect(h).not.toContain("<img src=x");
    expect(h).toContain("&lt;script&gt;");
    expect(h).toContain("TP &quot;1&quot; &amp; &lt;b&gt;");
  });

  it("muestra N/100 en numérica, Aprobada/No aprobada/Pendiente en el resto", () => {
    const h = html([
      cursada({
        enrollmentId: "e1",
        evaluaciones: [
          NUMERICA_80,
          { nombre: "Parcial", obligatoria: true, escala: "pass_fail", nota: null, aprobada: true },
          { nombre: "Oral", obligatoria: true, escala: "pass_fail", nota: null, aprobada: false },
          { nombre: "Final", obligatoria: true, escala: "pass_fail", nota: null, aprobada: null },
        ],
      }),
    ]);
    expect(h).toContain("80/100");
    expect(h).toContain("Aprobada");
    expect(h).toContain("No aprobada");
    expect(h).toContain("Pendiente");
  });

  it("es A4 vertical, con el pie informativo y la ayuda que no se imprime", () => {
    const h = html([cursada({ enrollmentId: "e1" })]);
    expect(h).toMatch(/@page\s*\{\s*size:\s*A4(\s+portrait)?;\s*margin:\s*18mm/);
    expect(h).toContain("No reemplaza al certificado");
    expect(h).toMatch(/class="noprint"/);
    expect(h).toContain("1.234.567-8");
  });

  it("dice los estados en palabras: Aprobado, No aprobado, En curso, Sin datos", () => {
    const h = html([
      cursada({ enrollmentId: "a", evaluaciones: [NUMERICA_80] }),
      cursada({ enrollmentId: "b", evaluaciones: [{ ...NUMERICA_80, nota: 10, aprobada: false }] }),
      cursada({ enrollmentId: "c", evaluaciones: [{ ...NUMERICA_80, nota: null, aprobada: null }] }),
      cursada({ enrollmentId: "d", asistenciaPct: null }),
    ]);
    for (const t of ["Aprobado", "No aprobado", "En curso", "Sin datos"]) expect(h).toContain(t);
    // Los identificadores pueden ser clases de CSS, nunca el texto que se lee.
    expect(h).not.toMatch(/>\s*(sin_datos|reprobado|pendiente)\s*</);
  });

  it("sin cursadas lo dice, en vez de mostrar una tabla vacía", () => {
    expect(html([])).toContain("Todavía no tenés cursadas");
  });
});

describe("la pureza del módulo", () => {
  const src = readFileSync(path.join(process.cwd(), "src", "lib", "escolaridad.ts"), "utf8");

  it("no lee la base ni importa del servidor", () => {
    expect(src).not.toMatch(/from "@\/lib\/db/);
    expect(src).not.toMatch(/from "@\/server\//);
  });

  it("no nombra cobranza, teléfono ni correo", () => {
    expect(src).not.toMatch(/\b(phone|email|balance|installment|cuota|telefono|teléfono|correo)\b/i);
  });
});
