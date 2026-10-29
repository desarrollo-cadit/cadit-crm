import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  datosDeEmpresaVacios,
  planDeUnificacionDeEmpresas,
  type EmpresaAUnificar,
} from "@/lib/company-merge";

/**
 * 2026-10-29 — Unificar empresas: las ESCRITURAS.
 *
 * Todo lo que apunta a la absorbida se mueve ANTES de borrarla: `enrollment`
 * es `restrict` (el borrado fallaría) y el resto es `set null` (quedaría
 * huérfano sin avisar). Con un bloqueo, LANZA sin escribir nada.
 */

type Op = { kind: "update" | "delete"; table: string; set?: Record<string, unknown> };
const ops: Op[] = [];

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    update: (table: unknown) => ({
      set: (set: Record<string, unknown>) => ({
        where: async () => {
          ops.push({ kind: "update", table: String(table), set });
          return [];
        },
      }),
    }),
    delete: (table: unknown) => ({
      where: async () => {
        ops.push({ kind: "delete", table: String(table) });
        return [];
      },
    }),
  }),
  schema: new Proxy(
    {},
    {
      get: (_t, tableName) =>
        new Proxy(
          {},
          {
            get: (_t2, col) => {
              if (col === "toString" || col === Symbol.toPrimitive) return () => String(tableName);
              if (typeof col === "symbol") return undefined;
              return `${String(tableName)}.${col}`;
            },
          }
        ),
    }
  ),
}));

beforeEach(() => {
  ops.length = 0;
});

const base: EmpresaAUnificar = {
  id: "cia_x",
  legalName: "X",
  tradeName: null,
  taxId: null,
  addressStreet: null,
  addressCity: null,
  addressState: null,
  addressCountry: null,
  billingContactName: null,
  billingEmail: null,
  billingPhone: null,
  paymentTerms: null,
  paymentTermDays: null,
  notes: null,
  excludeFromReports: false,
};
const queda: EmpresaAUnificar = { ...base, id: "cia_queda", legalName: "Del Sur S.A.", taxId: "212345670018" };
const dup: EmpresaAUnificar = {
  ...base,
  id: "cia_dup",
  legalName: "Del Sur",
  paymentTerms: "credito",
  paymentTermDays: 30,
};

const indice = (pred: (o: Op) => boolean) => {
  const i = ops.findIndex(pred);
  expect(i, "falta una escritura esperada").toBeGreaterThanOrEqual(0);
  return i;
};

describe("aplicarUnificacionDeEmpresas — el orden de las escrituras", () => {
  it("mueve todas las referencias, completa la que queda y RECIÉN AHÍ borra la absorbida", async () => {
    const { aplicarUnificacionDeEmpresas } = await import("@/server/company-merge");
    const plan = planDeUnificacionDeEmpresas(queda, dup, {
      ...datosDeEmpresaVacios(),
      filtros: [{ tabla: "marketing_audience", id: "aud_1", filters: { v: 1, companyIds: ["cia_dup"] } }],
    });
    expect(plan.bloqueos).toEqual([]);
    await aplicarUnificacionDeEmpresas("org_1", plan);

    const borrar = indice((o) => o.kind === "delete" && o.table === "company");
    expect(borrar).toBe(ops.length - 1);
    expect(indice((o) => o.table === "contact" && o.set?.companyId === "cia_queda")).toBeLessThan(borrar);
    expect(indice((o) => o.table === "enrollment" && o.set?.companyId === "cia_queda")).toBeLessThan(borrar);
    expect(indice((o) => o.table === "offlineCourseGrant" && o.set?.viaCompanyId === "cia_queda")).toBeLessThan(
      borrar
    );
    expect(
      indice((o) => o.table === "historicalCourseTaking" && o.set?.companyId === "cia_queda")
    ).toBeLessThan(borrar);
    expect(
      indice(
        (o) =>
          o.table === "marketingAudience" &&
          JSON.stringify((o.set?.filters as { companyIds?: string[] })?.companyIds) === '["cia_queda"]'
      )
    ).toBeLessThan(borrar);

    const completar = indice((o) => o.kind === "update" && o.table === "company");
    // La condición de pago viaja de a par, en UNA sentencia (el CHECK se chequea por fila).
    expect(ops[completar]!.set).toMatchObject({ paymentTerms: "credito", paymentTermDays: 30 });
    expect(completar).toBeLessThan(borrar);
  });

  it("el historial solo cambia de empresa: su llave no la lleva, no se reclava", async () => {
    const { aplicarUnificacionDeEmpresas } = await import("@/server/company-merge");
    await aplicarUnificacionDeEmpresas("org_1", planDeUnificacionDeEmpresas(queda, dup, datosDeEmpresaVacios()));
    const h = ops.filter((o) => o.table === "historicalCourseTaking");
    expect(h).toHaveLength(1);
    expect(Object.keys(h[0]!.set!)).toEqual(["companyId"]);
  });

  it("con un bloqueo LANZA y no escribe nada", async () => {
    const { aplicarUnificacionDeEmpresas, UnificacionDeEmpresasBloqueada } = await import("@/server/company-merge");
    const plan = planDeUnificacionDeEmpresas(queda, { ...dup, taxId: "219999990011" }, datosDeEmpresaVacios());
    await expect(aplicarUnificacionDeEmpresas("org_1", plan)).rejects.toBeInstanceOf(UnificacionDeEmpresasBloqueada);
    expect(ops).toEqual([]);
  });
});

/**
 * Toda tabla con FK a `company.id` tiene que estar contemplada: la de
 * `restrict` haría fallar el borrado, y las de `set null` perderían su
 * empresa sin que nadie lo note.
 */
describe("ninguna tabla que apunta a company queda afuera", () => {
  const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8").replace(/\r\n/g, "\n");
  const schemaSrc = leer("src/lib/db/schema.ts");
  const servidor = leer("src/server/company-merge.ts");
  const bloques = schemaSrc.split(/\nexport const /).slice(1);
  const conEmpresa = bloques
    .filter((b) => /= pgTable\(/.test(b.split("\n")[0] ?? "") && /=>\s*company\.id/.test(b))
    .map((b) => /^(\w+)/.exec(b)![1]!);

  it("encuentra las tablas (sanidad del parser)", () => {
    expect(conEmpresa).toEqual(
      expect.arrayContaining(["contact", "enrollment", "offlineCourseGrant", "historicalCourseTaking"])
    );
  });

  it.each(conEmpresa)("%s se mueve en src/server/company-merge.ts", (tabla) => {
    expect(servidor).toContain(`schema.${tabla}`);
  });

  it("los filtros de marketing que nombran empresas (`companyIds`) también se reapuntan", () => {
    expect(leer("src/lib/marketing/audience.ts")).toContain("companyIds");
    expect(servidor).toContain("schema.marketingAudience");
    expect(servidor).toContain("schema.marketingCampaign");
  });

  it("la lectura bloquea las dos filas de empresa (`for update`)", () => {
    expect(servidor).toMatch(/\.for\("update"\)/);
  });
});
