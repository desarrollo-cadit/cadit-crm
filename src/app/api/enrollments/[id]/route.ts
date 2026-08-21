import { z } from "zod";
import { CURRENCIES } from "@/lib/db/schema";
import { apiError, parseBody, requireFullAccess } from "@/lib/api";
import { updateEnrollmentCommercial } from "@/server/enrollments";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  amount: z.number().int().nullable().optional(),
  // 007 — moneda del importe (UYU por defecto; PYG para los alumnos de Paraguay).
  currency: z.enum(CURRENCIES).optional(),
  installments: z.number().int().min(0).nullable().optional(),
  paymentNotes: z.string().max(2000).nullable().optional(),
  nationalId: z.string().max(120).nullable().optional(),
  invoiceNumber: z.string().max(120).nullable().optional(),
  receiptNumber: z.string().max(120).nullable().optional(),
  sellerId: z.string().min(1).nullable().optional(),
  companyId: z.string().min(1).nullable().optional(),
});

/**
 * 005 iteración 2 — edita los datos comerciales de una inscripción ya
 * creada (feedback en vivo: solo se podían fijar al inscribir). Distinto de
 * `/api/enrollments/[id]/checklist` (onboarding, cualquier rol) y
 * `/api/enrollments/[id]/license` (asignación de licencia): esta ruta es
 * SOLO datos comerciales, por eso `requireFullAccess` (FR-016) — soporte no
 * edita datos financieros.
 */
export const PATCH = requireFullAccess(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;

  const result = await updateEnrollmentCommercial(session.organizationId, id, body.data);
  if (!result.ok) return apiError(result.status, result.code, result.message);

  return Response.json({ enrollment: result.enrollment });
});
