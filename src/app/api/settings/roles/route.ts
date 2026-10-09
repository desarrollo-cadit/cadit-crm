import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { CAPABILITIES, sessionCapabilities } from "@/lib/capabilities";
import { createRole, listRoles } from "@/server/roles";

export const dynamic = "force-dynamic";

/**
 * 012 (T020) — Roles de staff y sus capacidades.
 *
 * Devuelve también la lista cerrada de capacidades: la pantalla no puede
 * inventarla ni mantener una copia propia, porque el día que se agregue una
 * capacidad nueva la copia quedaría vieja sin avisar.
 *
 * `grantable` son las que quien mira puede otorgar (las suyas): la pantalla
 * deshabilita el resto en vez de dejar tildar algo que el servidor va a
 * rechazar.
 */
export const GET = requireCapability(
  "configuracion.editar",
  async (session) => {
    const roles = await listRoles(session.organizationId, session.role);
    return Response.json({
      roles,
      capabilities: CAPABILITIES,
      grantable: sessionCapabilities(session),
    });
  }
);

/**
 * Crear-roles — `name` se valida en `createRole` (`roleNameSchema`) para que
 * la regla viva en un solo lugar; acá solo se exige la forma. Las capacidades
 * van como `string[]` por el mismo motivo que en el PATCH: una desconocida se
 * descarta, no tumba el alta entera.
 */
const createSchema = z.object({
  name: z.string(),
  capabilities: z.array(z.string()).max(100),
});

/** Crear-roles — Alta de un rol propio de la organización. */
export const POST = requireCapability(
  "configuracion.editar",
  async (session, req: Request) => {
    const body = await parseBody(req, createSchema);
    if (!body.ok) return body.response;

    const result = await createRole(
      session.organizationId,
      session.role,
      sessionCapabilities(session),
      body.data
    );
    if (!result.ok) return apiError(result.status, result.code, result.message);

    return Response.json({ role: result.data }, { status: 201 });
  }
);
