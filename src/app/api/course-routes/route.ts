import { requireCapability } from "@/lib/api";
import { listarRutas } from "@/server/course-routes";

export const dynamic = "force-dynamic";

/**
 * 046 (US2) — Las rutas entre cursos de la organización, para dibujar
 * "Siguen: …" en la lista de cursos de Académico. Leer es `academico.ver`.
 */
export const GET = requireCapability("academico.ver", async (session) =>
  Response.json({ routes: await listarRutas(session.organizationId) })
);
