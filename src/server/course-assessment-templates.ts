import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { consignaSchema, validarConsigna } from "@/lib/assessment-consigna";
import {
  completarIds,
  leerPlantilla,
  normalizarPlantilla,
  templateSchema,
  validarPlantilla,
  type Template,
} from "@/lib/grading-template";
import { adjuntosPorContenedor, reemplazarAdjuntos, type AdjuntoDto } from "@/server/resources";

/**
 * 0084 — Las evaluaciones MODELO de un curso (Académico, `academico.editar`).
 *
 * Un modelo es lo que un grupo puede TOMAR: nombre, obligatoriedad, consigna
 * con adjuntos y plantilla/rúbrica. Tomar es copiar (`tomarEvaluacionesDelCurso`
 * en `src/server/grading.ts`), nunca heredar: editar el modelo después no toca
 * ningún grupo. Un modelo no tiene plazo ni correcciones, así que su plantilla
 * nunca se congela.
 *
 * Regla del archivo: ausencia = resultado tipado, jamás un código de
 * autorización; quien elige el 404 es la ruta.
 */

export type ModeloDto = {
  id: string;
  courseId: string;
  name: string;
  position: number;
  required: boolean;
  instructionsMd: string;
  adjuntos: AdjuntoDto[];
} & Template;

export type ModeloResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: 404 | 422; code: string; message: string };

export const modeloInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  required: z.boolean(),
  instructionsMd: consignaSchema.shape.instructionsMd,
  adjuntos: consignaSchema.shape.adjuntos,
  template: templateSchema,
});

export type ModeloInput = z.infer<typeof modeloInputSchema>;

type Fila = typeof schema.courseAssessmentTemplate.$inferSelect;

function aDto(f: Fila, adjuntos: AdjuntoDto[]): ModeloDto {
  return {
    id: f.id,
    courseId: f.courseId,
    name: f.name,
    position: f.position,
    required: f.required,
    instructionsMd: f.instructionsMd,
    adjuntos,
    ...leerPlantilla(f),
  };
}

/** Valida todo ANTES de escribir: la plantilla, la consigna y los adjuntos. */
function validarModelo(
  input: ModeloInput
): { ok: true; plantilla: Template; consigna: { instructionsMd: string; adjuntos: { title: string; url: string }[] } } | { ok: false; code: string; message: string } {
  const plantilla = normalizarPlantilla(completarIds(input.template));
  const p = validarPlantilla(plantilla);
  if (!p.ok) return { ok: false, code: "plantilla_invalida", message: p.mensaje };
  const c = validarConsigna({ instructionsMd: input.instructionsMd, adjuntos: input.adjuntos });
  if (!c.ok) return { ok: false, code: c.code, message: c.mensaje };
  return { ok: true, plantilla, consigna: c.data };
}

export async function listarModelos(organizationId: string, courseId: string): Promise<ModeloDto[]> {
  const filas = await getDb()
    .select()
    .from(schema.courseAssessmentTemplate)
    .where(
      scoped(
        schema.courseAssessmentTemplate.organizationId,
        organizationId,
        eq(schema.courseAssessmentTemplate.courseId, courseId)
      )
    )
    .orderBy(asc(schema.courseAssessmentTemplate.position), asc(schema.courseAssessmentTemplate.createdAt));
  const adjuntos = await adjuntosPorContenedor(
    organizationId,
    "courseAssessmentTemplate",
    filas.map((f) => f.id)
  );
  return filas.map((f) => aDto(f, adjuntos.get(f.id) ?? []));
}

export async function crearModelo(
  organizationId: string,
  courseId: string,
  input: ModeloInput
): Promise<ModeloResult<ModeloDto>> {
  const db = getDb();
  const [curso] = await db
    .select({ id: schema.course.id })
    .from(schema.course)
    .where(scoped(schema.course.organizationId, organizationId, eq(schema.course.id, courseId)))
    .limit(1);
  if (!curso) return { ok: false, status: 404, code: "not_found", message: "Curso no encontrado" };

  const v = validarModelo(input);
  if (!v.ok) return { ok: false, status: 422, code: v.code, message: v.message };

  const existentes = await listarModelos(organizationId, courseId);
  const [fila] = await db
    .insert(schema.courseAssessmentTemplate)
    .values({
      id: newId("courseAssessmentTemplate"),
      organizationId,
      courseId,
      name: input.name.trim(),
      required: input.required,
      position: existentes.reduce((max, m) => Math.max(max, m.position + 1), 0),
      instructionsMd: v.consigna.instructionsMd,
      scale: v.plantilla.scale,
      minScore: v.plantilla.minScore,
      requiresApproval: v.plantilla.requiresApproval,
      criteria: v.plantilla.criteria,
      textFields: v.plantilla.textFields,
    })
    .returning();
  const r = await reemplazarAdjuntos(organizationId, { courseAssessmentTemplateId: fila!.id }, v.consigna.adjuntos);
  if (!r.ok) throw new Error(`0084: adjuntos inválidos tras validar (${r.code})`);
  return { ok: true, data: aDto(fila!, r.data) };
}

export async function actualizarModelo(
  organizationId: string,
  modeloId: string,
  input: ModeloInput
): Promise<ModeloResult<ModeloDto>> {
  const v = validarModelo(input);
  if (!v.ok) return { ok: false, status: 422, code: v.code, message: v.message };

  const [fila] = await getDb()
    .update(schema.courseAssessmentTemplate)
    .set({
      name: input.name.trim(),
      required: input.required,
      instructionsMd: v.consigna.instructionsMd,
      scale: v.plantilla.scale,
      minScore: v.plantilla.minScore,
      requiresApproval: v.plantilla.requiresApproval,
      criteria: v.plantilla.criteria,
      textFields: v.plantilla.textFields,
      updatedAt: new Date(),
    })
    .where(
      scoped(
        schema.courseAssessmentTemplate.organizationId,
        organizationId,
        eq(schema.courseAssessmentTemplate.id, modeloId)
      )
    )
    .returning();
  if (!fila) return { ok: false, status: 404, code: "not_found", message: "Evaluación modelo no encontrada" };

  const r = await reemplazarAdjuntos(organizationId, { courseAssessmentTemplateId: fila.id }, v.consigna.adjuntos);
  if (!r.ok) throw new Error(`0084: adjuntos inválidos tras validar (${r.code})`);
  return { ok: true, data: aDto(fila, r.data) };
}

/** Borrar un modelo no toca los grupos que ya lo tomaron: son copias. */
export async function borrarModelo(
  organizationId: string,
  modeloId: string
): Promise<ModeloResult<{ id: string }>> {
  const borradas = await getDb()
    .delete(schema.courseAssessmentTemplate)
    .where(
      scoped(
        schema.courseAssessmentTemplate.organizationId,
        organizationId,
        eq(schema.courseAssessmentTemplate.id, modeloId)
      )
    )
    .returning({ id: schema.courseAssessmentTemplate.id });
  if (!borradas[0]) {
    return { ok: false, status: 404, code: "not_found", message: "Evaluación modelo no encontrada" };
  }
  return { ok: true, data: { id: modeloId } };
}
