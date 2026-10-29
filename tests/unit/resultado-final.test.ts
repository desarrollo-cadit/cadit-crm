import { describe, expect, it } from "vitest";
import {
  RAZON_GRUPO_INCOMPLETO,
  RAZON_SIN_CONFIRMAR,
  afirmadoConSugerencia,
  certificadoVisibleParaElAlumno,
  grupoCompleto,
  grupoSinResultado,
  debeAnularCertificado,
  estadoAfirmado,
  modulosAfirmados,
  programaConfirmado,
  puedeConfirmarResultado,
  sugeridosAConfirmar,
  validarConfirmaciones,
  visibilidadDeCertificado,
} from "@/lib/resultado-final";

/**
 * Decisión del dueño (2026-10-23): ninguna aprobación es automática. El
 * cálculo (notas + asistencia) es una SUGERENCIA; lo que se afirma como hecho
 * sale del resultado final que CONFIRMÓ una persona.
 */

const reloj = { timeZone: "America/Montevideo", now: new Date("2026-10-29T15:00:00Z") };
const clase = (dia: string, tomada: boolean, canceledAt: Date | null = null) => ({
  date: new Date(`${dia}T00:00:00Z`),
  endTime: "21:00",
  canceledAt,
  tomada,
});

describe("grupoCompleto — toda clase dictada con la asistencia tomada", () => {
  it("todas las dictadas con lista: completo", () => {
    expect(grupoCompleto([clase("2026-09-01", true), clase("2026-09-08", true)], reloj)).toBe(true);
  });
  it("una dictada sin lista: incompleto", () => {
    expect(grupoCompleto([clase("2026-09-01", true), clase("2026-09-08", false)], reloj)).toBe(false);
  });
  it("las canceladas y las futuras no cuentan", () => {
    expect(
      grupoCompleto(
        [clase("2026-09-01", true), clase("2026-09-08", false, new Date("2026-09-07")), clase("2026-11-20", false)],
        reloj
      )
    ).toBe(true);
  });
  it("sin ninguna clase dictada (importado, nunca se trabajó): incompleto", () => {
    expect(grupoCompleto([], reloj)).toBe(false);
    expect(grupoCompleto([clase("2026-09-01", false, new Date("2026-08-30"))], reloj)).toBe(false);
  });
});

describe("grupoSinResultado — terminado e incompleto", () => {
  const terminado = { startDate: new Date("2026-08-01T00:00:00Z"), endDate: new Date("2026-10-01T00:00:00Z") };
  it("terminado sin la lista completa: sin resultado", () => {
    expect(grupoSinResultado(terminado, [clase("2026-09-01", false)], reloj)).toBe(true);
  });
  it("terminado y completo: entra al circuito", () => {
    expect(grupoSinResultado(terminado, [clase("2026-09-01", true)], reloj)).toBe(false);
  });
  it("en curso todavía puede completarse", () => {
    expect(
      grupoSinResultado({ ...terminado, endDate: new Date("2026-12-01T00:00:00Z") }, [clase("2026-09-01", false)], reloj)
    ).toBe(false);
  });
});

describe("puedeConfirmarResultado — solo grupos terminados, nunca la madre", () => {
  it("un grupo terminado incompleto responde grupo_incompleto", () => {
    const r = puedeConfirmarResultado({ estadoDelGrupo: "finalizada", grupoCompleto: false, tieneModulos: false });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("grupo_incompleto");
      expect(r.message).toContain("asistencia");
    }
  });
  it("un grupo en curso o por comenzar responde grupo_no_finalizado", () => {
    for (const estado of ["planificada", "en_curso"] as const) {
      const r = puedeConfirmarResultado({ estadoDelGrupo: estado, grupoCompleto: true, tieneModulos: false });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe("grupo_no_finalizado");
    }
  });
  it("un grupo finalizado se puede confirmar", () => {
    expect(puedeConfirmarResultado({ estadoDelGrupo: "finalizada", grupoCompleto: true, tieneModulos: false })).toEqual({ ok: true });
  });
  it("la madre de una especialización se confirma por sus módulos", () => {
    const r = puedeConfirmarResultado({ estadoDelGrupo: "finalizada", grupoCompleto: true, tieneModulos: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("se_confirma_por_modulos");
  });
});

describe("estadoAfirmado — lo confirmado gana; la sugerencia nunca es un hecho", () => {
  it("sin confirmar es pendiente aunque la sugerencia sea aprobado", () => {
    expect(estadoAfirmado(null)).toEqual({ state: "pendiente", reasons: [RAZON_SIN_CONFIRMAR] });
  });
  it("confirmado aprobado / reprobado, sin razones", () => {
    expect(estadoAfirmado("aprobado")).toEqual({ state: "aprobado", reasons: [] });
    expect(estadoAfirmado("reprobado")).toEqual({ state: "reprobado", reasons: [] });
  });
});

describe("afirmadoConSugerencia — pantallas del staff", () => {
  it("confirmado: el resultado, sin razones", () => {
    expect(afirmadoConSugerencia("reprobado", { state: "aprobado", reasons: [] })).toEqual({
      state: "reprobado",
      reasons: [],
    });
  });
  it("sin confirmar: pendiente, con la sugerencia dicha como sugerencia", () => {
    expect(
      afirmadoConSugerencia(null, { state: "reprobado", reasons: ["Asistencia 50% (mínimo 75%)"] })
    ).toEqual({
      state: "pendiente",
      reasons: [RAZON_SIN_CONFIRMAR, "Sugerencia del sistema: reprobado", "Asistencia 50% (mínimo 75%)"],
    });
  });
  it("grupo sin resultado: sin_datos aunque haya un confirmado viejo", () => {
    expect(afirmadoConSugerencia("aprobado", { state: "aprobado", reasons: [] }, true)).toEqual({
      state: "sin_datos",
      reasons: [RAZON_GRUPO_INCOMPLETO],
    });
  });
  it("sin datos sigue siendo sin datos (no afirma nada)", () => {
    expect(afirmadoConSugerencia(null, { state: "sin_datos", reasons: ["x"] })).toEqual({
      state: "sin_datos",
      reasons: ["x"],
    });
  });
});

describe("programaConfirmado — la especialización desde sus módulos CONFIRMADOS", () => {
  it("sin módulos: pendiente, jamás aprobado", () => {
    expect(programaConfirmado([]).state).toBe("pendiente");
  });
  it("todos confirmados aprobados: aprobado", () => {
    expect(programaConfirmado(["aprobado", "aprobado"]).state).toBe("aprobado");
  });
  it("un módulo sin confirmar deja pendiente aunque los demás estén aprobados", () => {
    const r = programaConfirmado(["aprobado", null]);
    expect(r.state).toBe("pendiente");
  });
  it("un módulo confirmado reprobado reprueba la especialización", () => {
    expect(programaConfirmado(["reprobado", null, "aprobado"]).state).toBe("reprobado");
  });
  it("modulosAfirmados mapea sin confirmar a pendiente", () => {
    expect(modulosAfirmados(["aprobado", null, "reprobado"])).toEqual(["aprobado", "pendiente", "reprobado"]);
  });
});

describe("visibilidadDeCertificado — suspendido hasta que se confirme", () => {
  it("anulado gana sobre todo", () => {
    expect(
      visibilidadDeCertificado({ revokedAt: new Date(), grupoSinResultado: false, resultado: "aprobado" })
    ).toBe("anulado");
  });
  it("sin resultado confirmado: suspendido", () => {
    expect(visibilidadDeCertificado({ revokedAt: null, grupoSinResultado: false, resultado: "pendiente" })).toBe(
      "suspendido"
    );
  });
  it("confirmado reprobado (y todavía sin anular): suspendido, nunca válido", () => {
    expect(visibilidadDeCertificado({ revokedAt: null, grupoSinResultado: false, resultado: "reprobado" })).toBe(
      "suspendido"
    );
  });
  it("confirmado aprobado: válido", () => {
    expect(visibilidadDeCertificado({ revokedAt: null, grupoSinResultado: false, resultado: "aprobado" })).toBe("valido");
  });
  it("grupo terminado e incompleto: anulado (al leer), aunque haya un aprobado viejo", () => {
    expect(visibilidadDeCertificado({ revokedAt: null, grupoSinResultado: true, resultado: "aprobado" })).toBe(
      "anulado_sin_asistencia"
    );
  });
  it("si después se completa la asistencia y se confirma aprobado, vuelve a valer", () => {
    expect(visibilidadDeCertificado({ revokedAt: null, grupoSinResultado: false, resultado: "aprobado" })).toBe("valido");
  });
  it("el alumno ve el válido y el anulado a mano; nunca el suspendido ni el de grupo incompleto", () => {
    expect(certificadoVisibleParaElAlumno("valido")).toBe(true);
    expect(certificadoVisibleParaElAlumno("anulado")).toBe(true);
    expect(certificadoVisibleParaElAlumno("suspendido")).toBe(false);
    expect(certificadoVisibleParaElAlumno("anulado_sin_asistencia")).toBe(false);
  });
});

describe("debeAnularCertificado", () => {
  it("solo al confirmar reprobado sobre un certificado vigente", () => {
    expect(debeAnularCertificado({ certificadoVigente: true, resultado: "reprobado" })).toBe(true);
    expect(debeAnularCertificado({ certificadoVigente: true, resultado: "aprobado" })).toBe(false);
    expect(debeAnularCertificado({ certificadoVigente: false, resultado: "reprobado" })).toBe(false);
  });
});

describe("sugeridosAConfirmar — el botón «Confirmar sugeridos»", () => {
  it("toma los sin confirmar con sugerencia aprobado/reprobado; deja afuera pendientes y confirmados", () => {
    const r = sugeridosAConfirmar([
      { enrollmentId: "a", sugerido: "aprobado", confirmado: null },
      { enrollmentId: "b", sugerido: "reprobado", confirmado: null },
      { enrollmentId: "c", sugerido: "pendiente", confirmado: null },
      { enrollmentId: "d", sugerido: "aprobado", confirmado: "reprobado" },
    ]);
    expect(r).toEqual([
      { enrollmentId: "a", result: "aprobado" },
      { enrollmentId: "b", result: "reprobado" },
    ]);
  });
});

describe("validarConfirmaciones — el cuerpo de la confirmación", () => {
  it("acepta una lista de aprobado/reprobado con nota opcional", () => {
    const r = validarConfirmaciones({
      entries: [
        { enrollmentId: "enr_1", result: "aprobado" },
        { enrollmentId: "enr_2", result: "reprobado", note: "  No entregó el final  " },
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.entries[1]).toEqual({ enrollmentId: "enr_2", result: "reprobado", note: "No entregó el final" });
  });
  it("rechaza resultados inventados, listas vacías e inscripciones repetidas", () => {
    expect(validarConfirmaciones({ entries: [{ enrollmentId: "x", result: "pendiente" }] }).ok).toBe(false);
    expect(validarConfirmaciones({ entries: [] }).ok).toBe(false);
    expect(
      validarConfirmaciones({
        entries: [
          { enrollmentId: "x", result: "aprobado" },
          { enrollmentId: "x", result: "reprobado" },
        ],
      }).ok
    ).toBe(false);
  });
});
