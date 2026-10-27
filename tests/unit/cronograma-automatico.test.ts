import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  cronogramaCompleto,
  debeGenerarCronograma,
  resultadoDeCronogramaAutomatico,
  SIN_HORARIO,
  type GrupoParaCronograma,
} from "@/lib/cronograma-automatico";

/**
 * 2026-10-27 — Decisión del dueño: el cronograma de un grupo NUEVO se genera
 * solo al confirmarlo (o al completar sus datos ya confirmado). Nunca antes
 * de confirmar, nunca en un grupo finalizado, nunca encima de clases que ya
 * existen (eso lo sigue rechazando `generateSchedule`).
 */
const TZ = "America/Montevideo";
const ahora = new Date("2026-10-27T15:00:00Z");

const completo: GrupoParaCronograma = {
  startDate: new Date("2026-11-02"),
  endDate: new Date("2026-12-18"),
  daysOfWeek: "0,2",
  startTime: "18:30",
  endTime: "20:30",
  confirmedAt: new Date("2026-10-27T14:00:00Z"),
};

describe("cronogramaCompleto", () => {
  it("pide fecha de fin, días y horario", () => {
    expect(cronogramaCompleto(completo)).toBe(true);
    expect(cronogramaCompleto({ ...completo, endDate: null })).toBe(false);
    expect(cronogramaCompleto({ ...completo, daysOfWeek: null })).toBe(false);
    expect(cronogramaCompleto({ ...completo, daysOfWeek: "" })).toBe(false);
    expect(cronogramaCompleto({ ...completo, startTime: null })).toBe(false);
    expect(cronogramaCompleto({ ...completo, endTime: null })).toBe(false);
  });
});

describe("debeGenerarCronograma — al confirmar", () => {
  it("un grupo confirmado y vigente: genera", () => {
    expect(debeGenerarCronograma({ disparo: "confirmacion", despues: completo }, ahora, TZ)).toEqual({
      generar: true,
    });
  });

  it("sin confirmar: nunca", () => {
    expect(
      debeGenerarCronograma({ disparo: "confirmacion", despues: { ...completo, confirmedAt: null } }, ahora, TZ)
    ).toEqual({ generar: false, motivo: "sin_confirmar" });
  });

  it("un grupo finalizado: nunca (los grupos viejos no se tocan)", () => {
    const viejo = { ...completo, startDate: new Date("2025-03-01"), endDate: new Date("2025-07-01") };
    expect(debeGenerarCronograma({ disparo: "confirmacion", despues: viejo }, ahora, TZ)).toEqual({
      generar: false,
      motivo: "finalizado",
    });
  });

  it("sin horario: no genera, y lo dice", () => {
    expect(
      debeGenerarCronograma({ disparo: "confirmacion", despues: { ...completo, endTime: null } }, ahora, TZ)
    ).toEqual({ generar: false, motivo: "sin_horario" });
  });

  it("sin fecha de fin o sin días: deja que `generateSchedule` lo explique", () => {
    expect(
      debeGenerarCronograma({ disparo: "confirmacion", despues: { ...completo, endDate: null } }, ahora, TZ)
    ).toEqual({ generar: true });
    expect(
      debeGenerarCronograma({ disparo: "confirmacion", despues: { ...completo, daysOfWeek: null } }, ahora, TZ)
    ).toEqual({ generar: true });
  });
});

describe("debeGenerarCronograma — al editar", () => {
  const incompleto = { ...completo, endDate: null };

  it("un grupo confirmado al que le faltaba algo y ahora está completo: genera", () => {
    expect(
      debeGenerarCronograma({ disparo: "edicion", antes: incompleto, despues: completo }, ahora, TZ)
    ).toEqual({ generar: true });
  });

  it("ya estaba completo antes de editar: no (un cronograma borrado a propósito no vuelve)", () => {
    expect(
      debeGenerarCronograma(
        { disparo: "edicion", antes: completo, despues: { ...completo, endTime: "21:00" } },
        ahora,
        TZ
      )
    ).toEqual({ generar: false, motivo: "sin_cambios" });
  });

  it("sin confirmar: no, aunque se complete", () => {
    expect(
      debeGenerarCronograma(
        { disparo: "edicion", antes: { ...incompleto, confirmedAt: null }, despues: { ...completo, confirmedAt: null } },
        ahora,
        TZ
      )
    ).toEqual({ generar: false, motivo: "sin_confirmar" });
  });

  it("todavía incompleto tras editar: no genera, y avisa lo que falta", () => {
    const sinDias = { ...completo, daysOfWeek: null };
    expect(
      debeGenerarCronograma({ disparo: "edicion", antes: incompleto, despues: sinDias }, ahora, TZ)
    ).toEqual({ generar: true });
    expect(
      debeGenerarCronograma(
        { disparo: "edicion", antes: incompleto, despues: { ...completo, startTime: null } },
        ahora,
        TZ
      )
    ).toEqual({ generar: false, motivo: "sin_horario" });
  });

  it("finalizado: nunca", () => {
    const viejo = { ...completo, startDate: new Date("2025-03-01"), endDate: new Date("2025-07-01") };
    expect(
      debeGenerarCronograma({ disparo: "edicion", antes: { ...viejo, endDate: null }, despues: viejo }, ahora, TZ)
    ).toEqual({ generar: false, motivo: "finalizado" });
  });
});

describe("resultadoDeCronogramaAutomatico", () => {
  it("generado: cuenta las clases", () => {
    expect(resultadoDeCronogramaAutomatico({ ok: true, clases: 14 })).toEqual({
      estado: "generado",
      clases: 14,
      mensaje: "Se generaron 14 clases.",
    });
    expect(resultadoDeCronogramaAutomatico({ ok: true, clases: 1 })?.mensaje).toBe("Se generó 1 clase.");
  });

  it("faltan datos: el mensaje de `generateSchedule`, tal cual", () => {
    for (const code of ["no_end_date", "no_days", "empty_schedule"]) {
      expect(resultadoDeCronogramaAutomatico({ ok: false, code, message: "texto de generateSchedule" })).toEqual({
        estado: "faltan_datos",
        mensaje: "texto de generateSchedule",
      });
    }
  });

  it("ya tiene clases, es una especialización o no existe: silencio", () => {
    for (const code of ["schedule_exists", "camada_con_modulos", "not_found"]) {
      expect(resultadoDeCronogramaAutomatico({ ok: false, code, message: "x" })).toBeNull();
    }
  });

  it("sin horario: lo dice", () => {
    expect(resultadoDeCronogramaAutomatico({ ok: false, code: "sin_horario", message: SIN_HORARIO })).toEqual({
      estado: "faltan_datos",
      mensaje: SIN_HORARIO,
    });
  });
});

describe("las rutas lo usan", () => {
  const confirmacion = readFileSync("src/server/cohort-confirmation.ts", "utf8");
  const rutaConfirmacion = readFileSync("src/app/api/cohorts/[id]/confirmation/route.ts", "utf8");
  const rutaEdicion = readFileSync("src/app/api/cohorts/[id]/route.ts", "utf8");

  it("confirmar genera solo si la confirmación es nueva", () => {
    expect(confirmacion).toMatch(/cambio\s*\?\s*await generarCronogramaAutomatico\(/);
    expect(rutaConfirmacion).toMatch(/schedule: r\.cronograma/);
  });

  it("editar compara antes y después", () => {
    expect(rutaEdicion).toMatch(/datosDeCronograma\(/);
    expect(rutaEdicion).toMatch(/generarCronogramaAutomatico\(/);
    expect(rutaEdicion).toMatch(/scheduleWarnings: result\.scheduleWarnings,\s*schedule,/);
  });

  it("no corre fuera de la transacción del pedido", () => {
    const servidor = readFileSync("src/server/cronograma-automatico.ts", "utf8");
    expect(servidor).not.toMatch(/onAfterCommit/);
    expect(servidor).toMatch(/generateSchedule\(/);
  });
});

describe("2026-10-27 — especializaciones: la confirmación de la madre vale para sus módulos", () => {
  it("confirmacionEfectiva: la propia, o la de la madre", async () => {
    const { confirmacionEfectiva } = await import("@/lib/cronograma-automatico");
    const propia = new Date("2026-10-20T10:00:00Z");
    const madre = new Date("2026-10-21T10:00:00Z");
    expect(confirmacionEfectiva(propia, madre)).toBe(propia);
    expect(confirmacionEfectiva(null, madre)).toBe(madre);
    expect(confirmacionEfectiva(null, null)).toBeNull();
  });

  it("un módulo sin confirmación propia, con la madre confirmada, genera al completar sus datos", () => {
    // `datosDeCronograma` ya entrega la confirmación efectiva: la regla es la misma.
    expect(
      debeGenerarCronograma({ disparo: "edicion", antes: { ...completo, endTime: null }, despues: completo }, ahora, TZ)
    ).toEqual({ generar: true });
  });

  it("resumenDeModulos: cuenta clases y módulos, y nombra a los que les falta algo", async () => {
    const { resumenDeModulos } = await import("@/lib/cronograma-automatico");
    expect(
      resumenDeModulos([
        { nombre: "Módulo 1", resultado: { estado: "generado", clases: 10, mensaje: "x" } },
        { nombre: "Módulo 2", resultado: { estado: "generado", clases: 8, mensaje: "x" } },
        { nombre: "Módulo 3", resultado: { estado: "faltan_datos", mensaje: SIN_HORARIO } },
        { nombre: "Módulo 4", resultado: null },
      ])
    ).toEqual({
      estado: "generado",
      clases: 18,
      conFaltantes: true,
      mensaje: `Se generaron 18 clases en 2 módulos. Sin clases todavía: «Módulo 3»: ${SIN_HORARIO}`,
    });
  });

  it("resumenDeModulos: uno solo, sin faltantes", async () => {
    const { resumenDeModulos } = await import("@/lib/cronograma-automatico");
    expect(
      resumenDeModulos([{ nombre: "Módulo 1", resultado: { estado: "generado", clases: 1, mensaje: "x" } }])
    ).toEqual({ estado: "generado", clases: 1, conFaltantes: false, mensaje: "Se generó 1 clase en 1 módulo." });
  });

  it("resumenDeModulos: ninguno generó → faltan datos; nada que decir → null", async () => {
    const { resumenDeModulos } = await import("@/lib/cronograma-automatico");
    expect(
      resumenDeModulos([{ nombre: "Módulo 1", resultado: { estado: "faltan_datos", mensaje: "Falta X." } }])
    ).toEqual({ estado: "faltan_datos", mensaje: "Ningún módulo generó clases. «Módulo 1»: Falta X." });
    expect(resumenDeModulos([{ nombre: "Módulo 1", resultado: null }])).toBeNull();
    expect(resumenDeModulos([])).toBeNull();
  });

  it("el servidor recorre los módulos al confirmar la madre y NO escribe confirmación en ellos", () => {
    const servidor = readFileSync("src/server/cronograma-automatico.ts", "utf8");
    expect(servidor).toMatch(/eq\(schema\.cohort\.parentCohortId, cohortId\)/);
    expect(servidor).toMatch(/resumenDeModulos\(/);
    expect(servidor).toMatch(/confirmacionEfectiva\(/);
    expect(servidor).not.toMatch(/confirmedAt:\s*(now|new Date)/);
    expect(servidor).not.toMatch(/\.update\(schema\.cohort\)/);
  });
});
