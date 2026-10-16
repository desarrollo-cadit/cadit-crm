import { apiError } from "@/lib/api";
import { respuestaCertificadoPdf } from "@/lib/certificado-pdf";
import { requireStudentPortal } from "@/lib/portal-api";
import { certificadoDelAlumno } from "@/server/certificate-pdf";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ code: string }> };

/**
 * 038 (FR-015/FR-016) — "Descargar PDF" en Mis certificados.
 *
 * **404 y no 403** para un código ajeno, inexistente o anulado (FR-007): el
 * contacto sale de la sesión y entra en la consulta, así que lo ajeno ni se
 * encuentra. Es el MISMO PDF que descarga el staff (una sola función de
 * render).
 */
export const GET = requireStudentPortal(async (ctx, _req: Request, routeCtx: Params) => {
  const { code } = await routeCtx.params;
  const cert = await certificadoDelAlumno(ctx.organizationId, ctx.contactId, code);
  if (!cert) return apiError(404, "not_found", "Certificado no encontrado");
  return respuestaCertificadoPdf(cert.vista, cert.curso);
});
