import { z } from "zod";
import { parseQuery, requireCapability } from "@/lib/api";
import { cierreDePeriodo } from "@/server/finanzas-periodo";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  /** `"2026-08"`. Ausente = el mes anterior, que es el que se cierra (DV-002). */
  mes: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "El período se pide como AAAA-MM")
    .optional(),
  /** DV-005 — Filtro opcional por camada, encima del período. */
  cohortId: z.string().min(1).optional(),
});

/**
 * 026 (FR-006/FR-007) — El cierre de un período: Caja, Devengado y las
 * anulaciones, en un solo pedido.
 *
 * `cobranza.ver` y **no una capacidad nueva**: la pantalla agrega exactamente
 * lo que esa capacidad ya gobierna. Una `finanzas.ver` aparte permitiría
 * concederle a alguien el agregado negándole el detalle —siendo el mismo
 * dato—, y la primera vez que las dos reglas se contradigan gana la que nadie
 * miró.
 *
 * Las tres listas viajan juntas a propósito: salen de la MISMA resolución de
 * período. Pedirlas por separado abriría la puerta a que Caja se arme con
 * agosto y Devengado con septiembre si el filtro cambia entre dos pedidos, y
 * eso es exactamente el descuadre que nadie encuentra.
 *
 * FR-019 — Responde JSON y nada más. No hay `text/csv` ni ningún otro formato
 * de archivo: un export con formato es un contrato con un importador que no
 * controlamos, y se rompe en cierre de mes.
 */
export const GET = requireCapability(
  "cobranza.ver",
  async (session, req: Request) => {
    const query = parseQuery(new URL(req.url), querySchema);
    if (!query.ok) return query.response;

    const cierre = await cierreDePeriodo(session.organizationId, {
      mes: query.data.mes ?? null,
      cohortId: query.data.cohortId ?? null,
    });

    return Response.json({
      periodo: {
        mes: cierre.periodo.mes,
        etiqueta: cierre.periodo.etiqueta,
        desde: cierre.periodo.desde.toISOString(),
        hasta: cierre.periodo.hasta.toISOString(),
        // La zona viaja para que la pantalla muestre cada fecha como la ve la
        // academia: un cobro de las 23:00 del último día del mes es del día
        // siguiente en UTC, y así transcripto cae en el período equivocado.
        timezone: cierre.periodo.timezone,
      },
      caja: cierre.caja,
      devengado: cierre.devengado,
      anulados: cierre.anulados,
    });
  }
);
