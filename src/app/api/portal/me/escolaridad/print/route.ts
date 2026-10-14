import { apiError } from "@/lib/api";
import { requireStudentPortal } from "@/lib/portal-api";
import { renderEscolaridadHtml } from "@/lib/escolaridad";
import { escolaridadDeContacto } from "@/server/transcript";

export const dynamic = "force-dynamic";

/**
 * 031 (T040, DV-011) — "Mi escolaridad", desde el portal del ALUMNO.
 *
 * Sin parámetros: el contacto sale de la sesión y de ningún otro lado, así que
 * no hay id ajeno que probar. El documento es EL MISMO que imprime el staff
 * (una sola función de render). Sin cursadas, la propia escolaridad igual
 * existe y lo dice — al alumno no se le contesta un 404 sobre sí mismo.
 */
export const GET = requireStudentPortal(async (ctx) => {
  const r = await escolaridadDeContacto(ctx.organizationId, ctx.contactId);
  if (!r) return apiError(404, "not_found", "No encontramos tu escolaridad");
  return new Response(renderEscolaridadHtml(r.escolaridad, r.timezone), {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
});
