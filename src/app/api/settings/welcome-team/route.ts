import { z } from "zod";
import { parseBody, requireCapability } from "@/lib/api";
import { guardarEquipo, leerEquipoGuardado, listarEquipo } from "@/server/welcome-team";

export const dynamic = "force-dynamic";

/**
 * 036 — Quién figura como Soporte técnico y Coordinación en el correo de
 * bienvenida (y quién de soporte va en copia).
 *
 * `configuracion.editar`, como la marca: es una decisión de la academia que
 * se toma una vez, no algo que se toque por cohorte.
 */
export const GET = requireCapability("configuracion.editar", async (session) => {
  const [equipo, elegido] = [
    await listarEquipo(session.organizationId),
    await leerEquipoGuardado(session.organizationId),
  ];
  return Response.json({ equipo, elegido });
});

const ids = z.array(z.string().trim().min(1).max(64)).max(20);
const putSchema = z.object({ soporte: ids, coordinacion: ids });

export const PUT = requireCapability("configuracion.editar", async (session, req: Request) => {
  const body = await parseBody(req, putSchema);
  if (!body.ok) return body.response;
  const elegido = await guardarEquipo(session.organizationId, body.data);
  return Response.json({ ok: true, elegido });
});
