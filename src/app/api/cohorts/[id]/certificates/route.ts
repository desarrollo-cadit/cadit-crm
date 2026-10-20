import { apiError, requireCapability } from "@/lib/api";
import { emitirATodos } from "@/server/certificates";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 038 (FR-009/FR-010/FR-011) — "Emitir a todos los aprobados" de una cohorte.
 *
 * Misma capacidad que la emisión de a uno (`certificados.emitir`), y la misma
 * regla: `emitirATodos` es la emisión de a uno, alumno por alumno. En una
 * especialización emite los módulos aprobados de cada alumno y el general de
 * quien aprobó todo. Idempotente: repetirlo no duplica nada.
 *
 * Responde siempre la lista completa, con el estado de cada alumno: quién
 * quedó emitido, quién ya lo tenía y quién no, con el motivo.
 */
export const POST = requireCapability(
  "certificados.emitir",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const resultados = await emitirATodos(session.organizationId, id, {
      issuedBy: session.userId,
    });
    if (!resultados) return apiError(404, "not_found", "Grupo no encontrado");
    return Response.json({ resultados });
  }
);
