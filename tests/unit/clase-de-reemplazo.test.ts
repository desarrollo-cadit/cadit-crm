import { describe, expect, it } from "vitest";
import {
  diaCorto,
  efectoDelReemplazo,
  planDeReemplazo,
  sumarDias,
} from "@/lib/clase-de-reemplazo";

const base = {
  endDate: "2026-11-20",
  deliveryDeadline: "2026-11-30",
  confirmaExtension: true,
  puedeMoverFechas: true,
  opcion: null,
} as const;

describe("sumarDias / diaCorto", () => {
  it("suma días de calendario cruzando meses y años", () => {
    expect(sumarDias("2026-11-30", 3)).toBe("2026-12-03");
    expect(sumarDias("2026-12-30", 5)).toBe("2027-01-04");
    expect(sumarDias("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("formatea dd/mm", () => {
    expect(diaCorto("2026-11-05")).toBe("05/11");
  });
});

describe("efectoDelReemplazo", () => {
  it("dentro del grupo no extiende nada", () => {
    const e = efectoDelReemplazo({ ...base, reemplazo: "2026-11-18" });
    expect(e.extiendeFin).toBe(false);
    expect(e.pideEntrega).toBe(false);
  });

  it("el mismo día del fin no extiende", () => {
    expect(efectoDelReemplazo({ ...base, reemplazo: "2026-11-20" }).extiendeFin).toBe(false);
  });

  it("sin fecha de fin no hay nada que extender", () => {
    const e = efectoDelReemplazo({ endDate: null, deliveryDeadline: null, reemplazo: "2027-01-01" });
    expect(e.extiendeFin).toBe(false);
  });

  it("después del fin: fin nuevo, días corridos, entrega corrida y si se puede mantener", () => {
    const e = efectoDelReemplazo({ ...base, reemplazo: "2026-11-25" });
    expect(e).toMatchObject({
      extiendeFin: true,
      finNuevo: "2026-11-25",
      diasCorridos: 5,
      pideEntrega: true,
      entregaCorrida: "2026-12-05",
      mantenerPermitido: true,
    });
    expect(e.aviso).toBe(
      "La clase de reemplazo queda después del fin del grupo (20/11). La fecha de fin pasa a ser 25/11."
    );
  });

  it("no se puede mantener la entrega si queda en o antes del fin nuevo", () => {
    expect(efectoDelReemplazo({ ...base, reemplazo: "2026-11-30" }).mantenerPermitido).toBe(false);
    expect(efectoDelReemplazo({ ...base, reemplazo: "2026-12-02" }).mantenerPermitido).toBe(false);
  });

  it("sin entrega final no la pide", () => {
    const e = efectoDelReemplazo({ ...base, deliveryDeadline: null, reemplazo: "2026-11-25" });
    expect(e.extiendeFin).toBe(true);
    expect(e.pideEntrega).toBe(false);
    expect(e.entregaCorrida).toBeNull();
  });
});

describe("planDeReemplazo", () => {
  it("dentro del grupo: no toca fechas aunque venga una opción", () => {
    expect(
      planDeReemplazo({ ...base, reemplazo: "2026-11-10", opcion: { tipo: "correr" }, confirmaExtension: false })
    ).toEqual({ ok: true, endDate: null, deliveryDeadline: null });
  });

  it("sin permiso para mover las fechas del grupo: 403", () => {
    const r = planDeReemplazo({ ...base, reemplazo: "2026-11-25", puedeMoverFechas: false });
    expect(r).toMatchObject({ ok: false, status: 403, code: "fin_del_grupo_sin_permiso" });
  });

  it("sin confirmar la extensión: 409 con el aviso", () => {
    const r = planDeReemplazo({
      ...base,
      reemplazo: "2026-11-25",
      confirmaExtension: false,
      opcion: { tipo: "correr" },
    });
    expect(r).toMatchObject({ ok: false, status: 409, code: "reemplazo_despues_del_fin" });
    if (!r.ok) expect(r.message).toContain("25/11");
  });

  it("sin entrega final: extiende solo el fin", () => {
    expect(
      planDeReemplazo({ ...base, deliveryDeadline: null, reemplazo: "2026-11-25" })
    ).toEqual({ ok: true, endDate: "2026-11-25", deliveryDeadline: null });
  });

  it("con entrega final y sin opción: 422", () => {
    expect(planDeReemplazo({ ...base, reemplazo: "2026-11-25" })).toMatchObject({
      ok: false,
      status: 422,
      code: "opcion_de_entrega_requerida",
    });
  });

  it("mantener: el fin cambia y la entrega no", () => {
    expect(
      planDeReemplazo({ ...base, reemplazo: "2026-11-25", opcion: { tipo: "mantener" } })
    ).toEqual({ ok: true, endDate: "2026-11-25", deliveryDeadline: null });
  });

  it("mantener cuando la entrega quedaría en o antes del fin nuevo: 422", () => {
    expect(
      planDeReemplazo({ ...base, reemplazo: "2026-11-30", opcion: { tipo: "mantener" } })
    ).toMatchObject({ ok: false, status: 422, code: "entrega_final_antes_del_fin" });
  });

  it("correr: la entrega se mueve los mismos días que el fin", () => {
    expect(
      planDeReemplazo({ ...base, reemplazo: "2026-12-02", opcion: { tipo: "correr" } })
    ).toEqual({ ok: true, endDate: "2026-12-02", deliveryDeadline: "2026-12-12" });
  });

  it("otra fecha: tiene que ser posterior al fin nuevo", () => {
    expect(
      planDeReemplazo({ ...base, reemplazo: "2026-11-25", opcion: { tipo: "fecha", fecha: "2026-12-20" } })
    ).toEqual({ ok: true, endDate: "2026-11-25", deliveryDeadline: "2026-12-20" });
    expect(
      planDeReemplazo({ ...base, reemplazo: "2026-11-25", opcion: { tipo: "fecha", fecha: "2026-11-25" } })
    ).toMatchObject({ ok: false, status: 422, code: "entrega_final_antes_del_fin" });
  });

  it("otra fecha inválida: 422", () => {
    expect(
      planDeReemplazo({ ...base, reemplazo: "2026-11-25", opcion: { tipo: "fecha", fecha: "2026-02-30" } })
    ).toMatchObject({ ok: false, status: 422, code: "invalid_body" });
  });
});
