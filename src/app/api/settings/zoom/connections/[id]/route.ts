import { parseBody, requireCapability } from "@/lib/api";
import { updateConnection, updateConnectionSchema } from "@/server/zoom/connections";
import { connErrorResponse } from "@/server/zoom/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * 030 US4 — Editar o archivar una conexión. `clientSecret` vacío o ausente
 * conserva el anterior; cambiar credenciales la deja "sin probar".
 *
 * Sin DELETE a propósito: una conexión con grabaciones se ARCHIVA (deja de
 * sincronizarse y sus grabaciones siguen listadas).
 */
export const PATCH = requireCapability(
  "configuracion.editar",
  async (session, req: Request, { params }: Ctx) => {
    const { id } = await params;
    const body = await parseBody(req, updateConnectionSchema);
    if (!body.ok) return body.response;
    const result = await updateConnection(session.organizationId, id, body.data);
    if (!result.ok) return connErrorResponse(result);
    return Response.json({ connection: result.data });
  }
);
