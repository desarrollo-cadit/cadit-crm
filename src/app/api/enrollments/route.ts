import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { createEnrollment } from "@/server/enrollments";

export const dynamic = "force-dynamic";

const contactSchema = z.object({
  name: z.string().trim().min(1).max(120),
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
  installments: z.number().int().nullable().optional(),
  paymentNotes: z.string().max(4000).nullable().optional(),
  invoiceNumber: z.string().max(60).nullable().optional(),
  receiptNumber: z.string().max(60).nullable().optional(),
  sellerId: z.string().min(1).nullable().optional(),
  companyId: z.string().min(1).nullable().optional(),
});

// 005 (T019, US2, contracts/enrollments.md) — alta comercial de una inscripción.
export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;

  const result = await createEnrollment(session.organizationId, body.data);
  if (!result.ok) return apiError(result.status, result.code, result.message);

  return Response.json({ enrollment: result.enrollment }, { status: 201 });
});
