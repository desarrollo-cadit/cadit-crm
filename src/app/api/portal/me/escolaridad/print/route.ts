import { apiError } from "@/lib/api";
import { requireStudentPortal } from "@/lib/portal-api";
import { respuestaPdf } from "@/lib/escolaridad-pdf";
import { escolaridadDeContacto } from "@/server/transcript";

export const dynamic = "force-dynamic";

/**
 * 031 (T040, DV-011) — "Mi escolaridad", desde el portal del ALUMNO.
 *
 * Sin parámetros: el contacto sale de la sesión y de ningún otro lado, así que
 * no hay id ajeno que probar. El PDF es EL MISMO que descarga el staff
 * (una sola función de render). Sin cursadas, la propia escolaridad igual
 * existe y lo dice — al alumno no se le contesta un 404 sobre sí mismo.
 */
export const GET = requireStudentPortal(async (ctx) => {
  const r = await escolaridadDeContacto(ctx.organizationId, ctx.contactId);
  if (!r) return apiError(404, "not_found", "No encontramos tu escolaridad");
  return respuestaPdf(r.escolaridad, r.timezone);
});
