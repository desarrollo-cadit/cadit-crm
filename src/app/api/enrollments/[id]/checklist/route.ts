import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { updateChecklist } from "@/server/enrollments";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const nowOrNull = z.literal("now").nullable();

const patchSchema = z.object({
  termsEmailSentAt: nowOrNull.optional(),
  softwareInstalledAt: nowOrNull.optional(),
  hadOwnLicense: z.boolean().optional(),
  academiaOnlineAccessAt: nowOrNull.optional(),
});

// 005 (T025, US3, contracts/cohort-roster.md) — accesible por CUALQUIER rol
// (soporte y ventas/coordinación comparten esta acción, FR-014).
export const PATCH = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;

  const updated = await updateChecklist(session.organizationId, id, body.data);
  if (!updated) return apiError(404, "not_found", "Inscripción no encontrada");

  return Response.json({
    enrollment: {
      id: updated.id,
      checklist: {
        termsEmailSentAt: updated.termsEmailSentAt?.toISOString() ?? null,
        softwareInstalledAt: updated.softwareInstalledAt?.toISOString() ?? null,
        hadOwnLicense: updated.hadOwnLicense,
        academiaOnlineAccessAt: updated.academiaOnlineAccessAt?.toISOString() ?? null,
      },
    },
  });
});
