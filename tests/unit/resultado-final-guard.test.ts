import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 0086 — Guarda estructural de la regla del dueño (2026-10-23): ninguna
 * aprobación es automática.
 *
 * El cálculo (`approvalState` y sus variantes) es una SUGERENCIA. Todo lo que
 * le AFIRMA a alguien "aprobado / reprobado" —certificado, verificación,
 * escolaridad, legajo, portal, recorrido, reportes, constancia— tiene que
 * leer el resultado final confirmado. Este test falla si aparece un nuevo
 * llamador del cálculo sin decidir de qué lado está, o si un consumidor deja
 * de leer lo confirmado.
 */

const SRC = path.join(process.cwd(), "src");

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? archivos(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

const rel = (p: string) => path.relative(process.cwd(), p).replace(/\\/g, "/");
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const leer = (r: string) => readFileSync(path.join(process.cwd(), r), "utf8");

/** Quién puede llamar al cálculo, y por qué. */
const LLAMADORES_PERMITIDOS: Record<string, string> = {
  "src/lib/approval.ts": "la regla misma",
  "src/lib/resultado-final.ts": "programaConfirmado: la regla de programa sobre lo CONFIRMADO",
  "src/server/grading.ts": "la planilla del staff: SUGERENCIA rotulada como tal",
  "src/server/estado-de-cursada.ts": "sugerencia → afirmadoConSugerencia (legajo y recorrido)",
  "src/lib/escolaridad.ts": "solo decide `sin_datos`; el estado es el confirmado",
  "src/server/student-portal.ts": "solo decide `sin_datos`; la madre compone estados ya afirmados",
  "src/server/student-record.ts": "la madre compone estados ya afirmados",
  "src/server/program-staff.ts": "sugerencia → afirmadoConSugerencia",
  "src/server/module-roster.ts": "sugerencia → afirmadoConSugerencia",
  "src/lib/recorrido-comercial.ts": "la madre compone estados ya afirmados",
};

const LLAMADA = /\b(approvalState|moduleApprovalState|estadoDeModulo|programApprovalState)\(/;

describe("0086 — el cálculo de aprobación es una sugerencia", () => {
  it("solo los llamadores declarados usan el cálculo", () => {
    const llamadores = archivos(SRC)
      .filter((p) => LLAMADA.test(sinComentarios(readFileSync(p, "utf8"))))
      .map(rel)
      .sort();
    expect(llamadores.filter((p) => !(p in LLAMADORES_PERMITIDOS))).toEqual([]);
  });

  it("cada llamador que afirma algo lee el resultado confirmado", () => {
    for (const p of Object.keys(LLAMADORES_PERMITIDOS)) {
      if (p === "src/lib/approval.ts" || p === "src/lib/resultado-final.ts") continue;
      const src = leer(p);
      const leeConfirmado =
        src.includes("@/lib/resultado-final") ||
        src.includes("@/server/resultados-confirmados") ||
        // recorrido-comercial (lib) recibe `aprobacion` ya afirmada desde el servidor.
        p === "src/lib/recorrido-comercial.ts";
      expect({ p, leeConfirmado }).toEqual({ p, leeConfirmado: true });
    }
  });
});

describe("2026-10-29 — solo un grupo COMPLETO tiene resultado", () => {
  it("la regla vive en UN lugar: `grupoCompleto` de src/lib/resultado-final.ts", () => {
    const definiciones = archivos(SRC)
      .filter((p) => /export function grupoCompleto\(/.test(readFileSync(p, "utf8")))
      .map(rel);
    expect(definiciones).toEqual(["src/lib/resultado-final.ts"]);
  });

  it.each([
    "src/server/grading.ts",
    "src/server/resultados-confirmados.ts",
    "src/server/estado-de-cursada.ts",
    "src/server/student-portal.ts",
    "src/server/transcript.ts",
    "src/server/recorrido-comercial.ts",
    "src/server/company-report.ts",
    "src/lib/constancia-empresa.ts",
    "src/lib/resultado-de-cursada.ts",
    "src/lib/tareas-del-dia.ts",
    "src/server/tareas-del-dia.ts",
  ])("%s decide con el grupo completo", (p) => {
    expect(leer(p)).toMatch(/grupoCompleto|grupoSinResultado|gruposSinResultado|\bcompleto\b/);
  });

  it("confirmar y emitir responden 422 grupo_incompleto", () => {
    expect(leer("src/lib/resultado-final.ts")).toContain(`code: "grupo_incompleto"`);
    expect(leer("src/server/certificates.ts")).toContain(`code: "grupo_incompleto"`);
  });

  it("la emisión histórica ya no tiene excepción en la visibilidad", () => {
    expect(sinComentarios(leer("src/lib/resultado-final.ts"))).not.toMatch(/historical/);
  });
});

describe("0086 — los consumidores que AFIRMAN leen lo confirmado", () => {
  const CONSUMIDORES = [
    "src/server/certificates.ts",
    "src/server/certificate-pdf.ts",
    "src/server/transcript.ts",
    "src/server/student-portal.ts",
    "src/server/student-record.ts",
    "src/server/company-report.ts",
    "src/server/constancia-empresa.ts",
    "src/server/program-staff.ts",
    "src/server/module-roster.ts",
  ];

  it.each(CONSUMIDORES)("%s lee el resultado final confirmado", (p) => {
    expect(leer(p)).toMatch(/@\/server\/resultados-confirmados/);
  });

  it("el recorrido comercial (y con él reportes y audiencias) lee enrollment_final_result", () => {
    expect(leer("src/server/recorrido-comercial.ts")).toContain("schema.enrollmentFinalResult");
  });

  it("la emisión no decide con la sugerencia de la planilla", () => {
    const src = sinComentarios(leer("src/server/certificates.ts"));
    expect(src).not.toMatch(/student\.state\s*!==\s*"aprobado"/);
    expect(src).not.toMatch(/programa\.state\s*!==\s*"aprobado"/);
    expect(src).toContain("student.finalResult");
  });

  it("la constancia y el reporte por empresa ya no pasan «sin resultado» fijo", () => {
    expect(sinComentarios(leer("src/server/constancia-empresa.ts"))).not.toMatch(/resultadoConfirmado:\s*null/);
    expect(sinComentarios(leer("src/server/company-report.ts"))).not.toMatch(/resultadoConfirmado:\s*null/);
  });

  it("la migración 0086 no hace backfill: todo grupo vuelve a pendiente de confirmación", () => {
    const sql = sinComentarios(leer("drizzle/0086_resultado_final.sql")).replace(/--.*$/gm, "");
    expect(sql).not.toMatch(/insert\s+into\s+"?enrollment_final_result/i);
    expect(sql).toContain("tenant_isolation");
  });
});
