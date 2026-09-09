import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { createAnnouncement, listAnnouncements } from "@/server/resources";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 013 (T022, FR-008) — Los avisos de una cohorte.
 *
 * **No notifican** (DV-003): se registran y se ven. El aviso llega con 017.
 * Lo que resuelve hoy es lo que pedía la spec —que "no me enteré" deje de ser
 * una discusión— y eso lo dan el autor y la fecha, no la notificación.
 */
export const GET = requireCapability(
  "academico.ver",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const announcements = await listAnnouncements(session.organizationId, id);
    return Response.json({ announcements });
  }
);

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(4000),
});

export const POST = requireCapability(
  "academico.editar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const body = await parseBody(req, createSchema);
    if (!body.ok) return body.response;

    // El autor sale de la SESIÓN, no del body: quién publicó un aviso no es
    // un dato que el cliente pueda elegir.
    const result = await createAnnouncement(
      session.organizationId,
      id,
      session.userId,
      body.data
    );
    if (!result.ok) return apiError(result.status, result.code, result.message);
    return Response.json({ announcement: result.data }, { status: 201 });
  }
);
