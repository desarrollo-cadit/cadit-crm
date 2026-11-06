import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CAPABILITIES,
  FINANCIAL_CAPABILITIES,
  ROLE_CAPABILITIES,
  SYSTEM_ROLES,
  hasCapability,
} from "@/lib/capabilities";
import {
  agruparPorEmpresa,
  facturaComun,
  avisoDeFacturaRepetida,
  condicionDePago,
  enLaVista,
  estaFacturada,
  facturacionCsv,
  filtrarFacturacion,
  normalizarNumero,
  pendienteDeFacturar,
  resumenDeCobro,
  totalesPorMoneda,
  type FilaFacturacion,
  type FiltrosFacturacion,
} from "@/lib/facturacion";
import { sinFacturar, type InscripcionParaFacturar } from "@/lib/staff-notices";

/**
 * 042 — Facturación: Administración registra el número de factura sin poder
 * tocar la plata, y una pantalla le muestra qué ventas faltan facturar.
 */

const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

/* ============================================================
 * La capacidad
 * ============================================================ */

describe("042 — `facturacion.editar`", () => {
  const byKey = (k: string) => SYSTEM_ROLES.find((r) => r.key === k)!;

  it("está en la lista cerrada", () => {
    expect(CAPABILITIES).toContain("facturacion.editar");
  });

  it("la tienen dirección, coordinación y administración", () => {
    for (const key of ["direccion", "coordinacion", "administracion"]) {
      expect(byKey(key).capabilities, key).toContain("facturacion.editar");
    }
  });

  it("soporte y ventas NO la tienen (ni en la semilla ni en el respaldo)", () => {
    expect(byKey("soporte").capabilities).not.toContain("facturacion.editar");
    expect(byKey("ventas").capabilities).not.toContain("facturacion.editar");
    expect(ROLE_CAPABILITIES.soporte).not.toContain("facturacion.editar");
    expect(hasCapability("soporte", "facturacion.editar")).toBe(false);
  });

  it("en el respaldo por código: owner y member sí", () => {
    expect(hasCapability("owner", "facturacion.editar")).toBe(true);
    expect(hasCapability("member", "facturacion.editar")).toBe(true);
  });

  /**
   * El requisito es lo que NO abre: Administración sigue sin poder cambiar
   * montos ni pagos. La capacidad nueva no es financiera en el sentido de
   * FINANCIAL_CAPABILITIES (no cambia el texto del 403 de esas rutas).
   */
  it("administración sigue sin `inscripciones.editar` ni `cobranza.editar`", () => {
    expect(byKey("administracion").capabilities).not.toContain("inscripciones.editar");
    expect(byKey("administracion").capabilities).not.toContain("cobranza.editar");
    expect(FINANCIAL_CAPABILITIES).not.toContain("facturacion.editar");
  });
});

/* ============================================================
 * El número
 * ============================================================ */

describe("normalizarNumero", () => {
  it("recorta espacios", () => {
    expect(normalizarNumero("  A-0819  ")).toBe("A-0819");
  });

  it("vacío o solo espacios es borrar (una corrección)", () => {
    expect(normalizarNumero("")).toBeNull();
    expect(normalizarNumero("   ")).toBeNull();
    expect(normalizarNumero(null)).toBeNull();
  });

  it("estaFacturada mira el número recortado", () => {
    expect(estaFacturada("819")).toBe(true);
    expect(estaFacturada("  ")).toBe(false);
    expect(estaFacturada(null)).toBe(false);
  });
});

/* ============================================================
 * La regla compartida con los avisos de 039
 * ============================================================ */

const base: InscripcionParaFacturar = {
  enrollmentId: "en_1",
  nombre: "Ana",
  email: null,
  nationalId: null,
  invoiceNumber: null,
  amount: 100000,
  currency: "UYU",
  empresa: null,
  deBaja: false,
  esHija: false,
};

describe("042 — la pantalla y el correo de 039 no pueden discrepar", () => {
  const casos: InscripcionParaFacturar[] = [
    base,
    { ...base, enrollmentId: "en_2", invoiceNumber: "A-1" },
    { ...base, enrollmentId: "en_3", invoiceNumber: "   " },
    { ...base, enrollmentId: "en_4", deBaja: true },
    { ...base, enrollmentId: "en_5", esHija: true },
  ];

  it("`sinFacturar` (aviso T-7/T-2) es exactamente `pendienteDeFacturar`", () => {
    expect(sinFacturar(casos)).toEqual(casos.filter(pendienteDeFacturar));
  });

  it("para una venta, la pestaña Pendientes de la pantalla dice lo mismo que el correo", () => {
    for (const c of casos) {
      const venta = {
        cohortId: "coh_1",
        parentEnrollmentId: c.esHija ? "en_madre" : null,
        courseKind: "curso" as const,
        deBaja: c.deBaja,
        invoiceNumber: c.invoiceNumber,
      };
      expect(enLaVista(venta, "pendientes"), c.enrollmentId).toBe(sinFacturar([c]).length === 1);
    }
  });

  it("los dos lados importan la MISMA función (no una copia)", () => {
    expect(leer("src/lib/staff-notices.ts")).toMatch(/filter\(pendienteDeFacturar\)/);
    const servidor = leer("src/server/facturacion.ts");
    expect(servidor).toContain("enLaVista");
    expect(leer("src/lib/facturacion.ts")).toMatch(/pendienteDeFacturar\(/);
  });

  it("un lead, una hija o un taller nunca están en la vista", () => {
    const venta = { cohortId: "coh_1", parentEnrollmentId: null, courseKind: "curso" as const, deBaja: false, invoiceNumber: null };
    expect(enLaVista(venta, "pendientes")).toBe(true);
    expect(enLaVista({ ...venta, cohortId: null }, "pendientes")).toBe(false);
    expect(enLaVista({ ...venta, parentEnrollmentId: "en_m" }, "pendientes")).toBe(false);
    expect(enLaVista({ ...venta, courseKind: "taller" }, "pendientes")).toBe(false);
  });

  it("Facturadas: las ventas con número, nunca las pendientes", () => {
    const venta = { cohortId: "coh_1", parentEnrollmentId: null, courseKind: "curso" as const, deBaja: false, invoiceNumber: "F-1" };
    expect(enLaVista(venta, "facturadas")).toBe(true);
    expect(enLaVista(venta, "pendientes")).toBe(false);
    expect(enLaVista({ ...venta, invoiceNumber: null }, "facturadas")).toBe(false);
    expect(enLaVista({ ...venta, deBaja: true }, "facturadas")).toBe(false);
  });
});

/* ============================================================
 * Filtros, totales y CSV
 * ============================================================ */

const fila = (over: Partial<FilaFacturacion>): FilaFacturacion => ({
  enrollmentId: "en_1",
  contactId: "ct_1",
  alumno: "Ana Pérez",
  cedula: null,
  celular: null,
  curso: "Revit",
  cohorte: "Octubre",
  cohortId: "coh_1",
  inicio: "2026-10-20",
  confirmada: true,
  vendedor: "Valeria",
  amount: 100000,
  currency: "UYU",
  invoiceNumber: null,
  invoiceRecordedAt: null,
  empresa: null,
  cobro: { cuotas: 0, cuotasPagadas: 0, cuotasVencidas: 0, pagado: 0, saldo: 100000, estado: "sin_plan" },
  venta: null,
  ...over,
});

const sinFiltros: FiltrosFacturacion = {
  cohortId: null,
  desde: null,
  hasta: null,
  soloConfirmadas: false,
  empresa: "todas",
};

describe("filtrarFacturacion", () => {
  const filas = [
    fila({ enrollmentId: "a", cohortId: "coh_1", inicio: "2026-10-20", confirmada: true }),
    fila({ enrollmentId: "b", cohortId: "coh_2", inicio: "2026-11-03", confirmada: false }),
    fila({
      enrollmentId: "c",
      cohortId: "coh_2",
      inicio: "2026-11-03",
      confirmada: false,
      empresa: { id: "cia_1", razonSocial: "ACME SA", rut: "21", billingEmail: null, condicion: null },
    }),
  ];

  it("sin filtros devuelve todo", () => {
    expect(filtrarFacturacion(filas, sinFiltros).map((f) => f.enrollmentId)).toEqual(["a", "b", "c"]);
  });

  it("por cohorte", () => {
    expect(filtrarFacturacion(filas, { ...sinFiltros, cohortId: "coh_2" }).map((f) => f.enrollmentId)).toEqual(["b", "c"]);
  });

  it("por rango de inicio (inclusive en los dos extremos)", () => {
    expect(filtrarFacturacion(filas, { ...sinFiltros, desde: "2026-10-20", hasta: "2026-10-20" }).map((f) => f.enrollmentId)).toEqual(["a"]);
    expect(filtrarFacturacion(filas, { ...sinFiltros, desde: "2026-10-21" }).map((f) => f.enrollmentId)).toEqual(["b", "c"]);
  });

  it("solo cohortes confirmadas", () => {
    expect(filtrarFacturacion(filas, { ...sinFiltros, soloConfirmadas: true }).map((f) => f.enrollmentId)).toEqual(["a"]);
  });

  it("con y sin empresa", () => {
    expect(filtrarFacturacion(filas, { ...sinFiltros, empresa: "con" }).map((f) => f.enrollmentId)).toEqual(["c"]);
    expect(filtrarFacturacion(filas, { ...sinFiltros, empresa: "sin" }).map((f) => f.enrollmentId)).toEqual(["a", "b"]);
  });

  it("ordena por inicio y después por alumno, siempre igual", () => {
    const desordenadas = [
      fila({ enrollmentId: "z", inicio: "2026-11-01", alumno: "Bruno" }),
      fila({ enrollmentId: "y", inicio: "2026-10-01", alumno: "Carla" }),
      fila({ enrollmentId: "x", inicio: "2026-11-01", alumno: "Ana" }),
    ];
    expect(filtrarFacturacion(desordenadas, sinFiltros).map((f) => f.enrollmentId)).toEqual(["y", "x", "z"]);
  });
});

describe("totalesPorMoneda — nunca se suman monedas distintas", () => {
  it("un total por moneda, en orden fijo, y las filas sin monto aparte", () => {
    const t = totalesPorMoneda([
      fila({ amount: 100000, currency: "UYU" }),
      fila({ amount: 25000, currency: "USD" }),
      fila({ amount: 50000, currency: "UYU" }),
      fila({ amount: null, currency: "UYU" }),
    ]);
    expect(t.totales).toEqual([
      { currency: "UYU", total: 150000, cantidad: 2 },
      { currency: "USD", total: 25000, cantidad: 1 },
    ]);
    expect(t.sinMonto).toBe(1);
  });

  it("vacío → sin totales", () => {
    expect(totalesPorMoneda([])).toEqual({ totales: [], sinMonto: 0 });
  });
});

describe("condicionDePago", () => {
  it("contado, crédito con días, crédito a secas, nada", () => {
    expect(condicionDePago("contado", null)).toBe("Contado");
    expect(condicionDePago("credito", 30)).toBe("Crédito a 30 días");
    expect(condicionDePago("credito", null)).toBe("Crédito");
    expect(condicionDePago(null, null)).toBeNull();
  });
});

describe("avisoDeFacturaRepetida — avisa, no bloquea", () => {
  const propia = { contactId: "ct_1", companyId: null };

  it("sin otras inscripciones con ese número → nada", () => {
    expect(avisoDeFacturaRepetida(propia, [])).toBeNull();
  });

  it("otra persona con el mismo número → aviso que la nombra", () => {
    const aviso = avisoDeFacturaRepetida(propia, [{ contactId: "ct_2", companyId: null, alumno: "Bruno Gómez" }]);
    expect(aviso).toMatch(/Bruno Gómez/);
  });

  it("la misma persona (otra cursada en la misma factura) → nada", () => {
    expect(avisoDeFacturaRepetida(propia, [{ contactId: "ct_1", companyId: null, alumno: "Ana" }])).toBeNull();
  });

  it("una factura de empresa que cubre a varios empleados → nada", () => {
    expect(
      avisoDeFacturaRepetida({ contactId: "ct_1", companyId: "cia_1" }, [
        { contactId: "ct_2", companyId: "cia_1", alumno: "Bruno" },
      ])
    ).toBeNull();
  });

  it("empresas distintas con el mismo número → aviso", () => {
    expect(
      avisoDeFacturaRepetida({ contactId: "ct_1", companyId: "cia_1" }, [
        { contactId: "ct_2", companyId: "cia_2", alumno: "Bruno" },
      ])
    ).not.toBeNull();
  });
});

describe("agruparPorEmpresa", () => {
  const acme = { id: "cia_1", razonSocial: "ACME", rut: "21", billingEmail: null, condicion: null };
  const otra = { id: "cia_2", razonSocial: "Otra", rut: null, billingEmail: null, condicion: null };

  it("junta a los alumnos de la misma empresa y el mismo grupo, donde aparece el primero", () => {
    const bloques = agruparPorEmpresa([
      fila({ enrollmentId: "a", empresa: acme }),
      fila({ enrollmentId: "b", empresa: null }),
      fila({ enrollmentId: "c", empresa: acme }),
    ]);
    expect(bloques.map((b) => b.tipo)).toEqual(["empresa", "fila"]);
    const bloque = bloques[0]!;
    expect(bloque.tipo === "empresa" && bloque.filas.map((f) => f.enrollmentId)).toEqual(["a", "c"]);
  });

  it("la misma empresa en otro grupo no se junta; una empresa con un solo alumno queda suelta", () => {
    const bloques = agruparPorEmpresa([
      fila({ enrollmentId: "a", cohortId: "coh_1", empresa: acme }),
      fila({ enrollmentId: "b", cohortId: "coh_2", empresa: acme }),
      fila({ enrollmentId: "c", cohortId: "coh_1", empresa: otra }),
    ]);
    expect(bloques.every((b) => b.tipo === "fila")).toBe(true);
  });

  it("facturaComun: el número compartido, o null si difieren o no hay", () => {
    expect(facturaComun([fila({ invoiceNumber: "A-1" }), fila({ invoiceNumber: "A-1" })])).toBe("A-1");
    expect(facturaComun([fila({ invoiceNumber: "A-1" }), fila({ invoiceNumber: null })])).toBeNull();
    expect(facturaComun([fila({ invoiceNumber: null })])).toBeNull();
  });
});

describe("resumenDeCobro", () => {
  const ahora = new Date("2026-11-10T12:00:00Z");
  const cuota = (id: string, amount: number, dueDate: string, canceledAt: Date | null = null) => ({
    id,
    amount,
    dueDate: new Date(dueDate),
    canceledAt,
  });
  const pago = (amount: number, installmentId: string | null = null, voidedAt: Date | null = null) => ({
    installmentId,
    amount,
    voidedAt,
  });

  it("sin plan ni pagos: sin_plan y el saldo es todo lo pactado", () => {
    expect(resumenDeCobro({ pactado: 90000, cuotas: [], pagos: [] }, ahora)).toEqual({
      cuotas: 0,
      cuotasPagadas: 0,
      cuotasVencidas: 0,
      pagado: 0,
      saldo: 90000,
      estado: "sin_plan",
    });
  });

  it("una seña sin cuota baja el saldo aunque no haya plan", () => {
    const r = resumenDeCobro({ pactado: 90000, cuotas: [], pagos: [pago(30000)] }, ahora);
    expect(r.pagado).toBe(30000);
    expect(r.saldo).toBe(60000);
    expect(r.estado).toBe("sin_plan");
  });

  it("plan al día: cuotas pagadas y vencimientos futuros", () => {
    const r = resumenDeCobro(
      {
        pactado: 90000,
        cuotas: [cuota("c1", 45000, "2026-11-01"), cuota("c2", 45000, "2026-12-01")],
        pagos: [pago(45000, "c1")],
      },
      ahora
    );
    expect(r).toMatchObject({ cuotas: 2, cuotasPagadas: 1, cuotasVencidas: 0, pagado: 45000, saldo: 45000, estado: "al_dia" });
  });

  it("una cuota vencida con saldo marca vencida", () => {
    const r = resumenDeCobro(
      { pactado: 90000, cuotas: [cuota("c1", 45000, "2026-11-01"), cuota("c2", 45000, "2026-12-01")], pagos: [] },
      ahora
    );
    expect(r.estado).toBe("vencida");
    expect(r.cuotasVencidas).toBe(1);
  });

  it("un pago anulado no cuenta y una cuota anulada no se cuenta", () => {
    const r = resumenDeCobro(
      {
        pactado: 90000,
        cuotas: [cuota("c1", 90000, "2026-12-01"), cuota("viejo", 90000, "2026-10-01", new Date("2026-10-15"))],
        pagos: [pago(90000, "c1", new Date("2026-11-02"))],
      },
      ahora
    );
    expect(r).toMatchObject({ cuotas: 1, cuotasVencidas: 0, pagado: 0, saldo: 90000, estado: "al_dia" });
  });

  it("todo pagado = pagada; sin monto pactado el saldo es null", () => {
    expect(
      resumenDeCobro({ pactado: 1000, cuotas: [cuota("c1", 1000, "2026-11-01")], pagos: [pago(1000, "c1")] }, ahora).estado
    ).toBe("pagada");
    expect(resumenDeCobro({ pactado: null, cuotas: [], pagos: [pago(500)] }, ahora).saldo).toBeNull();
  });
});

describe("facturacionCsv", () => {
  it("encabezado en castellano y una línea por fila, con monto y moneda por separado", () => {
    const csv = facturacionCsv([
      fila({
        empresa: { id: "cia_1", razonSocial: "ACME, SA", rut: "2100", billingEmail: "f@acme.uy", condicion: "Contado" },
      }),
    ]);
    const [encabezado, linea] = csv.split("\r\n");
    expect(encabezado).toBe(
      "Alumno,Cédula,Celular,Curso,Grupo,Inicio,Grupo confirmado,Vendedor,Monto,Moneda,Factura,Razón social,RUT,Correo de facturación,Condición de pago"
    );
    expect(linea).toBe('Ana Pérez,,,Revit,Octubre,2026-10-20,Sí,Valeria,1000.00,UYU,,"ACME, SA",2100,f@acme.uy,Contado');
  });

  /**
   * El separador de columnas es la COMA: el monto sale en unidades MAYORES con
   * PUNTO decimal (sin miles) para que nunca parta el campo. Guaraníes, sin
   * decimales.
   */
  it("monto en unidades mayores con punto decimal; guaraníes sin decimales", () => {
    const SALTO = "\r\n";
    const linea = (amount: number | null, currency: "UYU" | "USD" | "PYG") =>
      facturacionCsv([fila({ amount, currency })]).split(SALTO)[1]!.split(",");
    expect(linea(524532, "UYU")[8]).toBe("5245.32");
    expect(linea(500000, "USD")[8]).toBe("5000.00");
    expect(linea(1000000000, "PYG")[8]).toBe("10000000");
    expect(linea(null, "UYU")[8]).toBe("");
  });

  it("lleva la cédula y el celular del alumno", () => {
    const [, linea] = facturacionCsv([fila({ cedula: "4.123.456-7", celular: "59899123456" })]).split("\r\n");
    expect(linea!.startsWith("Ana Pérez,4.123.456-7,59899123456,Revit,")).toBe(true);
  });

  it("neutraliza fórmulas (un nombre puede venir de un formulario público)", () => {
    const csv = facturacionCsv([fila({ alumno: "=HYPERLINK(\"x\")" })]);
    expect(csv.split("\r\n")[1]!.startsWith(`"'=HYPERLINK`)).toBe(true);
  });
});

/* ============================================================
 * Las rutas
 * ============================================================ */

describe("042 — las puertas", () => {
  it("PATCH /api/enrollments/[id]/invoice exige `facturacion.editar` y un body estricto", () => {
    const src = leer("src/app/api/enrollments/[id]/invoice/route.ts");
    expect(src).toMatch(/export const PATCH\s*=\s*requireCapability\(\s*"facturacion\.editar"/);
    expect(src).toContain(".strict()");
    // No reusa la ruta comercial: esa cambia montos.
    expect(src).not.toContain("updateEnrollmentCommercial");
  });

  it("PATCH /api/payments/[id]/receipt exige `facturacion.editar` y un body estricto", () => {
    const src = leer("src/app/api/payments/[id]/receipt/route.ts");
    expect(src).toMatch(/export const PATCH\s*=\s*requireCapability\(\s*"facturacion\.editar"/);
    expect(src).toContain(".strict()");
  });

  it("GET /api/facturacion exige `cobranza.ver` (viajan montos)", () => {
    const src = leer("src/app/api/facturacion/route.ts");
    expect(src).toMatch(/export const GET\s*=\s*requireCapability\(\s*"cobranza\.ver"/);
  });

  it("la ruta comercial vieja sigue en `inscripciones.editar`", () => {
    expect(leer("src/app/api/enrollments/[id]/route.ts")).toMatch(
      /export const PATCH\s*=\s*requireCapability\(\s*"inscripciones\.editar"/
    );
  });
});

/* ============================================================
 * La migración
 * ============================================================ */

describe("042 — la migración 0063", () => {
  const sql = leer("drizzle/0063_facturacion.sql");

  it.each(["direccion", "coordinacion", "administracion"])("le suma `facturacion.editar` a %s", (key) => {
    expect(sql).toMatch(
      new RegExp(
        `jsonb_build_array\\('facturacion\\.editar'\\)[\\s\\S]*?where "key" = '${key}'\\s+and not \\("capabilities" @> jsonb_build_array\\('facturacion\\.editar'\\)\\)`
      )
    );
  });

  it("no se la da a soporte ni a ventas", () => {
    expect(sql).not.toMatch(/where "key" = 'soporte'/);
    expect(sql).not.toMatch(/where "key" = 'ventas'/);
  });

  it("es re-ejecutable", () => {
    const columnas = [...sql.matchAll(/add column (if not exists )?"/g)];
    expect(columnas.length).toBe(4);
    expect(columnas.every((m) => m[1])).toBe(true);
  });
});
