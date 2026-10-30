import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { sessionCapabilities } from "@/lib/capabilities";
import { reprogramarClase } from "@/server/class-changes";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const HORA = z.string().regex(/^\d{1,2}:\d{2}$/, "Hora en formato HH:MM");
const DIA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha en formato AAAA-MM-DD");

/** 2026-10-30 — Qué hacer con la entrega final si el reemplazo mueve el fin. */
const opcionDeEntregaSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("mantener") }),
  z.object({ tipo: z.literal("correr") }),
  z.object({ tipo: z.literal("fecha"), fecha: DIA }),
]);

const postSchema = z.object({
  date: DIA,
  startTime: HORA.nullable().optional(),
  endTime: HORA.nullable().optional(),
  /** FR-014 — dar clase en un día de receso exige decirlo explícitamente. */
  confirmRecess: z.boolean().optional(),
  /** 2026-10-30 — pasar el fin del grupo exige decirlo explícitamente (409 si no). */
  confirmEndExtension: z.boolean().optional(),
  deliveryOption: opcionDeEntregaSchema.nullable().optional(),
});

/**
 * 034 (US3, FR-013/FR-014) — Reprograma una clase SUSPENDIDA (cancelada en la
 * base) a un día y hora nuevos: su clase de reemplazo. La nueva queda
 * vinculada a la suspendida y se muestra en las dos. En un día de receso
 * responde 409 `en_receso` hasta que llegue la confirmación explícita.
 *
 * 2026-10-30 — Después del fin del grupo responde 409
 * `reemplazo_despues_del_fin` hasta que llegue `confirmEndExtension`; con
 * entrega final, además, `deliveryOption`. El servidor recalcula las fechas
 * nuevas con lo que dice la base (`planDeReemplazo`).
 *
 * `academico.editar`: crea una clase, igual que generar el cronograma, y es
 * también la que edita el fin y la entrega final del grupo
 * (`PATCH /api/cohorts/[id]`). Se le pasa igual al servidor como
 * `puedeMoverFechas` para que la regla no dependa de esta línea.
 */
export const POST = requireCapability(
  "academico.editar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const body = await parseBody(req, postSchema);
    if (!body.ok) return body.response;
    const result = await reprogramarClase(session.organizationId, id, {
      date: body.data.date,
      startTime: body.data.startTime ?? null,
      endTime: body.data.endTime ?? null,
      confirmRecess: body.data.confirmRecess ?? false,
      confirmEndExtension: body.data.confirmEndExtension ?? false,
      deliveryOption: body.data.deliveryOption ?? null,
      puedeMoverFechas: sessionCapabilities(session).includes("academico.editar"),
    });
    if (!result.ok) return apiError(result.status, result.code, result.message);
    return Response.json({ session: result.data }, { status: 201 });
  }
);
