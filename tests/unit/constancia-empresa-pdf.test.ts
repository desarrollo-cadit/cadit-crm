import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { armarConstancia, type AlumnoDeConstancia } from "@/lib/constancia-empresa";
import { renderConstanciaPdf } from "@/lib/constancia-empresa-pdf";

const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const fechas = Array.from({ length: 20 }, (_, i) => `2025-10-${String(i + 1).padStart(2, "0")}`);

const alumnos: AlumnoDeConstancia[] = Array.from({ length: 70 }, (_, i) => ({
  enrollmentId: `enr_${i}`,
  firstName: `Nombre ${i} 😀`,
  lastName: `Apellido Ñúñez ${i}`,
  enrolledAt: dia("2025-09-01"),
  marcas: fechas.map((f, j) => ({
    classSessionId: f,
    status: (i + j) % 7 === 0 ? ("ausente" as const) : ("presente" as const),
  })),
  resultadoConfirmado: null,
}));

describe("renderConstanciaPdf", () => {
  it("genera un PDF válido de varias páginas con una lista larga", async () => {
    const c = armarConstancia({
      empresa: "ANCAP",
      academia: "CadIT",
      ciudad: "Montevideo",
      emitidaEl: "2026-10-26",
      corte: "2026-10-26",
      reloj: { timeZone: "America/Montevideo", now: new Date("2026-10-26T15:00:00.000Z") },
      alcance: "general",
      grupos: [
        {
          cohortId: "coh_1",
          curso: "AP3D",
          grupo: "Nube de Puntos",
          startDate: dia("2025-10-01"),
          endDate: dia("2025-10-20"),
          daysOfWeek: "0,1,2,3,4,5,6",
          startTime: "09:00",
          endTime: "12:00",
          clases: fechas.map((f) => ({ id: f, date: dia(f), endTime: "12:00", canceledAt: null, tomada: true })),
          recesos: [],
          alumnos,
        },
      ],
      firma: null,
      pie: ["Dirección: Bvr. Artigas 922, Montevideo – Uruguay", "www.ejemplo.uy"],
    });
    const bytes = await renderConstanciaPdf(c);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(2);
  });
});
