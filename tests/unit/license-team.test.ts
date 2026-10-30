import { describe, expect, it } from "vitest";
import {
  armarCupos,
  claveDeStock,
  cuposSchema,
  equipoNuevoSchema,
  motivoDeCupoInvalido,
  planDeMovimientoDePrograma,
} from "@/lib/license-team";

/**
 * 0087 — Las reglas puras de los equipos de licencias (Uruguay ATC, Paraguay
 * ATC…): el cupo es de cada equipo y se mide con lo que ESE equipo ocupa.
 */

describe("claveDeStock", () => {
  it("distingue el mismo programa en equipos distintos", () => {
    expect(claveDeStock("uy", "revit")).not.toBe(claveDeStock("py", "revit"));
    expect(claveDeStock("uy", "revit")).toBe(claveDeStock("uy", "revit"));
  });

  it("no lleva caracteres de control: viaja a Postgres en el candado de stock", () => {
    // Un `\u0000` hacía fallar con 500 `invalid byte sequence ... 0x00` al guardar cupos.
    expect(claveDeStock("ltm_a", "sw_b")).not.toMatch(/[\u0000-\u001f]/);
  });
});

describe("armarCupos", () => {
  it("Uruguay 50 / Paraguay 60: libres por equipo, sin mezclarlos", () => {
    const cupos = armarCupos(
      [
        { teamId: "uy", softwareId: "revit", total: 50 },
        { teamId: "py", softwareId: "revit", total: 60 },
      ],
      new Map([
        [claveDeStock("uy", "revit"), 50],
        [claveDeStock("py", "revit"), 10],
      ])
    );
    expect(cupos.map((c) => [c.teamId, c.ocupadas, c.libres])).toEqual([
      ["uy", 50, 0],
      ["py", 10, 50],
    ]);
  });

  it("sin ocupadas, todo el cupo está libre", () => {
    const [c] = armarCupos([{ teamId: "uy", softwareId: "revit", total: 5 }], new Map());
    expect(c).toMatchObject({ ocupadas: 0, libres: 5 });
  });
});

describe("motivoDeCupoInvalido", () => {
  const ocupadas = new Map([[claveDeStock("uy", "revit"), 8]]);

  it("bajar por debajo de lo que el equipo ocupa se rechaza y nombra equipo y programa", () => {
    const motivo = motivoDeCupoInvalido(
      [{ softwareId: "revit", total: 5, programa: "Revit" }],
      ocupadas,
      "uy",
      "Uruguay ATC"
    );
    expect(motivo).toBe("No se puede bajar Revit de 8 licencias en Uruguay ATC: ya hay 8 ocupadas");
  });

  it("igualar lo ocupado o subir se puede", () => {
    expect(
      motivoDeCupoInvalido(
        [{ softwareId: "revit", total: 8, programa: "Revit" }],
        ocupadas,
        "uy",
        "Uruguay ATC"
      )
    ).toBeNull();
  });

  it("lo que ocupa OTRO equipo no limita a este", () => {
    expect(
      motivoDeCupoInvalido(
        [{ softwareId: "revit", total: 0, programa: "Revit" }],
        ocupadas,
        "py",
        "Paraguay ATC"
      )
    ).toBeNull();
  });

  it("todo o nada: un solo cupo inválido frena el pedido", () => {
    const motivo = motivoDeCupoInvalido(
      [
        { softwareId: "navis", total: 3, programa: "Navisworks" },
        { softwareId: "revit", total: 1, programa: "Revit" },
      ],
      ocupadas,
      "uy",
      "Uruguay ATC"
    );
    expect(motivo).toContain("Revit");
  });
});

describe("esquemas", () => {
  it("el equipo pide nombre", () => {
    expect(equipoNuevoSchema.safeParse({ name: "  " }).success).toBe(false);
    expect(
      equipoNuevoSchema.safeParse({ name: "Uruguay ATC", autodeskAlias: "2026 ATC" }).success
    ).toBe(true);
  });

  it("el cupo es un entero >= 0", () => {
    expect(cuposSchema.safeParse({ seats: [{ softwareId: "sw", total: -1 }] }).success).toBe(false);
    expect(cuposSchema.safeParse({ seats: [{ softwareId: "sw", total: 1.5 }] }).success).toBe(false);
    expect(cuposSchema.safeParse({ seats: [{ softwareId: "sw", total: 0 }] }).success).toBe(true);
  });
});

describe("planDeMovimientoDePrograma (0088)", () => {
  const base = {
    programa: "AutoCAD",
    destino: "Paraguay ATC",
    totalOrigen: 10,
    totalDestino: 0,
    destinoTiene: false,
    sumar: false,
    ocupadasOrigen: 4,
    ocupadasDestino: 0,
  };

  it("destino sin ese programa: el cupo se mueve tal cual", () => {
    expect(planDeMovimientoDePrograma(base)).toEqual({ ok: true, nuevoTotal: 10, suma: false });
  });

  it("destino que ya lo tiene: 409 hasta que se confirme la suma", () => {
    const plan = planDeMovimientoDePrograma({ ...base, destinoTiene: true, totalDestino: 30 });
    expect(plan).toMatchObject({ ok: false, code: "programa_en_destino" });
    expect(plan.ok ? "" : plan.message).toContain("30");
  });

  it("confirmada la suma, los cupos se suman", () => {
    expect(
      planDeMovimientoDePrograma({ ...base, destinoTiene: true, totalDestino: 30, sumar: true })
    ).toEqual({ ok: true, nuevoTotal: 40, suma: true });
  });

  it("nunca deja el destino con menos cupo que lo que va a ocupar", () => {
    const plan = planDeMovimientoDePrograma({ ...base, totalOrigen: 3, ocupadasOrigen: 4 });
    expect(plan).toMatchObject({ ok: false, code: "sin_cupo" });
  });

  it("suma también lo que el destino ya ocupa", () => {
    const plan = planDeMovimientoDePrograma({
      ...base,
      destinoTiene: true,
      sumar: true,
      totalOrigen: 4,
      totalDestino: 3,
      ocupadasOrigen: 4,
      ocupadasDestino: 3,
    });
    expect(plan).toEqual({ ok: true, nuevoTotal: 7, suma: true });
  });
});
