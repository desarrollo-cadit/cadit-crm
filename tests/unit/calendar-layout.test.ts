import { describe, expect, it } from "vitest";
import {
  cohortColor,
  repartirEnColumnas,
  type PositionedSession,
} from "@/components/calendar/calendar-client";

/**
 * 013 (corrección) — Cómo se acomodan las clases que se pisan.
 *
 * El bug: dos clases a la misma hora se dibujaban una ENCIMA de la otra. Se
 * veía una sola y la de abajo desaparecía — no "se veía feo": **se perdía
 * información**, y nadie se enteraba de que faltaba una clase.
 */

const sesion = (
  cohortId: string,
  startMin: number,
  endMin: number
): PositionedSession => ({
  klass: {
    cohortId,
    cohortName: cohortId,
    courseName: cohortId,
    date: "2026-09-07T00:00:00.000Z",
    startTime: null,
    endTime: null,
    canceled: false,
    projected: false,
  },
  dayIndex: 0,
  hasTime: true,
  topPx: 0,
  heightPx: 10,
  column: 0,
  columns: 1,
  startMin,
  endMin,
});

describe("repartirEnColumnas — las clases que se pisan no se tapan", () => {
  it("una sola clase ocupa todo el ancho", () => {
    const [s] = repartirEnColumnas([sesion("a", 540, 660)]);
    expect(s!.columns).toBe(1);
    expect(s!.column).toBe(0);
  });

  /** El caso que reportó el dueño: dos clases en el mismo horario. */
  it("dos clases a la MISMA hora quedan lado a lado", () => {
    const r = repartirEnColumnas([sesion("a", 540, 660), sesion("b", 540, 660)]);
    expect(r.every((s) => s.columns === 2)).toBe(true);
    expect(r.map((s) => s.column).sort()).toEqual([0, 1]);
  });

  /**
   * Se agrupa por SOLAPAMIENTO real, no por hora de inicio: 9–11 y 10–12 se
   * pisan aunque no empiecen juntas. Agrupar por hora exacta las habría
   * dejado encimadas igual.
   */
  it("solapamiento parcial también reparte", () => {
    const r = repartirEnColumnas([sesion("a", 540, 660), sesion("b", 600, 720)]);
    expect(r.every((s) => s.columns === 2)).toBe(true);
  });

  /** Tres pisadas dan tres columnas. */
  it("tres clases simultáneas dan tres columnas", () => {
    const r = repartirEnColumnas([
      sesion("a", 540, 660),
      sesion("b", 540, 660),
      sesion("c", 540, 660),
    ]);
    expect(r.every((s) => s.columns === 3)).toBe(true);
    expect(r.map((s) => s.column).sort()).toEqual([0, 1, 2]);
  });

  /**
   * Y lo contrario, que es igual de importante: clases que NO se pisan
   * conservan el ancho completo. Repartir todo el día en columnas dejaría
   * cada clase flaquita sin motivo.
   */
  it("clases consecutivas que no se pisan quedan a ancho completo", () => {
    const r = repartirEnColumnas([sesion("a", 540, 660), sesion("b", 660, 780)]);
    expect(r.every((s) => s.columns === 1)).toBe(true);
  });

  /**
   * Una clase que termina justo cuando empieza otra NO se pisa: 9–11 y 11–13
   * son consecutivas. Con un `<` en vez de `<=` habrían quedado partidas al
   * medio sin necesidad.
   */
  it("el borde exacto (termina a la hora que empieza la otra) no cuenta como choque", () => {
    const r = repartirEnColumnas([sesion("a", 540, 660), sesion("b", 660, 720)]);
    expect(r.every((s) => s.columns === 1)).toBe(true);
  });

  /** Grupos independientes se reparten por separado. */
  it("dos grupos separados no se contaminan entre sí", () => {
    const r = repartirEnColumnas([
      sesion("a", 540, 600),
      sesion("b", 540, 600),
      sesion("c", 900, 960),
    ]);
    const c = r.find((s) => s.klass.cohortId === "c")!;
    expect(c.columns).toBe(1);
    expect(r.filter((s) => s.klass.cohortId !== "c").every((s) => s.columns === 2)).toBe(true);
  });

  it("no pierde ninguna clase", () => {
    const entrada = [
      sesion("a", 540, 660),
      sesion("b", 540, 660),
      sesion("c", 600, 700),
      sesion("d", 900, 960),
    ];
    expect(repartirEnColumnas(entrada)).toHaveLength(4);
  });
});

/**
 * El color se deriva del id de la cohorte y no de su posición: si dependiera
 * del orden, una cohorte cambiaría de color al aparecer otra nueva, y el
 * equipo perdería la referencia visual que acaba de aprender.
 */
describe("cohortColor — cada cohorte conserva SU color", () => {
  it("el mismo id siempre da el mismo color", () => {
    expect(cohortColor("coh_abc")).toBe(cohortColor("coh_abc"));
  });

  it("ids distintos reparten entre la paleta", () => {
    const colores = new Set(
      ["coh_1", "coh_2", "coh_3", "coh_4", "coh_5", "coh_6"].map(
        (id) => cohortColor(id).bg
      )
    );
    // No se exige que las 6 sean distintas (hay colisiones posibles), pero sí
    // que no colapsen todas en una: eso sería volver al calendario gris.
    expect(colores.size).toBeGreaterThan(2);
  });

  it("siempre devuelve un color válido, aunque el id sea raro", () => {
    for (const id of ["", "x", "🙂", "a".repeat(200)]) {
      expect(cohortColor(id).bg).toMatch(/^bg-/);
    }
  });
});
