import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  etiquetaDeGrupo,
  exactHoursFromTimes,
  formatHorasEs,
  horasDeLaClase,
  resumenDeHoras,
  type ClaseParaHoras,
} from "@/lib/class-hours";

/**
 * Horas dictadas: la cuenta EXACTA, la misma para el staff y para el portal.
 *
 * Antes cada clase se redondeaba a horas enteras (`Math.round`): una clase de
 * 18:30 a 20:00 sumaba 2 h y una de 18:00 a 19:20, 1 h. Lo que multiplica la
 * tarifa del profesor no puede depender de hacia dónde redondea cada clase.
 */
describe("exactHoursFromTimes", () => {
  it("una hora y media es 1,5, no 2", () => {
    expect(exactHoursFromTimes("18:30", "20:00")).toBe(1.5);
  });

  it("los minutos sueltos no se pierden (dos decimales)", () => {
    expect(exactHoursFromTimes("18:00", "19:40")).toBe(1.67);
    expect(exactHoursFromTimes("18:00", "19:20")).toBe(1.33);
  });

  it("las horas enteras siguen siendo enteras", () => {
    expect(exactHoursFromTimes("18:30", "20:30")).toBe(2);
  });

  it("null cuando falta un extremo o el rango no cierra", () => {
    expect(exactHoursFromTimes(null, "20:30")).toBeNull();
    expect(exactHoursFromTimes("20:30", "18:30")).toBeNull();
    expect(exactHoursFromTimes("no es hora", "20:30")).toBeNull();
  });
});

describe("horasDeLaClase", () => {
  it("con horario, manda el horario (exacto) y no el entero guardado", () => {
    expect(horasDeLaClase({ startTime: "18:30", endTime: "20:00", hours: 2 })).toBe(1.5);
  });

  it("sin horario, usa las horas guardadas", () => {
    expect(horasDeLaClase({ startTime: null, endTime: null, hours: 3 })).toBe(3);
  });

  it("sin nada, suma 0", () => {
    expect(horasDeLaClase({ startTime: null, endTime: null, hours: null })).toBe(0);
  });
});

describe("formatHorasEs", () => {
  it("coma decimal y hasta dos decimales", () => {
    expect(formatHorasEs(1.5)).toBe("1,5");
    expect(formatHorasEs(1.67)).toBe("1,67");
    expect(formatHorasEs(2)).toBe("2");
  });
});

describe("etiquetaDeGrupo", () => {
  it("curso — grupo cuando el grupo tiene nombre", () => {
    expect(etiquetaDeGrupo("Revit Básico", "Grupo A")).toBe("Revit Básico — Grupo A");
  });

  it("solo el curso cuando el grupo no tiene nombre", () => {
    expect(etiquetaDeGrupo("Revit Básico", null)).toBe("Revit Básico");
  });

  it("sin curso ni grupo no queda vacío", () => {
    expect(etiquetaDeGrupo(null, null)).toBe("Grupo sin nombre");
  });
});

/** 2026-10-20: 18:30–20:00 en Montevideo (UTC-3) termina 23:00Z. */
const ZONA = "America/Montevideo";
function clase(over: Partial<ClaseParaHoras> = {}): ClaseParaHoras {
  return {
    cohortId: "coh_1",
    cohortName: null,
    courseName: "Revit Básico",
    date: new Date("2026-10-20T00:00:00.000Z"),
    startTime: "18:30",
    endTime: "20:00",
    hours: 2,
    ...over,
  };
}

describe("resumenDeHoras — solo cuenta lo que ya se dictó", () => {
  it("una clase que todavía no terminó en la zona de la academia es programada", () => {
    // 22:00Z = 19:00 en Montevideo: la clase está en curso.
    const r = resumenDeHoras([clase()], ZONA, new Date("2026-10-20T22:00:00.000Z"));
    expect(r.sessions).toBe(0);
    expect(r.hours).toBe(0);
    expect(r.scheduledSessions).toBe(1);
    expect(r.scheduledHours).toBe(1.5);
  });

  it("al terminar (fin <= ahora) pasa a dictada", () => {
    const r = resumenDeHoras([clase()], ZONA, new Date("2026-10-20T23:00:00.000Z"));
    expect(r.sessions).toBe(1);
    expect(r.hours).toBe(1.5);
    expect(r.scheduledSessions).toBe(0);
  });

  it("los totales suman exacto y por grupo llevan el curso", () => {
    const ahora = new Date("2026-11-01T00:00:00.000Z");
    const r = resumenDeHoras(
      [
        clase(),
        clase({ date: new Date("2026-10-21T00:00:00.000Z") }),
        clase({ cohortId: "coh_2", cohortName: "Grupo B", courseName: "Revit MEP", startTime: "09:00", endTime: "11:20" }),
        clase({ date: new Date("2026-12-01T00:00:00.000Z") }),
      ],
      ZONA,
      ahora
    );
    expect(r.sessions).toBe(3);
    expect(r.hours).toBe(5.33);
    expect(r.scheduledSessions).toBe(1);
    expect(r.scheduledHours).toBe(1.5);
    expect(r.byCohort).toEqual([
      {
        cohortId: "coh_1",
        cohortName: null,
        courseName: "Revit Básico",
        sessions: 2,
        hours: 3,
        scheduledSessions: 1,
        scheduledHours: 1.5,
      },
      {
        cohortId: "coh_2",
        cohortName: "Grupo B",
        courseName: "Revit MEP",
        sessions: 1,
        hours: 2.33,
        scheduledSessions: 0,
        scheduledHours: 0,
      },
    ]);
  });
});

/**
 * Staff y portal cuentan con la MISMA regla: si cada uno sumara a su manera,
 * el profesor vería un número y la academia le liquidaría otro.
 */
describe("staff y portal comparten la cuenta", () => {
  const SRC = path.join(process.cwd(), "src", "server");
  it("teacherHours (staff) y teacherOwnHours (portal) usan resumenDeHoras", () => {
    const staff = readFileSync(path.join(SRC, "attendance.ts"), "utf8");
    const portal = readFileSync(path.join(SRC, "teacher-portal.ts"), "utf8");
    const cuerpo = (src: string, fn: string) => src.slice(src.indexOf(`export async function ${fn}(`));
    expect(cuerpo(staff, "teacherHours")).toContain("resumenDeHoras(");
    expect(cuerpo(portal, "teacherOwnHours")).toContain("resumenDeHoras(");
  });
});

describe("la pantalla de horas del profesor", () => {
  const PANTALLA = readFileSync(
    path.join(process.cwd(), "src", "components", "portal", "portal-hours-client.tsx"),
    "utf8"
  );

  it("muestra las horas con coma decimal, no el número crudo", () => {
    expect(PANTALLA).toContain("formatHorasEs(datos.hours)");
    expect(PANTALLA).toContain("formatHorasEs(c.hours)");
  });

  it("nombra cada grupo con su curso", () => {
    expect(PANTALLA).toContain("etiquetaDeGrupo(c.courseName, c.cohortName)");
  });

  it("las programadas van aparte, rotuladas como tales", () => {
    expect(PANTALLA).toContain("programada");
    expect(PANTALLA).toContain("datos.scheduledSessions");
  });
});
