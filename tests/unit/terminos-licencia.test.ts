import { describe, expect, it } from "vitest";
import {
  MENSAJE_SIN_TERMINOS,
  destinoDeTerminos,
  necesitaLicencia,
  planMarcarLicenciaPropia,
} from "@/lib/terminos-licencia";

/**
 * 2026-10-23 — Los términos de la licencia ATC documentan un PRÉSTAMO: van
 * solo a quien tiene una licencia asignada que no trajo de afuera, y al
 * correo de la licencia (`correoDeLicencia`), no al del alumno.
 *
 * Una sola regla para el envío individual, el envío al grupo y la
 * exportación para licenciamiento.
 */
describe("necesitaLicencia", () => {
  it("solo con licencia asignada y sin licencia propia", () => {
    expect(necesitaLicencia({ licenseAssigned: true, hadOwnLicense: false })).toBe(true);
    expect(necesitaLicencia({ licenseAssigned: true, hadOwnLicense: true })).toBe(false);
    expect(necesitaLicencia({ licenseAssigned: false, hadOwnLicense: false })).toBe(false);
    expect(necesitaLicencia({ licenseAssigned: false, hadOwnLicense: true })).toBe(false);
  });
});

describe("destinoDeTerminos", () => {
  it("va al correo de la licencia cuando corresponde", () => {
    expect(
      destinoDeTerminos({
        licenseAssigned: true,
        hadOwnLicense: false,
        licenseEmail: "empresa@example.com",
      })
    ).toEqual({ ok: true, email: "empresa@example.com" });
  });

  it("licencia propia gana sobre cualquier otro motivo", () => {
    const r = destinoDeTerminos({ licenseAssigned: false, hadOwnLicense: true, licenseEmail: null });
    expect(r).toEqual({
      ok: false,
      motivo: "licencia_propia",
      mensaje: MENSAJE_SIN_TERMINOS.licencia_propia,
    });
  });

  it("sin licencia asignada no se le manda", () => {
    const r = destinoDeTerminos({
      licenseAssigned: false,
      hadOwnLicense: false,
      licenseEmail: "a@example.com",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("sin_licencia");
  });

  it("sin correo para la licencia (nulo o en blanco) se saltea con el motivo", () => {
    for (const licenseEmail of [null, "", "   "]) {
      const r = destinoDeTerminos({ licenseAssigned: true, hadOwnLicense: false, licenseEmail });
      expect(r.ok, String(licenseEmail)).toBe(false);
      if (!r.ok) expect(r.motivo).toBe("sin_correo_licencia");
    }
  });

  it("los mensajes se leen en la pantalla: no están vacíos", () => {
    for (const m of Object.values(MENSAJE_SIN_TERMINOS)) expect(m.length).toBeGreaterThan(10);
  });
});

/**
 * Marcar "Tenía licencia propia" con una licencia ya asignada: la individual
 * la asignó alguien a mano y se rechaza (que la libere primero); la del
 * grupo no se puede liberar por alumno, así que la marca la devuelve al stock.
 */
describe("planMarcarLicenciaPropia", () => {
  it("sin licencias, se marca sin más", () => {
    expect(planMarcarLicenciaPropia([])).toEqual({ ok: true, liberarDelGrupo: [] });
  });

  it("con una individual asignada, se rechaza", () => {
    const r = planMarcarLicenciaPropia([
      { id: "lic_1", assigned: true, source: "individual" },
      { id: "lic_2", assigned: true, source: "grupo" },
    ]);
    expect(r.ok).toBe(false);
  });

  it("las del grupo se liberan; las ya liberadas no cuentan", () => {
    expect(
      planMarcarLicenciaPropia([
        { id: "lic_1", assigned: false, source: "individual" },
        { id: "lic_2", assigned: true, source: "grupo" },
        { id: "lic_3", assigned: false, source: "grupo" },
      ])
    ).toEqual({ ok: true, liberarDelGrupo: ["lic_2"] });
  });
});
