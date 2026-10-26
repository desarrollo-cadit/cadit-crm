import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  autocompletarTotal,
  courseDurationSchema,
  formatHoras,
  formatNumeroDeHoras,
  horasDesdeDb,
  horasParaDb,
  parseHoras,
  totalNoCoincide,
  totalSugerido,
} from "@/lib/course-duration";

/**
 * La duración del curso vive en el CURSO: cantidad de clases, horas por clase
 * y duración total en horas. El total NO se deriva a la fuerza: un examen o
 * una última clase más corta lo pueden hacer distinto de clases × horas.
 */

describe("parseHoras — lo que escribe la persona en el formulario", () => {
  it("vacío → null", () => {
    expect(parseHoras("")).toBeNull();
    expect(parseHoras("   ")).toBeNull();
  });

  it("acepta coma decimal (así se escribe en Uruguay) y punto", () => {
    expect(parseHoras("2,5")).toBe(2.5);
    expect(parseHoras("2.5")).toBe(2.5);
    expect(parseHoras(" 4 ")).toBe(4);
  });

  it("basura → null, nunca NaN", () => {
    expect(parseHoras("dos")).toBeNull();
    expect(parseHoras("2,5,1")).toBeNull();
  });
});

describe("totalSugerido — clases × horas por clase", () => {
  it("con las dos cargadas, multiplica sin redondear a entero", () => {
    expect(totalSugerido(10, 4)).toBe(40);
    expect(totalSugerido(15, 2.5)).toBe(37.5);
    expect(totalSugerido(7, 2.25)).toBe(15.75);
  });

  it("evita el ruido de coma flotante", () => {
    expect(totalSugerido(3, 0.1)).toBe(0.3);
  });

  it("si falta alguna, no sugiere nada", () => {
    expect(totalSugerido(null, 4)).toBeNull();
    expect(totalSugerido(10, null)).toBeNull();
    expect(totalSugerido(0, 4)).toBeNull();
  });
});

describe("totalNoCoincide — aviso suave, nunca bloquea", () => {
  it("las tres cargadas y el total distinto del producto → true", () => {
    expect(totalNoCoincide(10, 4, 42)).toBe(true);
  });

  it("coincide → false", () => {
    expect(totalNoCoincide(15, 2.5, 37.5)).toBe(false);
  });

  it("si falta alguna de las tres, no hay nada que avisar", () => {
    expect(totalNoCoincide(null, 4, 42)).toBe(false);
    expect(totalNoCoincide(10, null, 42)).toBe(false);
    expect(totalNoCoincide(10, 4, null)).toBe(false);
  });
});

describe("autocompletarTotal — precarga el total sin pisar lo que se escribió a mano", () => {
  it("total vacío → toma la sugerencia", () => {
    expect(autocompletarTotal("", null, 40)).toBe("40");
    expect(autocompletarTotal("", null, 37.5)).toBe("37,5");
  });

  it("total igual a la sugerencia anterior → sigue a la nueva", () => {
    expect(autocompletarTotal("40", 40, 44)).toBe("44");
    expect(autocompletarTotal("37,5", 37.5, 40)).toBe("40");
  });

  it("total editado a mano (distinto de la sugerencia anterior) → no se toca", () => {
    expect(autocompletarTotal("42", 40, 44)).toBe("42");
  });

  it("sin sugerencia nueva → deja el total como está", () => {
    expect(autocompletarTotal("40", 40, null)).toBe("40");
  });
});

describe("formatHoras — cómo se lee en el certificado", () => {
  it("entero sin decimales", () => {
    expect(formatHoras(40)).toBe("40 horas");
  });

  it("decimales con coma, sin ceros de más", () => {
    expect(formatHoras(37.5)).toBe("37,5 horas");
    expect(formatHoras(15.75)).toBe("15,75 horas");
  });

  it("una hora en singular", () => {
    expect(formatHoras(1)).toBe("1 hora");
  });

  it("formatNumeroDeHoras es el número solo, para precargar un campo", () => {
    expect(formatNumeroDeHoras(2.5)).toBe("2,5");
    expect(formatNumeroDeHoras(4)).toBe("4");
  });
});

describe("horasDesdeDb / horasParaDb — numeric de Postgres viaja como texto", () => {
  it("texto → número; null → null", () => {
    expect(horasDesdeDb("37.50")).toBe(37.5);
    expect(horasDesdeDb("4.00")).toBe(4);
    expect(horasDesdeDb(null)).toBeNull();
  });

  it("número → texto; null/undefined se preservan (undefined = no tocar)", () => {
    expect(horasParaDb(2.5)).toBe("2.5");
    expect(horasParaDb(null)).toBeNull();
    expect(horasParaDb(undefined)).toBeUndefined();
  });
});

describe("courseDurationSchema — validación del alta y la edición", () => {
  const { classCount, hoursPerClass, totalHours } = courseDurationSchema;

  it("cantidad de clases: entero de 1 a 1000, opcional y anulable", () => {
    expect(classCount.safeParse(12).success).toBe(true);
    expect(classCount.safeParse(null).success).toBe(true);
    expect(classCount.safeParse(undefined).success).toBe(true);
    expect(classCount.safeParse(0).success).toBe(false);
    expect(classCount.safeParse(1001).success).toBe(false);
    expect(classCount.safeParse(2.5).success).toBe(false);
  });

  it("horas por clase: > 0, ≤ 24, de a cuartos de hora", () => {
    expect(hoursPerClass.safeParse(2).success).toBe(true);
    expect(hoursPerClass.safeParse(2.5).success).toBe(true);
    expect(hoursPerClass.safeParse(2.25).success).toBe(true);
    expect(hoursPerClass.safeParse(null).success).toBe(true);
    expect(hoursPerClass.safeParse(0).success).toBe(false);
    expect(hoursPerClass.safeParse(24.5).success).toBe(false);
    expect(hoursPerClass.safeParse(2.1).success).toBe(false);
  });

  it("duración total: > 0, ≤ 10000, hasta dos decimales", () => {
    expect(totalHours.safeParse(40).success).toBe(true);
    expect(totalHours.safeParse(37.5).success).toBe(true);
    expect(totalHours.safeParse(15.75).success).toBe(true);
    expect(totalHours.safeParse(null).success).toBe(true);
    expect(totalHours.safeParse(0).success).toBe(false);
    expect(totalHours.safeParse(10000.5).success).toBe(false);
    expect(totalHours.safeParse(1.234).success).toBe(false);
  });
});

describe("estructura — las columnas viejas ya no se leen ni escriben", () => {
  const leer = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

  it("ni el editor, ni el alta/edición, ni los certificados nombran semanas u horas por semana", () => {
    for (const archivo of [
      "src/components/academic/course-form.tsx",
      "src/server/courses.ts",
      "src/server/certificates.ts",
      "src/app/api/courses/route.ts",
      "src/lib/types.ts",
    ]) {
      const src = leer(archivo);
      expect(src, archivo).not.toMatch(/durationWeeks|hoursPerWeek/);
    }
  });

  it("la migración rellena el total desde semanas × horas por semana y es re-ejecutable", () => {
    const sql = leer("drizzle/0075_duracion_del_curso.sql");
    expect(sql).toMatch(/add column if not exists "class_count"/);
    expect(sql).toMatch(/add column if not exists "hours_per_class"/);
    expect(sql).toMatch(/add column if not exists "total_hours"/);
    expect(sql).toMatch(/"duration_weeks" \* "hours_per_week"/);
    expect(sql).toMatch(/"total_hours" is null/);
    expect(sql).not.toMatch(/drop column/i);
  });
});
