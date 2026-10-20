import { describe, expect, it } from "vitest";
import {
  licenciaDelGrupoBloquea,
  mensajeFaltanLicencias,
  MENSAJE_LICENCIA_DEL_GRUPO,
  planAsignarAlGrupo,
  planQuitarDelGrupo,
  planSincronizarInscripcion,
  type LicenciaExistente,
} from "@/lib/group-licenses";

/**
 * 035 (US1/US2, FR-001..FR-010) — Las reglas puras de la licencia del grupo.
 * Sin base: el server les da filas y escribe lo que deciden.
 */

const individual = (id: string, softwareId: string, ocupa = true): LicenciaExistente => ({
  id,
  softwareId,
  assigned: true,
  source: "individual",
  ocupa,
});
const delGrupo = (id: string, softwareId: string): LicenciaExistente => ({
  id,
  softwareId,
  assigned: true,
  source: "grupo",
  ocupa: true,
});
const liberada = (id: string, softwareId: string): LicenciaExistente => ({
  id,
  softwareId,
  assigned: false,
  source: "individual",
  ocupa: false,
});

const miembros = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ enrollmentId: `enr_${i}`, licencias: [] }));

describe("planAsignarAlGrupo (FR-002, todo o nada)", () => {
  it("16 alumnos y 20 libres: inserta las 16 y descuenta 16", () => {
    const plan = planAsignarAlGrupo({
      softwareId: "sw_revit",
      miembros: miembros(16),
      disponibles: 20,
      descuentaStock: true,
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.insertar).toHaveLength(16);
    expect(plan.necesarias).toBe(16);
    expect(plan.convertir).toEqual([]);
    expect(plan.reactivar).toEqual([]);
  });

  it("16 alumnos y 10 libres: no asigna ninguna y dice cuántas faltan", () => {
    const plan = planAsignarAlGrupo({
      softwareId: "sw_revit",
      miembros: miembros(16),
      disponibles: 10,
      descuentaStock: true,
    });
    expect(plan).toEqual({ ok: false, faltan: 6, necesarias: 16, disponibles: 10 });
  });

  it("stock negativo (se bajó el total) cuenta como cero libres", () => {
    const plan = planAsignarAlGrupo({
      softwareId: "sw_revit",
      miembros: miembros(2),
      disponibles: -3,
      descuentaStock: true,
    });
    expect(plan).toEqual({ ok: false, faltan: 2, necesarias: 2, disponibles: 0 });
  });

  it("FR-010 — la individual que ya ocupa se CONVIERTE: no se duplica ni descuenta otra vez", () => {
    const plan = planAsignarAlGrupo({
      softwareId: "sw_revit",
      miembros: [
        { enrollmentId: "enr_a", licencias: [individual("lic_a", "sw_revit")] },
        { enrollmentId: "enr_b", licencias: [individual("lic_b", "sw_navis")] },
      ],
      disponibles: 1,
      descuentaStock: true,
    });
    expect(plan).toEqual({
      ok: true,
      convertir: ["lic_a"],
      reactivar: [],
      insertar: ["enr_b"],
      necesarias: 1,
    });
  });

  it("una fila liberada del mismo programa se reactiva y sí descuenta", () => {
    const plan = planAsignarAlGrupo({
      softwareId: "sw_revit",
      miembros: [{ enrollmentId: "enr_a", licencias: [liberada("lic_a", "sw_revit")] }],
      disponibles: 0,
      descuentaStock: true,
    });
    expect(plan).toEqual({ ok: false, faltan: 1, necesarias: 1, disponibles: 0 });
  });

  it("una individual asignada pero VENCIDA no ocupa: se reactiva y descuenta", () => {
    const plan = planAsignarAlGrupo({
      softwareId: "sw_revit",
      miembros: [{ enrollmentId: "enr_a", licencias: [individual("lic_a", "sw_revit", false)] }],
      disponibles: 1,
      descuentaStock: true,
    });
    expect(plan.ok && plan.reactivar).toEqual(["lic_a"]);
    expect(plan.ok && plan.necesarias).toBe(1);
  });

  it("en una cohorte terminada nada descuenta: no hace falta stock", () => {
    const plan = planAsignarAlGrupo({
      softwareId: "sw_revit",
      miembros: miembros(3),
      disponibles: 0,
      descuentaStock: false,
    });
    expect(plan.ok).toBe(true);
    expect(plan.ok && plan.necesarias).toBe(0);
  });

  it("un grupo vacío se puede asignar sin stock", () => {
    const plan = planAsignarAlGrupo({
      softwareId: "sw_revit",
      miembros: [],
      disponibles: 0,
      descuentaStock: true,
    });
    expect(plan).toEqual({ ok: true, convertir: [], reactivar: [], insertar: [], necesarias: 0 });
  });
});

describe("mensajeFaltanLicencias", () => {
  it("dice cuántas faltan, cuántas hacen falta y cuántas hay", () => {
    expect(mensajeFaltanLicencias("Revit", { faltan: 6, necesarias: 16, disponibles: 10 })).toBe(
      "Faltan 6 licencias de Revit: el grupo necesita 16 y hay 10 libres. No se asignó ninguna."
    );
  });

  it("en singular cuando falta una", () => {
    expect(mensajeFaltanLicencias("Revit", { faltan: 1, necesarias: 3, disponibles: 2 })).toBe(
      "Falta 1 licencia de Revit: el grupo necesita 3 y hay 2 libres. No se asignó ninguna."
    );
  });
});

describe("planQuitarDelGrupo (FR-005)", () => {
  it("libera sólo las del grupo de ESE programa; las individuales no se tocan", () => {
    const ids = planQuitarDelGrupo(
      [
        delGrupo("lic_1", "sw_revit"),
        individual("lic_2", "sw_revit"),
        delGrupo("lic_3", "sw_navis"),
        { ...delGrupo("lic_4", "sw_revit"), assigned: false },
      ],
      "sw_revit"
    );
    expect(ids).toEqual(["lic_1"]);
  });

  it("libera también las del grupo ya vencidas", () => {
    const ids = planQuitarDelGrupo([{ ...delGrupo("lic_1", "sw_revit"), ocupa: false }], "sw_revit");
    expect(ids).toEqual(["lic_1"]);
  });
});

describe("planSincronizarInscripcion (FR-004/FR-006)", () => {
  const sinStock = new Map<string, number>();

  it("inscripción nueva en una cohorte con Revit del grupo: lo recibe", () => {
    const plan = planSincronizarInscripcion({
      grupo: [{ softwareId: "sw_revit", descuentaStock: true }],
      licencias: [],
      disponibles: new Map([["sw_revit", 3]]),
    });
    expect(plan).toEqual({
      liberar: [],
      convertir: [],
      reactivar: [],
      insertar: ["sw_revit"],
      sinStock: [],
    });
  });

  it("sin stock la inscripción no se bloquea: queda el faltante", () => {
    const plan = planSincronizarInscripcion({
      grupo: [{ softwareId: "sw_revit", descuentaStock: true }],
      licencias: [],
      disponibles: sinStock,
    });
    expect(plan.insertar).toEqual([]);
    expect(plan.sinStock).toEqual(["sw_revit"]);
  });

  it("baja: con el grupo vacío se liberan las del grupo y las individuales quedan", () => {
    const plan = planSincronizarInscripcion({
      grupo: [],
      licencias: [delGrupo("lic_1", "sw_revit"), individual("lic_2", "sw_navis")],
      disponibles: sinStock,
    });
    expect(plan.liberar).toEqual(["lic_1"]);
    expect(plan.insertar).toEqual([]);
  });

  it("mudar: pierde las del grupo viejo y recibe las del nuevo; lo compartido se queda", () => {
    const plan = planSincronizarInscripcion({
      grupo: [
        { softwareId: "sw_revit", descuentaStock: true },
        { softwareId: "sw_civil", descuentaStock: true },
      ],
      licencias: [delGrupo("lic_revit", "sw_revit"), delGrupo("lic_navis", "sw_navis")],
      disponibles: new Map([["sw_civil", 1]]),
    });
    expect(plan.liberar).toEqual(["lic_navis"]);
    expect(plan.insertar).toEqual(["sw_civil"]);
    expect(plan.convertir).toEqual([]);
  });

  it("una individual del mismo programa que el grupo nuevo se convierte (SC-002)", () => {
    const plan = planSincronizarInscripcion({
      grupo: [{ softwareId: "sw_revit", descuentaStock: true }],
      licencias: [individual("lic_1", "sw_revit")],
      disponibles: sinStock,
    });
    expect(plan.convertir).toEqual([{ id: "lic_1", softwareId: "sw_revit" }]);
    expect(plan.sinStock).toEqual([]);
  });

  it("una fila liberada se reactiva en vez de duplicarse", () => {
    const plan = planSincronizarInscripcion({
      grupo: [{ softwareId: "sw_revit", descuentaStock: true }],
      licencias: [liberada("lic_1", "sw_revit")],
      disponibles: new Map([["sw_revit", 1]]),
    });
    expect(plan.reactivar).toEqual([{ id: "lic_1", softwareId: "sw_revit" }]);
    expect(plan.insertar).toEqual([]);
  });

  it("dos programas compiten por el stock que queda, de a uno", () => {
    const plan = planSincronizarInscripcion({
      grupo: [
        { softwareId: "sw_revit", descuentaStock: true },
        { softwareId: "sw_navis", descuentaStock: false },
      ],
      licencias: [],
      disponibles: new Map([["sw_revit", 0]]),
    });
    // Navisworks no descuenta (vencimiento pasado o curso terminado): entra igual.
    expect(plan.insertar).toEqual(["sw_navis"]);
    expect(plan.sinStock).toEqual(["sw_revit"]);
  });
});

describe("licenciaDelGrupoBloquea (FR-008)", () => {
  it("bloquea el programa del grupo y deja pasar los demás", () => {
    expect(licenciaDelGrupoBloquea(["sw_revit"], "sw_revit")).toBe(true);
    expect(licenciaDelGrupoBloquea(["sw_revit"], "sw_navis")).toBe(false);
    expect(licenciaDelGrupoBloquea([], "sw_revit")).toBe(false);
  });

  it("el motivo nombra el programa y dice dónde se cambia", () => {
    expect(MENSAJE_LICENCIA_DEL_GRUPO("Revit")).toBe(
      "Revit está asignado al grupo: se asigna y se quita desde el grupo, no por alumno."
    );
  });
});
