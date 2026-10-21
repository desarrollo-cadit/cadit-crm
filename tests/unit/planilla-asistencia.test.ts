import { describe, expect, it } from "vitest";
import {
  admiteTodosPresentes,
  etiquetaDeCelda,
  nivelDePorcentaje,
  presentesDeLaClase,
  siguienteEstado,
  sinMarcarEnLaClase,
  textoTodosPresentes,
} from "@/lib/attendance-grid";
import { etiquetaCortaDeModulo, etiquetaDeModulo } from "@/lib/program-order";

const ALUMNOS = [
  { enrollmentId: "a", contactName: "Ana", bySession: { s1: "presente" as const } },
  { enrollmentId: "b", contactName: "Beto", bySession: { s1: "ausente" as const } },
  { enrollmentId: "c", contactName: "Caro", bySession: {} },
  { enrollmentId: "d", contactName: "Dani", bySession: { s2: "tarde" as const } },
];

describe("Todos presentes — quiénes se marcan", () => {
  it("solo los que no tienen marca en ESA clase; nunca pisa una marca", () => {
    expect(sinMarcarEnLaClase(ALUMNOS, "s1").map((a) => a.enrollmentId)).toEqual(["c", "d"]);
    expect(sinMarcarEnLaClase(ALUMNOS, "s2").map((a) => a.enrollmentId)).toEqual(["a", "b", "c"]);
  });

  it("no se ofrece en canceladas ni futuras, ni si no queda nadie sin marcar", () => {
    expect(admiteTodosPresentes("dictada", 2)).toBe(true);
    expect(admiteTodosPresentes("hoy", 2)).toBe(true);
    expect(admiteTodosPresentes("futura", 2)).toBe(false);
    expect(admiteTodosPresentes("cancelada", 2)).toBe(false);
    expect(admiteTodosPresentes("dictada", 0)).toBe(false);
  });

  it("el mismo texto que el portal del profesor, con el número", () => {
    expect(textoTodosPresentes(3)).toBe("Marcar como presentes a los 3 alumnos sin registrar");
    expect(textoTodosPresentes(1)).toBe("Marcar como presente al alumno sin registrar");
  });
});

describe("pie de la planilla — presentes/total por clase", () => {
  it("tarde cuenta como presente; el total es la cantidad de alumnos", () => {
    expect(presentesDeLaClase(ALUMNOS, "s1")).toEqual({ presentes: 1, total: 4 });
    expect(presentesDeLaClase(ALUMNOS, "s2")).toEqual({ presentes: 1, total: 4 });
  });
});

describe("nivelDePorcentaje — color del % contra el mínimo", () => {
  it("sin dato, sin mínimo, debajo y en regla", () => {
    expect(nivelDePorcentaje(null, 75)).toBe("sin_datos");
    expect(nivelDePorcentaje(40, null)).toBe("sin_minimo");
    expect(nivelDePorcentaje(74, 75)).toBe("bajo");
    expect(nivelDePorcentaje(75, 75)).toBe("ok");
  });
});

describe("celda de la planilla", () => {
  it("etiqueta accesible: alumno, fecha y estado en palabras", () => {
    expect(etiquetaDeCelda("Ana Pérez", "mar 06/10", "presente")).toBe("Ana Pérez, mar 06/10: Presente");
    expect(etiquetaDeCelda("Ana Pérez", "mar 06/10", null)).toBe("Ana Pérez, mar 06/10: Sin registrar");
  });

  it("el atajo de teclado recorre P → T → A → J → P", () => {
    expect(siguienteEstado(null)).toBe("presente");
    expect(siguienteEstado("presente")).toBe("tarde");
    expect(siguienteEstado("tarde")).toBe("ausente");
    expect(siguienteEstado("ausente")).toBe("justificado");
    expect(siguienteEstado("justificado")).toBe("presente");
  });
});

/**
 * El nombre del módulo ya suele traer "Módulo 1 - …", y la etiqueta le
 * anteponía otra vez el ordinal: "Módulo 1 — Módulo 1 - BIM Management".
 */
describe("etiquetaDeModulo — sin duplicar el ordinal", () => {
  it("quita el 'Módulo N' del nombre cuando coincide con el ordinal", () => {
    expect(etiquetaDeModulo(1, "Módulo 1 - BIM Management")).toBe("Módulo 1 — BIM Management");
    expect(etiquetaDeModulo(2, "MODULO 2: Revit")).toBe("Módulo 2 — Revit");
    expect(etiquetaDeModulo(3, "Módulo 3 — Coordinación")).toBe("Módulo 3 — Coordinación");
  });

  it("si el número del nombre NO coincide, no lo esconde", () => {
    expect(etiquetaDeModulo(1, "Módulo 2 - BIM")).toBe("Módulo 1 — Módulo 2 - BIM");
  });

  it("sin ordinal o sin prefijo, igual que siempre", () => {
    expect(etiquetaDeModulo(null, "Módulo 1 - BIM Management")).toBe("Módulo 1 - BIM Management");
    expect(etiquetaDeModulo(1, "Revit MEP")).toBe("Módulo 1 — Revit MEP");
  });

  it("el nombre que es SOLO 'Módulo 1' no queda vacío", () => {
    expect(etiquetaDeModulo(1, "Módulo 1")).toBe("Módulo 1");
  });

  it("etiqueta corta para el encabezado de la grilla", () => {
    expect(etiquetaCortaDeModulo("Módulo 1 — BIM Management")).toBe("M1 · BIM Management");
    expect(etiquetaCortaDeModulo("Módulo 1")).toBe("M1");
    expect(etiquetaCortaDeModulo("Revit MEP")).toBe("Revit MEP");
  });
});
