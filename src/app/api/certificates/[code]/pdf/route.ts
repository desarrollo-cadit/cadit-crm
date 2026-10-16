import { apiError, requireCapability } from "@/lib/api";
import { respuestaCertificadoPdf } from "@/lib/certificado-pdf";
import { certificadoPorCodigo } from "@/server/certificate-pdf";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ code: string }> };

/**
 * 038 (FR-015/FR-016) — El PDF de un certificado, desde el LEGAJO.
 *
 * `contactos.ver`: la capacidad que abre el legajo, donde se muestra el
 * código. Un código de otra organización o anulado responde 404 (FR-007).
 */
export const GET = requireCapability(
  "contactos.ver",
  async (session, _req: Request, ctx: Params) => {
    const { code } = await ctx.params;
    const cert = await certificadoPorCodigo(session.organizationId, code);
    if (!cert) return apiError(404, "not_found", "Certificado no encontrado o anulado");
    return respuestaCertificadoPdf(cert.vista, cert.curso);
  }
);
