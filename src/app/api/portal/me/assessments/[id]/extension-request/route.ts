import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { requireStudentPortal } from "@/lib/portal-api";
import { pedidoDelAlumno, pedirProrroga } from "@/server/extension-requests";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 0083 — El pedido de prórroga del ALUMNO para una evaluación suya.
 *
 * CONTENIDO (043): con el acceso vencido no hay pedido que hacer ni que mirar,
 * y responde 404 como si la evaluación no existiera. Una evaluación de otra
 * persona sale igual: 404, jamás 403.
 */
export const GET = requireStudentPortal(async (ctx, _req: Request, { params }: Params) => {
  const { id } = await params;
  const data = await pedidoDelAlumno(ctx.organizationId, ctx.contactId, id);
  if (!data) return apiError(404, "not_found", "Evaluación no encontrada");
  return Response.json(data);
});

const pedidoSchema = z.object({
  /** Un día; el servidor lo cierra a las 23:59 de la academia. */
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha va con formato AAAA-MM-DD"),
  motivo: z.string().trim().min(3, "Contanos por qué necesitás más tiempo.").max(1000),
});

export const POST = requireStudentPortal(async (ctx, req: Request, { params }: Params) => {
  const { id } = await params;
  const body = await parseBody(req, pedidoSchema);
  if (!body.ok) return body.response;

  const r = await pedirProrroga(ctx.organizationId, ctx.contactId, id, body.data);
  if (!r.ok) return apiError(r.status, r.code, r.message);
  return Response.json({ pedido: r.data }, { status: 201 });
});
