import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 046 (T035; FR-010, FR-012, SC-003) — Guard estructural del recorrido
 * comercial: UNA definición de "cursó/aprobó", reusando las reglas que ya
 * existían, y ningún dato de plata en lo nuevo.
 */

const raiz = process.cwd();
const leer = (f: string) => readFileSync(path.join(raiz, f), "utf8");

function archivos(dir: string): string[] {
  return readdirSync(path.join(raiz, dir)).flatMap((n) => {
    const rel = `${dir}/${n}`;
    return statSync(path.join(raiz, rel)).isDirectory() ? archivos(rel) : /\.tsx?$/.test(n) ? [rel] : [];
  });
}

const DERIVACION = "src/lib/recorrido-comercial.ts";

const NUEVOS = [
  DERIVACION,
  "src/lib/rutas-de-cursos.ts",
  "src/lib/marketing/historial-filtros.ts",
  "src/lib/marketing/recompra.ts",
  "src/server/estado-de-cursada.ts",
  "src/server/recorrido-comercial.ts",
  "src/server/course-routes.ts",
  "src/server/marketing/recompra.ts",
  "src/app/api/contacts/[id]/recorrido-comercial/route.ts",
  "src/app/api/course-routes/route.ts",
  "src/app/api/courses/[id]/next-courses/route.ts",
  "src/app/api/marketing/recompra/route.ts",
  "src/components/contacts/recorrido-comercial-card.tsx",
  "src/components/academic/next-courses-dialog.tsx",
  "src/components/marketing/repurchase-view.tsx",
];

describe("una sola definición del historial comercial (FR-010)", () => {
  it("solo la derivación asigna estados comerciales", () => {
    const asigna = /estado:\s*"(aprobo|curso_sin_aprobar|en_curso|por_empezar)"/;
    const otros = archivos("src").filter((f) => f !== DERIVACION && asigna.test(leer(f)));
    expect(otros, `deciden estados por su cuenta: ${otros.join(", ")}`).toEqual([]);
  });

  it("la derivación compone la especialización con la regla del legajo", () => {
    expect(leer(DERIVACION)).toContain("programApprovalState(");
    expect(leer(DERIVACION)).toContain("computeCohortStatus(");
  });

  it("el loader reusa la regla de grupos no dictados y la aprobación del legajo", () => {
    const loader = leer("src/server/recorrido-comercial.ts");
    expect(loader).toContain("inscripcionesNoDictadas(");
    expect(loader).toContain("estadoDeAprobacionDeCursada(");
    expect(loader).toContain("historialesComerciales(");
  });

  it("el legajo usa la MISMA función de aprobación por cursada", () => {
    const legajo = leer("src/server/student-record.ts");
    expect(legajo).toContain("estadoDeAprobacionDeCursada(");
    expect(legajo).not.toMatch(/\bestadoDeModulo\(/);
  });

  it("audiencias y Recompra leen los historiales de la derivación, no SQL propio", () => {
    expect(leer("src/server/marketing/audiences.ts")).toContain("historialesDeLaOrganizacion(");
    expect(leer("src/server/marketing/recompra.ts")).toContain("historialesDeLaOrganizacion(");
    expect(leer("src/lib/marketing/historial-filtros.ts")).toContain("esCursado(");
  });
});

describe("un dato que no se debe ver no viaja (FR-012)", () => {
  it.each(NUEVOS)("%s no lee cuotas, pagos ni montos", (f) => {
    const src = leer(f);
    expect(src).not.toMatch(/schema\.(installment|payment)\b/);
    expect(src).not.toMatch(/\.amount\b/);
  });
});

describe("cada ruta nueva pide su capacidad", () => {
  it.each([
    ["src/app/api/contacts/[id]/recorrido-comercial/route.ts", "GET", "contactos.ver"],
    ["src/app/api/course-routes/route.ts", "GET", "academico.ver"],
    ["src/app/api/courses/[id]/next-courses/route.ts", "PUT", "academico.editar"],
    ["src/app/api/marketing/recompra/route.ts", "GET", "marketing.ver"],
  ])("%s %s → %s", (f, metodo, cap) => {
    expect(leer(f)).toMatch(new RegExp(`export const ${metodo} = requireCapability\\(\\s*"${cap.replace(".", "\\.")}"`));
  });
});

describe("046 US6 — el importador del historial", () => {
  const RUTAS = [
    ["src/app/api/historial/importaciones/route.ts", "GET"],
    ["src/app/api/historial/importaciones/route.ts", "POST"],
    ["src/app/api/historial/importaciones/analizar/route.ts", "POST"],
    ["src/app/api/historial/importaciones/vista-previa/route.ts", "POST"],
    ["src/app/api/historial/importaciones/[id]/route.ts", "DELETE"],
    ["src/app/api/historial/importaciones/[id]/aplicar/route.ts", "POST"],
  ] as const;

  it.each(RUTAS)("%s %s pide `historial.importar`", (f, metodo) => {
    expect(leer(f)).toMatch(new RegExp(`export const ${metodo} = requireCapability\\(\\s*"historial\\.importar"`));
  });

  it.each([
    "src/server/historial-import.ts",
    "src/lib/historial-import/plan.ts",
    "src/lib/historial-import/planilla.ts",
    "src/components/settings/historial-import-client.tsx",
  ])("%s no lee plata", (f) => {
    expect(leer(f)).not.toMatch(/schema\.(installment|payment)\b/);
    expect(leer(f)).not.toMatch(/\.amount\b/);
  });

  it("el DTO de una importación no lleva las filas pendientes (datos personales)", () => {
    const src = leer("src/server/historial-import.ts");
    const aDto = src.slice(src.indexOf("function aDto("), src.indexOf("async function leerImportacion("));
    expect(aDto).not.toContain("pendingRows");
  });

  it("en tests/fixtures solo está la planilla inventada", () => {
    const csvs = readdirSync(path.join(raiz, "tests", "fixtures")).filter((n) => n.endsWith(".csv"));
    expect(csvs).toEqual(["historial-planilla.csv"]);
    expect(leer("tests/fixtures/historial-planilla.csv")).toMatch(/@ejemplo\.test/);
  });
});

describe("046 US8 — reportes", () => {
  it("la ruta pide `reportes.ver` y los ingresos dependen de `cobranza.ver`", () => {
    const src = leer("src/app/api/dashboard/reportes/route.ts");
    expect(src).toMatch(/export const GET = requireCapability\(\s*"reportes\.ver"/);
    expect(src).toContain('conIngresos: sessionCapabilities(session).includes("cobranza.ver")');
  });

  it("el servidor solo lee pagos dentro de `if (opts.conIngresos)`", () => {
    const src = leer("src/server/reportes.ts");
    const antes = src.slice(0, src.indexOf("if (opts.conIngresos)"));
    expect(antes).not.toContain("schema.payment");
  });

  it("los reportes salen de la derivación única", () => {
    expect(leer("src/server/reportes.ts")).toContain("historialesDeLaOrganizacion(");
    expect(leer("src/lib/reportes.ts")).toContain("metricasDeRecompra(");
  });

  it("el inicio muestra la sección solo con `reportes.ver`", () => {
    expect(leer("src/app/(app)/page.tsx")).toContain('includes("reportes.ver")');
  });
});
