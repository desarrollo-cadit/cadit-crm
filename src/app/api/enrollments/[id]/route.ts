import { z } from "zod";
import { minorAmount } from "@/lib/money-schema";
import { CURRENCIES } from "@/lib/db/schema";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { updateEnrollmentCommercial } from "@/server/enrollments";
import { cancelarInscripcion } from "@/server/enrollment-cancel";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  /** En centésimos (DV-008, `src/lib/money.ts`). */
  amount: minorAmount.nullable().optional(),
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
 * SOLO datos comerciales, por eso `inscripciones.editar` (FR-016) — soporte no
 * edita datos financieros.
 */
export const PATCH = requireCapability(
  "inscripciones.editar",
  async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;

  const result = await updateEnrollmentCommercial(
    session.organizationId,
    id,
    body.data,
    session.userId
  );
  if (!result.ok) return apiError(result.status, result.code, result.message);

  return Response.json({ enrollment: result.enrollment });
});

/**
 * Cancelar (borrar) una inscripción hecha por error. Misma capacidad que el
 * alta (`POST /api/enrollments`): quien puede inscribir puede deshacer su
 * error de carga. La barrera es `cancelarInscripcion`, que decide de nuevo
 * dentro de la transacción con las filas bloqueadas: con historial (pagos,
 * asistencia, notas, entregas, correcciones, certificados) responde 409
 * `inscripcion_con_historial` y no toca nada.
 */
export const DELETE = requireCapability(
  "inscripciones.editar",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const result = await cancelarInscripcion(session.organizationId, id);
    if (!result.ok) {
      return Response.json(
        { error: { code: result.code, message: result.message }, detalle: result.detalle ?? null },
        { status: result.status }
      );
    }
    return Response.json({ ok: true, motivo: result.motivo, leadCreado: result.leadCreado });
  }
);
