import { requireTeacherPortal } from "@/lib/portal-api";
import { listTeacherCohorts, teacherPortalTimezone } from "@/server/teacher-portal";

export const dynamic = "force-dynamic";

/**
 * 014 (T023, FR-008) — Las cohortes del profesor.
 *
 * Superficie propia: **no reusa `/api/cohorts`**, ni siquiera filtrando. Ese
 * endpoint devuelve `cost` y `currency`, y el día que alguien agregue un campo
 * más al DTO del staff, ese campo aparecería acá sin que nadie lo decida.
 */
export const GET = requireTeacherPortal(async (ctx) => {
  // La zona de la academia: la pantalla dice de qué zona es cada hora, y
  // "Clase X de Y" cuenta como terminada la clase que terminó en ESA zona.
  const timezone = await teacherPortalTimezone(ctx.organizationId);
  const cohorts = await listTeacherCohorts(ctx.organizationId, ctx.teacherId, {
    conProgreso: { timeZone: timezone },
  });
  return Response.json({ cohorts, timezone });
});
