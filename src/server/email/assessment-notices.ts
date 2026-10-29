import { and, eq, exists, inArray, isNotNull, or, sql } from "drizzle-orm";
import { getEnv } from "@/lib/env";
import { getDb, getRootDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { withOrganizationScope } from "@/lib/db/with-tenant";
import {
  DIAS_DE_RECORDATORIO,
  INTENTOS_MAX,
  armarCorreccionPublicada,
  armarRecordatorio,
  claveDeCorreccionPublicada,
  seleccionarRecordatorios,
  type CandidatoARecordatorio,
  type RecordatorioQueToca,
} from "@/lib/assessment-notices";
import { instanteDeEntregaFinal, plazoDeEvaluacion } from "@/lib/entrega-final";
import { sendMail } from "@/lib/m365/client";
import { fullName } from "@/lib/utils";
import { estadosDeAcceso, zonaDeLaOrganizacion } from "@/server/access-expiry";

/**
 * 0084 — Los correos al ALUMNO sobre sus evaluaciones: el recordatorio antes
 * del plazo y "Tu corrección fue publicada". Correo operativo por
 * `src/lib/m365` (constitución 1.3.0); NUNCA WhatsApp, y nada de esto lee las
 * bajas de marketing (`tests/unit/marketing-guard.test.ts`).
 *
 *  - **A lo sumo una vez por llave**: se reclama la fila de `assessment_notice`
 *    (`dedup_key` única por organización) ANTES de llamar a Graph. Un fallo
 *    queda `fallido` y se reintenta hasta `INTENTOS_MAX`; lo enviado u
 *    omitido no se vuelve a tocar.
 *  - **Nunca dentro de la transacción del pedido**: la publicación lo agenda
 *    con `onAfterCommit`, y cada paso abre su propio alcance corto
 *    (`withOrganizationScope`). Graph se llama fuera de toda transacción.
 *  - **Nunca lanza**: un fallo del correo jamás rompe una publicación ni la
 *    periódica.
 */

const ACTOR = "system:evaluaciones";

type Sujeto = {
  kind: "recordatorio" | "correccion_publicada";
  assessmentId: string;
  enrollmentId: string;
  correctionId?: string | null;
  dueAt?: Date | null;
  dedupKey: string;
};

/**
 * Reclama la llave. Devuelve el id si este proceso tiene que enviar: la fila
 * es nueva, o era un `fallido` con intentos disponibles. `null` = ya está en
 * vuelo, enviada u omitida.
 */
async function reclamar(organizationId: string, s: Sujeto): Promise<string | null> {
  const t = schema.assessmentNotice;
  const filas = await getDb()
    .insert(t)
    .values({
      id: newId("assessmentNotice"),
      organizationId,
      kind: s.kind,
      assessmentId: s.assessmentId,
      enrollmentId: s.enrollmentId,
      correctionId: s.correctionId ?? null,
      dueAt: s.dueAt ?? null,
      dedupKey: s.dedupKey,
      status: "enviando",
      attempts: 1,
    })
    .onConflictDoUpdate({
      target: [t.organizationId, t.dedupKey],
      set: { status: "enviando", attempts: sql`${t.attempts} + 1`, updatedAt: new Date() },
      setWhere: and(eq(t.status, "fallido"), sql`${t.attempts} < ${INTENTOS_MAX}`),
    })
    .returning({ id: t.id });
  return filas[0]?.id ?? null;
}

async function cerrar(
  organizationId: string,
  id: string,
  status: "enviado" | "fallido" | "omitido",
  error: string | null
): Promise<void> {
  await withOrganizationScope(organizationId, ACTOR, async () => {
    const ahora = new Date();
    await getDb()
      .update(schema.assessmentNotice)
      .set({ status, error, updatedAt: ahora, ...(status === "enviado" ? { sentAt: ahora } : {}) })
      .where(
        scoped(schema.assessmentNotice.organizationId, organizationId, eq(schema.assessmentNotice.id, id))
      );
  });
}

/** Manda (fuera de transacción) y cierra la fila. Nunca lanza. */
async function mandar(
  organizationId: string,
  id: string,
  to: string,
  correo: { subject: string; html: string }
): Promise<"enviado" | "fallido" | "omitido"> {
  const r = await sendMail({ to, subject: correo.subject, html: correo.html }).catch(
    (err: unknown) =>
      ({ ok: false, code: "send_failed", message: err instanceof Error ? err.name : "error" }) as const
  );
  const status = r.ok ? "enviado" : r.code === "not_configured" ? "omitido" : "fallido";
  await cerrar(organizationId, id, status, r.ok ? null : r.message.slice(0, 500));
  return status;
}

function enlaceALaCursada(enrollmentId: string): string {
  const base = getEnv().APP_BASE_URL.replace(/\/+$/, "");
  return `${base}/portal/cursadas/${encodeURIComponent(enrollmentId)}?tab=evaluaciones`;
}

/** Contacto del Laboratorio: alguna conversación `is_test`. Jamás recibe nada. */
function esDePrueba() {
  return exists(
    getDb()
      .select({ uno: sql`1` })
      .from(schema.conversation)
      .where(
        and(
          eq(schema.conversation.contactId, schema.contact.id),
          eq(schema.conversation.isTest, true)
        )
      )
  );
}

/* ============================================================
 * "Tu corrección fue publicada"
 * ============================================================ */

/**
 * La llama `publicarCorreccion()` después del commit. Si la versión ya no
 * está publicada (la reemplazó otra antes de que corriera esto), no avisa.
 */
export async function avisarCorreccionPublicada(
  organizationId: string,
  correctionId: string
): Promise<void> {
  try {
    const listo = await withOrganizationScope(organizationId, ACTOR, async () => {
      const [f] = await getDb()
        .select({
          status: schema.correction.status,
          assessmentId: schema.correction.assessmentId,
          enrollmentId: schema.correction.enrollmentId,
          evaluacion: schema.assessment.name,
          curso: schema.course.name,
          firstName: schema.contact.firstName,
          lastName: schema.contact.lastName,
          email: schema.contact.email,
          archivedAt: schema.contact.archivedAt,
          prueba: sql<boolean>`${esDePrueba()}`,
        })
        .from(schema.correction)
        .innerJoin(schema.assessment, eq(schema.assessment.id, schema.correction.assessmentId))
        .innerJoin(schema.cohort, eq(schema.cohort.id, schema.assessment.cohortId))
        .innerJoin(schema.course, eq(schema.course.id, schema.cohort.courseId))
        .innerJoin(schema.enrollment, eq(schema.enrollment.id, schema.correction.enrollmentId))
        .innerJoin(schema.contact, eq(schema.contact.id, schema.enrollment.contactId))
        .where(
          scoped(schema.correction.organizationId, organizationId, eq(schema.correction.id, correctionId))
        )
        .limit(1);
      if (!f || f.status !== "published") return null;
      const email = f.email?.trim();
      if (!email || f.archivedAt || f.prueba === true) return null;

      const id = await reclamar(organizationId, {
        kind: "correccion_publicada",
        assessmentId: f.assessmentId,
        enrollmentId: f.enrollmentId,
        correctionId,
        dedupKey: claveDeCorreccionPublicada(correctionId),
      });
      if (!id) return null;
      return {
        id,
        email,
        correo: armarCorreccionPublicada({
          nombre: f.firstName?.trim() || fullName(f) || "",
          evaluacion: f.evaluacion,
          curso: f.curso,
          enlace: enlaceALaCursada(f.enrollmentId),
        }),
      };
    });
    if (listo) await mandar(organizationId, listo.id, listo.email, listo.correo);
  } catch (err) {
    console.error("[evaluaciones] aviso de corrección publicada falló:", err instanceof Error ? err.name : "error");
  }
}

/* ============================================================
 * El recordatorio antes del plazo
 * ============================================================ */

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Los recordatorios que tocan AHORA en una organización. La selección fina es
 * pura (`seleccionarRecordatorios`); acá se juntan los datos: el plazo
 * efectivo del grupo (propio o la entrega final heredada), la prórroga, si
 * entregó, si ya tiene resultado, el correo, si es de prueba o de baja y si
 * su acceso venció.
 */
export async function recordatoriosQueTocan(
  organizationId: string,
  now: Date,
  dias: number
): Promise<(RecordatorioQueToca & { email: string; nombre: string; evaluacion: string; curso: string })[]> {
  if (!(dias > 0)) return [];
  const db = getDb();
  const timeZone = await zonaDeLaOrganizacion(organizationId);
  const hasta = new Date(now.getTime() + dias * DIA_MS);

  // Evaluaciones con algún plazo de grupo (propio o entrega final).
  const evaluaciones = await db
    .select({
      id: schema.assessment.id,
      name: schema.assessment.name,
      cohortId: schema.assessment.cohortId,
      dueAt: schema.assessment.dueAt,
      deliveryDeadline: schema.cohort.deliveryDeadline,
      curso: schema.course.name,
    })
    .from(schema.assessment)
    .innerJoin(schema.cohort, eq(schema.cohort.id, schema.assessment.cohortId))
    .innerJoin(schema.course, eq(schema.course.id, schema.cohort.courseId))
    .where(
      scoped(
        schema.assessment.organizationId,
        organizationId,
        or(isNotNull(schema.assessment.dueAt), isNotNull(schema.cohort.deliveryDeadline))
      )
    );

  const plazoDelGrupo = new Map(
    evaluaciones.map((a) => [
      a.id,
      plazoDeEvaluacion(a.dueAt, instanteDeEntregaFinal(a.deliveryDeadline, timeZone)),
    ])
  );

  // Las prórrogas que caen en la ventana (pueden revivir un plazo de grupo ya pasado).
  const prorrogasEnVentana = await db
    .select({ assessmentId: schema.assessmentExtension.assessmentId })
    .from(schema.assessmentExtension)
    .where(
      scoped(
        schema.assessmentExtension.organizationId,
        organizationId,
        sql`${schema.assessmentExtension.dueAt} > ${now} and ${schema.assessmentExtension.dueAt} <= ${hasta}`
      )
    );
  const conProrroga = new Set(prorrogasEnVentana.map((p) => p.assessmentId));

  const candidatas = evaluaciones.filter((a) => {
    const p = plazoDelGrupo.get(a.id);
    const enVentana = p !== null && p !== undefined && p.getTime() > now.getTime() && p.getTime() <= hasta.getTime();
    return enVentana || conProrroga.has(a.id);
  });
  if (candidatas.length === 0) return [];

  const assessmentIds = candidatas.map((a) => a.id);
  const cohortIds = [...new Set(candidatas.map((a) => a.cohortId))];

  const [inscripciones, prorrogas, entregas, resultados] = await Promise.all([
    db
      .select({
        id: schema.enrollment.id,
        cohortId: schema.enrollment.cohortId,
        firstName: schema.contact.firstName,
        lastName: schema.contact.lastName,
        email: schema.contact.email,
        archivedAt: schema.contact.archivedAt,
        etapa: schema.pipelineStage.kind,
        prueba: sql<boolean>`${esDePrueba()}`,
      })
      .from(schema.enrollment)
      .innerJoin(schema.contact, eq(schema.contact.id, schema.enrollment.contactId))
      .innerJoin(schema.pipelineStage, eq(schema.pipelineStage.id, schema.enrollment.stageId))
      .where(scoped(schema.enrollment.organizationId, organizationId, inArray(schema.enrollment.cohortId, cohortIds))),
    db
      .select({
        assessmentId: schema.assessmentExtension.assessmentId,
        enrollmentId: schema.assessmentExtension.enrollmentId,
        dueAt: schema.assessmentExtension.dueAt,
      })
      .from(schema.assessmentExtension)
      .where(
        scoped(
          schema.assessmentExtension.organizationId,
          organizationId,
          inArray(schema.assessmentExtension.assessmentId, assessmentIds)
        )
      ),
    db
      .selectDistinct({
        assessmentId: schema.submission.assessmentId,
        enrollmentId: schema.submission.enrollmentId,
      })
      .from(schema.submission)
      .where(
        scoped(schema.submission.organizationId, organizationId, inArray(schema.submission.assessmentId, assessmentIds))
      ),
    db
      .select({
        assessmentId: schema.assessmentResult.assessmentId,
        enrollmentId: schema.assessmentResult.enrollmentId,
      })
      .from(schema.assessmentResult)
      .where(
        scoped(
          schema.assessmentResult.organizationId,
          organizationId,
          and(
            inArray(schema.assessmentResult.assessmentId, assessmentIds),
            isNotNull(schema.assessmentResult.passed)
          )
        )
      ),
  ]);
  if (inscripciones.length === 0) return [];

  const accesos = await estadosDeAcceso(
    organizationId,
    inscripciones.map((i) => i.id),
    now
  );
  const par = (a: string, e: string) => `${a}|${e}`;
  const prorrogaDe = new Map(prorrogas.map((p) => [par(p.assessmentId, p.enrollmentId), p.dueAt]));
  const entregaron = new Set(entregas.map((s) => par(s.assessmentId, s.enrollmentId)));
  const conResultado = new Set(resultados.map((r) => par(r.assessmentId, r.enrollmentId)));

  const candidatos: CandidatoARecordatorio[] = [];
  for (const a of candidatas) {
    for (const i of inscripciones) {
      if (i.cohortId !== a.cohortId) continue;
      candidatos.push({
        assessmentId: a.id,
        enrollmentId: i.id,
        plazoDelGrupo: plazoDelGrupo.get(a.id) ?? null,
        prorroga: prorrogaDe.get(par(a.id, i.id)) ?? null,
        entrego: entregaron.has(par(a.id, i.id)),
        tieneResultado: conResultado.has(par(a.id, i.id)),
        email: i.email,
        esPrueba: i.prueba === true,
        dadoDeBaja: i.archivedAt !== null || i.etapa === "lost",
        accesoVencido: accesos.get(i.id)?.vencido === true,
      });
    }
  }

  const porId = new Map(inscripciones.map((i) => [i.id, i]));
  const porEvaluacion = new Map(candidatas.map((a) => [a.id, a]));
  return seleccionarRecordatorios(candidatos, now, dias).map((r) => {
    const i = porId.get(r.enrollmentId)!;
    const a = porEvaluacion.get(r.assessmentId)!;
    return {
      ...r,
      email: i.email!.trim(),
      nombre: i.firstName?.trim() || fullName(i) || "",
      evaluacion: a.name,
      curso: a.curso,
    };
  });
}

/** Una pasada en una organización. Devuelve cuántos correos intentó. Nunca lanza. */
export async function runAssessmentRemindersForOrg(
  organizationId: string,
  now = new Date(),
  dias = getEnv().ASSESSMENT_REMINDER_DAYS
): Promise<number> {
  let intentados = 0;
  try {
    const { tocan, timeZone } = await withOrganizationScope(organizationId, ACTOR, async () => ({
      tocan: await recordatoriosQueTocan(organizationId, now, dias),
      timeZone: await zonaDeLaOrganizacion(organizationId),
    }));
    // Uno por uno, cada uno con su reclamo: un fallo no frena al siguiente.
    for (const r of tocan) {
      try {
        const id = await withOrganizationScope(organizationId, ACTOR, () =>
          reclamar(organizationId, {
            kind: "recordatorio",
            assessmentId: r.assessmentId,
            enrollmentId: r.enrollmentId,
            dueAt: r.vigente,
            dedupKey: r.clave,
          })
        );
        if (!id) continue;
        intentados++;
        await mandar(
          organizationId,
          id,
          r.email,
          armarRecordatorio({
            nombre: r.nombre,
            evaluacion: r.evaluacion,
            curso: r.curso,
            vigente: r.vigente,
            timeZone,
            enlace: enlaceALaCursada(r.enrollmentId),
          })
        );
      } catch (err) {
        console.error("[evaluaciones] recordatorio falló:", err instanceof Error ? err.name : "error");
      }
    }
  } catch (err) {
    console.error("[evaluaciones] recordatorios: la pasada falló:", err instanceof Error ? err.name : "error");
  }
  return intentados;
}

/* ============================================================
 * La periódica (mismo diseño que la de talleres)
 * ============================================================ */

export type AssessmentReminderSchedulerDeps = {
  intervalMin: number;
  bootDelayMs: number;
  organizations: () => Promise<string[]>;
  runOrg: (orgId: string) => Promise<number>;
  log: (msg: string) => void;
};

const MIN = 60_000;
type State = { timeout: ReturnType<typeof setTimeout>; interval: ReturnType<typeof setInterval> };
// En globalThis: en desarrollo Next reevalúa los módulos y dos copias serían dos temporizadores.
const globalForReminders = globalThis as unknown as { __caditAssessmentReminders?: State | null };

/**
 * `ASSESSMENT_REMINDER_INTERVAL_MIN=0` la apaga (default). La arranca
 * `startAssessmentRemindersOnBoot` con la guarda `shouldStartScheduler`:
 * nunca en tests ni en `next build`. Los temporizadores van con `unref()`.
 */
export function startAssessmentReminderScheduler(
  deps: AssessmentReminderSchedulerDeps = defaultAssessmentReminderDeps()
): boolean {
  if (!(deps.intervalMin > 0)) return false;
  if (globalForReminders.__caditAssessmentReminders) return false;

  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      let orgs: string[];
      try {
        orgs = await deps.organizations();
      } catch (err) {
        deps.log(`[evaluaciones] recordatorio: no se pudo leer organizaciones (${err instanceof Error ? err.name : "error"})`);
        return;
      }
      for (const orgId of orgs) {
        try {
          const n = await deps.runOrg(orgId);
          if (n > 0) deps.log(`[evaluaciones] recordatorio: ${orgId} → ${n} intento(s)`);
        } catch (err) {
          deps.log(`[evaluaciones] recordatorio: ${orgId} falló (${err instanceof Error ? err.name : "error"})`);
        }
      }
    } finally {
      busy = false;
    }
  };

  const timeout = setTimeout(() => void tick(), deps.bootDelayMs);
  timeout.unref?.();
  const interval = setInterval(() => void tick(), deps.intervalMin * MIN);
  interval.unref?.();
  globalForReminders.__caditAssessmentReminders = { timeout, interval };
  deps.log(`[evaluaciones] recordatorio encendido: cada ${deps.intervalMin} min`);
  return true;
}

export function stopAssessmentReminderScheduler(): void {
  const s = globalForReminders.__caditAssessmentReminders;
  if (!s) return;
  clearTimeout(s.timeout);
  clearInterval(s.interval);
  globalForReminders.__caditAssessmentReminders = null;
}

export function defaultAssessmentReminderDeps(): AssessmentReminderSchedulerDeps {
  return {
    intervalMin: getEnv().ASSESSMENT_REMINDER_INTERVAL_MIN,
    bootDelayMs: 50_000,
    // `organization` no tiene RLS (no es tabla de dominio).
    organizations: async () =>
      (await getRootDb().select({ id: schema.organization.id }).from(schema.organization)).map((o) => o.id),
    runOrg: (orgId) => runAssessmentRemindersForOrg(orgId),
    log: (m) => console.log(m),
  };
}

export { DIAS_DE_RECORDATORIO };
