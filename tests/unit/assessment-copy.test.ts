import { describe, expect, it } from "vitest";
import { modeloComoEvaluacion, planAssessmentCopy, type AssessmentDto } from "@/server/grading";

/**
 * 014 (T014, DV-009) — Copiar las evaluaciones de una cohorte a otra.
 *
 * El contexto que da sentido al archivo: hay **0 evaluaciones cargadas en las
 * 41 cohortes**, y el profesor no puede crearlas (DV-002). Sin esta acción su
 * pantalla nace vacía en todas — el mismo agujero que tuvo el calendario en la
 * 013 con `class_session` vacía.
 *
 * `planAssessmentCopy` es PURA a propósito: la regla que decide qué se copia y
 * qué no es la parte que puede romperse en silencio, y probarla no debería
 * necesitar una base de datos.
 */

function ev(name: string, position: number, required = true): AssessmentDto {
  return { id: `asm_${position}`, name, position, required };
}

describe("T014 — copiar no duplica (constitución IV)", () => {
  /**
   * El caso normal: una cohorte nueva, vacía, recibe el esquema completo.
   */
  it("copia todas cuando el destino está vacío, en el orden del origen", () => {
    const plan = planAssessmentCopy(
      [ev("Parcial 1", 0), ev("Trabajo final", 1), ev("Práctica", 2, false)],
      []
    );

    expect(plan.aCopiar.map((a) => a.name)).toEqual([
      "Parcial 1",
      "Trabajo final",
      "Práctica",
    ]);
    expect(plan.aCopiar.map((a) => a.position)).toEqual([0, 1, 2]);
    expect(plan.omitidas).toEqual([]);
    expect(plan.aviso).toBeNull();
  });

  /** Lo obligatorio viaja: una práctica opcional no puede volverse requisito. */
  it("respeta `required` de cada evaluación", () => {
    const plan = planAssessmentCopy([ev("Práctica", 0, false), ev("Final", 1, true)], []);
    expect(plan.aCopiar.map(({ name, required, position }) => ({ name, required, position }))).toEqual([
      { name: "Práctica", required: false, position: 0 },
      { name: "Final", required: true, position: 1 },
    ]);
  });

  /**
   * **El caso que justifica el test.** Apretar dos veces el botón es lo más
   * probable que va a pasar: la primera copia no da una señal fuerte y la
   * persona duda. Si duplicara, la planilla quedaría con "Parcial 1" dos veces
   * y cada alumno tendría que aprobar la misma evaluación dos veces.
   */
  it("copiar dos veces no duplica nada", () => {
    const origen = [ev("Parcial 1", 0), ev("Trabajo final", 1)];

    const primera = planAssessmentCopy(origen, []);
    const yaCopiadas = primera.aCopiar.map((a, i) => ev(a.name, i, a.required));

    const segunda = planAssessmentCopy(origen, yaCopiadas);

    expect(segunda.aCopiar).toEqual([]);
    expect(segunda.omitidas).toEqual(["Parcial 1", "Trabajo final"]);
    expect(segunda.aviso).toContain("ya tenía");
  });

  /**
   * La comparación es por NOMBRE normalizado, no por `id`: la copia crea filas
   * nuevas, así que el `id` nunca coincide. Comparar por `id` dejaría duplicar
   * sin límite y el test de arriba pasaría igual por accidente.
   */
  it("ignora mayúsculas, acentos y espacios de sobra al comparar", () => {
    const plan = planAssessmentCopy(
      [ev("Trabajo  Práctico", 0)],
      [ev("trabajo practico", 0)]
    );

    expect(plan.aCopiar).toEqual([]);
    expect(plan.omitidas).toEqual(["Trabajo  Práctico"]);
  });

  /** Un origen con el nombre repetido copia UNA sola, no dos. */
  it("no duplica dentro de la misma tanda", () => {
    const plan = planAssessmentCopy([ev("Parcial", 0), ev("PARCIAL", 1)], []);
    expect(plan.aCopiar).toHaveLength(1);
    expect(plan.omitidas).toEqual(["PARCIAL"]);
  });

  /**
   * Copiar sobre una cohorte que YA tiene evaluaciones propias no las pisa ni
   * las reordena: las nuevas se agregan al final. Lo que ya estaba cargado —
   * con resultados de alumnos colgando — no se toca.
   */
  it("agrega al final sin tocar lo que ya había", () => {
    const plan = planAssessmentCopy(
      [ev("Parcial 1", 0), ev("Final", 1)],
      [ev("Diagnóstico propio", 0), ev("Parcial 1", 1)]
    );

    expect(plan.aCopiar.map((a) => [a.name, a.position])).toEqual([["Final", 2]]);
    expect(plan.omitidas).toEqual(["Parcial 1"]);
  });

  /**
   * Posiciones con huecos (alguien borró la del medio) no pueden generar una
   * posición repetida.
   */
  it("continúa después de la posición más alta, aunque haya huecos", () => {
    const plan = planAssessmentCopy([ev("Nueva", 0)], [ev("Vieja", 7)]);
    expect(plan.aCopiar[0]?.position).toBe(8);
  });
});

describe("T014 — copiar de una cohorte vacía avisa, no falla", () => {
  /**
   * Con 0 evaluaciones en las 41 cohortes, elegir un origen vacío es el error
   * MÁS probable de los primeros días. Fallar sería correcto y también
   * inútil: la persona necesita saber que el problema está en el origen, no en
   * lo que apretó.
   */
  it("devuelve un plan vacío con aviso, no un error", () => {
    const plan = planAssessmentCopy([], [ev("Ya tenía", 0)]);

    expect(plan.aCopiar).toEqual([]);
    expect(plan.omitidas).toEqual([]);
    expect(plan.aviso).toContain("origen");
    expect(plan.aviso).toContain("no tiene evaluaciones");
  });

  /** Y el aviso distingue los dos "no se copió nada", que son distintos. */
  it("el aviso del origen vacío no se confunde con el de todo repetido", () => {
    const vacio = planAssessmentCopy([], []);
    const repetido = planAssessmentCopy([ev("Final", 0)], [ev("Final", 0)]);

    expect(vacio.aviso).not.toEqual(repetido.aviso);
  });
});

describe("T014 — lo que NO se copia", () => {
  /**
   * **Los resultados son de las personas de la otra cohorte.** El plan es un
   * objeto plano con nombre, obligatoriedad, posición y la plantilla (031): no
   * hay forma de que un resultado, un alumno, un `id` de origen o el plazo se
   * cuelen en el insert.
   */
  it("el plan solo lleva nombre, obligatoriedad, posición y plantilla", () => {
    const plan = planAssessmentCopy([{ ...ev("Parcial 1", 0), dueAt: "2026-10-01T21:00:00.000Z" }], []);
    expect(Object.keys(plan.aCopiar[0] ?? {}).sort()).toEqual([
      "criteria",
      // 0084 — la consigna viaja con la evaluación (los adjuntos, aparte).
      "instructionsMd",
      "minScore",
      "name",
      "position",
      "required",
      "requiresApproval",
      "scale",
      "textFields",
    ]);
  });
});

/**
 * 031 (T009, DV-009, FR-006) — Copiar trae la plantilla de corrección.
 *
 * Sin esto, copiar las evaluaciones de la cohorte anterior dejaría todas en
 * aprobado/no aprobado y habría que volver a armar cada plantilla a mano: el
 * mismo agujero que la copia vino a tapar.
 */
describe("T009 — copiar trae la plantilla", () => {
  const numerica: AssessmentDto = {
    ...ev("Trabajo final", 0),
    scale: "numeric",
    minScore: 60,
    requiresApproval: true,
    criteria: [
      { id: "c1", name: "Modelado", maxPoints: 40 },
      { id: "c2", name: "Planos", maxPoints: 60 },
    ],
    textFields: [{ id: "f1", name: "Fortalezas", required: true }],
  };

  it("copia escala, mínimo, aprobación, ejercicios y campos", () => {
    const [copia] = planAssessmentCopy([numerica], []).aCopiar;
    expect(copia?.scale).toBe("numeric");
    expect(copia?.minScore).toBe(60);
    expect(copia?.requiresApproval).toBe(true);
    expect(copia?.criteria.map(({ name, maxPoints }) => ({ name, maxPoints }))).toEqual([
      { name: "Modelado", maxPoints: 40 },
      { name: "Planos", maxPoints: 60 },
    ]);
    expect(copia?.textFields.map(({ name, required }) => ({ name, required }))).toEqual([
      { name: "Fortalezas", required: true },
    ]);
  });

  /**
   * La copia es OTRA evaluación: si compartiera los ids de los ejercicios, una
   * corrección de una cohorte se podría leer contra la plantilla de la otra.
   */
  it("regenera los ids de ejercicios y campos", () => {
    const [copia] = planAssessmentCopy([numerica], []).aCopiar;
    const ids = [...(copia?.criteria ?? []), ...(copia?.textFields ?? [])].map((x) => x.id);
    expect(ids).toHaveLength(3);
    for (const id of ids) {
      expect(id).toBeTruthy();
      expect(["c1", "c2", "f1"]).not.toContain(id);
    }
    expect(new Set(ids).size).toBe(3);
  });

  /** Una evaluación de antes de 031 (sin plantilla en el DTO) se copia como pass_fail. */
  it("sin plantilla se copia aprobado/no aprobado", () => {
    const [copia] = planAssessmentCopy([ev("Parcial", 0)], []).aCopiar;
    expect(copia).toMatchObject({
      scale: "pass_fail",
      minScore: null,
      requiresApproval: false,
      criteria: [],
      textFields: [],
    });
  });

  it("sigue sin copiar el plazo", () => {
    const [copia] = planAssessmentCopy(
      [{ ...numerica, dueAt: "2026-10-01T21:00:00.000Z" }],
      []
    ).aCopiar;
    expect(copia).not.toHaveProperty("dueAt");
  });
});

/**
 * 0084 — Copiar (de otro grupo o del curso) trae también la consigna y las
 * frases de cada nivel de la rúbrica. Los adjuntos se copian aparte, por eso
 * el plan dice de qué evaluación de origen sale cada copia (`origenIds`,
 * alineado con `aCopiar`) sin meter el id de origen en el insert.
 */
describe("0084 — copiar trae consigna y rúbrica", () => {
  const conRubrica: AssessmentDto = {
    ...ev("Entrega final", 0),
    instructionsMd: "Modelá la **planta baja**.",
    scale: "numeric",
    minScore: 60,
    requiresApproval: false,
    criteria: [
      { id: "c1", name: "Modelado", maxPoints: 100, levels: { excelente: "Sin errores", bueno: "Detalles" } },
    ],
    textFields: [],
  };

  it("copia la consigna y los descriptores, con ids nuevos", () => {
    const [copia] = planAssessmentCopy([conRubrica], []).aCopiar;
    expect(copia?.instructionsMd).toBe("Modelá la **planta baja**.");
    expect(copia?.criteria[0]?.levels).toEqual({ excelente: "Sin errores", bueno: "Detalles" });
    expect(copia?.criteria[0]?.id).not.toBe("c1");
  });

  it("sin consigna se copia vacía", () => {
    const [copia] = planAssessmentCopy([ev("Parcial", 0)], []).aCopiar;
    expect(copia?.instructionsMd).toBe("");
  });

  it("origenIds dice de qué evaluación sale cada copia, en el mismo orden", () => {
    const plan = planAssessmentCopy(
      [ev("B", 1), ev("A", 0), ev("Ya está", 2)],
      [ev("Ya está", 0)]
    );
    expect(plan.aCopiar.map((a) => a.name)).toEqual(["A", "B"]);
    expect(plan.origenIds).toEqual(["asm_0", "asm_1"]);
  });
});

describe("0084 — tomar las evaluaciones modelo del curso", () => {
  it("un modelo se lee como evaluación de origen, y la regla de duplicados es la misma", () => {
    const origen = [
      modeloComoEvaluacion({
        id: "casm_1",
        name: "Trabajo final",
        position: 0,
        required: true,
        instructionsMd: "Consigna",
        scale: "pass_fail",
        minScore: null,
        requiresApproval: false,
        criteria: [],
        textFields: [],
      }),
    ];
    const plan = planAssessmentCopy(origen, [ev("TRABAJO  final", 0)]);
    expect(plan.aCopiar).toEqual([]);
    expect(plan.omitidas).toEqual(["Trabajo final"]);
  });
});
