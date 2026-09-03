import { eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";

/**
 * 014 (T004, DV-008) — Dar de baja a un alumno sin destruir su historial.
 *
 * El peligro, verificado contra la base real:
 *
 *   contact → enrollment → certificate · payment · installment
 *                        → attendance · assessment_result · license
 *
 * Todo en CASCADE. Un `DELETE` sobre un contacto con historial se lleva sus
 * notas, sus pagos y **sus certificados emitidos**, sin aviso y sin vuelta.
 *
 * Por eso la decisión es una función PURA y probada, del lado del servidor. Un
 * diálogo de confirmación en el navegador es un cartel, no una barrera: no
 * protege de un script, de un bug ni de un click apurado.
 */

export type HistorialDelContacto = {
  enrollments: number;
  certificates: number;
  payments: number;
};

export type DecisionDeBaja = {
  accion: "borrar" | "archivar";
  /** En palabras y con NÚMEROS, para que la pantalla lo pueda decir. */
  motivo: string;
};

/**
 * 014 (T003) — Borrar o archivar. Pura y sin base.
 *
 * Se borra de verdad SOLO al contacto que no tiene absolutamente nada: un lead
 * que nunca cursó, o un error de carga. Con cualquier rastro de historial se
 * archiva.
 *
 * Los certificados y pagos se miran además de las inscripciones por defensa:
 * si un dato inconsistente dejara un certificado sin su inscripción, la
 * respuesta segura sigue siendo archivar. **Ante la duda no se destruye.**
 */
export function decidirBaja(h: HistorialDelContacto): DecisionDeBaja {
  const partes: string[] = [];
  if (h.enrollments > 0) {
    partes.push(`${h.enrollments} ${h.enrollments === 1 ? "inscripción" : "inscripciones"}`);
  }
  if (h.certificates > 0) {
    partes.push(`${h.certificates} ${h.certificates === 1 ? "certificado" : "certificados"}`);
  }
  if (h.payments > 0) {
    partes.push(`${h.payments} ${h.payments === 1 ? "pago" : "pagos"}`);
  }

  if (partes.length === 0) {
    return {
      accion: "borrar",
      motivo: "No tiene inscripciones ni historial: se puede borrar.",
    };
  }

  return {
    accion: "archivar",
    motivo:
      `Tiene ${partes.join(", ")}. Se archiva en vez de borrarse: ` +
      "sale de las listas y del portal, pero su historial queda intacto.",
  };
}

export type BajaResult =
  | { ok: true; accion: "borrar" | "archivar"; motivo: string }
  | { ok: false; status: 404; code: string; message: string };

/** Cuánto historial tiene el contacto. Una consulta, tres conteos. */
async function historialDe(
  organizationId: string,
  contactId: string
): Promise<HistorialDelContacto> {
  const db = getDb();

  const inscripciones = await db
    .select({ id: schema.enrollment.id })
    .from(schema.enrollment)
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        eq(schema.enrollment.contactId, contactId)
      )
    );

  if (inscripciones.length === 0) {
    return { enrollments: 0, certificates: 0, payments: 0 };
  }

  const ids = inscripciones.map((e) => e.id);

  const [certificados, cuotas] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.certificate)
      .where(
        scoped(
          schema.certificate.organizationId,
          organizationId,
          inArray(schema.certificate.enrollmentId, ids)
        )
      ),
    db
      .select({ id: schema.installment.id })
      .from(schema.installment)
      .where(
        scoped(
          schema.installment.organizationId,
          organizationId,
          inArray(schema.installment.enrollmentId, ids)
        )
      ),
  ]);

  let pagos = 0;
  if (cuotas.length > 0) {
    const rows = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.payment)
      .where(
        scoped(
          schema.payment.organizationId,
          organizationId,
          inArray(
            schema.payment.installmentId,
            cuotas.map((c) => c.id)
          )
        )
      );
    pagos = rows[0]?.n ?? 0;
  }

  return {
    enrollments: inscripciones.length,
    certificates: certificados[0]?.n ?? 0,
    payments: pagos,
  };
}

/**
 * Da de baja a un contacto: lo borra si no tiene nada, lo archiva si tiene
 * historial. **Nunca destruye historial**, pase lo que pase.
 */
export async function archiveOrDeleteContact(
  organizationId: string,
  contactId: string
): Promise<BajaResult> {
  const db = getDb();

  const rows = await db
    .select({ id: schema.contact.id })
    .from(schema.contact)
    .where(scoped(schema.contact.organizationId, organizationId, eq(schema.contact.id, contactId)))
    .limit(1);
  if (!rows[0]) {
    return { ok: false, status: 404, code: "not_found", message: "Contacto no encontrado" };
  }

  const decision = decidirBaja(await historialDe(organizationId, contactId));

  if (decision.accion === "borrar") {
    await db
      .delete(schema.contact)
      .where(
        scoped(schema.contact.organizationId, organizationId, eq(schema.contact.id, contactId))
      );
  } else {
    await db
      .update(schema.contact)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(
        scoped(schema.contact.organizationId, organizationId, eq(schema.contact.id, contactId))
      );
  }

  return { ok: true, accion: decision.accion, motivo: decision.motivo };
}

/**
 * Qué pasaría si se diera de baja — para que la pantalla lo diga ANTES.
 *
 * La confirmación no reemplaza la barrera del servidor, pero decirle a alguien
 * "esto archiva a la persona porque tiene 5 inscripciones" evita el susto de
 * apretar y no saber qué ocurrió.
 */
export async function previewBaja(
  organizationId: string,
  contactId: string
): Promise<DecisionDeBaja | null> {
  const rows = await getDb()
    .select({ id: schema.contact.id })
    .from(schema.contact)
    .where(scoped(schema.contact.organizationId, organizationId, eq(schema.contact.id, contactId)))
    .limit(1);
  if (!rows[0]) return null;
  return decidirBaja(await historialDe(organizationId, contactId));
}

/* ============================================================
 * 014 (T006/T007, DV-008) — Baja de profesores
 * ============================================================ */

export type BajaProfesorResult =
  | { ok: true }
  | { ok: false; status: 404 | 409; code: string; message: string; cohorts?: number };

/**
 * Da de baja a un profesor, **solo si no le quedan cohortes**.
 *
 * `cohort.teacher_id` es `SET NULL`, así que borrarlo no destruye datos — pero
 * deja las cohortes sin docente. Con Ovidio Santos serían **18 de un click**,
 * y el error se descubre semanas después, cuando alguien abre una cohorte y no
 * entiende por qué no tiene profesor.
 *
 * Un paso más para dar de baja a alguien que ya no está es barato. Reconstruir
 * quién dictaba qué, no.
 */
export async function deleteTeacher(
  organizationId: string,
  teacherId: string
): Promise<BajaProfesorResult> {
  const db = getDb();

  const rows = await db
    .select({ id: schema.teacher.id })
    .from(schema.teacher)
    .where(scoped(schema.teacher.organizationId, organizationId, eq(schema.teacher.id, teacherId)))
    .limit(1);
  if (!rows[0]) {
    return { ok: false, status: 404, code: "not_found", message: "Profesor no encontrado" };
  }

  const cohortes = await db
    .select({ id: schema.cohort.id })
    .from(schema.cohort)
    .where(
      scoped(
        schema.cohort.organizationId,
        organizationId,
        eq(schema.cohort.teacherId, teacherId)
      )
    );

  if (cohortes.length > 0) {
    return {
      ok: false,
      status: 409,
      code: "has_cohorts",
      cohorts: cohortes.length,
      message:
        `Este profesor tiene ${cohortes.length} ` +
        `${cohortes.length === 1 ? "cohorte asignada" : "cohortes asignadas"}. ` +
        "Reasignalas a otro docente antes de darlo de baja.",
    };
  }

  await db
    .delete(schema.teacher)
    .where(scoped(schema.teacher.organizationId, organizationId, eq(schema.teacher.id, teacherId)));

  return { ok: true };
}

/** Reasigna TODAS las cohortes de un profesor a otro, para poder darlo de baja. */
export async function reassignCohorts(
  organizationId: string,
  fromTeacherId: string,
  toTeacherId: string
): Promise<BajaProfesorResult> {
  const db = getDb();

  const destino = await db
    .select({ id: schema.teacher.id })
    .from(schema.teacher)
    .where(
      scoped(schema.teacher.organizationId, organizationId, eq(schema.teacher.id, toTeacherId))
    )
    .limit(1);
  if (!destino[0]) {
    return {
      ok: false,
      status: 404,
      code: "not_found",
      message: "El profesor de destino no existe",
    };
  }

  await db
    .update(schema.cohort)
    .set({ teacherId: toTeacherId, updatedAt: new Date() })
    .where(
      scoped(
        schema.cohort.organizationId,
        organizationId,
        eq(schema.cohort.teacherId, fromTeacherId)
      )
    );

  return { ok: true };
}

