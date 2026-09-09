import { apiError, parseBody, withOrganization } from "@/lib/api";
import { corsPreflight, withCors } from "@/lib/cors";
import {
  checkRateLimit,
  clientIp,
  publicFormRateLimit,
  tooManyRequests,
} from "@/lib/rate-limit";
import { publicLeadSchema, submitIntakeForm } from "@/server/intake-forms";
import { resolveSoleOrganizationId } from "@/server/public-catalog";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ formId: string }> };

/** 007 — preflight del navegador cuando el sitio postea desde otro dominio. */
export function OPTIONS(req: Request) {
  return corsPreflight(req);
}

/**
 * 005 iteración 3 — endpoint público (SIN autenticación, mismo patrón que
 * `/api/public/courses`) para que el sitio externo del dueño mande los datos
 * de un formulario de captación embebido. 404 si el formulario no existe en
 * la única organización de la instancia (mono-tenant, DV-010).
 *
 * 005 iteración 8 — sigue siendo la puerta de las campañas con nombre
 * propio ("Feria 2026"); para la página de un curso del catálogo la puerta
 * es `/api/public/courses/<slug>/submit`, que no necesita provisionar nada.
 * Las dos comparten `publicLeadSchema`: un solo contrato de body.
 */
/**
 * 012 (T028, CORREGIDO 2026-09-01) — Sin sesión, pero CON alcance.
 *
 * Un formulario público que corre sin `app.current_org` no solo LEE cero
 * filas: tampoco puede ESCRIBIR ninguna. Un lead que llega de la web se
 * perdería en silencio, con un 201 de vuelta al navegador.
 */
export const POST = withOrganization(
  "public:lead-formulario",
  async (_req: Request, _ctx: Params) => resolveSoleOrganizationId(),
  () =>
    Response.json(
      { error: { code: "no_organization", message: "Formulario no disponible" } },
      { status: 503 }
    ),
  async (_organizationId: string, req: Request, ctx: Params) => {
  const { formId } = await ctx.params;

  // 007 — mismo balde por IP que la puerta por curso: el límite es del
  // formulario público, no de una ruta puntual.
  const rl = publicFormRateLimit();
  if (!checkRateLimit(`public-form:${clientIp(req)}`, rl).allowed) {
    return withCors(req, tooManyRequests(rl.windowMs));
  }

  const body = await parseBody(req, publicLeadSchema);
  if (!body.ok) return withCors(req, body.response);

  const result = await submitIntakeForm(formId, {
    name: body.data.name,
    lastName: body.data.lastName ?? null,
    phone: body.data.phone,
    email: body.data.email ?? null,
    notes: body.data.message ?? null,
  });
  if (!result.ok) {
    return withCors(req, apiError(result.status, result.code, result.message));
  }

  return withCors(req, Response.json({ ok: true }, { status: 201 }));
  }
);
