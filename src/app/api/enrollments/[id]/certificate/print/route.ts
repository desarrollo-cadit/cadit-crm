import { apiError, requireCapability } from "@/lib/api";
import { respuestaCertificadoPdf } from "@/lib/certificado-pdf";
import { certificadoDeInscripcion } from "@/server/certificate-pdf";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 010 (DV-002) → 038 (FR-001) — El certificado de una inscripción, desde la
 * planilla de evaluación.
 *
 * Hasta 038 era un HTML para imprimir con Ctrl+P; ahora es el PDF con el
 * diseño de la academia, el mismo que descarga el alumno. Conserva
 * `evaluacion.ver`, la puerta de la planilla donde está el enlace.
 *
 * Un certificado anulado ya no se entrega ni con marca de agua (FR-007): la
 * planilla dice que está anulado y la verificación pública también.
 */
export const GET = requireCapability(
  "evaluacion.ver",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const cert = await certificadoDeInscripcion(session.organizationId, id);
    if (!cert) {
      return apiError(404, "not_found", "Esta inscripción no tiene un certificado vigente");
    }
    return respuestaCertificadoPdf(cert.vista, cert.curso);
  }
);
