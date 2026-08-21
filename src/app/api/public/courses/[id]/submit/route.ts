import { apiError, parseBody } from "@/lib/api";
import { corsPreflight, withCors } from "@/lib/cors";
import {
  checkRateLimit,
  clientIp,
  publicFormRateLimit,
  tooManyRequests,
} from "@/lib/rate-limit";
import { publicLeadSchema, submitCourseInterest } from "@/server/intake-forms";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** 007 — preflight del navegador cuando el sitio postea desde otro dominio. */
export function OPTIONS(req: Request) {
  return corsPreflight(req);
}

/**
 * 005 iteración 8 — captación pública POR CURSO (sin auth, mismo patrón que
 * el resto de `/api/public`). El sitio comercial ya consume el catálogo y
 * tiene el `slug` de cada curso, así que la página de un curso postea acá
 * directamente y el lead entra atribuido a ESE curso — sin provisionar ni
 * mantener sincronizado un id de formulario por curso.
 *
 * El segmento acepta slug o id interno, igual que el GET del detalle.
 * 404 si el curso no existe o no está publicado en la única organización de
 * la instancia (mono-tenant, DV-010).
 */
export async function POST(req: Request, ctx: Params) {
  const { id } = await ctx.params;

  // 007 — El límite corre ANTES de tocar la base: es lo que protege de un
  // script que dispara envíos, con o sin navegador (CORS no frena a curl).
  const rl = publicFormRateLimit();
  if (!checkRateLimit(`public-form:${clientIp(req)}`, rl).allowed) {
    return withCors(req, tooManyRequests(rl.windowMs));
  }

  const body = await parseBody(req, publicLeadSchema);
  if (!body.ok) return withCors(req, body.response);

  const result = await submitCourseInterest(id, {
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
