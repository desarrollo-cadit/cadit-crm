import { requireStudentPortal } from "@/lib/portal-api";
import { studentCertificates } from "@/server/student-portal";

export const dynamic = "force-dynamic";

/** 015 (US6, FR-009) — Mis certificados, emitidos y anulados. */
export const GET = requireStudentPortal(async (ctx) => {
  const certificates = await studentCertificates(ctx.organizationId, ctx.contactId);
  return Response.json({ certificates });
});
