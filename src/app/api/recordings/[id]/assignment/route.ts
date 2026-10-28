import { z } from "zod";
import { parseBody, requireCapability } from "@/lib/api";
import { assignManually, unassign } from "@/server/zoom/assignment";
import { manualResponse } from "@/server/zoom/manual-http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z
  .object({
    /** Una sola clase (la forma de siempre). */
    classSessionId: z.string().min(1).optional(),
    /** 2026-10-28 — Varias clases: una grabación compartida, una por grupo. */
    classSessionIds: z.array(z.string().min(1)).min(1).max(20).optional(),
    /** Confirmación explícita para pisar un enlace manual u otra grabación. */
    replace: z.boolean().optional(),
  })
  .strict()
  .refine((b) => (b.classSessionId === undefined) !== (b.classSessionIds === undefined), {
    message: "Indicá la clase (classSessionId) o las clases (classSessionIds), una de las dos.",
  });

/**
 * 030 US3 — Asignar a mano una grabación a una o varias clases de cualquier
 * grupo (el conjunto reemplaza al que tenía). Queda `manual/asignada`:
 * ninguna sincronización la mueve después (SC-005). Si una clase ya tiene un
 * enlace manual u otra grabación → 409 `requiere_reemplazo` con QUÉ se
 * reemplazaría y en qué clase; con `replace: true` se pisa.
 */
export const PUT = requireCapability(
  "grabaciones.gestionar",
  async (session, req: Request, { params }: Ctx) => {
    const { id } = await params;
    const body = await parseBody(req, bodySchema);
    if (!body.ok) return body.response;
    const clases = body.data.classSessionIds ?? [body.data.classSessionId!];
    const r = await assignManually(session.organizationId, id, clases, {
      replace: body.data.replace ?? false,
      userId: session.userId,
    });
    return manualResponse(session.organizationId, id, r);
  }
);

/** 030 US3 — Desasignar: `manual/sin_clase`; cada clase pierde el enlace solo si era el de esta grabación. */
export const DELETE = requireCapability(
  "grabaciones.gestionar",
  async (session, _req: Request, { params }: Ctx) => {
    const { id } = await params;
    const r = await unassign(session.organizationId, id, session.userId);
    return manualResponse(session.organizationId, id, r);
  }
);
