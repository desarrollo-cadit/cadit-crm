import { apiError } from "@/lib/api";
import {
  portalTeacherId,
  resolvePortalSession,
  studentContactId,
} from "@/lib/auth/portal";
import { withOrganizationScope } from "@/lib/db/with-tenant";

/**
 * 014 (fase 4, FR-008) — La puerta del portal del profesor.
 *
 * Es un envoltorio APARTE de `requireCapability`, y esa separación es el punto.
 * Las capacidades (`academico.editar`, `cobranza.ver`…) describen lo que puede
 * hacer alguien del staff dentro del panel; un profesor no tiene ninguna, y
 * darle una para que entre al portal sería abrirle también las pantallas del
 * staff que piden esa misma capacidad.
 *
 * La barrera no depende de que nadie se equivoque: una cuenta de portal **no
 * tiene fila en `member`**, así que `requireCapability` la rechaza por
 * construcción. Y al revés, alguien del staff sin `account_link` no entra acá.
 *
 * **Este archivo no decide qué cohortes ve**: eso lo resuelve
 * `src/server/teacher-portal.ts`, y su respuesta a "no la alcanzás" es la
 * misma que a "no existe" (404). Acá solo se contesta "¿sos profesor?".
 */

export type TeacherPortalContext = {
  organizationId: string;
  teacherId: string;
  userId: string;
};

export function requireTeacherPortal<Args extends unknown[]>(
  handler: (ctx: TeacherPortalContext, ...args: Args) => Promise<Response>
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    const portal = await resolvePortalSession();
    if (!portal) return apiError(401, "unauthorized", "No autenticado");

    const teacherId = portalTeacherId(portal);
    if (!teacherId) {
      // No revela nada de ninguna cohorte: dice que esta PUERTA no es suya.
      // Un alumno con sesión de portal cae acá, y decírselo es correcto.
      return apiError(403, "not_a_teacher", "Esta sección es para profesores");
    }

    const ctx: TeacherPortalContext = {
      organizationId: portal.organizationId,
      teacherId,
      userId: portal.userId,
    };

    try {
      return await withOrganizationScope(ctx.organizationId, `portal:${ctx.userId}`, () =>
        handler(ctx, ...args)
      );
    } catch (err) {
      console.error("[portal] error no controlado:", err);
      return apiError(500, "internal", "Error interno");
    }
  };
}

/* ============================================================
 * 015 (fase 1, FR-004) — La puerta del portal del ALUMNO
 * ============================================================ */

export type StudentPortalContext = {
  organizationId: string;
  contactId: string;
  userId: string;
};

/**
 * 015 (FR-004) — La puerta del alumno, separada de la del profesor.
 *
 * Son dos envoltorios y no uno con un parámetro a propósito. Un envoltorio
 * único que decide adentro "¿es alumno o profesor?" tiene, por construcción,
 * un camino en el que la respuesta se elige mal; dos puertas distintas no se
 * confunden por descuido. Es el mismo criterio con el que 012 separó la sesión
 * de portal de la del staff.
 *
 * Una persona que es alumno **y** profesor entra por las dos, cada una con su
 * alcance: acá `contactId`, allá `teacherId`. Ninguna de las dos ve lo de la
 * otra.
 *
 * **Este archivo no decide qué inscripciones ve**: eso lo resuelve
 * `src/server/student-portal.ts`, que arranca SIEMPRE por `contactId` y no
 * acepta un id de inscripción sin verificar que sea de esta persona.
 */
export function requireStudentPortal<Args extends unknown[]>(
  handler: (ctx: StudentPortalContext, ...args: Args) => Promise<Response>
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    const portal = await resolvePortalSession();
    if (!portal) return apiError(401, "unauthorized", "No autenticado");

    const contactId = studentContactId(portal);
    if (!contactId) {
      return apiError(403, "not_a_student", "Esta sección es para alumnos");
    }

    const ctx: StudentPortalContext = {
      organizationId: portal.organizationId,
      contactId,
      userId: portal.userId,
    };

    try {
      return await withOrganizationScope(ctx.organizationId, `portal:${ctx.userId}`, () =>
        handler(ctx, ...args)
      );
    } catch (err) {
      console.error("[portal] error no controlado:", err);
      return apiError(500, "internal", "Error interno");
    }
  };
}
