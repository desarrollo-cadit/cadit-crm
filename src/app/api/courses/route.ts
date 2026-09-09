import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import {
  courseContentSchema,
  createCourseWithModules,
  listCourses,
} from "@/server/courses";
import { courseModulesSchema } from "@/server/course-content";

export const dynamic = "force-dynamic";

// 004/005 (T011) — la función server ya existía de la Fase 1; faltaba la ruta.
// 006 — devuelve también la ficha comercial, que el editor de cursos precarga.
export const GET = requireCapability(
  "academico.ver",
  async (session) => {
  const rows = await listCourses(session.organizationId);
  return Response.json({
    courses: rows.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      slug: c.slug,
      tagline: c.tagline,
      categoryId: c.categoryId,
      level: c.level,
      modality: c.modality,
      durationWeeks: c.durationWeeks,
      hoursPerWeek: c.hoursPerWeek,
      imageUrl: c.imageUrl,
      learningObjectives: c.learningObjectives ?? [],
      targetAudience: c.targetAudience,
      syllabusUrl: c.syllabusUrl,
      /*
        Estos tres FALTABAN, y el hueco no era inocuo: el editor de cursos se
        precarga desde ESTE payload —el detalle por id sólo se pide para el
        temario—, así que un campo ausente llega al form como `undefined`, cae
        en su default optimista y se guarda pisado en el próximo Guardar.

        `published` venía así desde el 007 y `minAttendancePct` desde el 009:
        destildar "Publicar en el catálogo web", volver a entrar a corregir
        una frase y guardar volvía a publicar el curso, sin que nadie lo
        pidiera ni lo notara. La bandera de certificado del 028 iba camino a
        lo mismo, y ahí el precio era emitir un certificado de un curso que no
        certifica.

        `Response.json()` no se contrasta contra `CourseDto`, así que el
        compilador nunca vio la diferencia entre lo que el tipo promete y lo
        que la ruta manda. Hoy lo mira un test.
      */
      published: c.published,
      grantsCertificate: c.grantsCertificate,
      minAttendancePct: c.minAttendancePct,
    })),
  });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  ...courseContentSchema,
  // El editor permite cargar el temario ya en el alta; sin declararlo acá Zod
  // lo descartaría en silencio y el usuario perdería lo que escribió.
  modules: courseModulesSchema.optional(),
});

export const POST = requireCapability(
  "academico.editar",
  async (session, req: Request) => {
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;

  const { modules, ...courseFields } = body.data;

  const result = await createCourseWithModules(
    session.organizationId,
    courseFields,
    modules
  );
  if (!result.ok) return apiError(result.status, result.code, result.message);

  // La fila persistida, no el body: el `slug` lo resuelve el server.
  return Response.json({ course: result.course }, { status: 201 });
});
