import { apiError, withOrganization } from "@/lib/api";
import { corsPreflight, withCors } from "@/lib/cors";
import { checkRateLimit, clientIp, publicFormRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { verifyCertificate } from "@/server/certificates";
import { resolveSoleOrganizationId } from "@/server/public-catalog";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ code: string }> };

/** 010 — preflight: la verificación se consume desde el sitio comercial. */
export function OPTIONS(req: Request) {
  return corsPreflight(req);
}

/**
 * 010 (FR-009) — Verificación PÚBLICA de un certificado por su código.
 *
 * Expone SOLO alumno, curso, cohorte, fecha y horas. Nunca notas, nunca
 * asistencia, nunca teléfono ni correo: quien verifica suele ser un
 * empleador, y no tiene por qué recibir el legajo del alumno.
 *
 * Lleva límite por IP aunque sea una lectura: el código es aleatorio (FR-010)
 * pero un límite corta cualquier intento de recorrerlo por fuerza bruta, que
 * es la única vía que quedaría para listar egresados.
 *
 * Un certificado ANULADO responde 200 con `valid: false`, no 404. Decir "no
 * existe" sobre algo que sí se emitió es peor que decir "se anuló".
 */
/**
 * 012 (T028, CORREGIDO 2026-09-01) — Sin sesión, pero CON alcance.
 *
 * Al encender RLS la app pasó a conectarse con un rol sujeto a las políticas,
 * y esta ruta corría sin declarar `app.current_org`: la base le devolvía cero
 * filas en silencio. "Sin sesión" nunca quiso decir "sin alcance".
 */
export const GET = withOrganization(
  "public:certificado",
  async (_req: Request, _ctx: Params) => resolveSoleOrganizationId(),
  () =>
    Response.json(
      { error: { code: "no_organization", message: "Verificación no disponible" } },
      { status: 503 }
    ),
  async (_organizationId, req: Request, ctx: Params) => {
  const rl = publicFormRateLimit();
  if (!checkRateLimit(`cert-verify:${clientIp(req)}`, rl).allowed) {
    return withCors(req, tooManyRequests(rl.windowMs));
  }

  const { code } = await ctx.params;
  const certificate = await verifyCertificate(code);
  if (!certificate) {
    return withCors(req, apiError(404, "not_found", "Certificado no encontrado"));
  }

  return withCors(
    req,
    Response.json(
      { certificate },
      { headers: { "Cache-Control": "public, max-age=60" } }
    )
  );
  }
);
