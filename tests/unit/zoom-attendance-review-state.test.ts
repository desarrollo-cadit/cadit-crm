import { describe, expect, it } from "vitest";
import {
  asignar,
  cuerpoDeConfirmacion,
  estadoInicial,
  minutosEnPantalla,
  resumenDeConfirmacion,
  type SugerenciaEnPantalla,
} from "@/lib/zoom-attendance-review";

/** La pantalla de revisión: asignar, sacar, ignorar y lo que se manda. */

const s: SugerenciaEnPantalla = {
  umbralMinutos: 60,
  alumnos: [
    { enrollmentId: "enr_ana", nombre: "Ana", sugerido: "presente", personas: ["correo:ana@x"], marcaActual: null },
    { enrollmentId: "enr_juan", nombre: "Juan", sugerido: "presente", personas: ["nombre:juan"], marcaActual: { status: "ausente", source: "manual" } },
    { enrollmentId: "enr_seba", nombre: "Seba", sugerido: "ausente", personas: [], marcaActual: null },
  ],
  sinIdentificar: [{ key: "nombre:pedro" }, { key: "nombre:otter ai" }],
  personas: {
    "correo:ana@x": { nombres: ["Ana"], minutos: 110 },
    "nombre:juan": { nombres: ["iPhone de Juan"], minutos: 95 },
    "nombre:pedro": { nombres: ["Pedro"], minutos: 80 },
    "nombre:otter ai": { nombres: ["Otter.ai"], minutos: 120 },
  },
};

describe("revisión de la sugerencia de Zoom", () => {
  it("arranca con lo sugerido y nadie asignado a los sin identificar", () => {
    const e = estadoInicial(s);
    expect(e.asignacion).toEqual({
      "correo:ana@x": "enr_ana",
      "nombre:juan": "enr_juan",
      "nombre:pedro": null,
      "nombre:otter ai": null,
    });
    expect(e.estados).toEqual({ enr_ana: "presente", enr_juan: "presente", enr_seba: "ausente" });
  });

  it("asignar un nombre a quien no apareció lo vuelve presente si alcanza el umbral", () => {
    const e = asignar(estadoInicial(s), s, "nombre:pedro", "enr_seba", new Set());
    expect(e.estados.enr_seba).toBe("presente");
    expect(minutosEnPantalla("enr_seba", e.asignacion, s.personas)).toEqual({ minutos: 80, aproximado: false });
  });

  it("sacar la persona sugerida (no es él) lo deja ausente, salvo que lo hayan tocado a mano", () => {
    expect(asignar(estadoInicial(s), s, "nombre:juan", null, new Set()).estados.enr_juan).toBe("ausente");
    expect(asignar(estadoInicial(s), s, "nombre:juan", null, new Set(["enr_juan"])).estados.enr_juan).toBe("presente");
  });

  it("el cuerpo: decisiones, ignorados, rechazados (solo lo que se proponía) y pisadas", () => {
    let e = estadoInicial(s);
    e = asignar(e, s, "nombre:pedro", "enr_seba", new Set());
    e = asignar(e, s, "nombre:otter ai", "ignorar", new Set());
    e = asignar(e, s, "nombre:juan", null, new Set());
    e = { ...e, pisar: ["enr_juan"] };
    expect(cuerpoDeConfirmacion(s, e)).toEqual({
      decisions: [
        { enrollmentId: "enr_ana", status: "presente", personaKeys: ["correo:ana@x"] },
        { enrollmentId: "enr_juan", status: "ausente", personaKeys: [] },
        { enrollmentId: "enr_seba", status: "presente", personaKeys: ["nombre:pedro"] },
      ],
      ignore: ["nombre:otter ai"],
      rejected: ["nombre:juan"],
      overwrite: ["enr_juan"],
    });
  });

  it("el pie cuenta lo que se escribe, lo que se pisa y lo que no se toca", () => {
    const e = estadoInicial(s);
    expect(resumenDeConfirmacion(s, e)).toEqual({ aEscribir: 2, sinTocar: 1, aPisar: 0 });
    expect(resumenDeConfirmacion(s, { ...e, pisar: ["enr_juan"] })).toEqual({ aEscribir: 2, sinTocar: 0, aPisar: 1 });
  });
});
