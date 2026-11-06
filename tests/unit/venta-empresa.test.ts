import { describe, expect, it } from "vitest";
import {
  candidatasATitular,
  estaCubierta,
  nuevaTitular,
  problemaParaCubrir,
  titularAlQueSumar,
  type MiembroDeVenta,
} from "@/lib/venta-empresa";

const m = (id: string, over: Partial<MiembroDeVenta> = {}): MiembroDeVenta => ({
  id,
  companyId: "cia_1",
  cohortId: "coh_1",
  parentEnrollmentId: null,
  billingEnrollmentId: null,
  enrolledAt: new Date(`2026-10-0${id.length}T00:00:00Z`),
  ...over,
});

describe("venta de empresa — quién es titular", () => {
  it("estaCubierta mira solo billingEnrollmentId", () => {
    expect(estaCubierta({ billingEnrollmentId: null })).toBe(false);
    expect(estaCubierta({ billingEnrollmentId: "e1" })).toBe(true);
  });

  it("candidatas: misma empresa y grupo, principales, sin cubrir, la más antigua primero", () => {
    const miembros = [
      m("ccc", { enrolledAt: new Date("2026-10-03") }),
      m("a", { enrolledAt: new Date("2026-10-01") }),
      m("b", { enrolledAt: new Date("2026-10-02"), billingEnrollmentId: "a" }),
      m("d", { companyId: "cia_2" }),
      m("e", { cohortId: "coh_2" }),
      m("f", { parentEnrollmentId: "a" }),
    ];
    expect(candidatasATitular(miembros, "cia_1", "coh_1").map((x) => x.id)).toEqual(["a", "ccc"]);
  });

  it("titularAlQueSumar: la que ya lleva cubiertas, o la más antigua, o null si no hay", () => {
    const antigua = m("a", { enrolledAt: new Date("2026-10-01") });
    const otra = m("zz", { enrolledAt: new Date("2026-10-05") });
    const cubierta = m("c", { billingEnrollmentId: "zz", enrolledAt: new Date("2026-10-06") });
    expect(titularAlQueSumar([antigua, otra, cubierta], "cia_1", "coh_1")).toBe("zz");
    expect(titularAlQueSumar([antigua, otra], "cia_1", "coh_1")).toBe("a");
    expect(titularAlQueSumar([], "cia_1", "coh_1")).toBeNull();
  });
});

describe("venta de empresa — quién puede quedar cubierta", () => {
  const titular = m("t");
  it("misma empresa y mismo grupo: sí", () => {
    expect(problemaParaCubrir(m("x"), titular)).toBeNull();
  });
  it.each([
    ["otra empresa", { companyId: "cia_9" }, "otra_empresa"],
    ["sin empresa", { companyId: null }, "otra_empresa"],
    ["otro grupo", { cohortId: "coh_9" }, "otro_grupo"],
    ["un módulo", { parentEnrollmentId: "madre" }, "es_modulo"],
  ] as const)("%s: no", (_n, over, code) => {
    expect(problemaParaCubrir(m("x", over), titular)?.code).toBe(code);
  });
  it("la titular no puede estar cubierta (no hay cadenas) ni cubrirse a sí misma", () => {
    expect(problemaParaCubrir(m("x"), m("t", { billingEnrollmentId: "otra" }))?.code).toBe("ya_cubierta");
    expect(problemaParaCubrir(titular, titular)?.code).toBe("ya_cubierta");
  });
});

describe("venta de empresa — si la titular se va", () => {
  it("la reemplaza la cubierta activa más antigua; sin cubiertas, nadie", () => {
    const miembros = [
      m("t"),
      m("b", { billingEnrollmentId: "t", enrolledAt: new Date("2026-10-03") }),
      m("c", { billingEnrollmentId: "t", enrolledAt: new Date("2026-10-02"), deBaja: true } as Partial<MiembroDeVenta>),
      m("d", { billingEnrollmentId: "t", enrolledAt: new Date("2026-10-04") }),
    ];
    expect(nuevaTitular("t", miembros)).toBe("b");
    expect(nuevaTitular("t", [m("t")])).toBeNull();
  });
});
