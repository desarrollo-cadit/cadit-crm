import { asc } from "drizzle-orm";
import type { getDb } from "@/lib/db";
import { schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";

type Db = ReturnType<typeof getDb>;

/**
 * 004 — Las 7 etapas académicas, compartidas por el tablero general de
 * ventas (enrollment.cohort_id NULL) y por cada tablero de camada. `kind`
 * reusa el concepto de "ancla no borrable" ya existente en pipeline_stage.
 */
const ACADEMIC_STAGES: {
  name: string;
  kind: "open" | "won" | "lost";
}[] = [
  { name: "lead", kind: "open" },
  { name: "contactado", kind: "open" },
  { name: "inscripto", kind: "open" },
  { name: "con_licencia", kind: "open" },
  { name: "cursando", kind: "open" },
  { name: "finalizado", kind: "won" },
  { name: "abandonó", kind: "lost" },
];

/**
 * Siembra las 7 etapas académicas para una organización si no existen ya
 * (por nombre) — idempotente, re-ejecutable (Constitución IV).
 */
export async function ensureAcademicStages(
  db: Db,
  organizationId: string
): Promise<void> {
  const existing = await db
    .select({ name: schema.pipelineStage.name })
    .from(schema.pipelineStage)
    .where(scoped(schema.pipelineStage.organizationId, organizationId));
  const existingNames = new Set(existing.map((s) => s.name));

  const maxPosition = await db
    .select({ position: schema.pipelineStage.position })
    .from(schema.pipelineStage)
    .where(scoped(schema.pipelineStage.organizationId, organizationId))
    .orderBy(asc(schema.pipelineStage.position));
  let nextPosition =
    maxPosition.length > 0
      ? Math.max(...maxPosition.map((s) => s.position)) + 1
      : 0;

  for (const stage of ACADEMIC_STAGES) {
    if (existingNames.has(stage.name)) continue;
    await db.insert(schema.pipelineStage).values({
      id: newId("stage"),
      organizationId,
      name: stage.name,
      position: nextPosition++,
      kind: stage.kind,
    });
  }
}
