import { describe, expect, it } from "vitest";
import {
  configAGuardar,
  grupoEmiteCertificado,
  grupoTieneEvaluaciones,
} from "@/lib/taller-config";
import { resultadoDeCursada } from "@/lib/resultado-de-cursada";
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

  it("sin evaluaciones el grupo terminado no es 'Resultado pendiente'", () => {
    expect(
      resultadoDeCursada({ estadoDelGrupo: "finalizada", resultadoConfirmado: null, tieneEvaluaciones: false })
    ).toBe("sin_evaluacion");
    expect(resultadoDeCursada({ estadoDelGrupo: "finalizada", resultadoConfirmado: null })).toBe("pendiente");
  });

  it("las pestañas se ocultan", () => {
    const base = { esEspecializacion: false, verCursosOffline: false };
    expect(pestanasDelGrupo({ ...base, tieneEvaluaciones: false, emiteCertificado: false })).not.toContain("evaluacion");
    expect(pestanasDelGrupo({ ...base, tieneEvaluaciones: false, emiteCertificado: true })).toContain("evaluacion");
    expect(pestanasPortalGrupo({ tieneEvaluaciones: false })).toEqual(["clases", "material"]);
    expect(pestanasPortalCursada({ tieneEvaluaciones: false })).not.toContain("evaluaciones");
  });
});
