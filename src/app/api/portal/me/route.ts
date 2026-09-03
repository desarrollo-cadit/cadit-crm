import { apiError } from "@/lib/api";
import { requireStudentPortal } from "@/lib/portal-api";
import { studentOverview } from "@/server/student-portal";

export const dynamic = "force-dynamic";

/**
 * 015 (US1-US7) — Todo lo del alumno, en un pedido.
 *
 * Superficie propia (FR-004): **no reusa `/api/contacts/[id]/record`**. Ese
 * endpoint responde a coordinación sobre una persona y trae cédula, teléfono y
 * el vendedor de la inscripción. El día que alguien le agregue un campo más,
 * ese campo aparecería acá sin que nadie lo decida.
 */
export const GET = requireStudentPortal(async (ctx) => {
  const data = await studentOverview(ctx.organizationId, ctx.contactId);
  if (!data) return apiError(404, "not_found", "No encontramos tu ficha");
  return Response.json(data);
});
