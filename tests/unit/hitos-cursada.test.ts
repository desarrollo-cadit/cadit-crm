import { describe, expect, it } from "vitest";
import { buildMilestones } from "@/server/student-portal";

/**
 * 024 — El recorrido de la cursada.
 *
 * Es lo que la persona lee sobre SÍ MISMA, así que el riesgo no es que se vea
 * feo: es que afirme algo falso. Una medalla regalada no motiva —se nota—, y
 * un "no alcanzado" sobre un dato que nadie cargó es una acusación.
 *
 * Por eso la regla que gobierna el módulo entero es una sola: **un hito solo
 * se marca cumplido si el sistema tiene con qué probarlo**, y estos tests la
 * atacan por los bordes.
 */

const AHORA = new Date("2026-09-15T12:00:00Z");
const dias = (n: number) => new Date(AHORA.getTime() + n * 86_400_000);

const base = {
  enrolledAt: dias(-30),
  classes: [] as { date: Date; number: number }[],
  attendancePct: null as number | null,
  minAttendancePct: null as number | null,
  assessments: [] as {
    name: string;
    required: boolean;
    passed: boolean | null;
    at: Date | null;
  }[],
  certificate: null as { issuedAt: Date; revokedAt: Date | null } | null,
  now: AHORA,
};

const doceClases = Array.from({ length: 12 }, (_, i) => ({
  number: i + 1,
  date: dias(-20 + i * 3),
}));

const buscar = (hitos: ReturnType<typeof buildMilestones>, key: string) =>
  hitos.find((h) => h.key === key);

describe("024 — hitos de la cursada", () => {
  it("la inscripción siempre está cumplida: es el hecho que originó todo", () => {
    const h = buscar(buildMilestones(base), "inscripcion");
    expect(h?.state).toBe("cumplido");
    expect(h?.at).toBe(dias(-30).toISOString());
  });

  it("una clase que ya pasó está cumplida; una futura, no", () => {
    const hitos = buildMilestones({ ...base, classes: doceClases });
    expect(buscar(hitos, "primera-clase")?.state).toBe("cumplido");
    // Todavía no ocurrió. Que además quede como "en curso" es correcto: es el
    // próximo hito con fecha, y eso lo fija su propio test más abajo.
    expect(buscar(hitos, "ultima-clase")?.state).not.toBe("cumplido");
  });

  it("la mitad se calcula sobre las clases reales", () => {
    const hitos = buildMilestones({ ...base, classes: doceClases });
    expect(buscar(hitos, "mitad")?.detail).toBe("Clase 6 de 12");
  });

  /**
   * Con tres clases, "la mitad" es la segunda: un hito que aporta menos que el
   * ruido que agrega. Se omite en vez de dibujar un recorrido de adorno.
   */
  it("una cursada corta no inventa un hito de mitad de camino", () => {
    const hitos = buildMilestones({
      ...base,
      classes: doceClases.slice(0, 3),
    });
    expect(buscar(hitos, "mitad")).toBeUndefined();
  });

  /* ── La regla que más se rompe sola ───────────────────────── */

  /**
   * FR-005 de 010 — sin corregir es PENDIENTE, jamás desaprobada. Se rompe con
   * cualquier `passed ? x : y` que no mire el `null`, y el resultado sería
   * decirle a alguien que reprobó algo que nadie corrigió todavía.
   */
  it("una evaluación SIN CORREGIR queda pendiente, nunca no alcanzada", () => {
    const hitos = buildMilestones({
      ...base,
      assessments: [{ name: "Trabajo final", required: true, passed: null, at: null }],
    });
    const h = hitos.find((x) => x.label === "Trabajo final");
    expect(h?.state).not.toBe("no_alcanzado");
    expect(["pendiente", "en_curso"]).toContain(h?.state);
  });

  it("una aprobada se marca cumplida, con su fecha", () => {
    const cuando = dias(-5);
    const hitos = buildMilestones({
      ...base,
      assessments: [{ name: "Parcial", required: true, passed: true, at: cuando }],
    });
    const h = hitos.find((x) => x.label === "Parcial");
    expect(h?.state).toBe("cumplido");
    expect(h?.at).toBe(cuando.toISOString());
  });

  it("una desaprobada sí se marca no alcanzada: ahí el dato existe", () => {
    const hitos = buildMilestones({
      ...base,
      assessments: [{ name: "Parcial", required: true, passed: false, at: dias(-5) }],
    });
    expect(hitos.find((x) => x.label === "Parcial")?.state).toBe("no_alcanzado");
  });

  /* ── Asistencia: informar, no acusar ──────────────────────── */

  /**
   * **0% porque nadie pasó lista no es 0% porque no vino** (013/T034). Sin
   * este caso, la mayoría de las 41 camadas importadas le diría a su alumno
   * que no alcanzó la asistencia mínima.
   */
  it("sin asistencia registrada dice SIN DATOS, no 'no alcanzado'", () => {
    const hitos = buildMilestones({
      ...base,
      classes: doceClases,
      attendancePct: null,
      minAttendancePct: 75,
    });
    const h = buscar(hitos, "asistencia");
    expect(h?.state).toBe("sin_datos");
    expect(h?.detail).toContain("Todavía no se registró");
  });

  it("con asistencia por encima del mínimo, cumplida", () => {
    const h = buscar(
      buildMilestones({ ...base, attendancePct: 86, minAttendancePct: 75 }),
      "asistencia"
    );
    expect(h?.state).toBe("cumplido");
    expect(h?.detail).toContain("86%");
  });

  it("justo en el mínimo alcanza: el umbral incluye su propio valor", () => {
    expect(
      buscar(buildMilestones({ ...base, attendancePct: 75, minAttendancePct: 75 }), "asistencia")
        ?.state
    ).toBe("cumplido");
  });

  it("por debajo del mínimo, con datos, sí se dice", () => {
    expect(
      buscar(buildMilestones({ ...base, attendancePct: 40, minAttendancePct: 75 }), "asistencia")
        ?.state
    ).toBe("no_alcanzado");
  });

  /** Sin mínimo declarado no hay nada que exigir, así que no hay hito. */
  it("una camada sin mínimo no muestra el hito de asistencia", () => {
    expect(
      buscar(buildMilestones({ ...base, attendancePct: 40, minAttendancePct: null }), "asistencia")
    ).toBeUndefined();
  });

  /* ── El final ─────────────────────────────────────────────── */

  it("sin certificado, el hito queda pendiente y explica cómo se obtiene", () => {
    const h = buscar(buildMilestones(base), "certificado");
    expect(h?.state).not.toBe("cumplido");
    expect(h?.detail).toContain("Se emite al terminar");
  });

  it("con certificado emitido, cumplido y con fecha", () => {
    const cuando = dias(-1);
    const h = buscar(
      buildMilestones({ ...base, certificate: { issuedAt: cuando, revokedAt: null } }),
      "certificado"
    );
    expect(h?.state).toBe("cumplido");
    expect(h?.at).toBe(cuando.toISOString());
  });

  /** FR-009 — un certificado anulado se VE, y dice que lo está. */
  it("un certificado anulado no se disfraza de logro", () => {
    const h = buscar(
      buildMilestones({
        ...base,
        certificate: { issuedAt: dias(-10), revokedAt: dias(-2) },
      }),
      "certificado"
    );
    expect(h?.state).toBe("no_alcanzado");
    expect(h?.detail).toContain("Anulado");
  });

  /* ── Dónde estoy parado ───────────────────────────────────── */

  it("marca UN solo hito como 'en curso': el próximo con fecha", () => {
    const hitos = buildMilestones({ ...base, classes: doceClases });
    const enCurso = hitos.filter((h) => h.state === "en_curso");
    expect(enCurso).toHaveLength(1);
    expect(enCurso[0]!.key).toBe("ultima-clase");
  });

  /**
   * Una cursada terminada no tiene "próximo paso" inventado: todos los hitos
   * con fecha ya pasaron, y ninguno queda marcado como en curso.
   */
  it("una cursada terminada no inventa un próximo paso", () => {
    const pasadas = doceClases.map((c, i) => ({ ...c, date: dias(-40 + i) }));
    const hitos = buildMilestones({
      ...base,
      classes: pasadas,
      attendancePct: 90,
      minAttendancePct: 75,
      certificate: { issuedAt: dias(-1), revokedAt: null },
    });
    expect(hitos.filter((h) => h.state === "en_curso")).toHaveLength(0);
  });

  /** Sin clases ni evaluaciones, el recorrido no se rompe: dice lo poco que sabe. */
  it("una cursada importada sin datos devuelve un recorrido honesto y corto", () => {
    const hitos = buildMilestones(base);
    expect(hitos.length).toBeGreaterThan(0);
    expect(hitos.every((h) => h.state !== "no_alcanzado")).toBe(true);
  });
});
