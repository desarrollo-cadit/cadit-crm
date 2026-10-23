import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
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

// 005 (T025, US3, contracts/cohort-roster.md) — soporte y coordinación
// comparten esta acción (FR-014). 040 (DV-001) — `inscripciones.seguimiento`:
// el rol Ventas ve el checklist pero no lo tilda.
export const PATCH = requireCapability(
  "inscripciones.seguimiento",
  async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;

  // 2026-10-23 — Marcar "Tenía licencia propia" con una licencia individual
  // asignada responde 409 `licencia_asignada` (que la liberen primero).
  const result = await updateChecklist(session.organizationId, id, body.data);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  const updated = result.enrollment;

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
