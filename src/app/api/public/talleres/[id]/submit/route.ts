import { apiError, parseBody, withOrganization } from "@/lib/api";
import { corsPreflight, withCors } from "@/lib/cors";
import {
  checkRateLimit,
  clientIp,
  publicFormRateLimit,
  tooManyRequests,
} from "@/lib/rate-limit";
import { resolveSoleOrganizationId } from "@/server/public-catalog";
import {
  publicWorkshopRegistrationSchema,
  scheduleConfirmation,
  submitPublicWorkshopRegistration,
} from "@/server/workshops";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** 033 — preflight del navegador cuando la web postea desde otro dominio. */
export function OPTIONS(req: Request) {
  return corsPreflight(req);
}

/**
 * 033 (FR-006..FR-010) — Inscripción pública a una edición de taller.
 *
 * Mismo contrato de body que los formularios de cursos (`publicLeadSchema`),
 * más la empresa opcional (`publicWorkshopRegistrationSchema`), y
 * el MISMO límite por origen (`publicFormRateLimit`, con la misma clave): un
 * script que dispara envíos no gana cupo extra por cambiar de puerta.
 *
 * - 201: anotado. 200: ya estaba anotado (reenvío, sin duplicar).
 * - 409 con `code` (`inscripciones_cerradas`, `taller_cancelado`,
 *   `taller_realizado`, `sin_lugares`) y un `message` que la web muestra tal cual.
 * - 404: la edición no existe o su taller no está publicado.
 */
export const POST = withOrganization(
  "public:taller-inscripcion",
  async (_req: Request, _ctx: Params) => resolveSoleOrganizationId(),
  () =>
    Response.json(
      { error: { code: "no_organization", message: "Formulario no disponible" } },
      { status: 503 }
    ),
  async (organizationId: string, req: Request, ctx: Params) => {
    const { id } = await ctx.params;

    // El límite corre ANTES de tocar la base (CORS no frena a curl).
    const rl = publicFormRateLimit();
    if (!checkRateLimit(`public-form:${clientIp(req)}`, rl).allowed) {
      return withCors(req, tooManyRequests(rl.windowMs));
    }

    const body = await parseBody(req, publicWorkshopRegistrationSchema);
    if (!body.ok) return withCors(req, body.response);

    const result = await submitPublicWorkshopRegistration(organizationId, id, {
      name: body.data.name,
      lastName: body.data.lastName ?? null,
      phone: body.data.phone,
      email: body.data.email ?? null,
      notes: body.data.message ?? null,
      company: body.data.company ?? null,
    });
    if (!result.ok) {
      return withCors(req, apiError(result.status, result.code, result.message));
    }

    // 033 (FR-019) — la confirmación sale después del commit y nunca bloquea.
    if (result.data.created) scheduleConfirmation(organizationId, result.data.registrationId);

    return withCors(
      req,
      Response.json(
        { ok: true, alreadyRegistered: !result.data.created },
        { status: result.data.created ? 201 : 200 }
      )
    );
  }
);
