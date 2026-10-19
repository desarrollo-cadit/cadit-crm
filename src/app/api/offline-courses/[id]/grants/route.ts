import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { diaDeAccesoSchema, NOTA_MAX } from "@/lib/offline-grants";
import { assignGrant } from "@/server/offline-courses/grants";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z
  .object({
    contactId: z.string().min(1),
    accessUntil: diaDeAccesoSchema,
    note: z.string().trim().max(NOTA_MAX).nullable().optional(),
  })
  .strict();

/**
 * 043 — Dar el curso a UNA persona, sin inscripción, hasta una fecha. Si ya
 * tenía un acceso directo, le cambia la fecha. `academico.editar`, igual que
 * asignar cursos a una cohorte; Ventas no la tiene.
 */
export const POST = requireCapability(
  "academico.editar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const body = await parseBody(req, bodySchema);
    if (!body.ok) return body.response;
    const r = await assignGrant(
      session.organizationId,
      {
        contactId: body.data.contactId,
        courseId: id,
        accessUntil: body.data.accessUntil,
        note: body.data.note?.trim() ? body.data.note.trim() : null,
      },
      session.userId
    );
    if (!r.ok) return apiError(r.status, r.code, r.message);
    return Response.json(r.data, { status: r.data.created ? 201 : 200 });
  }
);
