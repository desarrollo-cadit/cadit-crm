import { z } from "zod";
import { parseBody, requireCapability } from "@/lib/api";
import { assignManually, unassign } from "@/server/zoom/assignment";
import { manualResponse } from "@/server/zoom/manual-http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z
  .object({
    classSessionId: z.string().min(1),
    /** Confirmación explícita para pisar un enlace manual u otra grabación. */
    replace: z.boolean().optional(),
  })
  .strict();

/**
 * 030 US3 — Asignar a mano una grabación a una clase de cualquier cohorte.
 * Queda `manual/asignada`: ninguna sincronización la mueve después (SC-005).
 * Si la clase ya tiene un enlace manual u otra grabación → 409
 * `requiere_reemplazo` con QUÉ se reemplazaría; con `replace: true` se pisa.
 */
export const PUT = requireCapability(
  "grabaciones.gestionar",
  async (session, req: Request, { params }: Ctx) => {
    const { id } = await params;
    const body = await parseBody(req, bodySchema);
    if (!body.ok) return body.response;
    const r = await assignManually(session.organizationId, id, body.data.classSessionId, {
      replace: body.data.replace ?? false,
      userId: session.userId,
    });
    return manualResponse(session.organizationId, id, r);
  }
);

/** 030 US3 — Desasignar: `manual/sin_clase`; la clase pierde el enlace solo si era el de esta grabación. */
export const DELETE = requireCapability(
  "grabaciones.gestionar",
  async (session, _req: Request, { params }: Ctx) => {
    const { id } = await params;
    const r = await unassign(session.organizationId, id, session.userId);
    return manualResponse(session.organizationId, id, r);
  }
);
