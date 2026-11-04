import { describe, expect, it } from "vitest";
import {
  decidirBorradoDeClases,
  diaDeClase,
  fechaEnReceso,
  recesosDeCohorte,
  recesosDelRango,
  validarReceso,
  validarReprogramacion,
  type Receso,
} from "@/lib/recess";
import { buildClassSchedule } from "@/server/attendance";

/**
 * 034 (US2/US3, FR-006..FR-015) — Recesos, borrado y reprogramación de clases.
 *
 * Todo lo que decide es PURO: qué día cae en un receso, qué clase se puede
 * borrar sin perder historia y cuándo se puede reprogramar. Las rutas sólo
 * averiguan los hechos y ejecutan.
 */

const VERANO: Receso = {
  id: "rc_1",
  name: "Receso de verano",
  fromDate: "2026-12-15",
  toDate: "2027-01-31",
  cohortId: null,
  recurring: false,
};

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("diaDeClase", () => {
  it("es el día UTC de la clase (la medianoche UTC que guarda el cronograma)", () => {
    expect(diaDeClase(utc("2026-12-15"))).toBe("2026-12-15");
  });
});

describe("fechaEnReceso", () => {
  it("los bordes del rango son parte del receso", () => {
    expect(fechaEnReceso(utc("2026-12-15"), [VERANO])?.id).toBe("rc_1");
    expect(fechaEnReceso(utc("2027-01-31"), [VERANO])?.id).toBe("rc_1");
  });

  it("fuera del rango no hay receso", () => {
    expect(fechaEnReceso(utc("2026-12-14"), [VERANO])).toBeNull();
    expect(fechaEnReceso(utc("2027-02-01"), [VERANO])).toBeNull();
  });

  it("recesos superpuestos se suman: ningún día de ninguno tiene clase", () => {
    const propio: Receso = { ...VERANO, id: "rc_2", fromDate: "2027-02-01", toDate: "2027-02-05", cohortId: "co_1" };
    expect(fechaEnReceso(utc("2027-02-03"), [VERANO, propio])?.id).toBe("rc_2");
    expect(fechaEnReceso(utc("2027-01-10"), [VERANO, propio])?.id).toBe("rc_1");
  });

  it("sin recesos nunca hay receso", () => {
    expect(fechaEnReceso(utc("2026-12-20"), [])).toBeNull();
  });
});

describe("recesosDeCohorte", () => {
  it("una cohorte ve los de la academia y los SUYOS, nunca los de otra (escenario 6)", () => {
    const propio = { ...VERANO, id: "rc_p", cohortId: "co_1" };
    const ajeno = { ...VERANO, id: "rc_a", cohortId: "co_2" };
    expect(recesosDeCohorte([VERANO, propio, ajeno], "co_1").map((r) => r.id)).toEqual([
      "rc_1",
      "rc_p",
    ]);
  });
});

describe("validarReceso", () => {
  it("exige nombre y un rango que cierre", () => {
    expect(validarReceso({ name: "  ", fromDate: "2026-12-15", toDate: "2027-01-31" })).toMatch(
      /nombre/i
    );
    expect(validarReceso({ name: "Verano", fromDate: "2027-01-31", toDate: "2026-12-15" })).toMatch(
      /hasta/i
    );
    expect(validarReceso({ name: "Verano", fromDate: "2026-02-30", toDate: "2026-03-01" })).toMatch(
      /fecha/i
    );
  });

  it("un día suelto es un receso válido", () => {
    expect(validarReceso({ name: "Feriado", fromDate: "2026-05-01", toDate: "2026-05-01" })).toBeNull();
  });
});

describe("buildClassSchedule con recesos (FR-007)", () => {
  it("no genera clases en días de receso y numera seguido", () => {
    // Martes y jueves (1,3) del 8/12/2026 al 7/1/2027... dentro del receso no hay nada.
    const plan = buildClassSchedule(utc("2026-12-08"), utc("2027-02-04"), "1,3", 2, [VERANO]);
    const dias = plan.map((p) => diaDeClase(p.date));
    expect(dias).toEqual(["2026-12-08", "2026-12-10", "2027-02-02", "2027-02-04"]);
    expect(plan.map((p) => p.number)).toEqual([1, 2, 3, 4]);
  });

  it("una cohorte que empieza dentro del receso arranca después", () => {
    const plan = buildClassSchedule(utc("2027-01-25"), utc("2027-02-03"), "0", null, [VERANO]);
    expect(plan.map((p) => diaDeClase(p.date))).toEqual(["2027-02-01"]);
  });

  it("sin recesos se comporta exactamente como antes", () => {
    const sin = buildClassSchedule(utc("2026-12-08"), utc("2026-12-31"), "1,3", 2);
    const vacio = buildClassSchedule(utc("2026-12-08"), utc("2026-12-31"), "1,3", 2, []);
    expect(vacio).toEqual(sin);
    expect(sin).toHaveLength(8);
  });
});

describe("decidirBorradoDeClases (FR-008/FR-012)", () => {
  it("borra lo que no tiene historia y conserva —diciendo por qué— lo que sí", () => {
    const r = decidirBorradoDeClases([
      { id: "cs_1", date: utc("2026-12-15"), tieneAsistencia: false, tieneGrabacion: false },
      { id: "cs_2", date: utc("2026-12-17"), tieneAsistencia: true, tieneGrabacion: false },
      { id: "cs_3", date: utc("2026-12-22"), tieneAsistencia: false, tieneGrabacion: true },
      { id: "cs_4", date: utc("2026-12-24"), tieneAsistencia: true, tieneGrabacion: true },
    ]);
    expect(r.borrar).toEqual(["cs_1"]);
    expect(r.conservar.map((c) => [c.id, c.motivo])).toEqual([
      ["cs_2", "asistencia"],
      ["cs_3", "grabacion"],
      ["cs_4", "asistencia_y_grabacion"],
    ]);
  });

  it("sin clases no hay nada que hacer", () => {
    expect(decidirBorradoDeClases([])).toEqual({ borrar: [], conservar: [] });
  });
});

describe("validarReprogramacion (FR-013/FR-014)", () => {
  const cancelada = { canceled: true, yaReprogramada: false };

  it("sólo se reprograma una clase cancelada", () => {
    expect(
      validarReprogramacion({ ...cancelada, canceled: false }, utc("2026-11-03"), [], false)
    ).toEqual(expect.objectContaining({ code: "no_cancelada" }));
  });

  it("una clase ya reprogramada no se vuelve a reprogramar: se reprograma la nueva", () => {
    expect(
      validarReprogramacion({ ...cancelada, yaReprogramada: true }, utc("2026-11-03"), [], false)
    ).toEqual(expect.objectContaining({ code: "ya_reprogramada" }));
  });

  it("dentro de un receso pide confirmación explícita, y con ella pasa", () => {
    expect(validarReprogramacion(cancelada, utc("2026-12-20"), [VERANO], false)).toEqual(
      expect.objectContaining({ code: "en_receso", receso: "Receso de verano" })
    );
    expect(validarReprogramacion(cancelada, utc("2026-12-20"), [VERANO], true)).toBeNull();
  });

  it("fuera de receso pasa sin preguntar", () => {
    expect(validarReprogramacion(cancelada, utc("2026-11-03"), [VERANO], false)).toBeNull();
  });
});

describe("planDeCronogramaDelPrograma con recesos", () => {
  it("cada módulo saltea los recesos de la academia y los SUYOS, no los del vecino", async () => {
    const { planDeCronogramaDelPrograma } = await import("@/server/attendance");
    const base = {
      courseName: "Revit",
      startDate: utc("2026-12-08"),
      endDate: utc("2026-12-17"),
      daysOfWeek: "1,3",
      startTime: "19:00",
      endTime: "21:00",
      teacherId: null,
    };
    const { filas } = planDeCronogramaDelPrograma(
      [
        { ...base, id: "co_m1", name: "M1", position: 1 },
        { ...base, id: "co_m2", name: "M2", position: 2 },
      ],
      new Set(),
      [{ fromDate: "2026-12-10", toDate: "2026-12-10", cohortId: "co_m1" }]
    );
    const de = (id: string) => filas.filter((f) => f.cohortId === id).map((f) => diaDeClase(f.date));
    expect(de("co_m1")).toEqual(["2026-12-08", "2026-12-15", "2026-12-17"]);
    expect(de("co_m2")).toEqual(["2026-12-08", "2026-12-10", "2026-12-15", "2026-12-17"]);
  });
});

describe("vinculosDeReprogramacion (FR-013)", () => {
  it("el vínculo se ve en las DOS clases", async () => {
    const { vinculosDeReprogramacion } = await import("@/server/classes");
    const v = vinculosDeReprogramacion([
      { id: "cs_cancelada", date: utc("2026-11-03"), rescheduledFromId: null },
      { id: "cs_nueva", date: utc("2026-11-07"), rescheduledFromId: "cs_cancelada" },
      { id: "cs_otra", date: utc("2026-11-10"), rescheduledFromId: null },
    ]);
    expect(v.get("cs_nueva")?.rescheduledFrom).toEqual({
      id: "cs_cancelada",
      date: "2026-11-03T00:00:00.000Z",
    });
    expect(v.get("cs_cancelada")?.rescheduledTo).toEqual({
      id: "cs_nueva",
      date: "2026-11-07T00:00:00.000Z",
    });
    expect(v.get("cs_otra")).toBeUndefined();
  });
});

describe("feriados que se repiten todos los años", () => {
  const NAVIDAD = { fromDate: "2026-12-25", toDate: "2026-12-25", recurring: true };

  it("cae el mismo mes y día de cada año, desde el año elegido", () => {
    expect(fechaEnReceso(utc("2026-12-25"), [NAVIDAD])).not.toBeNull();
    expect(fechaEnReceso(utc("2027-12-25"), [NAVIDAD])).not.toBeNull();
    expect(fechaEnReceso(utc("2031-12-25"), [NAVIDAD])).not.toBeNull();
    expect(fechaEnReceso(utc("2027-12-24"), [NAVIDAD])).toBeNull();
  });

  it("no se aplica hacia atrás del año en que se cargó", () => {
    expect(fechaEnReceso(utc("2025-12-25"), [NAVIDAD])).toBeNull();
  });

  it("un día de un solo año no se repite", () => {
    const unaVez = { fromDate: "2026-12-25", toDate: "2026-12-25", recurring: false };
    expect(fechaEnReceso(utc("2026-12-25"), [unaVez])).not.toBeNull();
    expect(fechaEnReceso(utc("2027-12-25"), [unaVez])).toBeNull();
  });

  it("un 29/02 cae el 28/02 en los años que no son bisiestos", () => {
    const bisiesto = { fromDate: "2028-02-29", toDate: "2028-02-29", recurring: true };
    expect(fechaEnReceso(utc("2028-02-29"), [bisiesto])).not.toBeNull();
    expect(fechaEnReceso(utc("2028-02-28"), [bisiesto])).toBeNull();
    expect(fechaEnReceso(utc("2029-02-28"), [bisiesto])).not.toBeNull();
    expect(fechaEnReceso(utc("2032-02-28"), [bisiesto])).toBeNull();
    expect(fechaEnReceso(utc("2032-02-29"), [bisiesto])).not.toBeNull();
  });

  it("el cronograma saltea el feriado anual en todos los años", () => {
    const clases = buildClassSchedule(
      utc("2026-12-21"),
      utc("2027-01-05"),
      "0,3",
      null,
      [{ fromDate: "2026-12-24", toDate: "2026-12-24", recurring: true }]
    ).map((c) => diaDeClase(c.date));
    expect(clases).toEqual(["2026-12-21", "2026-12-28", "2026-12-31", "2027-01-04"]);
    const otroAnio = buildClassSchedule(
      utc("2027-12-20"),
      utc("2027-12-27"),
      "0,4",
      null,
      [{ fromDate: "2026-12-24", toDate: "2026-12-24", recurring: true }]
    ).map((c) => diaDeClase(c.date));
    expect(otroAnio).toEqual(["2027-12-20", "2027-12-27"]);
  });

  it("recesosDelRango los vuelve el día concreto de cada año", () => {
    const r = { id: "rc_n", name: "Navidad", cohortId: null, ...NAVIDAD };
    const rango = recesosDelRango([r, VERANO], "2026-12-20", "2028-01-10");
    expect(rango.map((x) => `${x.id}:${x.fromDate}:${x.toDate}`)).toEqual([
      "rc_1:2026-12-15:2027-01-31",
      "rc_n:2026-12-25:2026-12-25",
      "rc_n:2027-12-25:2027-12-25",
    ]);
    expect(recesosDelRango([r], "2027-03-01", "2027-06-01")).toEqual([]);
  });

  it("validarReceso: lo anual es un solo día", () => {
    expect(validarReceso({ name: "Navidad", fromDate: "2026-12-25", toDate: "2026-12-25", recurring: true })).toBeNull();
    expect(
      validarReceso({ name: "Verano", fromDate: "2026-12-15", toDate: "2027-01-31", recurring: true })
    ).toMatch(/un solo día/);
  });
});
