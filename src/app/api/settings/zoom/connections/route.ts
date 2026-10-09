import { parseBody, requireCapability } from "@/lib/api";
import {
  createConnection,
  createConnectionSchema,
  listConnections,
} from "@/server/zoom/connections";
import { connErrorResponse } from "@/server/zoom/http";

export const dynamic = "force-dynamic";

/**
 * 030 US4 — Conexiones de Zoom (una por app Server-to-Server OAuth).
 *
 * `configuracion.editar`, igual que las credenciales de WhatsApp: es
 * configuración de la plataforma con secretos (DV-009). El secreto nunca
 * vuelve: solo `clientSecretLast4`.
 */
export const GET = requireCapability("configuracion.editar", async (session) => {
  const connections = await listConnections(session.organizationId);
  return Response.json({ connections });
});

export const POST = requireCapability("configuracion.editar", async (session, req: Request) => {
  const body = await parseBody(req, createConnectionSchema);
  if (!body.ok) return body.response;
  const result = await createConnection(session.organizationId, body.data, session.userId);
  if (!result.ok) return connErrorResponse(result);
  return Response.json({ connection: result.data }, { status: 201 });
});
