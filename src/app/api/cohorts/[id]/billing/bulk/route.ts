import { z } from "zod";
import { parseBody, requireCapability } from "@/lib/api";
import {
  applyBillingToBatch,
  enrollmentIdsDeCohorte,
  previewLote,
} from "@/server/billing-bulk";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 022 (FR-006) — La acción con más alcance de todo el sistema.
 *
 * Un lote mal armado toca la plata de decenas de personas de una sola vez, así
 * que exige `cobranza.editar` — la misma capacidad que registrar un pago, no
 * una más laxa por ser "una carga masiva".
 */
export const GET = requireCapability(
  "cobranza.ver",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    return Response.json(await previewLote(session.organizationId, id));
  }
);

/**
 * El modo es una unión discriminada y **el cliente lo declara**: el servidor no
 * deduce si una inscripción ya se cobró. Con 152 facturas ya cargadas en la
 * base, deducirlo mal significa reclamarle a alguien que ya pagó.
 */
const bulkSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("cobrada"),
    enrollmentIds: z.array(z.string().min(1)).max(500).optional(),
    paidAt: z.coerce.date(),
    method: z.enum(["efectivo", "transferencia", "tarjeta", "otro"]),
  }),
  z.object({
    kind: z.literal("plan"),
    enrollmentIds: z.array(z.string().min(1)).max(500).optional(),
    // 24 cuotas es más de lo que una academia usa; el tope está para que un
    // error de tipeo no genere 3000 filas.
    count: z.number().int().min(1).max(24),
    firstDueDate: z.coerce.date(),
  }),
]);

export const POST = requireCapability(
  "cobranza.editar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const body = await parseBody(req, bulkSchema);
    if (!body.ok) return body.response;

    /**
     * Sin lista explícita, el lote es LA COHORTE. Es el caso real —"cargar la
     * cobranza de esta cohorte"— y obligar a mandar 24 identificadores desde
     * el navegador solo agregaría una forma de equivocarse.
     */
    const enrollmentIds =
      body.data.enrollmentIds && body.data.enrollmentIds.length > 0
        ? body.data.enrollmentIds
        : await enrollmentIdsDeCohorte(session.organizationId, id);
    const modo =
      body.data.kind === "cobrada"
        ? ({
            kind: "cobrada" as const,
            paidAt: body.data.paidAt,
            method: body.data.method,
          })
        : ({
            kind: "plan" as const,
            count: body.data.count,
            firstDueDate: body.data.firstDueDate,
          });

    const resultado = await applyBillingToBatch(
      session.organizationId,
      enrollmentIds,
      modo,
      session.userId
    );

    // El `id` de la cohorte viaja para que la pantalla sepa qué refrescar; el
    // lote se identifica por inscripciones, no por cohorte, así que se puede
    // aplicar a una selección parcial.
    return Response.json({ cohortId: id, ...resultado });
  }
);
