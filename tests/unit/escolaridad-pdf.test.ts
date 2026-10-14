import { writeFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { armarEscolaridad, type CursadaInput } from "@/lib/escolaridad";
import { nombreDeArchivo, renderEscolaridadPdf, respuestaPdf } from "@/lib/escolaridad-pdf";

const cursada = (over: Partial<CursadaInput>): CursadaInput => ({
  enrollmentId: "enr_1",
  parentEnrollmentId: null,
  curso: "Revit Arquitectura Profesionales",
  cohorte: "2026 - Revit Arquitectura 6",
  desde: new Date("2026-10-14T00:00:00.000Z"),
  hasta: new Date("2026-12-25T00:00:00.000Z"),
  asistenciaPct: 92,
  minAsistenciaPct: 75,
  dispensa: null,
  posicion: null,
  evaluaciones: [
    { nombre: "Entrega final — modelo completo", obligatoria: true, escala: "numeric", nota: 80, aprobada: true },
    { nombre: "Práctico de familias", obligatoria: false, escala: "pass_fail", nota: null, aprobada: null },
  ],
  ...over,
});

const escolaridad = armarEscolaridad({
  academia: "CAD IT Solution Provider",
  alumno: { nombre: "María José Núñez 😀", documento: "1.234.567-8" },
  emitidaEl: new Date("2026-10-14T15:00:00.000Z"),
  cursadas: [
    cursada({}),
    cursada({ enrollmentId: "enr_2", curso: "Especialización en Proyectos BIM", evaluaciones: [] }),
    cursada({ enrollmentId: "enr_3", parentEnrollmentId: "enr_2", curso: "BIM Management", posicion: 1 }),
    cursada({ enrollmentId: "enr_4", parentEnrollmentId: "enr_2", curso: "Coordinación BIM", posicion: 2, asistenciaPct: null }),
    ...Array.from({ length: 12 }, (_, i) =>
      cursada({ enrollmentId: `enr_x${i}`, curso: `Curso de relleno ${i + 1}`, desde: null })
    ),
  ],
});

describe("escolaridad en PDF", () => {
  it("genera un PDF válido, con varias páginas si hace falta, aunque haya caracteres fuera de WinAnsi", async () => {
    const pdf = await renderEscolaridadPdf(escolaridad, "America/Montevideo");
    expect(Buffer.from(pdf.subarray(0, 5)).toString()).toBe("%PDF-");
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBeGreaterThan(1);
    expect(doc.getTitle()).toContain("Escolaridad");
    if (process.env.ESCOLARIDAD_PDF_OUT) writeFileSync(process.env.ESCOLARIDAD_PDF_OUT, pdf);
  });

  it("sin cursadas también genera el documento", async () => {
    const vacia = armarEscolaridad({
      academia: "CAD IT Solution Provider",
      alumno: { nombre: "Ana", documento: null },
      emitidaEl: new Date(),
      cursadas: [],
    });
    const doc = await PDFDocument.load(await renderEscolaridadPdf(vacia, "America/Montevideo"));
    expect(doc.getPageCount()).toBe(1);
  });

  it("se descarga como archivo con el nombre del alumno", async () => {
    const res = await respuestaPdf(escolaridad, "America/Montevideo");
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="Escolaridad - /);
    expect(nombreDeArchivo("José / Pérez").ascii).toBe("Escolaridad - Jose Perez.pdf");
  });
});
