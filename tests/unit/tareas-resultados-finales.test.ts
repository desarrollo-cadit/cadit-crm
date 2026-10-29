import { describe, expect, it } from "vitest";
import {
  armarBandeja,
  reglasPermitidas,
  tareasDeResultadosFinales,
  type GrupoParaCerrar,
} from "@/lib/tareas-del-dia";
import { SYSTEM_ROLES } from "@/lib/capabilities";

/**
 * 0086 — "Resultados finales sin confirmar": grupos TERMINADOS con alumnos
 * cuyo resultado final nadie confirmó. Derivada, nunca guardada.
 */

const TZ = "America/Montevideo";
/** Lunes 26/10/2026, 10:00 en Montevideo. */
const AHORA = new Date("2026-10-26T13:00:00Z");
const reloj = { timeZone: TZ, now: AHORA };
const dia = (iso: string) => new Date(`${iso}T00:00:00Z`);

function grupo(over: Partial<GrupoParaCerrar> = {}): GrupoParaCerrar {
  return {
    cohortId: "coh_1",
    cohortName: "Marzo",
    courseName: "Revit",
    courseKind: "curso",
    startDate: dia("2026-08-01"),
    endDate: dia("2026-10-20"),
    sinConfirmar: 3,
    completo: true,
    ...over,
  };
}

describe("reglasPermitidas — resultados finales", () => {
  it("la ve quien tiene correcciones.aprobar (Dirección, Coordinación), no Soporte", () => {
    const de = (key: string) => SYSTEM_ROLES.find((r) => r.key === key)!.capabilities;
    expect(reglasPermitidas(de("direccion"))).toContain("resultados");
    expect(reglasPermitidas(de("coordinacion"))).toContain("resultados");
    expect(reglasPermitidas(de("soporte"))).not.toContain("resultados");
  });
});

describe("tareasDeResultadosFinales", () => {
  it("un grupo terminado con alumnos sin confirmar es UNA tarea, con cuántos son", () => {
    const [t, ...resto] = tareasDeResultadosFinales([grupo()], reloj);
    expect(resto).toEqual([]);
    expect(t).toMatchObject({
      ruleId: "resultados",
      titulo: "Revit — Marzo",
      href: "/cohorts/coh_1?tab=evaluacion",
      cantidad: 3,
      urgencia: "media",
      fecha: "2026-10-20",
    });
    expect(t?.detalle).toContain("3 alumnos sin resultado final");
  });

  it("no es tarea: en curso, sin pendientes, taller o grupo INCOMPLETO (sin asistencia en todas sus clases)", () => {
    expect(tareasDeResultadosFinales([grupo({ endDate: dia("2026-10-30") })], reloj)).toEqual([]);
    expect(tareasDeResultadosFinales([grupo({ endDate: null })], reloj)).toEqual([]);
    expect(tareasDeResultadosFinales([grupo({ sinConfirmar: 0 })], reloj)).toEqual([]);
    expect(tareasDeResultadosFinales([grupo({ courseKind: "taller" })], reloj)).toEqual([]);
    expect(tareasDeResultadosFinales([grupo({ completo: false })], reloj)).toEqual([]);
  });

  it("sin ventana de días: un grupo completo que terminó hace un año sigue pendiente", () => {
    const [t] = tareasDeResultadosFinales([grupo({ startDate: dia("2025-08-01"), endDate: dia("2025-10-20") })], reloj);
    expect(t?.ruleId).toBe("resultados");
    expect(t?.urgencia).toBe("alta");
  });

  it("alta cuando terminó hace más de 7 días", () => {
    const [t] = tareasDeResultadosFinales([grupo({ endDate: dia("2026-10-10") })], reloj);
    expect(t?.urgencia).toBe("alta");
  });

  it("la bandeja suma alumnos y dice en cuántos grupos", () => {
    const bandeja = armarBandeja(
      tareasDeResultadosFinales(
        [grupo(), grupo({ cohortId: "coh_2", cohortName: "Abril", sinConfirmar: 1 })],
        reloj
      )
    );
    expect(bandeja[0]?.resumen).toBe("4 alumnos sin resultado final en 2 grupos");
  });
});
