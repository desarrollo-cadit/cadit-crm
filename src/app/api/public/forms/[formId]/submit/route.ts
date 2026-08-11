import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { submitIntakeForm } from "@/server/intake-forms";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ formId: string }> };

const submitSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z
    .string()
    .trim()
    .regex(/^\d{7,15}$/, "Teléfono en dígitos, con código de país (ej. 5215512345678)"),
  email: z.string().trim().email().max(200).optional(),
  // 005 iteración 4 (feedback en vivo: "el campo mensaje que llena el
  // usuario en mi web") — nombre de cara al formulario externo; se guarda
  // en contact.notes (mismo campo que ya se ve en la tabla de contactos).
  message: z.string().max(4000).optional(),
});

/**
 * 005 iteración 3 — endpoint público (SIN autenticación, mismo patrón que
 * `/api/public/courses`) para que el sitio externo del dueño mande los datos
 * de un formulario de captación embebido. 404 si el formulario no existe en
 * la única organización de la instancia (mono-tenant, DV-010).
 */
export async function POST(req: Request, ctx: Params) {
  const { formId } = await ctx.params;

  const body = await parseBody(req, submitSchema);
  if (!body.ok) return body.response;

  const result = await submitIntakeForm(formId, {
    name: body.data.name,
    phone: body.data.phone,
    email: body.data.email ?? null,
    notes: body.data.message ?? null,
  });
  if (!result.ok) {
    return apiError(result.status, result.code, result.message);
  }

  return Response.json({ ok: true }, { status: 201 });
}
