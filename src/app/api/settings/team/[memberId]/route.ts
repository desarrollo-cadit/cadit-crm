import { apiError, parseBody, requireCapability } from "@/lib/api";
import { sessionCapabilities } from "@/lib/capabilities";
import { memberPatchSchema } from "@/lib/team-member-patch";
import { changeMemberRole, removeMember, setMemberInternalNotices } from "@/server/team";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ memberId: string }> };

/**
 * Crear-roles — Cambia el rol de una cuenta del equipo, o enciende/apaga sus
 * avisos internos por correo (uno u otro por pedido: `memberPatchSchema`).
 *
 * Las reglas viven en `changeMemberRole` (sin escalada, no a uno mismo,
 * siempre alguien a cargo) y en `setMemberInternalNotices` (sin escalada; a
 * uno mismo sí); la ruta solo elige el código de estado.
 */
export const PATCH = requireCapability(
  "accesos.gestionar",
  async (session, req: Request, ctx: Params) => {
    const { memberId } = await ctx.params;
    const body = await parseBody(req, memberPatchSchema);
    if (!body.ok) return body.response;

    const actor = { userId: session.userId, capabilities: sessionCapabilities(session) };
    const result =
      "roleId" in body.data
        ? await changeMemberRole(session.organizationId, actor, memberId, body.data.roleId)
        : await setMemberInternalNotices(
            session.organizationId,
            actor,
            memberId,
            body.data.receivesInternalNotices
          );
    if (!result.ok) return apiError(result.status, result.code, result.message);
    return Response.json({ member: result.data });
  }
);

/**
 * 030 (addendum) — Quitar del equipo: borra SOLO la fila de `member`.
 *
 * Si la persona además es profesor, sigue entrando al portal con su misma
 * contraseña: su usuario y su `account_link` no se tocan. Las reglas (no a
 * uno mismo, sin escalada, siempre alguien a cargo) viven en `removeMember`.
 */
export const DELETE = requireCapability(
  "accesos.gestionar",
  async (session, _req: Request, ctx: Params) => {
    const { memberId } = await ctx.params;
    const result = await removeMember(
      session.organizationId,
      { userId: session.userId, capabilities: sessionCapabilities(session) },
      memberId
    );
    if (!result.ok) return apiError(result.status, result.code, result.message);
    return Response.json({ ok: true });
  }
);
