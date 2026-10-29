import { describe, expect, it } from "vitest";
import {
  DIAS_DE_RECORDATORIO,
  armarCorreccionPublicada,
  armarRecordatorio,
  claveDeCorreccionPublicada,
  claveDeRecordatorio,
  seleccionarRecordatorios,
  type CandidatoARecordatorio,
} from "@/lib/assessment-notices";

/**
 * 0084 — Los correos al ALUMNO sobre sus evaluaciones (solo correo). Qué toca
 * y qué dice es puro; el envío y el reclamo idempotente viven en
 * `src/server/email/assessment-notices.ts`.
 */

const AHORA = new Date("2026-11-10T12:00:00.000Z");
const DIA = 24 * 60 * 60 * 1000;

function candidato(p: Partial<CandidatoARecordatorio> = {}): CandidatoARecordatorio {
  return {
    assessmentId: "asm_1",
    enrollmentId: "enr_1",
    plazoDelGrupo: new Date(AHORA.getTime() + DIA),
    prorroga: null,
    entrego: false,
    tieneResultado: false,
    email: "ana@example.com",
    esPrueba: false,
    dadoDeBaja: false,
    accesoVencido: false,
    ...p,
  };
}

describe("seleccionarRecordatorios", () => {
  it("por defecto avisa 2 días antes del plazo vigente", () => {
    expect(DIAS_DE_RECORDATORIO).toBe(2);
    const r = seleccionarRecordatorios([candidato()], AHORA, 2);
    expect(r).toEqual([
      {
        assessmentId: "asm_1",
        enrollmentId: "enr_1",
        vigente: new Date(AHORA.getTime() + DIA),
        clave: claveDeRecordatorio("asm_1", "enr_1", new Date(AHORA.getTime() + DIA)),
      },
    ]);
  });

  it("todavía no: falta más que la ventana; ya no: el plazo pasó", () => {
    expect(seleccionarRecordatorios([candidato({ plazoDelGrupo: new Date(AHORA.getTime() + 3 * DIA) })], AHORA, 2)).toEqual([]);
    expect(seleccionarRecordatorios([candidato({ plazoDelGrupo: new Date(AHORA.getTime() - 1) })], AHORA, 2)).toEqual([]);
    expect(seleccionarRecordatorios([candidato({ plazoDelGrupo: null })], AHORA, 2)).toEqual([]);
  });

  it("el plazo vigente es el más tardío: la prórroga lo corre fuera de la ventana", () => {
    const r = seleccionarRecordatorios(
      [candidato({ prorroga: new Date(AHORA.getTime() + 10 * DIA) })],
      AHORA,
      2
    );
    expect(r).toEqual([]);
  });

  it("una prórroga dentro de la ventana avisa aunque el plazo del grupo ya pasó", () => {
    const prorroga = new Date(AHORA.getTime() + DIA);
    const r = seleccionarRecordatorios(
      [candidato({ plazoDelGrupo: new Date(AHORA.getTime() - 5 * DIA), prorroga })],
      AHORA,
      2
    );
    expect(r.map((x) => x.vigente)).toEqual([prorroga]);
  });

  it("no avisa a quien ya entregó, ya tiene resultado, no tiene correo, es de prueba, está de baja o con el acceso vencido", () => {
    for (const p of [
      { entrego: true },
      { tieneResultado: true },
      { email: null },
      { email: "  " },
      { esPrueba: true },
      { dadoDeBaja: true },
      { accesoVencido: true },
    ]) {
      expect(seleccionarRecordatorios([candidato(p)], AHORA, 2), JSON.stringify(p)).toEqual([]);
    }
  });

  it("con 0 días no avisa nunca", () => {
    expect(seleccionarRecordatorios([candidato()], AHORA, 0)).toEqual([]);
  });
});

describe("las llaves de idempotencia", () => {
  it("el recordatorio es por evaluación, inscripción y plazo vigente", () => {
    const a = claveDeRecordatorio("asm_1", "enr_1", new Date("2026-11-11T02:59:00.000Z"));
    const b = claveDeRecordatorio("asm_1", "enr_1", new Date("2026-11-12T02:59:00.000Z"));
    expect(a).not.toBe(b);
    expect(a).toBe("recordatorio:asm_1:enr_1:2026-11-11T02:59:00.000Z");
  });

  it("la publicación es por versión publicada", () => {
    expect(claveDeCorreccionPublicada("cor_1")).toBe("correccion:cor_1");
  });
});

describe("el contenido", () => {
  it("el recordatorio dice qué, hasta cuándo (en la zona de la academia) y dónde, y escapa todo", () => {
    const m = armarRecordatorio({
      nombre: "Ana <script>",
      evaluacion: "Entrega final",
      curso: "Revit",
      vigente: new Date("2026-11-11T02:59:00.000Z"),
      timeZone: "America/Montevideo",
      enlace: "https://crm.example.com/portal/cursadas/enr_1?tab=evaluaciones",
    });
    expect(m.subject).toBe("Recordatorio: «Entrega final» vence pronto");
    expect(m.html).toContain("Ana &lt;script&gt;");
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("23:59");
    expect(m.html).toContain("https://crm.example.com/portal/cursadas/enr_1?tab=evaluaciones");
  });

  it("la corrección publicada no lleva la nota en el asunto y escapa el nombre", () => {
    const m = armarCorreccionPublicada({
      nombre: "Ana",
      evaluacion: "Parcial <1>",
      curso: "Revit",
      enlace: "https://crm.example.com/portal/cursadas/enr_1?tab=evaluaciones",
    });
    expect(m.subject).toBe("Tu corrección fue publicada: «Parcial <1>»");
    expect(m.html).toContain("Parcial &lt;1&gt;");
  });
});
