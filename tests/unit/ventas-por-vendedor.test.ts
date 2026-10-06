import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolverPeriodo } from "@/server/finanzas-periodo";

/**
 * 2026-10-06 — Ventas por vendedor, para pagar comisiones.
 *
 * Las reglas que el reporte NO puede romper:
 *
 * - **Nunca se suman monedas.** Un total por moneda, en el orden fijo de
 *   `CURRENCIES`, y ningún total general.
 * - **Sólo la madre cuenta.** La especialización se vende una vez; sus hijas
 *   (módulos) no llevan el monto del paquete, y contarlas duplica la venta.
 * - **Sólo lo que tiene cohorte es una venta.** El lead de interés no.
 * - **"Sin vendedor" es un grupo propio**, para que administración lo corrija.
 * - **El período se corta en la zona de la academia**: una venta de las 23:30
 *   del 31 de agosto en Montevideo es de agosto, aunque en UTC sea septiembre.
 * - El alumno dado de baja SIGUE: la venta ocurrió. Va marcado.
 */

const TZ = "America/Montevideo";
const AGOSTO = resolverPeriodo("2026-08", TZ, new Date("2026-10-06T12:00:00Z"));

type Fila = Parameters<typeof import("@/server/ventas-por-vendedor").armarVentasPorVendedor>[0][number];

const ana = { id: "sel_ana", name: "Ana", archived: false };
const bruno = { id: "sel_bruno", name: "Bruno", archived: true };

function venta(over: Partial<Fila> = {}): Fila {
  return {
    enrollmentId: "enr_1",
    cohortId: "coh_1",
    parentEnrollmentId: null,
    fecha: new Date("2026-08-10T15:00:00Z"),
    importe: 1000,
    currency: "UYU",
    alumno: "Lucía Gómez",
    alumnoDeBaja: false,
    cohorte: "Revit 08/26",
    curso: "Revit",
    vendedor: ana,
    ...over,
  };
}

describe("armarVentasPorVendedor", () => {
  it("agrupa por vendedor y totaliza POR MONEDA, sin total general", async () => {
    const { armarVentasPorVendedor } = await import("@/server/ventas-por-vendedor");
    const r = armarVentasPorVendedor(
      [
        venta({ enrollmentId: "enr_1", importe: 1000, currency: "UYU" }),
        venta({ enrollmentId: "enr_2", importe: 500, currency: "UYU" }),
        venta({ enrollmentId: "enr_3", importe: 300, currency: "USD" }),
      ],
      AGOSTO
    );
    expect(r.grupos).toHaveLength(1);
    const g = r.grupos[0]!;
    expect(g.vendedor).toEqual(ana);
    expect(g.totales).toEqual([
      { currency: "UYU", total: 1500, ventas: 2 },
      { currency: "USD", total: 300, ventas: 1 },
    ]);
    expect(JSON.stringify(r)).not.toMatch(/totalGeneral|granTotal/);
    expect("total" in g).toBe(false);
  });

  it("las hijas de una especialización NO cuentan: sólo la madre", async () => {
    const { armarVentasPorVendedor } = await import("@/server/ventas-por-vendedor");
    const r = armarVentasPorVendedor(
      [
        venta({ enrollmentId: "enr_madre", importe: 9000 }),
        venta({ enrollmentId: "enr_hija", parentEnrollmentId: "enr_madre", importe: 0 }),
      ],
      AGOSTO
    );
    expect(r.grupos[0]!.filas.map((f) => f.enrollmentId)).toEqual(["enr_madre"]);
    expect(r.grupos[0]!.totales).toEqual([{ currency: "UYU", total: 9000, ventas: 1 }]);
  });

  it("un lead sin cohorte no es una venta", async () => {
    const { armarVentasPorVendedor } = await import("@/server/ventas-por-vendedor");
    const r = armarVentasPorVendedor([venta({ cohortId: null })], AGOSTO);
    expect(r.grupos).toEqual([]);
  });

  it("«Sin vendedor» es un grupo propio y va al final", async () => {
    const { armarVentasPorVendedor } = await import("@/server/ventas-por-vendedor");
    const r = armarVentasPorVendedor(
      [
        venta({ enrollmentId: "enr_1", vendedor: null }),
        venta({ enrollmentId: "enr_2", vendedor: bruno }),
        venta({ enrollmentId: "enr_3", vendedor: ana }),
      ],
      AGOSTO
    );
    expect(r.grupos.map((g) => g.vendedor?.name ?? null)).toEqual(["Ana", "Bruno", null]);
    expect(r.sinVendedor).toBe(1);
  });

  it("un vendedor archivado sigue en el reporte con sus ventas", async () => {
    const { armarVentasPorVendedor } = await import("@/server/ventas-por-vendedor");
    const r = armarVentasPorVendedor([venta({ vendedor: bruno })], AGOSTO);
    expect(r.grupos[0]!.vendedor).toEqual(bruno);
  });

  it("el alumno dado de baja sigue, marcado: la venta ocurrió", async () => {
    const { armarVentasPorVendedor } = await import("@/server/ventas-por-vendedor");
    const r = armarVentasPorVendedor([venta({ alumnoDeBaja: true })], AGOSTO);
    expect(r.grupos[0]!.filas[0]!.alumnoDeBaja).toBe(true);
    expect(r.grupos[0]!.totales[0]!.ventas).toBe(1);
  });

  it("una venta sin monto se lista pero no inventa un importe", async () => {
    const { armarVentasPorVendedor } = await import("@/server/ventas-por-vendedor");
    const r = armarVentasPorVendedor(
      [venta({ enrollmentId: "enr_1", importe: null }), venta({ enrollmentId: "enr_2" })],
      AGOSTO
    );
    const g = r.grupos[0]!;
    expect(g.filas).toHaveLength(2);
    expect(g.sinMonto).toBe(1);
    expect(g.totales).toEqual([{ currency: "UYU", total: 1000, ventas: 2 }]);
  });

  it("límites del período en hora de Montevideo", async () => {
    const { armarVentasPorVendedor } = await import("@/server/ventas-por-vendedor");
    const r = armarVentasPorVendedor(
      [
        // 31/08 23:30 en Montevideo = 01/09 02:30 UTC → AGOSTO.
        venta({ enrollmentId: "enr_ultima_noche", fecha: new Date("2026-09-01T02:30:00Z") }),
        // 01/09 00:30 en Montevideo = 01/09 03:30 UTC → septiembre, fuera.
        venta({ enrollmentId: "enr_septiembre", fecha: new Date("2026-09-01T03:30:00Z") }),
        // 31/07 23:00 en Montevideo = 01/08 02:00 UTC → julio, fuera.
        venta({ enrollmentId: "enr_julio", fecha: new Date("2026-08-01T02:00:00Z") }),
        // 01/08 00:00 en Montevideo = 01/08 03:00 UTC → agosto (inicio inclusivo).
        venta({ enrollmentId: "enr_primera_hora", fecha: new Date("2026-08-01T03:00:00Z") }),
      ],
      AGOSTO
    );
    expect(r.grupos[0]!.filas.map((f) => f.enrollmentId)).toEqual([
      "enr_primera_hora",
      "enr_ultima_noche",
    ]);
  });

  it("orden estable: fecha y, a igual fecha, id", async () => {
    const { armarVentasPorVendedor } = await import("@/server/ventas-por-vendedor");
    const mismo = new Date("2026-08-10T15:00:00Z");
    const r = armarVentasPorVendedor(
      [
        venta({ enrollmentId: "enr_b", fecha: mismo }),
        venta({ enrollmentId: "enr_a", fecha: mismo }),
        venta({ enrollmentId: "enr_0", fecha: new Date("2026-08-02T15:00:00Z") }),
      ],
      AGOSTO
    );
    expect(r.grupos[0]!.filas.map((f) => f.enrollmentId)).toEqual(["enr_0", "enr_a", "enr_b"]);
  });

  it("cada fila trae la cohorte para enlazar al roster", async () => {
    const { armarVentasPorVendedor } = await import("@/server/ventas-por-vendedor");
    const r = armarVentasPorVendedor([venta()], AGOSTO);
    expect(r.grupos[0]!.filas[0]!.cohortId).toBe("coh_1");
  });
});

/* ============================================================
 * La ruta: el monto es dato financiero
 * ============================================================ */

const selectQueue: unknown[][] = [];

function thenableChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "innerJoin", "leftJoin", "where", "groupBy", "orderBy", "limit"]) {
    chain[m] = () => chain;
  }
  (chain as { then: unknown }).then = (resolve: (v: unknown) => void) =>
    Promise.resolve(rows).then(resolve);
  return chain;
}

vi.mock("@/lib/db", () => ({
  getRootDb: () => ({
    transaction: async (fn: (tx: unknown) => unknown) => fn({ execute: async () => [] }),
  }),
  getDb: () => ({
    select: () => thenableChain(selectQueue.shift() ?? []),
  }),
  schema: new Proxy(
    {},
    {
      get: (_t, tableName) =>
        new Proxy({}, { get: (_t2, col) => `${String(tableName)}.${String(col)}` }),
    }
  ),
}));

function sesion(role: string, capabilities?: string[]) {
  vi.doMock("@/lib/auth/session", () => {
    class UnauthorizedError extends Error {}
    return {
      UnauthorizedError,
      requireSession: vi.fn().mockResolvedValue({
        userId: "usr_1",
        organizationId: "org_1",
        role,
        ...(capabilities ? { capabilities } : {}),
      }),
    };
  });
}

describe("GET /api/finanzas/ventas", () => {
  beforeEach(() => {
    selectQueue.length = 0;
    vi.resetModules();
  });

  it("sin `cobranza.ver` → 403 sin tocar la base", async () => {
    sesion("soporte");
    const { GET } = await import("@/app/api/finanzas/ventas/route");
    const res = await GET(new Request("http://localhost/api/finanzas/ventas?mes=2026-08"));
    expect(res.status).toBe(403);
    expect(selectQueue).toHaveLength(0);
  });

  it("administración (cobranza.ver) entra y recibe el período resuelto", async () => {
    sesion("administracion", ["cobranza.ver", "inscripciones.ver", "academico.ver", "contactos.ver"]);
    selectQueue.push([{ timezone: TZ }], []);
    const { GET } = await import("@/app/api/finanzas/ventas/route");
    const res = await GET(new Request("http://localhost/api/finanzas/ventas?mes=2026-08"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { periodo: { mes: string }; grupos: unknown[] };
    expect(body.periodo.mes).toBe("2026-08");
    expect(body.grupos).toEqual([]);
  });

  it("un período mal escrito → 422", async () => {
    sesion("direccion", ["cobranza.ver"]);
    const { GET } = await import("@/app/api/finanzas/ventas/route");
    const res = await GET(new Request("http://localhost/api/finanzas/ventas?mes=agosto"));
    expect(res.status).toBe(422);
  });
});
