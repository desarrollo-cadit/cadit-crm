import { describe, expect, it } from "vitest";
import {
  planDeInscripcionAModulos,
  resumenDelFaltante,
  type HechosDeInscripcionAModulos,
} from "@/lib/module-auto-enroll";

/**
 * 034 (US1, FR-001..FR-005a) — Qué inscripciones hijas se crean solas.
 *
 * La regla es PURA: recibe las madres, los módulos, las hijas que ya existen y
 * las exclusiones, y devuelve qué crear, qué ya estaba y a quién se deja
 * afuera y por qué. La usan las tres puertas —crear un módulo, inscribir en la
 * especialización y la regularización de FR-005— para que no puedan decidir
 * distinto.
 */

const MOD1 = { cohortId: "co_m1", courseId: "cu_revit", label: "Módulo 1 — Revit" };
const MOD2 = { cohortId: "co_m2", courseId: "cu_navis", label: "Módulo 2 — Navisworks" };

function madre(n: number, extra: Partial<{ enBaja: boolean }> = {}) {
  return {
    enrollmentId: `en_${n}`,
    contactId: `ct_${n}`,
    contactName: `Alumno ${n}`,
    enBaja: extra.enBaja ?? false,
  };
}

function hechos(over: Partial<HechosDeInscripcionAModulos> = {}): HechosDeInscripcionAModulos {
  return {
    madres: [],
    modulos: [],
    hijas: [],
    inscripcionesEnModulos: [],
    exclusiones: [],
    ...over,
  };
}

describe("planDeInscripcionAModulos", () => {
  it("crea una hija por madre activa y por módulo (escenarios 1 y 2)", () => {
    const plan = planDeInscripcionAModulos(
      hechos({ madres: [madre(1), madre(2)], modulos: [MOD1, MOD2] })
    );
    expect(plan.aCrear).toEqual([
      { parentEnrollmentId: "en_1", contactId: "ct_1", cohortId: "co_m1" },
      { parentEnrollmentId: "en_1", contactId: "ct_1", cohortId: "co_m2" },
      { parentEnrollmentId: "en_2", contactId: "ct_2", cohortId: "co_m1" },
      { parentEnrollmentId: "en_2", contactId: "ct_2", cohortId: "co_m2" },
    ]);
    expect(plan.existentes).toEqual([]);
    expect(plan.excluidas).toEqual([]);
  });

  it("el caso real de EBIM 14: 9 alumnos, 4 módulos, 0 hijas → faltan 36", () => {
    const modulos = [1, 2, 3, 4].map((i) => ({
      cohortId: `co_m${i}`,
      courseId: `cu_${i}`,
      label: `Módulo ${i}`,
    }));
    const madres = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => madre(i));
    const plan = planDeInscripcionAModulos(hechos({ madres, modulos }));
    expect(plan.aCrear).toHaveLength(36);
    expect(resumenDelFaltante(plan)).toEqual({ inscripciones: 36, alumnos: 9, modulos: 4 });
  });

  it("no inscribe a quien está dado de baja de la especialización (escenario 3)", () => {
    const plan = planDeInscripcionAModulos(
      hechos({ madres: [madre(1), madre(2, { enBaja: true })], modulos: [MOD1] })
    );
    expect(plan.aCrear.map((c) => c.parentEnrollmentId)).toEqual(["en_1"]);
    expect(plan.excluidas).toEqual([
      expect.objectContaining({
        parentEnrollmentId: "en_2",
        cohortId: null,
        motivo: "baja",
      }),
    ]);
  });

  it("la baja se dice UNA vez por persona, no una por módulo", () => {
    const plan = planDeInscripcionAModulos(
      hechos({ madres: [madre(1, { enBaja: true })], modulos: [MOD1, MOD2] })
    );
    expect(plan.excluidas).toHaveLength(1);
  });

  it("la hija que ya existe en este módulo cuenta como existente (idempotencia)", () => {
    const plan = planDeInscripcionAModulos(
      hechos({
        madres: [madre(1)],
        modulos: [MOD1, MOD2],
        hijas: [
          { id: "en_h1", parentEnrollmentId: "en_1", cohortId: "co_m1", courseId: "cu_revit" },
        ],
      })
    );
    expect(plan.existentes).toEqual([
      { parentEnrollmentId: "en_1", cohortId: "co_m1", enrollmentId: "en_h1" },
    ]);
    expect(plan.aCrear).toEqual([
      { parentEnrollmentId: "en_1", contactId: "ct_1", cohortId: "co_m2" },
    ]);
  });

  it("ejecutar dos veces no crea nada la segunda (FR-005)", () => {
    const base = hechos({ madres: [madre(1), madre(2)], modulos: [MOD1, MOD2] });
    const primera = planDeInscripcionAModulos(base);
    const hijas = primera.aCrear.map((c, i) => ({
      id: `en_new_${i}`,
      parentEnrollmentId: c.parentEnrollmentId,
      cohortId: c.cohortId,
      courseId: c.cohortId === "co_m1" ? "cu_revit" : "cu_navis",
    }));
    const segunda = planDeInscripcionAModulos({ ...base, hijas });
    expect(segunda.aCrear).toEqual([]);
    expect(segunda.existentes).toHaveLength(4);
  });

  it("la recursada en OTRA camada del mismo curso no se duplica (escenario 4)", () => {
    const plan = planDeInscripcionAModulos(
      hechos({
        madres: [madre(1)],
        modulos: [MOD1],
        hijas: [
          // Su módulo de Revit lo cursa con la EBIM siguiente.
          { id: "en_h1", parentEnrollmentId: "en_1", cohortId: "co_otra", courseId: "cu_revit" },
        ],
      })
    );
    expect(plan.aCrear).toEqual([]);
    expect(plan.excluidas).toEqual([
      expect.objectContaining({
        parentEnrollmentId: "en_1",
        cohortId: "co_m1",
        motivo: "recursada_otra_camada",
      }),
    ]);
  });

  it("una hija de otra camada cubre UN módulo: dos módulos del mismo curso no se tapan con ella", () => {
    const gemelo = { cohortId: "co_m1b", courseId: "cu_revit", label: "Módulo 3 — Revit II" };
    const plan = planDeInscripcionAModulos(
      hechos({
        madres: [madre(1)],
        modulos: [MOD1, gemelo],
        hijas: [
          { id: "en_h1", parentEnrollmentId: "en_1", cohortId: "co_otra", courseId: "cu_revit" },
        ],
      })
    );
    expect(plan.excluidas.map((e) => e.cohortId)).toEqual(["co_m1"]);
    expect(plan.aCrear.map((c) => c.cohortId)).toEqual(["co_m1b"]);
  });

  it("las hijas de OTRA madre no cuentan para esta", () => {
    const plan = planDeInscripcionAModulos(
      hechos({
        madres: [madre(1)],
        modulos: [MOD1],
        hijas: [
          { id: "en_h9", parentEnrollmentId: "en_9", cohortId: "co_m1", courseId: "cu_revit" },
        ],
      })
    );
    expect(plan.aCrear).toHaveLength(1);
  });

  it("quien fue SACADO del módulo no vuelve a entrar con la regularización (FR-004/FR-005)", () => {
    const plan = planDeInscripcionAModulos(
      hechos({
        madres: [madre(1)],
        modulos: [MOD1, MOD2],
        exclusiones: [{ parentEnrollmentId: "en_1", cohortId: "co_m2" }],
      })
    );
    expect(plan.aCrear.map((c) => c.cohortId)).toEqual(["co_m1"]);
    expect(plan.excluidas).toEqual([
      expect.objectContaining({ cohortId: "co_m2", motivo: "sacado_del_modulo" }),
    ]);
  });

  it("si la persona ya tiene CUALQUIER inscripción en esa cohorte, no se le crea otra", () => {
    // El índice único (contacto, cohorte) la rechazaría: se dice antes.
    const plan = planDeInscripcionAModulos(
      hechos({
        madres: [madre(1)],
        modulos: [MOD1],
        inscripcionesEnModulos: [{ contactId: "ct_1", cohortId: "co_m1" }],
      })
    );
    expect(plan.aCrear).toEqual([]);
    expect(plan.excluidas).toEqual([
      expect.objectContaining({ motivo: "inscripto_en_la_cohorte", cohortId: "co_m1" }),
    ]);
  });

  it("la misma persona con DOS madres no recibe dos hijas en el mismo módulo", () => {
    const plan = planDeInscripcionAModulos(
      hechos({
        madres: [madre(1), { ...madre(2), contactId: "ct_1" }],
        modulos: [MOD1],
      })
    );
    expect(plan.aCrear).toHaveLength(1);
    expect(plan.excluidas).toEqual([
      expect.objectContaining({ parentEnrollmentId: "en_2", motivo: "inscripto_en_la_cohorte" }),
    ]);
  });

  it("sin módulos no hay nada que crear (módulo creado antes que los alumnos, y al revés)", () => {
    expect(planDeInscripcionAModulos(hechos({ madres: [madre(1)] })).aCrear).toEqual([]);
    expect(planDeInscripcionAModulos(hechos({ modulos: [MOD1] })).aCrear).toEqual([]);
  });

  it("cada exclusión lleva su motivo en palabras", () => {
    const plan = planDeInscripcionAModulos(
      hechos({ madres: [madre(1, { enBaja: true })], modulos: [MOD1] })
    );
    expect(plan.excluidas[0]?.detalle).toMatch(/baja/i);
    expect(plan.excluidas[0]?.contactName).toBe("Alumno 1");
  });
});

describe("resumenDelFaltante", () => {
  it("sin faltante devuelve ceros", () => {
    expect(
      resumenDelFaltante({ aCrear: [], existentes: [], excluidas: [] })
    ).toEqual({ inscripciones: 0, alumnos: 0, modulos: 0 });
  });
});
