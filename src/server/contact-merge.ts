import { eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import {
  COLUMNAS_DE_CONSULTA,
  datosVacios,
  planDeUnificacion,
  type ColumnaDeConsulta,
  type ConsultaGeneral,
  TABLAS_SIMPLES,
  type Bloqueo,
  type ContactoAUnificar,
  type DatosDeUnificacion,
  type OpcionesDeUnificacion,
  type PlanDeUnificacion,
  type TablaSimple,
} from "@/lib/contact-merge";
import { completarEmpresaDelContacto } from "@/server/contact-company";
import { sincronizarLicenciasDelGrupo } from "@/server/group-licenses";

/**
 * 2026-10-26 — Unificar contactos: la lectura y las escrituras.
 *
 * Las reglas viven en `src/lib/contact-merge.ts`. Acá:
 *
 * 1. `prepararUnificacion` BLOQUEA las dos filas de `contact` (`for update`)
 *    y lee todo lo que cuelga de ellas. El bloqueo hace que nadie le agregue
 *    una inscripción o un mensaje a ninguno de los dos mientras dura el
 *    pedido (cualquier FK hacia `contact` espera a que termine), así que la
 *    foto que lee la vista previa del POST es la que se ejecuta.
 * 2. `aplicarUnificacion` escribe en un orden pensado para los índices
 *    únicos, que Postgres chequea sentencia por sentencia: PRIMERO se vacían
 *    correo, secundario y teléfono del absorbido, y recién al final se
 *    escriben en el que queda. Lo que choca dentro de una tabla (accesos,
 *    progreso, intentos, reconocimientos, historial) se resuelve ANTES de
 *    mover el resto. Si algo bloquea, LANZA: la transacción del pedido
 *    revierte todo y nunca queda una unificación a medias.
 *
 * Tablas con `contact_id` (todas con FK a `contact.id`; las que van en
 * cascada se perderían al borrar al absorbido si no se movieran —
 * `tests/unit/contact-merge-servidor.test.ts` falla si aparece una nueva sin
 * nombrarla acá): enrollment, conversation, account_link, offline_quiz_attempt,
 * offline_course_grant, offline_topic_progress, offline_recognition,
 * activity_log, area_handoff, staff_notice, contact_form_submission,
 * contact_activity, marketing_campaign_recipient, marketing_unsubscribe,
 * historical_course_taking, zoom_participant_alias.
 *
 * Lo congelado NO se reescribe: el snapshot de los certificados, los nombres
 * de los envíos de formularios, las variables de los destinatarios de
 * campañas y el payload / la llave de los avisos internos dicen lo que
 * decían cuando se generaron.
 */

export class UnificacionBloqueada extends Error {
  constructor(readonly bloqueos: Bloqueo[]) {
    super(bloqueos.map((b) => b.mensaje).join(" "));
    this.name = "UnificacionBloqueada";
  }
}

const COLUMNAS_DE_CONTACTO = {
  id: schema.contact.id,
  firstName: schema.contact.firstName,
  lastName: schema.contact.lastName,
  email: schema.contact.email,
  secondaryEmail: schema.contact.secondaryEmail,
  phone: schema.contact.phone,
  waIdentity: schema.contact.waIdentity,
  waUserId: schema.contact.waUserId,
  nationalId: schema.contact.nationalId,
  companyId: schema.contact.companyId,
  notes: schema.contact.notes,
  source: schema.contact.source,
  utmCampaign: schema.contact.utmCampaign,
  archivedAt: schema.contact.archivedAt,
  createdAt: schema.contact.createdAt,
};

/**
 * Lo que cuelga de una inscripción. Una consulta general (sin grupo) solo se
 * borra si no tiene NADA de esto: borrarla cae en cascada sobre todo.
 */
const DEPENDIENTES_DE_INSCRIPCION: readonly [string, string][] = [
  ["workshop_registration", "enrollment_id"],
  ["license", "enrollment_id"],
  ["module_exclusion", "parent_enrollment_id"],
  ["bulk_send_recipient", "enrollment_id"],
  ["installment", "enrollment_id"],
  ["payment", "enrollment_id"],
  ["attendance", "enrollment_id"],
  ["assessment_result", "enrollment_id"],
  ["submission", "enrollment_id"],
  ["assessment_extension", "enrollment_id"],
  // 0083 — el pedido de prórroga del alumno (pendiente o decidido).
  ["assessment_extension_request", "enrollment_id"],
  // 0086 — el resultado final confirmado de la cursada.
  ["enrollment_final_result", "enrollment_id"],
  ["correction", "enrollment_id"],
  ["certificate", "enrollment_id"],
  ["offline_quiz_attempt", "enrollment_id"],
  ["offline_course_access", "enrollment_id"],
  ["staff_notice", "enrollment_id"],
  ["enrollment", "parent_enrollment_id"],
];

function contarDependientes(): SQL<number> {
  const partes = DEPENDIENTES_DE_INSCRIPCION.map(
    ([tabla, columna]) =>
      sql`(select count(*) from ${sql.identifier(tabla)} d where d.${sql.identifier(columna)} = ${schema.enrollment.id})`
  );
  return sql<number>`(case when ${schema.enrollment.cohortId} is null then ${sql.join(partes, sql` + `)} else 0 end)::int`;
}

/** Tabla simple → su tabla de Drizzle. */
const TABLA: Record<
  TablaSimple,
  | typeof schema.activityLog
  | typeof schema.contactActivity
  | typeof schema.contactFormSubmission
  | typeof schema.marketingCampaignRecipient
  | typeof schema.marketingUnsubscribe
  | typeof schema.areaHandoff
  | typeof schema.staffNotice
  | typeof schema.zoomParticipantAlias
  | typeof schema.licenseEmailAlias
  | typeof schema.licenseAutodeskTask
> = {
  activity_log: schema.activityLog,
  contact_activity: schema.contactActivity,
  contact_form_submission: schema.contactFormSubmission,
  marketing_campaign_recipient: schema.marketingCampaignRecipient,
  marketing_unsubscribe: schema.marketingUnsubscribe,
  area_handoff: schema.areaHandoff,
  staff_notice: schema.staffNotice,
  zoom_participant_alias: schema.zoomParticipantAlias,
  license_email_alias: schema.licenseEmailAlias,
  license_autodesk_task: schema.licenseAutodeskTask,
};

export type Preparacion = {
  a: ContactoAUnificar;
  b: ContactoAUnificar;
  plan: PlanDeUnificacion;
};

/**
 * Lee (y bloquea) los dos contactos y todo lo suyo, y arma el plan. `null`
 * si alguno no es de esta organización (la ruta responde 404).
 */
export async function prepararUnificacion(
  organizationId: string,
  idA: string,
  idB: string,
  opciones: OpcionesDeUnificacion = {}
): Promise<Preparacion | null> {
  const db = getDb();
  const ids = [idA, idB];
  const contactos = await db
    .select(COLUMNAS_DE_CONTACTO)
    .from(schema.contact)
    .where(scoped(schema.contact.organizationId, organizationId, inArray(schema.contact.id, ids)))
    .for("update");
  const a = contactos.find((c) => c.id === idA);
  const b = contactos.find((c) => c.id === idB);
  if (!a || !b) return null;

  const datos = await leerDatos(organizationId, ids, [a.companyId, b.companyId]);
  return { a, b, plan: planDeUnificacion(a, b, datos, opciones) };
}

async function leerDatos(
  organizationId: string,
  ids: string[],
  empresas: (string | null)[]
): Promise<DatosDeUnificacion> {
  const db = getDb();
  const datos = datosVacios();

  datos.inscripciones = await db
    .select({
      id: schema.enrollment.id,
      contactId: schema.enrollment.contactId,
      cohortId: schema.enrollment.cohortId,
      grupo: schema.cohort.name,
      dependientes: contarDependientes(),
    })
    .from(schema.enrollment)
    .leftJoin(schema.cohort, eq(schema.cohort.id, schema.enrollment.cohortId))
    .where(scoped(schema.enrollment.organizationId, organizationId, inArray(schema.enrollment.contactId, ids)));

  datos.conversaciones = await db
    .select({
      id: schema.conversation.id,
      contactId: schema.conversation.contactId,
      isTest: schema.conversation.isTest,
      lastInboundAt: schema.conversation.lastInboundAt,
      lastMessageAt: schema.conversation.lastMessageAt,
      unreadCount: schema.conversation.unreadCount,
      mensajes: sql<number>`(select count(*) from ${schema.message} m where m.conversation_id = ${schema.conversation.id})::int`,
    })
    .from(schema.conversation)
    .where(scoped(schema.conversation.organizationId, organizationId, inArray(schema.conversation.contactId, ids)));

  const cuentas = await db
    .select({ id: schema.accountLink.id, contactId: schema.accountLink.contactId })
    .from(schema.accountLink)
    .where(scoped(schema.accountLink.organizationId, organizationId, inArray(schema.accountLink.contactId, ids)));
  datos.cuentasDelPortal = cuentas.flatMap((c) => (c.contactId ? [{ id: c.id, contactId: c.contactId }] : []));

  const accesos = await db
    .select({
      id: schema.offlineCourseGrant.id,
      contactId: schema.offlineCourseGrant.contactId,
      offlineCourseId: schema.offlineCourseGrant.offlineCourseId,
      accessUntil: schema.offlineCourseGrant.accessUntil,
      revokedAt: schema.offlineCourseGrant.revokedAt,
    })
    .from(schema.offlineCourseGrant)
    .where(
      scoped(schema.offlineCourseGrant.organizationId, organizationId, inArray(schema.offlineCourseGrant.contactId, ids))
    );
  datos.accesosOffline = accesos.map(({ revokedAt, ...g }) => ({ ...g, activo: revokedAt === null }));

  const progreso = await db
    .select({
      id: schema.offlineTopicProgress.id,
      contactId: schema.offlineTopicProgress.contactId,
      topicId: schema.offlineTopicProgress.topicId,
      watchedRatio: schema.offlineTopicProgress.watchedRatio,
      completedAt: schema.offlineTopicProgress.completedAt,
    })
    .from(schema.offlineTopicProgress)
    .where(
      scoped(schema.offlineTopicProgress.organizationId, organizationId, inArray(schema.offlineTopicProgress.contactId, ids))
    );
  datos.progreso = progreso.map((p) => ({ ...p, watchedRatio: Number(p.watchedRatio) }));

  datos.intentos = await db
    .select({
      id: schema.offlineQuizAttempt.id,
      contactId: schema.offlineQuizAttempt.contactId,
      quizId: schema.offlineQuizAttempt.quizId,
      attemptNumber: schema.offlineQuizAttempt.attemptNumber,
    })
    .from(schema.offlineQuizAttempt)
    .where(
      scoped(schema.offlineQuizAttempt.organizationId, organizationId, inArray(schema.offlineQuizAttempt.contactId, ids))
    );

  const reconocimientos = await db
    .select({
      id: schema.offlineRecognition.id,
      contactId: schema.offlineRecognition.contactId,
      courseId: schema.offlineRecognition.courseId,
      lessonId: schema.offlineRecognition.lessonId,
      revokedAt: schema.offlineRecognition.revokedAt,
    })
    .from(schema.offlineRecognition)
    .where(
      scoped(schema.offlineRecognition.organizationId, organizationId, inArray(schema.offlineRecognition.contactId, ids))
    );
  datos.reconocimientos = reconocimientos.map(({ revokedAt, ...r }) => ({ ...r, activo: revokedAt === null }));

  datos.historial = await db
    .select({
      id: schema.historicalCourseTaking.id,
      contactId: schema.historicalCourseTaking.contactId,
      dedupKey: schema.historicalCourseTaking.dedupKey,
    })
    .from(schema.historicalCourseTaking)
    .where(
      scoped(
        schema.historicalCourseTaking.organizationId,
        organizationId,
        inArray(schema.historicalCourseTaking.contactId, ids)
      )
    );

  // Las tablas simples se cuentan de los dos: el plan usa las del absorbido.
  for (const tabla of TABLAS_SIMPLES) {
    const t = TABLA[tabla];
    const filas = await db
      .select({ contactId: t.contactId, n: sql<number>`count(*)::int` })
      .from(t)
      .where(scoped(t.organizationId, organizationId, inArray(t.contactId, ids)))
      .groupBy(t.contactId);
    for (const f of filas) {
      if (!f.contactId) continue;
      (datos.simples[f.contactId] ??= {})[tabla] = Number(f.n);
    }
  }

  // Las consultas generales (sin grupo), con todas sus columnas propias: si
  // las dos tienen una, la que se borra completa a la que queda.
  const columnas = Object.fromEntries(
    COLUMNAS_DE_CONSULTA.map((c) => [c, schema.enrollment[c]])
  ) as { [K in ColumnaDeConsulta]: (typeof schema.enrollment)[K] };
  const consultas = await db
    .select({ id: schema.enrollment.id, contactId: schema.enrollment.contactId, ...columnas })
    .from(schema.enrollment)
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        inArray(schema.enrollment.contactId, ids),
        isNull(schema.enrollment.cohortId)
      )
    );
  datos.consultasGenerales = consultas.map((c) => ({
    ...c,
    amount: c.amount === null ? null : Number(c.amount),
  })) as ConsultaGeneral[];

  if (datos.consultasGenerales.length > 1) {
    const unicos = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => Boolean(x)))];
    const etapas = unicos(datos.consultasGenerales.map((c) => c.stageId));
    const vendedores = unicos(datos.consultasGenerales.map((c) => c.sellerId));
    const cursos = unicos(datos.consultasGenerales.map((c) => c.interestCourseId));
    if (etapas.length) {
      const filas = await db
        .select({ id: schema.pipelineStage.id, nombre: schema.pipelineStage.name })
        .from(schema.pipelineStage)
        .where(scoped(schema.pipelineStage.organizationId, organizationId, inArray(schema.pipelineStage.id, etapas)));
      datos.nombres.etapas = Object.fromEntries(filas.map((f) => [f.id, f.nombre]));
    }
    if (vendedores.length) {
      const filas = await db
        .select({ id: schema.seller.id, nombre: schema.seller.name })
        .from(schema.seller)
        .where(scoped(schema.seller.organizationId, organizationId, inArray(schema.seller.id, vendedores)));
      datos.nombres.vendedores = Object.fromEntries(filas.map((f) => [f.id, f.nombre]));
    }
    if (cursos.length) {
      const filas = await db
        .select({ id: schema.course.id, nombre: schema.course.name })
        .from(schema.course)
        .where(scoped(schema.course.organizationId, organizationId, inArray(schema.course.id, cursos)));
      datos.nombres.cursos = Object.fromEntries(filas.map((f) => [f.id, f.nombre]));
    }
    empresas = [...empresas, ...datos.consultasGenerales.map((c) => c.companyId)];
  }

  const conEmpresa = [...new Set(empresas.filter((e): e is string => Boolean(e)))];
  if (conEmpresa.length > 0) {
    const filas = await db
      .select({ id: schema.company.id, nombre: schema.company.legalName })
      .from(schema.company)
      .where(scoped(schema.company.organizationId, organizationId, inArray(schema.company.id, conEmpresa)));
    datos.empresas = Object.fromEntries(filas.map((f) => [f.id, f.nombre]));
  }
  return datos;
}

/**
 * Ejecuta el plan. LANZA si el plan tiene bloqueos o le falta la elección
 * de correos: la transacción del pedido revierte y no queda nada a medias.
 * Devuelve el id del que queda.
 */
export async function aplicarUnificacion(
  organizationId: string,
  actorUserId: string | null,
  plan: PlanDeUnificacion
): Promise<string> {
  if (plan.bloqueos.length > 0) throw new UnificacionBloqueada(plan.bloqueos);
  if (plan.correos.faltaElegir || plan.correos.error) {
    throw new Error(plan.correos.error ?? "Unificar: falta elegir qué correos quedan.");
  }

  const db = getDb();
  const now = new Date();
  const s = plan.survivorId;
  const x = plan.absorbedId;
  // 1. Vaciar lo único del absorbido ANTES de escribirlo en el que queda.
  await db
    .update(schema.contact)
    .set({ email: null, secondaryEmail: null, phone: null, updatedAt: now })
    .where(scoped(schema.contact.organizationId, organizationId, eq(schema.contact.id, x)));

  // 2. Inscripciones: la consulta general que sobra completa a la que queda
  //    (solo sus vacíos: completa, nunca pisa), se borra y el resto se mueve.
  const completarConsulta = plan.consultaGeneral;
  if (completarConsulta && Object.keys(completarConsulta.set).length > 0) {
    await db
      .update(schema.enrollment)
      .set({ ...completarConsulta.set, updatedAt: now })
      .where(
        scoped(schema.enrollment.organizationId, organizationId, eq(schema.enrollment.id, completarConsulta.conservadaId))
      );
  }
  if (plan.inscripcionABorrar) {
    await db
      .delete(schema.enrollment)
      .where(
        scoped(schema.enrollment.organizationId, organizationId, eq(schema.enrollment.id, plan.inscripcionABorrar))
      );
  }
  await db
    .update(schema.enrollment)
    .set({ contactId: s, updatedAt: now })
    .where(scoped(schema.enrollment.organizationId, organizationId, eq(schema.enrollment.contactId, x)));

  // 3. Conversaciones: dos reales se unen en la del que queda.
  if (plan.conversacion) {
    const { destinoId, origenId } = plan.conversacion;
    await db
      .update(schema.message)
      .set({ conversationId: destinoId })
      .where(scoped(schema.message.organizationId, organizationId, eq(schema.message.conversationId, origenId)));
    await db
      .update(schema.areaHandoff)
      .set({ conversationId: destinoId })
      .where(
        scoped(schema.areaHandoff.organizationId, organizationId, eq(schema.areaHandoff.conversationId, origenId))
      );
    await db
      .update(schema.agentTestCase)
      .set({ conversationId: destinoId })
      .where(
        scoped(schema.agentTestCase.organizationId, organizationId, eq(schema.agentTestCase.conversationId, origenId))
      );
    await db
      .update(schema.conversation)
      .set({
        lastInboundAt: plan.conversacion.lastInboundAt,
        lastMessageAt: plan.conversacion.lastMessageAt,
        unreadCount: plan.conversacion.unreadCount,
        updatedAt: now,
      })
      .where(scoped(schema.conversation.organizationId, organizationId, eq(schema.conversation.id, destinoId)));
    await db
      .delete(schema.conversation)
      .where(scoped(schema.conversation.organizationId, organizationId, eq(schema.conversation.id, origenId)));
  }
  await db
    .update(schema.conversation)
    .set({ contactId: s, updatedAt: now })
    .where(scoped(schema.conversation.organizationId, organizationId, eq(schema.conversation.contactId, x)));

  // 4. La cuenta del portal (si los dos tenían, el plan ya bloqueó).
  await db
    .update(schema.accountLink)
    .set({ contactId: s, updatedAt: now })
    .where(scoped(schema.accountLink.organizationId, organizationId, eq(schema.accountLink.contactId, x)));

  // 5. Cursos offline: lo que choca se resuelve antes de mover.
  if (plan.accesosARevocar.length > 0) {
    await db
      .update(schema.offlineCourseGrant)
      .set({ revokedAt: now, revokedBy: actorUserId, updatedAt: now, updatedBy: actorUserId })
      .where(
        scoped(
          schema.offlineCourseGrant.organizationId,
          organizationId,
          inArray(schema.offlineCourseGrant.id, plan.accesosARevocar)
        )
      );
  }
  await db
    .update(schema.offlineCourseGrant)
    .set({ contactId: s, updatedAt: now })
    .where(
      scoped(schema.offlineCourseGrant.organizationId, organizationId, eq(schema.offlineCourseGrant.contactId, x))
    );

  if (plan.progresoABorrar.length > 0) {
    await db
      .delete(schema.offlineTopicProgress)
      .where(
        scoped(
          schema.offlineTopicProgress.organizationId,
          organizationId,
          inArray(schema.offlineTopicProgress.id, plan.progresoABorrar)
        )
      );
  }
  await db
    .update(schema.offlineTopicProgress)
    .set({ contactId: s, updatedAt: now })
    .where(
      scoped(schema.offlineTopicProgress.organizationId, organizationId, eq(schema.offlineTopicProgress.contactId, x))
    );

  for (const intento of plan.intentosARenumerar) {
    await db
      .update(schema.offlineQuizAttempt)
      .set({ contactId: s, attemptNumber: intento.attemptNumber })
      .where(
        scoped(schema.offlineQuizAttempt.organizationId, organizationId, eq(schema.offlineQuizAttempt.id, intento.id))
      );
  }
  await db
    .update(schema.offlineQuizAttempt)
    .set({ contactId: s })
    .where(
      scoped(schema.offlineQuizAttempt.organizationId, organizationId, eq(schema.offlineQuizAttempt.contactId, x))
    );

  if (plan.reconocimientosARevocar.length > 0) {
    await db
      .update(schema.offlineRecognition)
      .set({ revokedAt: now, revokedBy: actorUserId })
      .where(
        scoped(
          schema.offlineRecognition.organizationId,
          organizationId,
          inArray(schema.offlineRecognition.id, plan.reconocimientosARevocar)
        )
      );
  }
  await db
    .update(schema.offlineRecognition)
    .set({ contactId: s })
    .where(
      scoped(schema.offlineRecognition.organizationId, organizationId, eq(schema.offlineRecognition.contactId, x))
    );

  // 6. Historial importado: la llave lleva el id del contacto.
  if (plan.historialABorrar.length > 0) {
    await db
      .delete(schema.historicalCourseTaking)
      .where(
        scoped(
          schema.historicalCourseTaking.organizationId,
          organizationId,
          inArray(schema.historicalCourseTaking.id, plan.historialABorrar)
        )
      );
  }
  for (const h of plan.historialAReclavar) {
    await db
      .update(schema.historicalCourseTaking)
      .set({ contactId: s, dedupKey: h.dedupKey })
      .where(
        scoped(schema.historicalCourseTaking.organizationId, organizationId, eq(schema.historicalCourseTaking.id, h.id))
      );
  }

  // 7. Las tablas que solo cambian de contacto (lo congelado no se toca).
  for (const tabla of TABLAS_SIMPLES) {
    const t = TABLA[tabla];
    await db
      .update(t)
      .set({ contactId: s })
      .where(scoped(t.organizationId, organizationId, eq(t.contactId, x)));
  }

  // 8. Recién ahora se completan los datos del que queda.
  await db
    .update(schema.contact)
    .set({ ...plan.contacto, updatedAt: now })
    .where(scoped(schema.contact.organizationId, organizationId, eq(schema.contact.id, s)));
  await completarEmpresaDelContacto(organizationId, s, plan.empresaDelAbsorbido);

  // 9. El absorbido ya está vacío: se borra.
  await db
    .delete(schema.contact)
    .where(scoped(schema.contact.organizationId, organizationId, eq(schema.contact.id, x)));

  // 10. Lo que pasó queda en el seguimiento del que queda.
  await db.insert(schema.contactActivity).values({
    id: newId("contactActivity"),
    organizationId,
    contactId: s,
    authorUserId: actorUserId,
    kind: "nota",
    body: plan.nota,
    createdAt: now,
  });

  // 11. Las licencias del grupo siguen a la inscripción (misma llamada que el alta).
  await sincronizarLicenciasDelGrupo(organizationId, plan.inscripcionesMovidas);

  return s;
}
