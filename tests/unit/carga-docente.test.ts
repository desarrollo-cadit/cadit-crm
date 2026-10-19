import { describe, expect, it } from "vitest";
import {
  SIN_PROFESOR,
  classMinutes,
  effectiveTeacherId,
  formatHours,
  matchesTeacherFilter,
  parseTeacherFilter,
  serializeTeacherFilter,
  weeklyTeacherLoad,
  type LoadClass,
} from "@/lib/teacher-load";

/**
 * 044 — Calendario por profesor: el filtro y la carga semanal.
 *
 * La carga es lo que el dueño mira para repartir clases. Si suma una
 * cancelada, o inventa una hora para una clase sin horario, el número dice
 * algo que no pasó.
 */

function clase(p: Partial<LoadClass> = {}): LoadClass {
  return {
    teacherId: "tch_ana",
    teacherName: "Ana",
    date: "2026-10-19T00:00:00.000Z",
    startTime: "18:00",
    endTime: "21:00",
    canceled: false,
    projected: false,
    ...p,
  };
}

describe("parseTeacherFilter / serializeTeacherFilter", () => {
  it("vacío o ausente = todos", () => {
    expect(parseTeacherFilter(null)).toEqual([]);
    expect(parseTeacherFilter(undefined)).toEqual([]);
    expect(parseTeacherFilter("")).toEqual([]);
    expect(parseTeacherFilter(" , ,")).toEqual([]);
  });

  it("separa por coma, recorta y quita duplicados", () => {
    expect(parseTeacherFilter("tch_a, tch_b,tch_a,,")).toEqual(["tch_a", "tch_b"]);
  });

  it("ida y vuelta por la URL", () => {
    const ids = ["tch_a", SIN_PROFESOR];
    expect(parseTeacherFilter(serializeTeacherFilter(ids))).toEqual(ids);
  });
});

describe("effectiveTeacherId — la suplencia manda", () => {
  it("la clase con profesor propio usa ese (suplencia)", () => {
    expect(effectiveTeacherId("tch_sup", "tch_tit")).toBe("tch_sup");
  });
  it("sin profesor en la clase, el de la cohorte", () => {
    expect(effectiveTeacherId(null, "tch_tit")).toBe("tch_tit");
  });
  it("ninguno = sin profesor", () => {
    expect(effectiveTeacherId(null, null)).toBeNull();
  });
});

describe("matchesTeacherFilter", () => {
  it("filtro vacío deja pasar todo", () => {
    expect(matchesTeacherFilter("tch_a", [])).toBe(true);
    expect(matchesTeacherFilter(null, [])).toBe(true);
  });
  it("solo los elegidos", () => {
    expect(matchesTeacherFilter("tch_a", ["tch_a"])).toBe(true);
    expect(matchesTeacherFilter("tch_b", ["tch_a"])).toBe(false);
  });
  it("las clases sin profesor solo con la opción «Sin profesor»", () => {
    expect(matchesTeacherFilter(null, ["tch_a"])).toBe(false);
    expect(matchesTeacherFilter(null, [SIN_PROFESOR])).toBe(true);
  });
});

describe("classMinutes / formatHours", () => {
  it("fin − inicio", () => {
    expect(classMinutes("18:30", "21:00")).toBe(150);
  });
  it("sin horario, o fin no posterior al inicio, no inventa duración", () => {
    expect(classMinutes(null, "21:00")).toBeNull();
    expect(classMinutes("18:00", null)).toBeNull();
    expect(classMinutes("21:00", "18:00")).toBeNull();
    expect(classMinutes("18:00", "18:00")).toBeNull();
    expect(classMinutes("xx", "18:00")).toBeNull();
  });
  it("formato en horas y minutos", () => {
    expect(formatHours(0)).toBe("0 h");
    expect(formatHours(180)).toBe("3 h");
    expect(formatHours(150)).toBe("2 h 30 min");
  });
});

describe("weeklyTeacherLoad", () => {
  it("separa reales de proyectadas", () => {
    const [ana] = weeklyTeacherLoad([
      clase(),
      clase({ date: "2026-10-21T00:00:00.000Z", projected: true, startTime: "09:00", endTime: "10:30" }),
    ]);
    expect(ana).toMatchObject({
      teacherId: "tch_ana",
      teacherName: "Ana",
      classes: 2,
      minutes: 270,
      realClasses: 1,
      realMinutes: 180,
      projectedClasses: 1,
      projectedMinutes: 90,
    });
  });

  it("las canceladas no suman: se cuentan aparte", () => {
    const [ana] = weeklyTeacherLoad([clase(), clase({ canceled: true, date: "2026-10-20T00:00:00.000Z" })]);
    expect(ana).toMatchObject({ classes: 1, minutes: 180, canceledClasses: 1 });
  });

  it("un profesor con solo canceladas igual aparece, con 0 clases", () => {
    const filas = weeklyTeacherLoad([clase({ canceled: true })]);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ classes: 0, minutes: 0, canceledClasses: 1 });
  });

  it("sin horario: cuenta como clase, 0 h, y queda señalada", () => {
    const [ana] = weeklyTeacherLoad([clase({ startTime: null, endTime: null }), clase()]);
    expect(ana).toMatchObject({ classes: 2, minutes: 180, untimedClasses: 1 });
  });

  it("las que se pisan suman cada una y se señalan", () => {
    const [ana] = weeklyTeacherLoad([
      clase({ startTime: "09:00", endTime: "11:00" }),
      clase({ startTime: "10:00", endTime: "12:00" }),
      clase({ startTime: "12:00", endTime: "13:00" }), // toca, no pisa
      clase({ date: "2026-10-20T00:00:00.000Z", startTime: "10:00", endTime: "12:00" }), // otro día
    ]);
    expect(ana).toMatchObject({ classes: 4, minutes: 420, overlappingClasses: 2 });
  });

  it("una cancelada no se pisa con nadie", () => {
    const [ana] = weeklyTeacherLoad([
      clase({ startTime: "09:00", endTime: "11:00" }),
      clase({ startTime: "10:00", endTime: "12:00", canceled: true }),
    ]);
    expect(ana!.overlappingClasses).toBe(0);
  });

  it("clases de profesores distintos a la misma hora no son superposición", () => {
    const filas = weeklyTeacherLoad([clase(), clase({ teacherId: "tch_bea", teacherName: "Bea" })]);
    expect(filas.every((f) => f.overlappingClasses === 0)).toBe(true);
  });

  it("la suplencia carga al suplente, no al titular", () => {
    // El DTO ya trae el profesor efectivo: la carga agrupa por ese.
    const filas = weeklyTeacherLoad([
      clase(),
      clase({ teacherId: "tch_sup", teacherName: "Suplente", date: "2026-10-20T00:00:00.000Z" }),
    ]);
    expect(filas.find((f) => f.teacherId === "tch_ana")!.classes).toBe(1);
    expect(filas.find((f) => f.teacherId === "tch_sup")!.classes).toBe(1);
  });

  it("ordena por horas, y «Sin profesor» siempre al final", () => {
    const filas = weeklyTeacherLoad([
      clase({ teacherId: null, teacherName: null, startTime: "08:00", endTime: "20:00" }),
      clase({ teacherId: "tch_bea", teacherName: "Bea", startTime: "09:00", endTime: "10:00" }),
      clase(),
    ]);
    expect(filas.map((f) => f.teacherName)).toEqual(["Ana", "Bea", "Sin profesor"]);
    expect(filas[2]!.teacherId).toBeNull();
  });

  it("sin clases, sin filas", () => {
    expect(weeklyTeacherLoad([])).toEqual([]);
  });
});
