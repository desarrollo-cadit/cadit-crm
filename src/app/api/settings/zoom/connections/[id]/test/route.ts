import { requireCapability } from "@/lib/api";
import { testConnection } from "@/server/zoom/connections";
import { connErrorResponse } from "@/server/zoom/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * 030 US4 — "Probar": lista los usuarios de la cuenta de Zoom.
 *
 * Un fallo de Zoom responde 200 `{ ok: false, error, message }`: no es un
 * fallo del CRM, es el resultado de la prueba, y la pantalla lo muestra tal
 * cual. El mensaje es propio; nunca la respuesta cruda de Zoom.
 */
export const POST = requireCapability(
  "configuracion.editar",
  async (session, _req: Request, { params }: Ctx) => {
    const { id } = await params;
    const result = await testConnection(session.organizationId, id);
    if (!result.ok) return connErrorResponse(result);
    return Response.json(result.data);
  }
);
