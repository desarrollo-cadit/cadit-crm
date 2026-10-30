import { describe, expect, it } from "vitest";
import {
  configAGuardar,
  grupoEmiteCertificado,
  grupoTieneEvaluaciones,
} from "@/lib/taller-config";
import { resultadoDeCursada } from "@/lib/resultado-de-cursada";
import { historialesComerciales, type CursadaComercial } from "@/lib/recorrido-comercial";
import { visibilidadSegun } from "@/lib/resultado-final";
import { pestanasDelGrupo, pestanasPortalCursada, pestanasPortalGrupo } from "@/lib/pestanas";

const taller = { courseKind: "taller", registrationStatus: null };

describe("configuración de un grupo de taller", () => {
  it("solo un taller cursable (sin estado de inscripción) se puede apagar", () => {
    expect(grupoTieneEvaluaciones({ ...taller, hasAssessments: false })).toBe(false);
    expect(grupoEmiteCertificado({ ...taller, issuesCertificate: false })).toBe(false);
    // edición de Marketing y curso común: siempre "sí", ignora lo guardado
    expect(
      grupoTieneEvaluaciones({ courseKind: "taller", registrationStatus: "abierta", hasAssessments: false })
    ).toBe(true);
    expect(grupoTieneEvaluaciones({ courseKind: "curso", hasAssessments: false })).toBe(true);
    expect(grupoEmiteCertificado({ courseKind: "curso", issuesCertificate: false })).toBe(true);
  });

  it("el default es sí", () => {
    expect(grupoTieneEvaluaciones(taller)).toBe(true);
    expect(grupoEmiteCertificado(taller)).toBe(true);
  });

  it("configAGuardar fuerza true fuera de los talleres", () => {
    expect(configAGuardar({ courseKind: "curso" }, { hasAssessments: false, issuesCertificate: false })).toEqual({
      hasAssessments: true,
      issuesCertificate: true,
    });
    expect(configAGuardar(taller, { hasAssessments: false })).toEqual({
      hasAssessments: false,
      issuesCertificate: true,
    });
  });

  it("sin evaluaciones el resultado sigue siendo de una persona: sin confirmar es 'Resultado pendiente'", () => {
    const base = { estadoDelGrupo: "finalizada" as const, grupoCompleto: true };
    expect(resultadoDeCursada({ ...base, resultadoConfirmado: null })).toBe("pendiente");
    expect(resultadoDeCursada({ ...base, resultadoConfirmado: "aprobado" })).toBe("aprobado");
    expect(resultadoDeCursada({ ...base, resultadoConfirmado: "reprobado" })).toBe("reprobado");
  });

  it("el certificado de un grupo que no emite queda suspendido aunque el resultado esté confirmado aprobado", () => {
    const ok = { state: "aprobado" as const, sinResultado: false };
    expect(visibilidadSegun(null, ok)).toBe("valido");
    expect(visibilidadSegun(null, { ...ok, noEmite: true })).toBe("suspendido");
    expect(visibilidadSegun(null, { state: "pendiente", sinResultado: false })).toBe("suspendido");
    expect(visibilidadSegun(new Date(), { ...ok, noEmite: true })).toBe("anulado");
  });

  it("las pestañas se ocultan", () => {
    const base = { esEspecializacion: false, verCursosOffline: false };
    // «Resultado final» (cierre) sigue en un grupo sin evaluaciones
    expect(pestanasPortalGrupo({ tieneEvaluaciones: false })).toEqual(["clases", "cierre", "material"]);
    expect(pestanasDelGrupo({ ...base, tieneEvaluaciones: false, emiteCertificado: false })).toContain("evaluacion");
    expect(pestanasPortalCursada({ tieneEvaluaciones: false })).not.toContain("evaluaciones");
  });
});

describe("recorrido comercial: grupo sin evaluaciones", () => {
  const NOW = new Date("2026-10-29T12:00:00Z");
  const base: CursadaComercial = {
    enrollmentId: "e1",
    contactId: "c1",
    parentEnrollmentId: null,
    courseId: "k1",
    courseName: "Curso",
    courseKind: "curso",
    categoryId: null,
    cohortId: "g1",
    cohortName: "G1",
    startDate: new Date("2026-01-01T00:00:00Z"),
    endDate: new Date("2026-03-01T00:00:00Z"),
    stageKind: "won",
    nuncaDictada: false,
    aprobacion: "sin_datos",
    certificadoVigente: false,
  };
  it("taller cursable sin evaluaciones: sin confirmar no es 'aprobó'; confirmado sí / no", () => {
    const sin = { ...base, edicionDeMarketing: false, courseKind: "taller" as const };
    const est = (c: CursadaComercial) => (historialesComerciales([c], NOW).get("c1") ?? []).map((x) => x.estado);
    expect(est({ ...sin, aprobacion: "pendiente" })).toEqual(["curso_sin_aprobar"]);
    expect(est({ ...sin, aprobacion: "aprobado" })).toEqual(["aprobo"]);
    expect(est({ ...sin, aprobacion: "reprobado" })).toEqual(["curso_sin_aprobar"]);
    // una edición de Marketing sigue sin contar
    expect(est({ ...sin, edicionDeMarketing: true, aprobacion: "aprobado" })).toEqual([]);
  });
});
