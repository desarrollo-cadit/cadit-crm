import { z } from "zod";
import { apiError, parseBody, parseQuery, requireCapability } from "@/lib/api";
import { sessionCapabilities } from "@/lib/capabilities";
import { crearReemplazosEnLote, sugerenciasDeReemplazo } from "@/server/class-changes";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const HORA = z.string().regex(/^\d{1,2}:\d{2}$/, "Hora en formato HH:MM");
const DIA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha en formato AAAA-MM-DD");

const getQuery = z.object({ classId: z.string().min(1).optional() });

const postSchema = z.object({
  items: z
    .array(
      z.object({
        classId: z.string().min(1),
        /** `null` = ignorar esa suspendida: no se le crea reemplazo. */
        date: DIA.nullable(),
        startTime: HORA.nullable().optional(),
        endTime: HORA.nullable().optional(),
        /** Dar clase en un día de receso o feriado exige decirlo explícitamente. */
        confirmRecess: z.boolean().optional(),
      })
    )
    .min(1)
    .max(200),
});

/**
 * 2026-11-05 — Las suspendidas de un grupo SIN clase de reemplazo, cada una con
 * el día sugerido (en fila, salteando recesos y feriados) y el fin y la entrega
 * final de hoy. `?classId=` devuelve sólo esa. `academico.editar`: es la
 * pantalla de quien crea los reemplazos.
 */
export const GET = requireCapability(
  "academico.editar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const query = parseQuery(new URL(req.url), getQuery);
    if (!query.ok) return query.response;
    const result = await sugerenciasDeReemplazo(session.organizationId, id, query.data.classId ?? null);
    if (!result.ok) return apiError(result.status, result.code, result.message);
    return Response.json(result.data);
  }
);

/**
 * Crea varios reemplazos juntos, todo o nada. El servidor recalcula todo con lo
 * que dice la base y pasa por el mismo camino que `POST …/reschedule`: si el fin
 * del grupo se pasa, se estira y la entrega final se corre los mismos días. Un
 * día de receso sin `confirmRecess` responde 409 `en_receso` con las filas
 * (`rows`) que lo causaron y no crea ninguna.
 *
 * `academico.editar`: crea clases y es la que mueve el fin y la entrega final.
 */
export const POST = requireCapability(
  "academico.editar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const body = await parseBody(req, postSchema);
    if (!body.ok) return body.response;
    const result = await crearReemplazosEnLote(
      session.organizationId,
      id,
      body.data.items.map((i) => ({
        classId: i.classId,
        date: i.date,
        startTime: i.startTime ?? null,
        endTime: i.endTime ?? null,
        confirmRecess: i.confirmRecess ?? false,
      })),
      sessionCapabilities(session).includes("academico.editar")
    );
    if (!result.ok) {
      return Response.json(
        { error: { code: result.code, message: result.message }, rows: result.filas },
        { status: result.status }
      );
    }
    return Response.json(result.data, { status: 201 });
  }
);
