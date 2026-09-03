import { requireTeacherPortal } from "@/lib/portal-api";
import { teacherOwnHours } from "@/server/teacher-portal";

export const dynamic = "force-dynamic";

/**
 * 014 (T030, US5/FR-010) — Mis horas dictadas.
 *
 * Clases y horas, **sin tarifa**. `teacher.hourly_rate` existe y es lo que
 * multiplica estas horas, pero esa cuenta es de la academia. Lo que el
 * profesor necesita es poder controlar que le liquiden las clases correctas.
 */
export const GET = requireTeacherPortal(async (ctx) => {
  const data = await teacherOwnHours(ctx.organizationId, ctx.teacherId);
  return Response.json(data);
});
