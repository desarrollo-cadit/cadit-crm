import { z } from "zod";
import { apiError, parseBody, parseQuery, requireCapability } from "@/lib/api";
import { CURRENCIES } from "@/lib/db/schema";
import { positiveMinorAmount } from "@/lib/money-schema";
import { pasarAVentaUnica, ventaDeEmpresaEnGrupo } from "@/server/venta-empresa";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 2026-11-06 — Qué hay de una empresa en este grupo (para el formulario de
 * inscripción): a qué venta se sumaría un alumno nuevo. `inscripciones.ver`.
 */
const querySchema = z.object({ companyId: z.string().min(1) }).strict();

export const GET = requireCapability("inscripciones.ver", async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const query = parseQuery(new URL(req.url), querySchema);
  if (!query.ok) return query.response;
  return Response.json(await ventaDeEmpresaEnGrupo(session.organizationId, query.data.companyId, id));
});

const bodySchema = z
  .object({
    companyId: z.string().min(1),
    /** La inscripción que lleva el total, las cuotas y los pagos de la empresa. */
    titularId: z.string().min(1),
    /** Los alumnos que quedan cubiertos; vacío o ausente = todos los demás de la empresa en el grupo. */
    cubiertasIds: z.array(z.string().min(1)).max(500).optional(),
    /** En centésimos: el total que se le factura a la empresa por el grupo. */
    total: positiveMinorAmount,
    currency: z.enum(CURRENCIES),
  })
  .strict();

/**
 * 2026-11-06 — Pasa a los alumnos de una empresa en un grupo a UNA venta: el
 * total, las cuotas y los pagos se gestionan una vez, en la titular.
 *
 * `cobranza.registrar`: definir el total de la venta es del mismo orden que
 * armar el plan y cargar pagos (Administración lo hace desde Facturación). Se
 * rechaza (409) si alguna inscripción ya tiene cuotas o pagos por persona.
 */
export const POST = requireCapability("cobranza.registrar", async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;

  const r = await pasarAVentaUnica(session.organizationId, { ...body.data, cohortId: id });
  if (!r.ok) return apiError(r.status, r.code, r.message);
  return Response.json({ titularId: r.titularId, cubiertas: r.cubiertas }, { status: 201 });
});
