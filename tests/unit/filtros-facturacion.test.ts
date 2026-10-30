import { describe, expect, it } from "vitest";
import {
  contadoresDeFacturacion,
  filtrarFacturacion,
  type FiltrosFacturacion,
  type FilaFacturacion,
} from "@/lib/facturacion";

/** 2026-10-30 — Facturación alineada a Académico: búsqueda y cantidades de los desplegables. */
const fila = (over: Partial<FilaFacturacion>): FilaFacturacion => ({
  enrollmentId: "en_1",
  contactId: "ct_1",
  alumno: "Ana Pérez",
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
  ...over,
});

const sinFiltros: FiltrosFacturacion = {
  cohortId: null,
  desde: null,
  hasta: null,
  soloConfirmadas: false,
  empresa: "todas",
};

const filas = [
  fila({ enrollmentId: "a", cohortId: "coh_1", confirmada: true }),
  fila({ enrollmentId: "b", cohortId: "coh_2", alumno: "Bruno Gómez", confirmada: false, vendedor: null }),
  fila({
    enrollmentId: "c",
    cohortId: "coh_2",
    alumno: "Carla Ríos",
    confirmada: false,
    invoiceNumber: "A-0042",
    empresa: { razonSocial: "Constructora Acme SA", rut: "21.234.567-0012", billingEmail: null, condicion: null },
  }),
];
const ids = (fs: FilaFacturacion[]) => fs.map((f) => f.enrollmentId);

describe("filtrarFacturacion — búsqueda", () => {
  it("sin búsqueda (o vacía) no filtra: los llamadores viejos siguen igual", () => {
    expect(ids(filtrarFacturacion(filas, sinFiltros))).toEqual(["a", "b", "c"]);
    expect(ids(filtrarFacturacion(filas, { ...sinFiltros, busqueda: "  " }))).toEqual(["a", "b", "c"]);
  });

  it("busca alumno sin tildes, empresa, RUT y número de factura", () => {
    expect(ids(filtrarFacturacion(filas, { ...sinFiltros, busqueda: "rios" }))).toEqual(["c"]);
    expect(ids(filtrarFacturacion(filas, { ...sinFiltros, busqueda: "acme" }))).toEqual(["c"]);
    expect(ids(filtrarFacturacion(filas, { ...sinFiltros, busqueda: "21.234" }))).toEqual(["c"]);
    expect(ids(filtrarFacturacion(filas, { ...sinFiltros, busqueda: "a-0042" }))).toEqual(["c"]);
    expect(ids(filtrarFacturacion(filas, { ...sinFiltros, busqueda: "valeria" }))).toEqual(["a", "c"]);
  });

  it("se combina con los demás filtros", () => {
    expect(ids(filtrarFacturacion(filas, { ...sinFiltros, busqueda: "valeria", cohortId: "coh_1" }))).toEqual([
      "a",
    ]);
  });
});

describe("contadoresDeFacturacion", () => {
  it("cada desplegable cuenta con los demás filtros y sin el suyo", () => {
    const c = contadoresDeFacturacion(filas, { ...sinFiltros, cohortId: "coh_2", empresa: "con" });
    // Grupo: sin el grupo elegido, con "con empresa" → solo c (coh_2).
    expect(c.todosLosGrupos).toBe(1);
    expect(c.grupos.get("coh_2")).toBe(1);
    expect(c.grupos.get("coh_1")).toBeUndefined();
    // Empresa: con el grupo coh_2 y sin el filtro de empresa → b y c.
    expect(c.empresa).toEqual({ todas: 2, con: 1, sin: 1 });
    // Confirmación: grupo coh_2 + con empresa → c, sin confirmar.
    expect(c.confirmacion).toEqual({ todas: 1, soloConfirmadas: 0 });
  });

  it("la búsqueda también achica los conteos", () => {
    const c = contadoresDeFacturacion(filas, { ...sinFiltros, busqueda: "bruno" });
    expect(c.todosLosGrupos).toBe(1);
    expect(c.grupos.get("coh_2")).toBe(1);
    expect(c.empresa).toEqual({ todas: 1, con: 0, sin: 1 });
  });
});
