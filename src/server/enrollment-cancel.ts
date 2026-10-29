import { eq, inArray, ne, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { fullName } from "@/lib/utils";
import { nombreDeCohorte } from "@/lib/staff-notices";
import {
  decidirCancelacion,
  type DecisionDeCancelacion,
  type HistorialDeInscripcion,
} from "@/lib/enrollment-cancel";
import { sincronizarLicenciasDelGrupo } from "@/server/group-licenses";
import { onLeadActivity } from "@/server/inbox/lead-activity";

/**
 * Cancelar (borrar) una inscripción hecha por error.
 *
 * Cada FK a `enrollment`, clasificada (todas son ON DELETE CASCADE salvo
 * `enrollment.parent_enrollment_id`, que es RESTRICT):
 *
 * | Tabla                      | Clase     | Por qué                                         |
 * |----------------------------|-----------|-------------------------------------------------|
 * | payment (aun anulado)      | HISTORIA  | plata que entró, o que entró y se anuló         |
 * | certificate (aun anulado)  | HISTORIA  | documento entregado                             |
 * | attendance                 | DERIVADO  | se va con ella; la vista previa la cuenta       |
 * | assessment_result          | HISTORIA  | nota oficial                                    |
 * | correction (todo estado)   | HISTORIA  | trabajo de quien corrige                        |
 * | submission                 | HISTORIA  | trabajo del alumno                              |
 * | offline_quiz_attempt       | HISTORIA  | intentos del alumno (se perderían por cascada)  |
 * | workshop_registration      | (taller)  | se gestiona desde Talleres: 422                 |
 * | enrollment (hijas)         | DERIVADO* | módulos de la madre; su historia cuenta arriba  |
 * | installment                | DERIVADO  | el plan pactado, sin pagos                      |
 * | license                    | DERIVADO  | se borra la fila → vuelve al stock              |
 * | module_exclusion           | DERIVADO  | configuración del recorrido                     |
 * | offline_course_access      | DERIVADO  | excepción de acceso por inscripción             |
 * | assessment_extension       | DERIVADO  | prórroga otorgada, sin entrega                  |
 * | assessment_extension_request | DERIVADO | pedido de prórroga (0083), sin entrega        |
 * | bulk_send_recipient        | DERIVADO  | renglón del registro de un envío masivo         |
 * | staff_notice               | CASCADA   | el correo ya salió y queda salido; la fila de   |
 * |                            |           | idempotencia se va (su llave es por inscripción |
 * |                            |           | y nadie la va a volver a pedir). Un aviso       |
 * |                            |           | ENCOLADO sin mandar se cancela con ella.        |
 *
 * La tarjeta del pipeline ES la fila de `enrollment`: se borra con ella. Si la
 * persona se queda sin ninguna inscripción, se le crea su lead general (la
 * misma tarjeta que crea un mensaje entrante, `onLeadActivity`) con el curso
 * del grupo como interés: vuelve a ser un lead, que es lo que era.
 */

type Db = ReturnType<typeof getDb>;

type Hechos = {
  decision: DecisionDeCancelacion;
  ids: string[];
  contactId: string;
  cohortIds: string[];
  courseId: string | null;
};

async function contar(
  db: Db,
  organizationId: string,
  tabla:
    | typeof schema.certificate
    | typeof schema.attendance
    | typeof schema.assessmentResult
    | typeof schema.correction
    | typeof schema.submission
    | typeof schema.offlineQuizAttempt
    | typeof schema.installment
    | typeof schema.workshopRegistration,
  ids: string[]
): Promise<number> {
  const [fila] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tabla)
    .where(scoped(tabla.organizationId, organizationId, inArray(tabla.enrollmentId, ids)));
  return fila?.n ?? 0;
}

/**
 * Lee todo lo que la decisión necesita. Con `bloquear`, toma `FOR UPDATE`
 * sobre la inscripción y sus hijas ANTES de contar: un pago, una marca de
 * asistencia o una hija nueva que se inserten en paralelo necesitan un
 * `FOR KEY SHARE` sobre estas filas, así que o terminaron antes (y se
 * cuentan) o esperan a este commit (y fallan por FK). Sin ventana TOCTOU.
 */
async function leerHechos(
  db: Db,
  organizationId: string,
  enrollmentId: string,
  bloquear: boolean
): Promise<Hechos | null> {
  const consulta = db
    .select({
      id: schema.enrollment.id,
      contactId: schema.enrollment.contactId,
      cohortId: schema.enrollment.cohortId,
      parentEnrollmentId: schema.enrollment.parentEnrollmentId,
    })
    .from(schema.enrollment)
    .where(
      scoped(schema.enrollment.organizationId, organizationId, eq(schema.enrollment.id, enrollmentId))
    )
    .limit(1);
  const [fila] = bloquear ? await consulta.for("update") : await consulta;
  if (!fila) return null;

  const hijasConsulta = db
    .select({ id: schema.enrollment.id, cohortId: schema.enrollment.cohortId })
    .from(schema.enrollment)
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        eq(schema.enrollment.parentEnrollmentId, enrollmentId)
      )
    );
  const hijas = bloquear ? await hijasConsulta.for("update") : await hijasConsulta;
  const ids = [fila.id, ...hijas.map((h) => h.id)];

  const [contacto] = await db
    .select({ firstName: schema.contact.firstName, lastName: schema.contact.lastName })
    .from(schema.contact)
    .where(scoped(schema.contact.organizationId, organizationId, eq(schema.contact.id, fila.contactId)))
    .limit(1);

  let grupo = "";
  let courseId: string | null = null;
  if (fila.cohortId) {
    const [c] = await db
      .select({ name: schema.cohort.name, courseId: schema.cohort.courseId, course: schema.course.name })
      .from(schema.cohort)
      .innerJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
      .where(scoped(schema.cohort.organizationId, organizationId, eq(schema.cohort.id, fila.cohortId)))
      .limit(1);
    if (c) {
      grupo = nombreDeCohorte(c.course, c.name);
      courseId = c.courseId;
    }
  }

  const [pagos] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.payment)
    .where(
      scoped(
        schema.payment.organizationId,
        organizationId,
        // Anulados incluidos: un pago anulado es un movimiento de plata que
        // existió, y borrarlo se lleva el rastro de quién lo cargó y lo anuló.
        inArray(schema.payment.enrollmentId, ids)
      )
    );

  const [certificados, asistencias, resultados, correcciones, entregas, intentosOffline, cuotas, talleres] =
    await Promise.all([
      contar(db, organizationId, schema.certificate, ids),
      contar(db, organizationId, schema.attendance, ids),
      contar(db, organizationId, schema.assessmentResult, ids),
      contar(db, organizationId, schema.correction, ids),
      contar(db, organizationId, schema.submission, ids),
      contar(db, organizationId, schema.offlineQuizAttempt, ids),
      contar(db, organizationId, schema.installment, ids),
      contar(db, organizationId, schema.workshopRegistration, [fila.id]),
    ]);

  const licencias = await db
    .select({ name: schema.software.name })
    .from(schema.license)
    .innerJoin(schema.software, eq(schema.license.softwareId, schema.software.id))
    .where(
      scoped(
        schema.license.organizationId,
        organizationId,
        inArray(schema.license.enrollmentId, ids),
        eq(schema.license.assigned, true)
      )
    );

  const historial: HistorialDeInscripcion = {
    pagos: pagos?.n ?? 0,
    certificados,
    resultados,
    correcciones,
    entregas,
    intentosOffline,
  };

  const decision = decidirCancelacion({
    contacto: contacto ? fullName(contacto) : "la persona",
    grupo,
    tieneGrupo: fila.cohortId !== null,
    esHija: fila.parentEnrollmentId !== null,
    esTaller: talleres > 0,
    modulos: hijas.length,
    cuotas,
    licencias: [...new Set(licencias.map((l) => l.name))],
    asistencias,
    historial,
  });

  return {
    decision,
    ids,
    contactId: fila.contactId,
    cohortIds: [
      ...new Set([fila.cohortId, ...hijas.map((h) => h.cohortId)].filter((c): c is string => c !== null)),
    ],
    courseId,
  };
}

/** Qué pasaría: para que la pantalla lo diga ANTES de confirmar. */
export async function previewCancelacion(
  organizationId: string,
  enrollmentId: string
): Promise<DecisionDeCancelacion | null> {
  const hechos = await leerHechos(getDb(), organizationId, enrollmentId, false);
  return hechos?.decision ?? null;
}

export type CancelacionResult =
  | { ok: true; motivo: string; leadCreado: boolean }
  | {
      ok: false;
      status: 404 | 409 | 422;
      code: string;
      message: string;
      detalle?: DecisionDeCancelacion["detalle"];
    };

/**
 * Borra la inscripción y todo lo derivado, en la transacción del pedido
 * (`withAuth`). La decisión se vuelve a tomar acá, con las filas bloqueadas:
 * la vista previa es un cartel, no la barrera.
 */
export async function cancelarInscripcion(
  organizationId: string,
  enrollmentId: string
): Promise<CancelacionResult> {
  const db = getDb();
  const hechos = await leerHechos(db, organizationId, enrollmentId, true);
  if (!hechos) {
    return { ok: false, status: 404, code: "not_found", message: "Inscripción no encontrada" };
  }
  const { decision } = hechos;
  if (!decision.deletable) {
    return {
      ok: false,
      status: decision.code === "inscripcion_con_historial" ? 409 : 422,
      code: decision.code,
      message: decision.motivo,
      detalle: decision.detalle,
    };
  }

  // Hijas primero: `parent_enrollment_id` es RESTRICT. Todo lo demás
  // (cuotas, licencias, accesos offline, exclusiones, prórrogas, avisos) cae
  // por CASCADE en esta misma transacción.
  const hijas = hechos.ids.filter((id) => id !== enrollmentId);
  if (hijas.length > 0) {
    await db
      .delete(schema.enrollment)
      .where(
        scoped(
          schema.enrollment.organizationId,
          organizationId,
          inArray(schema.enrollment.id, hijas),
          eq(schema.enrollment.parentEnrollmentId, enrollmentId)
        )
      );
  }
  await db
    .delete(schema.enrollment)
    .where(
      scoped(schema.enrollment.organizationId, organizationId, eq(schema.enrollment.id, enrollmentId))
    );

  // 035 — El stock que se liberó puede completar a quien del mismo grupo se
  // había quedado sin la licencia del grupo. Mismo sincronizador que el alta,
  // "Mudar" y la baja.
  if (hechos.cohortIds.length > 0) {
    const resto = await db
      .select({ id: schema.enrollment.id })
      .from(schema.enrollment)
      .where(
        scoped(
          schema.enrollment.organizationId,
          organizationId,
          inArray(schema.enrollment.cohortId, hechos.cohortIds)
        )
      );
    await sincronizarLicenciasDelGrupo(
      organizationId,
      resto.map((r) => r.id)
    );
  }

  // La persona sigue siendo un contacto. Sin ninguna otra inscripción (ni
  // lead general) desaparecería del pipeline: vuelve a ser un lead.
  const [otra] = await db
    .select({ id: schema.enrollment.id })
    .from(schema.enrollment)
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        eq(schema.enrollment.contactId, hechos.contactId),
        ne(schema.enrollment.id, enrollmentId)
      )
    )
    .limit(1);
  let leadCreado = false;
  if (!otra) {
    await onLeadActivity(organizationId, hechos.contactId, new Date(), hechos.courseId);
    leadCreado = true;
  }

  return { ok: true, motivo: decision.motivo, leadCreado };
}
