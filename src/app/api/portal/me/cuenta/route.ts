import { apiError } from "@/lib/api";
import { requireStudentPortal } from "@/lib/portal-api";
import { studentAccount } from "@/server/student-portal";

export const dynamic = "force-dynamic";

/**
 * 015 (US7, FR-006) — Mi estado de cuenta.
 *
 * DV-002 — La deuda vencida se muestra. Ocultarla no la hace desaparecer: solo
 * garantiza la llamada que este portal vino a evitar.
 */
export const GET = requireStudentPortal(async (ctx) => {
  const data = await studentAccount(ctx.organizationId, ctx.contactId);
  if (!data) return apiError(404, "not_found", "No encontramos tu ficha");
  return Response.json(data);
});
