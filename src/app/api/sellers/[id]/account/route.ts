import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { sessionCapabilities } from "@/lib/capabilities";
import { signUpWithAssignedPassword } from "@/server/auth/assigned-password";
import { darCuentaAVendedor } from "@/server/sellers";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  /**
   * Contraseña temporal para una cuenta NUEVA (al entrar se le pide cambiarla).
   * Si el correo es de un profesor, se le agrega el equipo a su cuenta y no
   * hace falta (030, cuenta dual).
   */
  password: z.union([z.literal(""), z.string().min(8).max(128)]).optional(),
});

/**
 * 040 (US3, DV-006) — Darle al vendedor una cuenta del panel con el rol Ventas.
 *
 * Dos capacidades y no una: crear una cuenta del equipo es `accesos.gestionar`
 * (la puerta, la misma de Ajustes → Equipo) y escribir el vendedor es
 * `inscripciones.editar` (la de Ajustes → Vendedores). Quien tiene una sola
 * no hace las dos cosas por otro lado, así que tampoco por acá. La regla de
 * escalada la aplica `addTeamMember`: sin todas las capacidades de Ventas,
 * 403.
 */
export const POST = requireCapability(
  "accesos.gestionar",
  async (session, req: Request, ctx: Params) => {
    const caps = sessionCapabilities(session);
    if (!caps.includes("inscripciones.editar")) {
      return apiError(403, "forbidden", "Tu rol no incluye esta acción.");
    }
    const { id } = await ctx.params;
    const body = await parseBody(req, bodySchema);
    if (!body.ok) return body.response;

    const result = await darCuentaAVendedor(
      session.organizationId,
      caps,
      id,
      body.data.password || undefined,
      // La contraseña asignada enciende `mustChangePassword` (helper único).
      { signUp: (cuenta) => signUpWithAssignedPassword(cuenta) }
    );
    if (!result.ok) return apiError(result.status, result.code, result.message);
    return Response.json({ seller: result.seller, attached: result.attached }, { status: 201 });
  }
);
