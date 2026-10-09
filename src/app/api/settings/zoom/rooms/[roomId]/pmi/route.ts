import { requireCapability } from "@/lib/api";
import { adoptZoomPmiForRoom } from "@/server/zoom/connections";
import { connErrorResponse } from "@/server/zoom/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ roomId: string }> };

/**
 * 030 (addendum) — "Actualizar enlace del aula a la sala personal de Zoom".
 *
 * Un clic explícito y nunca un efecto colateral de vincular: el enlace del
 * aula es lo que abre el alumno, y reescribirlo en silencio cambia a dónde
 * entra una clase en curso. El PMI se vuelve a pedir a Zoom acá mismo.
 */
export const POST = requireCapability(
  "configuracion.editar",
  async (session, _req: Request, { params }: Ctx) => {
    const { roomId } = await params;
    const result = await adoptZoomPmiForRoom(session.organizationId, roomId);
    if (!result.ok) return connErrorResponse(result);
    return Response.json(result.data);
  }
);
