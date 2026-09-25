import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { schema } from "@/lib/db";
import {
  agruparEspecializaciones,
  planDeReorden,
  siguientePosicion,
} from "@/lib/program-order";
import {
  validarMarcaDeEspecializacion,
  validarPadreDeCohorte,
} from "@/server/program-modules";

/**
 * 028 (seguimiento) — La especialización deja de ser IMPLÍCITA.
 *
 * Hasta acá una camada era "especialización" recién cuando alguien le colgaba
 * el primer módulo, y para colgarlo había que editar CADA módulo y elegir la
 * madre en un selector con cuarenta cohortes sin fechas. El dueño lo encontró
 * confuso y decidió (final): la condición se PERSISTE en una columna, y el
 * árbol se arma desde la pestaña de la especialización.
 *
 * Sin base de datos, como el resto de `tests/unit/`: la forma del esquema, la
 * migración y las reglas puras.
 */

const cohorte = getTableConfig(schema.cohort);
const DRIZZLE_DIR = path.join(process.cwd(), "drizzle");

describe("la columna `is_specialization`", () => {
  it("existe, es NOT NULL y arranca en false", () => {
    const col = cohorte.columns.find((c) => c.name === "is_specialization");
    expect(col).toBeDefined();
    expect(col?.notNull).toBe(true);
    expect(col?.default).toBe(false);
  });

  /**
   * La migración tiene que ser re-ejecutable (constitución IV) y tiene que
   * RELLENAR: las EBIM que ya tienen módulos no pueden perder su pestaña el día
   * del deploy.
   */
  it("la migración es re-ejecutable y marca a las camadas que ya tienen módulos", () => {
    const archivo = readdirSync(DRIZZLE_DIR).find((f) =>
      /^0041_.*\.sql$/.test(f)
    );
    expect(archivo, "falta la migración 0041").toBeDefined();
    const sql = readFileSync(path.join(DRIZZLE_DIR, archivo!), "utf8")
      .replace(/--.*$/gm, "")
      .toLowerCase();
    expect(sql).toMatch(/add column if not exists "is_specialization" boolean default false not null/);
    expect(sql).toMatch(/update "cohort"/);
    expect(sql).toMatch(/set "is_specialization" = true/);
    expect(sql).toMatch(/exists\s*\(\s*select 1 from "cohort" "?c2"?\s+where "?c2"?\."parent_cohort_id" = "cohort"\."id"\s*\)/);
  });
});

/* ============================================================
 * B — Las reglas del árbol con la especialización explícita
 * ============================================================ */

describe("validarPadreDeCohorte — sólo una especialización puede ser madre", () => {
  const colgar = {
    cohorteId: "coh_modulo",
    padreId: "coh_madre",
    padreExiste: true,
    padreYaEsModulo: false,
    padreEsEspecializacion: true,
    cohorteEsEspecializacion: false,
    cohorteYaTieneModulos: false,
    cohorteTieneCursadasDeModulo: false,
  };

  it("colgar de una especialización se acepta", () => {
    expect(validarPadreDeCohorte(colgar)).toBeNull();
  });

  /** Reemplaza la regla anterior de "cualquier cohorte raíz sirve de madre". */
  it("colgar de una cohorte común se rechaza", () => {
    const error = validarPadreDeCohorte({ ...colgar, padreEsEspecializacion: false });
    expect(error?.code).toBe("padre_no_es_especializacion");
  });

  it("una especialización no puede pasar a ser módulo de otra", () => {
    const error = validarPadreDeCohorte({ ...colgar, cohorteEsEspecializacion: true });
    expect(error?.code).toBe("especializacion_no_es_modulo");
  });

  /** El descuelgue con alumnos colgando sigue cerrado (FR-010). */
  it("descolgar un módulo con cursadas de módulo sigue rechazado", () => {
    const error = validarPadreDeCohorte({
      ...colgar,
      padreId: null,
      cohorteTieneCursadasDeModulo: true,
    });
    expect(error?.code).toBe("modulo_con_alumnos_cursandolo");
  });
});

describe("validarMarcaDeEspecializacion", () => {
  it("marcar una cohorte suelta se acepta", () => {
    expect(
      validarMarcaDeEspecializacion({
        marcar: true,
        cohorteEsModulo: false,
        cohorteTieneModulos: false,
      })
    ).toBeNull();
  });

  it("un módulo no puede ser especialización", () => {
    const error = validarMarcaDeEspecializacion({
      marcar: true,
      cohorteEsModulo: true,
      cohorteTieneModulos: false,
    });
    expect(error?.code).toBe("modulo_no_es_especializacion");
  });

  /** Desmarcar con módulos dejaría hijos colgando de una cohorte común. */
  it("desmarcar una especialización que todavía tiene módulos se rechaza", () => {
    const error = validarMarcaDeEspecializacion({
      marcar: false,
      cohorteEsModulo: false,
      cohorteTieneModulos: true,
    });
    expect(error?.code).toBe("especializacion_con_modulos");
    expect(error?.message).toMatch(/módulos/);
  });

  it("desmarcar una especialización vacía se acepta", () => {
    expect(
      validarMarcaDeEspecializacion({
        marcar: false,
        cohorteEsModulo: false,
        cohorteTieneModulos: false,
      })
    ).toBeNull();
  });
});

/* ============================================================
 * E — El lugar del módulo nuevo y el reordenamiento
 * ============================================================ */

describe("siguientePosicion — el módulo nuevo va al final", () => {
  it("sin módulos arranca en 10", () => {
    expect(siguientePosicion([])).toBe(10);
  });

  it("deja el hueco de 10 después del mayor, ignorando los sin orden", () => {
    expect(siguientePosicion([10, 30, null, 20])).toBe(40);
  });

  it("con todos sin orden, arranca en 10", () => {
    expect(siguientePosicion([null, null])).toBe(10);
  });
});

describe("planDeReorden — el orden pedido tiene que ser EXACTAMENTE los módulos", () => {
  it("renumera 10, 20, 30 en el orden pedido", () => {
    const plan = planDeReorden(["a", "b", "c"], ["c", "a", "b"]);
    expect(plan).toEqual({
      ok: true,
      positions: [
        { id: "c", position: 10 },
        { id: "a", position: 20 },
        { id: "b", position: 30 },
      ],
    });
  });

  it("rechaza un módulo que no es de esta especialización", () => {
    const plan = planDeReorden(["a", "b"], ["a", "x"]);
    expect(plan.ok).toBe(false);
  });

  it("rechaza un orden al que le falta un módulo", () => {
    expect(planDeReorden(["a", "b", "c"], ["a", "b"]).ok).toBe(false);
  });

  it("rechaza un módulo repetido", () => {
    expect(planDeReorden(["a", "b"], ["a", "a"]).ok).toBe(false);
  });
});

/* ============================================================
 * F — El listado académico agrupa a los módulos bajo su madre
 * ============================================================ */

type Fila = {
  id: string;
  name: string | null;
  courseName: string;
  isSpecialization: boolean;
  parentCohortId: string | null;
  position: number | null;
  startDate: string;
  status: "planificada" | "en_curso" | "finalizada";
};

function fila(p: Partial<Fila> & { id: string }): Fila {
  return {
    name: p.id,
    courseName: `Curso ${p.id}`,
    isSpecialization: false,
    parentCohortId: null,
    position: null,
    startDate: "2026-09-01T00:00:00.000Z",
    status: "planificada",
    ...p,
  };
}

const TODOS = new Set(["planificada", "en_curso", "finalizada"] as const);

describe("agruparEspecializaciones", () => {
  const madre = fila({ id: "ebim", isSpecialization: true, status: "planificada" });
  const m2 = fila({ id: "m2", parentCohortId: "ebim", position: 30, status: "planificada" });
  const m1 = fila({ id: "m1", parentCohortId: "ebim", position: 10, status: "en_curso" });
  const suelta = fila({ id: "revit", status: "en_curso" });

  it("los módulos NO aparecen como filas sueltas", () => {
    const grupos = agruparEspecializaciones([madre, m2, m1, suelta], TODOS);
    expect(grupos.map((g) => g.cohort.id).sort()).toEqual(["ebim", "revit"]);
  });

  it("los módulos van bajo su madre, en orden y con su ordinal", () => {
    const grupos = agruparEspecializaciones([madre, m2, m1, suelta], TODOS);
    const ebim = grupos.find((g) => g.cohort.id === "ebim")!;
    expect(ebim.modules.map((m) => [m.cohort.id, m.label])).toEqual([
      ["m1", "Módulo 1 — m1"],
      ["m2", "Módulo 2 — m2"],
    ]);
  });

  it("una especialización vacía se lista igual, sin módulos", () => {
    const vacia = fila({ id: "vacia", isSpecialization: true });
    const grupos = agruparEspecializaciones([vacia], TODOS);
    expect(grupos).toHaveLength(1);
    expect(grupos[0]!.modules).toEqual([]);
  });

  /** La madre se muestra si ELLA o alguno de sus módulos coincide. */
  it("filtrando por en curso, la madre planificada aparece por su módulo en curso", () => {
    const grupos = agruparEspecializaciones(
      [madre, m2, m1, suelta],
      new Set(["en_curso"] as const)
    );
    const ebim = grupos.find((g) => g.cohort.id === "ebim");
    expect(ebim).toBeDefined();
    // Se ubica en la sección de lo que coincidió, no en la de la madre.
    expect(ebim!.seccion).toBe("en_curso");
  });

  it("sin coincidencia ni en ella ni en sus módulos, la madre no aparece", () => {
    const grupos = agruparEspecializaciones(
      [madre, m2, m1, suelta],
      new Set(["finalizada"] as const)
    );
    expect(grupos).toEqual([]);
  });

  it("la sección de una madre que coincide es su propio estado", () => {
    const grupos = agruparEspecializaciones([madre, m1, m2], TODOS);
    expect(grupos[0]!.seccion).toBe("planificada");
  });

  /** Defensa: un módulo cuya madre no llegó en el listado no se pierde. */
  it("un módulo huérfano en el listado se muestra suelto", () => {
    const grupos = agruparEspecializaciones([m1], TODOS);
    expect(grupos.map((g) => g.cohort.id)).toEqual(["m1"]);
  });
});

/* ============================================================
 * G — Ninguna pantalla imprime `position`
 * ============================================================ */

describe("el recorrido del alumno no imprime la clave de orden", () => {
  it("student-course-client no pinta `m.position ??`", () => {
    const src = readFileSync(
      path.join(process.cwd(), "src/components/portal/student-course-client.tsx"),
      "utf8"
    );
    expect(src).not.toMatch(/\{m\.position \?\?/);
  });
});

/* ============================================================
 * C — La pestaña sale de la columna, no de contar hijos
 * ============================================================ */

describe("la pestaña de la especialización", () => {
  it("la página de la cohorte no decide por `modulos.length`", () => {
    const src = readFileSync(
      path.join(process.cwd(), "src/app/(app)/cohorts/[id]/page.tsx"),
      "utf8"
    );
    expect(src).not.toMatch(/esEspecializacion=\{modulos\.length/);
    expect(src).toContain("isSpecialization");
  });
});
