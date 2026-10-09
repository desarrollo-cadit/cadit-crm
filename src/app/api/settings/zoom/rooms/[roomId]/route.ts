import { parseBody, requireCapability } from "@/lib/api";
import { linkRoom, linkRoomSchema } from "@/server/zoom/connections";
import { connErrorResponse } from "@/server/zoom/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ roomId: string }> };

/**
 * 030 US4 — Vincula un aula a un usuario de Zoom de una conexión, o la
 * desvincula con `{ connectionId: null }`. Solo se sincronizan los usuarios
 * vinculados a un aula ACTIVA (decisión del dueño, DV-012).
 */
export const PUT = requireCapability(
  "configuracion.editar",
  async (session, req: Request, { params }: Ctx) => {
    const { roomId } = await params;
    const body = await parseBody(req, linkRoomSchema);
    if (!body.ok) return body.response;
    const link =
      body.data.connectionId === null
        ? null
        : {
            connectionId: body.data.connectionId,
            zoomUserId: body.data.zoomUserId,
            zoomUserEmail: body.data.zoomUserEmail ?? null,
          };
    const result = await linkRoom(session.organizationId, roomId, link);
    if (!result.ok) return connErrorResponse(result);
    return Response.json({ ok: true });
  }
);
