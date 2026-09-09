import { z } from "zod";
import { CURRENCIES } from "@/lib/db/schema";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { createEnrollment } from "@/server/enrollments";

export const dynamic = "force-dynamic";

const contactSchema = z.object({
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().max(120).optional(),
  phone: z
    .string()
    .trim()
    .regex(/^\d{7,15}$/, "Teléfono en dígitos, con código de país (ej. 5215512345678)"),
  email: z.string().trim().email().max(200).optional(),
  nationalId: z.string().trim().max(60).optional(),
});

const createSchema = z.object({
  cohortId: z.string().min(1),
  contactId: z.string().min(1).optional(),
  contact: contactSchema.optional(),
  amount: z.number().int().nullable().optional(),
  // 007 — moneda del importe (UYU por defecto; PYG para los alumnos de Paraguay).
  currency: z.enum(CURRENCIES).optional(),
  installments: z.number().int().nullable().optional(),
  paymentNotes: z.string().max(4000).nullable().optional(),
  invoiceNumber: z.string().max(60).nullable().optional(),
  receiptNumber: z.string().max(60).nullable().optional(),
  sellerId: z.string().min(1).nullable().optional(),
  companyId: z.string().min(1).nullable().optional(),
  /**
   * 028 fase 4 (US4, regla 4) — La RECURSADA tras reprobar.
   *
   * Con `parentEnrollmentId` esta alta crea la inscripción **hija** de un
   * módulo contra la cohorte de otra camada, con su propio `amount` y su
   * propio plan de cuotas: es el pago por módulo suelto del camino de
   * recuperación. El intento anterior no se toca — quedó reprobado y esa es la
   * evidencia de por qué hay que recursar (FR-021).
   *
   * No hace falta ningún endpoint nuevo ni ninguna categoría de cobro: una
   * hija es una inscripción como cualquier otra, así que las cuotas de 008 y
   * la Caja del mes de la 026 la toman tal cual (FR-011, SC-006).
   *
   * Quién puede ser madre de quién lo decide `verificarVinculoDeInscripcion`
   * (fase 1), que ya corre dentro de `createEnrollment`: acá sólo se valida la
   * forma.
   */
  parentEnrollmentId: z.string().min(1).nullable().optional(),
});

// 005 (T019, US2, contracts/enrollments.md) — alta comercial de una
// inscripción; acepta monto/cuotas/factura/vendedor, por eso
// `inscripciones.editar` (FR-016) igual que el PATCH en [id]/route.ts —
// soporte no debe poder fijar datos financieros ni al crear ni al editar
// (hallazgo del reviewer, iteración 6).
export const POST = requireCapability(
  "inscripciones.editar",
  async (session, req: Request) => {
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;

  const result = await createEnrollment(session.organizationId, body.data);
  if (!result.ok) return apiError(result.status, result.code, result.message);

  return Response.json({ enrollment: result.enrollment }, { status: 201 });
});
