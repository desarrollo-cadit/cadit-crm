import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ESTADOS_DE_GRABACION,
  SIN_FILTROS_DE_GRABACIONES,
  contarPorEstado,
  esEstadoDeGrabacion,
  etiquetasDeFiltros,
  fechaCorta,
} from "@/lib/recording-filters";
import { RECORDING_STATES } from "@/server/zoom/recordings";

/** 2026-10-30 — Los filtros de Grabaciones: estados, conteos y etiquetas del resumen. */
describe("estados de grabación", () => {
  it("ofrece exactamente los estados que acepta la API", () => {
    expect([...ESTADOS_DE_GRABACION].sort()).toEqual([...RECORDING_STATES].sort());
  });

  it("reconoce solo esos estados", () => {
    expect(esEstadoDeGrabacion("ambigua")).toBe(true);
    expect(esEstadoDeGrabacion("borrada")).toBe(false);
  });
});

describe("contarPorEstado", () => {
  it("suma cada estado, el total y las que ya no están en Zoom (que cruzan estados)", () => {
    const conteo = contarPorEstado([
      { state: "asignada", cantidad: 10, faltantes: 1 },
      { state: "ambigua", cantidad: 2, faltantes: 0 },
      { state: "sin_clase", cantidad: 4, faltantes: 3 },
    ]);
    expect(conteo).toEqual({
      todas: 16,
      pendiente: 0,
      asignada: 10,
      ambigua: 2,
      conflicto: 0,
      sin_clase: 4,
      faltante: 4,
    });
  });

  it("sin grupos, todo en cero", () => {
    expect(contarPorEstado([]).todas).toBe(0);
  });

  it("un estado desconocido cuenta en el total pero no inventa una opción", () => {
    const conteo = contarPorEstado([{ state: "otro", cantidad: 3, faltantes: 0 }]);
    expect(conteo.todas).toBe(3);
    expect(Object.keys(conteo)).not.toContain("otro");
  });
});

describe("etiquetasDeFiltros", () => {
  const nombres = {
    cuentas: new Map([["zc_1", "Cuenta principal"]]),
    aulas: new Map([["vr_1", "Aula 2"]]),
  };

  it("sin filtros no hay etiquetas", () => {
    expect(etiquetasDeFiltros(SIN_FILTROS_DE_GRABACIONES, nombres)).toEqual([]);
  });

  it("nombra cuenta, aula, fechas (juntas) y estado, en el orden de la tarjeta", () => {
    const etiquetas = etiquetasDeFiltros(
      { connectionId: "zc_1", roomId: "vr_1", from: "2026-10-01", to: "2026-10-07", state: "ambigua" },
      nombres
    );
    expect(etiquetas).toEqual([
      { clave: "connectionId", etiqueta: "Cuenta: Cuenta principal" },
      { clave: "roomId", etiqueta: "Aula: Aula 2" },
      { clave: "fechas", etiqueta: "Desde 1/10/2026 hasta 7/10/2026" },
      { clave: "state", etiqueta: "Estado: Ambigua" },
    ]);
  });

  it("una sola fecha y un id que ya no existe", () => {
    const etiquetas = etiquetasDeFiltros(
      { ...SIN_FILTROS_DE_GRABACIONES, roomId: "vr_borrada", to: "2026-10-07" },
      nombres
    );
    expect(etiquetas.map((e) => e.etiqueta)).toEqual(["Aula: otra aula", "Hasta 7/10/2026"]);
  });
});

describe("fechaCorta", () => {
  it("día/mes/año sin ceros, y lo que no es fecha queda igual", () => {
    expect(fechaCorta("2026-01-05")).toBe("5/1/2026");
    expect(fechaCorta("ayer")).toBe("ayer");
  });
});

describe("la pantalla", () => {
  const cliente = readFileSync("src/components/recordings/recordings-client.tsx", "utf8");

  it("conserva los id que usa el E2E y el filtro de estado por la URL", () => {
    for (const id of ["rec-connection", "rec-room", "rec-from", "rec-to", "rec-page-size"]) {
      expect(cliente).toMatch(new RegExp(`(id|idDesde|idHasta)="${id}"`));
    }
    expect(cliente).toContain('state: sp.get("state")');
    expect(cliente).toContain("data-pagination-summary");
  });
});
