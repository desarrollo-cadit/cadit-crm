import { asc, eq } from "drizzle-orm";
import { apiError, requireCapability } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { PERSONA_LABELS } from "@/server/lab/personas";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const GET = requireCapability(
  "configuracion.editar",
  async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const db = getDb();
  const runs = await db
    .select()
    .from(schema.agentTestRun)
    .where(
      scoped(
        schema.agentTestRun.organizationId,
        session.organizationId,
        eq(schema.agentTestRun.id, id)
      )
    )
    .limit(1);
  const run = runs[0];
  if (!run) return apiError(404, "not_found", "Corrida no encontrada");

  /**
   * Constitución III — `scoped()` aunque la corrida de arriba ya se verificó.
   *
   * Sin `organization_id` en el `WHERE`, el filtrado queda dependiendo de RLS
   * y del chequeo previo: dos capas que no se ven leyendo esta consulta. El
   * día que corra como `postgres` —que saltea RLS sin avisar, ver
   * `docs/rls-rol-de-conexion.md`— este `WHERE` no filtra por nada.
   */
  const cases = await db
    .select()
    .from(schema.agentTestCase)
    .where(
      scoped(
        schema.agentTestCase.organizationId,
        session.organizationId,
        eq(schema.agentTestCase.runId, id)
      )
    )
    .orderBy(asc(schema.agentTestCase.createdAt));

  return Response.json({
    run: {
      id: run.id,
      status: run.status,
      score: run.score,
      error: run.error,
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() ?? null,
    },
    cases: cases.map((c) => ({
      id: c.id,
      persona: c.persona,
      personaLabel: PERSONA_LABELS[c.persona] ?? c.persona,
      status: c.status,
      veredicto: c.veredicto,
      hallazgos: c.hallazgos ?? [],
      transcript: c.transcript ?? [],
    })),
  });
});
