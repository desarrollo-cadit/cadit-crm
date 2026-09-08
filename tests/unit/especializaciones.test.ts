import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { schema } from "@/lib/db";
import { approvalState, programApprovalState } from "@/server/grading";
import {
  validarPadreDeCohorte,
  validarVinculoDeInscripcion,
} from "@/server/program-modules";

/**
 * 028 fase 1 — El modelo de las especializaciones: las dos auto-referencias,
 * la dispensa de asistencia y los guardas que impiden que el árbol crezca
 * más de un nivel.
 *
 * Sin base de datos, como el resto de `tests/unit/` (convención del repo: el
 * comportamiento contra Postgres se verifica en vivo). Acá se verifica la
 * FORMA del esquema y la REGLA pura de cada guarda — que es exactamente por
 * qué las reglas se escriben como funciones puras y no adentro de un `insert`.
 */

const cohorte = getTableConfig(schema.cohort);
const inscripcion = getTableConfig(schema.enrollment);

function columna(tabla: ReturnType<typeof getTableConfig>, nombre: string) {
  return tabla.columns.find((c) => c.name === nombre);
}

/* ============================================================
 * La estructura del programa — FR-001, FR-002
 * ============================================================ */

describe("cohort: la estructura del programa (FR-001, FR-002)", () => {
  it("gana parent_cohort_id, auto-referencia NULLABLE a cohort.id", () => {
    const col = columna(cohorte, "parent_cohort_id");
    expect(col).toBeDefined();
    // NULL = "no es módulo de nada", el estado de las 41 filas existentes.
    expect(col?.notNull).toBe(false);
    const fk = cohorte.foreignKeys.find((f) =>
      f.reference().columns.some((c) => c.name === "parent_cohort_id")
    );
    expect(fk).toBeDefined();
    expect(fk?.reference().foreignTable).toBe(schema.cohort);
    expect(fk?.reference().foreignColumns.map((c) => c.name)).toEqual(["id"]);
  });

  it("gana position (entero, nullable): sin padre no significa nada", () => {
    const col = columna(cohorte, "position");
    expect(col).toBeDefined();
    expect(col?.columnType).toBe("PgInteger");
    expect(col?.notNull).toBe(false);
  });

  it("indexa el árbol por (organización, padre, posición): así se camina", () => {
    const idx = cohorte.indexes.find((i) => i.config.name === "cohort_org_parent_idx");
    expect(idx).toBeDefined();
    expect(idx?.config.columns.map((c) => ("name" in c ? c.name : undefined))).toEqual([
      "organization_id",
      "parent_cohort_id",
      "position",
    ]);
  });

  it("un CHECK impide que una cohorte sea su propio padre (FR-004)", () => {
    const chk = cohorte.checks.find((c) => c.name === "cohort_padre_distinto_de_si");
    expect(chk).toBeDefined();
  });
});

/* ============================================================
 * El recorrido de la persona — FR-006
 * ============================================================ */

describe("enrollment: el recorrido de la persona (FR-006)", () => {
  it("gana parent_enrollment_id, auto-referencia NULLABLE a enrollment.id", () => {
    const col = columna(inscripcion, "parent_enrollment_id");
    expect(col).toBeDefined();
    // NULL = inscripción normal, el estado de las 384 filas existentes.
    expect(col?.notNull).toBe(false);
    const fk = inscripcion.foreignKeys.find((f) =>
      f.reference().columns.some((c) => c.name === "parent_enrollment_id")
    );
    expect(fk).toBeDefined();
    expect(fk?.reference().foreignTable).toBe(schema.enrollment);
    expect(fk?.reference().foreignColumns.map((c) => c.name)).toEqual(["id"]);
  });

  it("indexa (organización, madre) para poder listar las hijas de un recorrido", () => {
    const idx = inscripcion.indexes.find(
      (i) => i.config.name === "enrollment_org_parent_idx"
    );
    expect(idx).toBeDefined();
    expect(idx?.config.columns.map((c) => ("name" in c ? c.name : undefined))).toEqual([
      "organization_id",
      "parent_enrollment_id",
    ]);
  });

  it("un CHECK impide que una inscripción sea su propia madre (FR-009)", () => {
    const chk = inscripcion.checks.find(
      (c) => c.name === "enrollment_madre_distinta_de_si"
    );
    expect(chk).toBeDefined();
  });
});

/* ============================================================
 * La dispensa de asistencia — FR-022, FR-023, DV-004
 * ============================================================ */

describe("enrollment: la dispensa de asistencia (FR-022, FR-023, DV-004)", () => {
  /**
   * FR-023 — nunca un booleano suelto: sin autor ni motivo, una dispensa es
   * indistinguible de un error de cálculo.
   */
  it("registra quién, cuándo y por qué — y ninguna columna es booleana", () => {
    const at = columna(inscripcion, "attendance_waiver_at");
    const by = columna(inscripcion, "attendance_waiver_by");
    const reason = columna(inscripcion, "attendance_waiver_reason");
    expect(at?.columnType).toBe("PgTimestamp");
    expect(by?.columnType).toBe("PgText");
    expect(reason?.columnType).toBe("PgText");
    for (const col of [at, by, reason]) expect(col?.notNull).toBe(false);
  });

  it("no existe ninguna columna booleana de dispensa (FR-023)", () => {
    const booleanaSospechosa = inscripcion.columns.find(
      (c) => c.columnType === "PgBoolean" && /waiver|dispensa/i.test(c.name)
    );
    expect(booleanaSospechosa).toBeUndefined();
  });

  it("attendance_waiver_by apunta a user y sobrevive a la baja del autor", () => {
    const fk = inscripcion.foreignKeys.find((f) =>
      f.reference().columns.some((c) => c.name === "attendance_waiver_by")
    );
    expect(fk?.reference().foreignTable).toBe(schema.user);
    expect(fk?.onDelete).toBe("set null");
  });

  /** DV-004 — revocable, con el mismo trío que el certificado del ciclo 010. */
  it("es revocable con el patrón revoked_at / revoked_by / revoke_reason", () => {
    expect(columna(inscripcion, "attendance_waiver_revoked_at")?.columnType).toBe(
      "PgTimestamp"
    );
    expect(columna(inscripcion, "attendance_waiver_revoked_by")?.columnType).toBe(
      "PgText"
    );
    expect(columna(inscripcion, "attendance_waiver_revoke_reason")?.columnType).toBe(
      "PgText"
    );
  });

  it("nombra sus columnas como el certificado, no de otra manera", () => {
    const certificado = getTableConfig(schema.certificate);
    // El precedente que se está copiando existe y se llama así.
    for (const nombre of ["revoked_at", "revoked_by", "revoke_reason"]) {
      expect(columna(certificado, nombre)).toBeDefined();
    }
  });
});

/* ============================================================
 * Los guardas de la estructura — FR-003, FR-004
 * ============================================================ */

describe("validarPadreDeCohorte (FR-003, FR-004)", () => {
  const base = {
    cohorteId: "cohort_hija",
    padreId: null as string | null,
    padreExiste: false,
    padreYaEsModulo: false,
    cohorteYaTieneModulos: false,
  };

  it("sin padre no hay nada que validar: es el estado de las 41 cohortes de hoy", () => {
    expect(validarPadreDeCohorte(base)).toBeNull();
  });

  it("acepta colgar una cohorte simple de una camada sin padre", () => {
    expect(
      validarPadreDeCohorte({ ...base, padreId: "cohort_madre", padreExiste: true })
    ).toBeNull();
  });

  it("rechaza que una cohorte sea su propio padre (FR-004)", () => {
    const error = validarPadreDeCohorte({
      ...base,
      padreId: "cohort_hija",
      padreExiste: true,
    });
    expect(error?.code).toBe("cohorte_padre_de_si_misma");
  });

  it("rechaza un padre inexistente antes que cualquier otra cosa", () => {
    const error = validarPadreDeCohorte({ ...base, padreId: "cohort_fantasma" });
    expect(error?.code).toBe("padre_inexistente");
  });

  /** FR-003: si A.parent = B, entonces B.parent DEBE ser NULL. */
  it("rechaza colgar un módulo de otro módulo: no hay sub-módulos", () => {
    const error = validarPadreDeCohorte({
      ...base,
      padreId: "cohort_modulo",
      padreExiste: true,
      padreYaEsModulo: true,
    });
    expect(error?.code).toBe("anidamiento_de_dos_niveles");
  });

  /** La otra mitad de FR-003: la que ya es madre no puede volverse hija. */
  it("rechaza darle padre a una camada que YA tiene módulos", () => {
    const error = validarPadreDeCohorte({
      ...base,
      padreId: "cohort_madre",
      padreExiste: true,
      cohorteYaTieneModulos: true,
    });
    expect(error?.code).toBe("anidamiento_de_dos_niveles");
  });

  /**
   * FR-005 — el ciclo A→B→A queda impedido SIN regla adicional: para que A
   * apunte a B, B tiene que tener el padre en NULL, y entonces B no apunta
   * a A. Se fija con un test para que nadie "optimice" la regla anterior.
   */
  it("un ciclo A→B→A es inalcanzable con las dos mitades de FR-003", () => {
    // A→B se acepta: B no es módulo de nadie.
    expect(
      validarPadreDeCohorte({
        cohorteId: "A",
        padreId: "B",
        padreExiste: true,
        padreYaEsModulo: false,
        cohorteYaTieneModulos: false,
      })
    ).toBeNull();
    // Ahora B→A: A ya es módulo (tiene padre B) y B ya tiene módulos.
    const error = validarPadreDeCohorte({
      cohorteId: "B",
      padreId: "A",
      padreExiste: true,
      padreYaEsModulo: true,
      cohorteYaTieneModulos: true,
    });
    expect(error?.code).toBe("anidamiento_de_dos_niveles");
  });
});

/* ============================================================
 * Los guardas del recorrido — FR-009, FR-010
 * ============================================================ */

describe("validarVinculoDeInscripcion (FR-009, FR-010)", () => {
  const base = {
    inscripcionId: "enr_1",
    cohorteId: "cohort_simple",
    cohorteEsModulo: false,
    madreId: null as string | null,
    madreExiste: false,
    madreYaEsHija: false,
    inscripcionYaTieneHijas: false,
  };

  it("una inscripción simple a una cohorte simple pasa sin observaciones (FR-032)", () => {
    expect(validarVinculoDeInscripcion(base)).toBeNull();
  });

  it("un lead general (sin cohorte y sin madre) sigue siendo válido", () => {
    expect(
      validarVinculoDeInscripcion({ ...base, cohorteId: null })
    ).toBeNull();
  });

  it("acepta una hija contra una cohorte de módulo", () => {
    expect(
      validarVinculoDeInscripcion({
        ...base,
        cohorteId: "cohort_modulo",
        cohorteEsModulo: true,
        madreId: "enr_madre",
        madreExiste: true,
      })
    ).toBeNull();
  });

  it("rechaza que una inscripción sea su propia madre (FR-009)", () => {
    const error = validarVinculoDeInscripcion({
      ...base,
      cohorteEsModulo: true,
      madreId: "enr_1",
      madreExiste: true,
    });
    expect(error?.code).toBe("inscripcion_madre_de_si_misma");
  });

  it("rechaza una madre inexistente", () => {
    const error = validarVinculoDeInscripcion({ ...base, madreId: "enr_fantasma" });
    expect(error?.code).toBe("madre_inexistente");
  });

  it("rechaza colgar una hija de otra hija: un solo nivel (FR-009)", () => {
    const error = validarVinculoDeInscripcion({
      ...base,
      cohorteEsModulo: true,
      madreId: "enr_hija",
      madreExiste: true,
      madreYaEsHija: true,
    });
    expect(error?.code).toBe("anidamiento_de_dos_niveles");
  });

  it("rechaza darle madre a una inscripción que ya tiene hijas", () => {
    const error = validarVinculoDeInscripcion({
      ...base,
      cohorteEsModulo: true,
      madreId: "enr_madre",
      madreExiste: true,
      inscripcionYaTieneHijas: true,
    });
    expect(error?.code).toBe("anidamiento_de_dos_niveles");
  });

  /** FR-010, primera mitad: una hija cuelga de un MÓDULO, no de una cohorte suelta. */
  it("rechaza una hija contra una cohorte sin padre", () => {
    const error = validarVinculoDeInscripcion({
      ...base,
      madreId: "enr_madre",
      madreExiste: true,
      cohorteEsModulo: false,
    });
    expect(error?.code).toBe("hija_fuera_de_un_modulo");
  });

  /**
   * FR-010, segunda mitad: una cohorte hija NO admite inscripciones directas.
   * La inscripción se cuelga de la madre; si no, el módulo tendría alumnos
   * que no pertenecen a ningún recorrido y el paquete cerrado se rompe.
   */
  it("rechaza una inscripción directa contra una cohorte de módulo", () => {
    const error = validarVinculoDeInscripcion({
      ...base,
      cohorteId: "cohort_modulo",
      cohorteEsModulo: true,
      madreId: null,
    });
    expect(error?.code).toBe("modulo_sin_inscripcion_directa");
  });
});

/* ============================================================
 * La madre sin hijas — DV-005
 * ============================================================ */

describe("programApprovalState: la madre y sus hijas (DV-005, FR-016)", () => {
  /**
   * DV-005 — el default optimista de `approvalState([], null, null)` es
   * `aprobado`, y en la planilla de cohorte está bien. Aplicado a una madre
   * sin hijas sería afirmar que alguien aprobó una especialización de la que
   * todavía no se cargó un solo módulo. Es la misma trampa que en el legajo
   * (013) obligó a inventar `sin_datos`.
   */
  it("una madre SIN hijas está pendiente, jamás aprobado", () => {
    const r = programApprovalState([]);
    expect(r.state).toBe("pendiente");
    expect(r.reasons.join(" ")).toContain("módulo");
  });

  it("el default optimista de approvalState NO cambia (sin regresión)", () => {
    // La planilla de cohorte sigue leyendo lo mismo que hoy.
    expect(approvalState([], null, null).state).toBe("aprobado");
  });

  it("reprobado si alguna hija está reprobada", () => {
    expect(programApprovalState(["aprobado", "reprobado", "pendiente"]).state).toBe(
      "reprobado"
    );
  });

  it("pendiente si ninguna reprobó y alguna sigue pendiente (FR-017)", () => {
    expect(programApprovalState(["aprobado", "pendiente"]).state).toBe("pendiente");
  });

  it("aprobado sólo con TODAS las hijas aprobadas", () => {
    expect(programApprovalState(["aprobado", "aprobado"]).state).toBe("aprobado");
  });
});

/* ============================================================
 * Sin regresión — FR-032, FR-033
 * ============================================================ */

describe("sin regresión: 33 cohortes simples y 284 inscripciones (FR-032)", () => {
  /**
   * Toda columna nueva es NULLABLE y sin default: una fila existente la
   * satisface sin que la migración la toque. Si alguna naciera NOT NULL, la
   * migración tendría que inventar un valor para 41 cohortes y 384
   * inscripciones — y ese valor inventado ES la regresión.
   */
  it("ninguna columna nueva es NOT NULL ni trae default", () => {
    const nuevas = [
      ...["parent_cohort_id", "position"].map((n) => columna(cohorte, n)),
      ...[
        "parent_enrollment_id",
        "attendance_waiver_at",
        "attendance_waiver_by",
        "attendance_waiver_reason",
        "attendance_waiver_revoked_at",
        "attendance_waiver_revoked_by",
        "attendance_waiver_revoke_reason",
      ].map((n) => columna(inscripcion, n)),
    ];
    for (const col of nuevas) {
      expect(col).toBeDefined();
      expect(col?.notNull).toBe(false);
      expect(col?.hasDefault).toBe(false);
    }
  });

  it("los índices y CHECK que ya existían siguen en pie", () => {
    const nombres = new Set(inscripcion.indexes.map((i) => i.config.name));
    for (const n of [
      "enrollment_contact_cohort_uq",
      "enrollment_contact_general_uq",
      "enrollment_org_stage_idx",
      "enrollment_org_cohort_idx",
      "enrollment_seller_idx",
      "enrollment_company_idx",
      "enrollment_org_interest_course_idx",
    ]) {
      expect(nombres.has(n)).toBe(true);
    }
    const deCohorte = new Set(cohorte.indexes.map((i) => i.config.name));
    expect(deCohorte.has("cohort_org_course_idx")).toBe(true);
    expect(deCohorte.has("cohort_teacher_idx")).toBe(true);
  });

  /**
   * FR-033 — los caminos nuevos se encienden por un DATO presente, no por una
   * bandera. Con los dos punteros en NULL, ninguna guarda cambia de veredicto
   * respecto de lo que hoy no existe: devuelven `null`, o sea "seguí como
   * siempre".
   */
  it("con las dos auto-referencias en NULL, las guardas no opinan", () => {
    expect(
      validarPadreDeCohorte({
        cohorteId: "cohort_simple",
        padreId: null,
        padreExiste: false,
        padreYaEsModulo: false,
        cohorteYaTieneModulos: false,
      })
    ).toBeNull();
    expect(
      validarVinculoDeInscripcion({
        inscripcionId: "enr_simple",
        cohorteId: "cohort_simple",
        cohorteEsModulo: false,
        madreId: null,
        madreExiste: false,
        madreYaEsHija: false,
        inscripcionYaTieneHijas: false,
      })
    ).toBeNull();
  });

  /** La regla de aprobación de una cohorte simple no se movió un milímetro. */
  it("approvalState devuelve exactamente lo mismo que antes del ciclo 028", () => {
    expect(approvalState([true, true], 90, 75)).toEqual({
      state: "aprobado",
      reasons: [],
    });
    expect(approvalState([true, null], 90, 75).state).toBe("pendiente");
    expect(approvalState([true, false], 100, 75).state).toBe("reprobado");
    expect(approvalState([true, true], 50, 75).state).toBe("reprobado");
    expect(approvalState([false, null], 90, 75).state).toBe("reprobado");
    expect(approvalState([true, true], null, null).state).toBe("aprobado");
    expect(approvalState([], 80, 80).state).toBe("aprobado");
    expect(approvalState([true, true], null, 75).state).toBe("pendiente");
  });
});

/* ============================================================
 * La migración — FR-034, FR-035
 * ============================================================ */

describe("la migración 0037 (FR-034, FR-035)", () => {
  const DRIZZLE = path.join(process.cwd(), "drizzle");
  const archivo = readdirSync(DRIZZLE).find((f) => f.startsWith("0037_"));
  const sql = archivo ? readFileSync(path.join(DRIZZLE, archivo), "utf8") : "";

  it("existe", () => {
    expect(archivo).toBeDefined();
  });

  /** FR-035 (constitución IV) — correrla dos veces no puede fallar. */
  it("es re-ejecutable: cada columna con `if not exists`", () => {
    const columnas = [
      "parent_cohort_id",
      "position",
      "parent_enrollment_id",
      "attendance_waiver_at",
      "attendance_waiver_by",
      "attendance_waiver_reason",
      "attendance_waiver_revoked_at",
      "attendance_waiver_revoked_by",
      "attendance_waiver_revoke_reason",
    ];
    for (const c of columnas) {
      expect(sql).toMatch(new RegExp(`add column if not exists "${c}"`, "i"));
    }
    expect(sql).toMatch(/create index if not exists/i);
  });

  it("agrega los CHECK sólo si faltan", () => {
    expect(sql).toMatch(/pg_constraint/i);
    expect(sql).toContain("cohort_padre_distinto_de_si");
    expect(sql).toContain("enrollment_madre_distinta_de_si");
  });

  /**
   * FR-034 — la regla que todo el mundo olvida: `db:generate` NO emite las
   * políticas RLS. Acá no hay tabla nueva, así que no hay nada que escribir,
   * pero la migración tiene que DECIRLO: el próximo que copie este archivo
   * para agregar una tabla tiene que tropezarse con la regla.
   */
  it("declara por escrito que no crea tablas y por qué eso exime del RLS", () => {
    expect(sql).toMatch(/row level security/i);
    expect(sql).toMatch(/tenant_isolation/i);
    expect(sql).toMatch(/rls-cobertura/i);
  });

  it("no crea ninguna tabla", () => {
    expect(sql).not.toMatch(/create table/i);
  });
});
