import { requireCapability } from "@/lib/api";
import { resetToAuto } from "@/server/zoom/assignment";
import { manualResponse } from "@/server/zoom/manual-http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * 030 US3 — "Volver a automático": suelta la decisión manual y re-evalúa en
 * el acto con el matcher. 422 `ya_automatica` si no era manual.
 */
export const POST = requireCapability(
  "grabaciones.gestionar",
  async (session, _req: Request, { params }: Ctx) => {
    const { id } = await params;
    const r = await resetToAuto(session.organizationId, id);
    return manualResponse(session.organizationId, id, r);
  }
);
