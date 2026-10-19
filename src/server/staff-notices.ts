import { asc, eq, gte, inArray, isNotNull, isNull } from "drizzle-orm";
import { getEnv } from "@/lib/env";
import { getDb, getRootDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { withOrganizationScope } from "@/lib/db/with-tenant";
import { sendMail } from "@/lib/m365/client";
import {
  armarAvisoFacturacion,
  armarAvisoSoporte,
  avisoDeFacturacionQueToca,
  avisosQueTocan,
  claveDeAviso,
  COHORT_NOTICE_KINDS,
  columnasDelSujeto,
  destinatariosDeArea,
  puedeReclamar,
  sinFacturar,
  type AlumnoParaSoporte,
  type AvisoRegistrado,
  type BillingNoticeKind,
  type CohortNoticeKind,
  type Destinatarios,
  type StaffNoticeStatus,
  type SujetoDeAviso,
} from "@/lib/staff-notices";
import { getAreaConfig } from "@/server/areas/config";
import { organizationTimezone } from "@/server/finanzas-periodo";

/**
 * 039 — Avisos internos por correo: Soporte al confirmar una cohorte y
 * Administración 7 y 2 días antes del inicio.
 *
 * Las reglas (cuándo, a quién, qué dice) son puras y están probadas en
 * `src/lib/staff-notices.ts`; acá se lee la base y se manda.
 *
 * Lo que sostiene el diseño, igual que el recordatorio de talleres:
 *
 *  - **Un aviso por cohorte y tipo** (`staff_notice`, UNIQUE): se RECLAMA
 *    (`pending`) en una transacción corta, con compare-and-swap sobre el
 *    estado anterior, ANTES de mandar. Dos procesos, un reinicio o un doble
 *    click no duplican.
 *  - **Ninguna transacción abierta durante el HTTP a Graph**: reclamar, mandar
 *    y registrar el resultado son tres pasos.
 *  - **Nunca lanza.** Un área apagada o sin casilla se OMITE y se registra; un
 *    fallo del correo queda `failed` (y se reintenta) y jamás deshace la
 *    confirmación, que ya confirmó su propia transacción.
 */

const ACTOR = "system:avisos-internos";

type Origen = "confirmacion" | "periodica";

export const ACTOR_AVISOS = ACTOR;

export type ResultadoAviso = StaffNoticeStatus | "no_corresponde";

const nombre = (first: string, last: string | null) => [first, last].filter(Boolean).join(" ").trim();

const AREA_DEL_AVISO = {
  cohorte_confirmada: "soporte",
  facturacion_t7: "administracion",
  facturacion_t2: "administracion",
} as const satisfies Record<CohortNoticeKind, "soporte" | "administracion">;

/* ============================================================
 * Lecturas
 * ============================================================ */

async function leerCohorte(organizationId: string, cohortId: string) {
  const rows = await getDb()
    .select({
      id: schema.cohort.id,
      name: schema.cohort.name,
      startDate: schema.cohort.startDate,
      startTime: schema.cohort.startTime,
      confirmedAt: schema.cohort.confirmedAt,
      courseName: schema.course.name,
      teacherName: schema.teacher.name,
    })
    .from(schema.cohort)
    .innerJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .leftJoin(schema.teacher, eq(schema.cohort.teacherId, schema.teacher.id))
    .where(scoped(schema.cohort.organizationId, organizationId, eq(schema.cohort.id, cohortId)))
    .limit(1);
  return rows[0] ?? null;
}

/** 041 — El registro de un aviso por su llave (`claveDeAviso`), única por organización. */
export async function leerRegistroDeAviso(organizationId: string, sujeto: SujetoDeAviso) {
  const rows = await getDb()
    .select({
      id: schema.staffNotice.id,
      status: schema.staffNotice.status,
      attempts: schema.staffNotice.attempts,
      claimedAt: schema.staffNotice.claimedAt,
    })
    .from(schema.staffNotice)
    .where(
      scoped(
        schema.staffNotice.organizationId,
        organizationId,
        eq(schema.staffNotice.dedupKey, claveDeAviso(sujeto))
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Los alumnos que Soporte tiene que preparar: toda inscripción ACTIVA cuya
 * cohorte es esta (contacto sin baja), con sus licencias.
 *
 * Se toman las inscripciones de ESTA cohorte, madres o hijas: en un curso o
 * una especialización son las madres; en un módulo son las hijas, y sin ellas
 * confirmar un módulo avisaría que no cursa nadie.
 */
async function alumnosParaSoporte(organizationId: string, cohortId: string): Promise<AlumnoParaSoporte[]> {
  const db = getDb();
  const inscripciones = await db
    .select({
      enrollmentId: schema.enrollment.id,
      firstName: schema.contact.firstName,
      lastName: schema.contact.lastName,
      email: schema.contact.email,
      phone: schema.contact.phone,
      hadOwnLicense: schema.enrollment.hadOwnLicense,
    })
    .from(schema.enrollment)
    .innerJoin(schema.contact, eq(schema.enrollment.contactId, schema.contact.id))
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        eq(schema.enrollment.cohortId, cohortId),
        isNull(schema.contact.archivedAt)
      )
    )
    .orderBy(asc(schema.contact.firstName), asc(schema.contact.lastName));
  if (inscripciones.length === 0) return [];

  const licencias = await db
    .select({
      enrollmentId: schema.license.enrollmentId,
      programa: schema.software.name,
      origen: schema.license.source,
      asignada: schema.license.assigned,
    })
    .from(schema.license)
    .innerJoin(schema.software, eq(schema.license.softwareId, schema.software.id))
    .where(
      scoped(
        schema.license.organizationId,
        organizationId,
        inArray(
          schema.license.enrollmentId,
          inscripciones.map((i) => i.enrollmentId)
        )
      )
    )
    .orderBy(asc(schema.software.name));

  return inscripciones.map((i) => ({
    nombre: nombre(i.firstName, i.lastName),
    email: i.email,
    telefono: i.phone,
    licenciaPropia: i.hadOwnLicense,
    licencias: licencias
      .filter((l) => l.enrollmentId === i.enrollmentId)
      .map((l) => ({ programa: l.programa, origen: l.origen, asignada: l.asignada })),
  }));
}

async function softwareDeLaCohorte(organizationId: string, cohortId: string) {
  const db = getDb();
  const [declarado, grupo] = await Promise.all([
    db
      .select({ name: schema.software.name })
      .from(schema.cohortSoftware)
      .innerJoin(schema.software, eq(schema.cohortSoftware.softwareId, schema.software.id))
      .where(
        scoped(schema.cohortSoftware.organizationId, organizationId, eq(schema.cohortSoftware.cohortId, cohortId))
      )
      .orderBy(asc(schema.software.name)),
    db
      .select({ name: schema.software.name })
      .from(schema.cohortGroupSoftware)
      .innerJoin(schema.software, eq(schema.cohortGroupSoftware.softwareId, schema.software.id))
      .where(
        scoped(
          schema.cohortGroupSoftware.organizationId,
          organizationId,
          eq(schema.cohortGroupSoftware.cohortId, cohortId)
        )
      )
      .orderBy(asc(schema.software.name)),
  ]);
  return { declarado: declarado.map((s) => s.name), grupo: grupo.map((s) => s.name) };
}

/** Las inscripciones de la cohorte con lo que Administración necesita para facturar. */
async function inscripcionesParaFacturar(organizationId: string, cohortId: string) {
  const rows = await getDb()
    .select({
      enrollmentId: schema.enrollment.id,
      parentEnrollmentId: schema.enrollment.parentEnrollmentId,
      invoiceNumber: schema.enrollment.invoiceNumber,
      amount: schema.enrollment.amount,
      currency: schema.enrollment.currency,
      enrollmentNationalId: schema.enrollment.nationalId,
      firstName: schema.contact.firstName,
      lastName: schema.contact.lastName,
      email: schema.contact.email,
      contactNationalId: schema.contact.nationalId,
      archivedAt: schema.contact.archivedAt,
      legalName: schema.company.legalName,
      taxId: schema.company.taxId,
    })
    .from(schema.enrollment)
    .innerJoin(schema.contact, eq(schema.enrollment.contactId, schema.contact.id))
    .leftJoin(schema.company, eq(schema.enrollment.companyId, schema.company.id))
    .where(
      scoped(schema.enrollment.organizationId, organizationId, eq(schema.enrollment.cohortId, cohortId))
    )
    .orderBy(asc(schema.contact.firstName), asc(schema.contact.lastName));
  return rows.map((r) => ({
    enrollmentId: r.enrollmentId,
    nombre: nombre(r.firstName, r.lastName),
    email: r.email,
    nationalId: r.enrollmentNationalId ?? r.contactNationalId,
    invoiceNumber: r.invoiceNumber,
    amount: r.amount,
    currency: r.currency,
    empresa: r.legalName ? { razonSocial: r.legalName, rut: r.taxId } : null,
    deBaja: r.archivedAt !== null,
    esHija: r.parentEnrollmentId !== null,
  }));
}

/* ============================================================
 * Reclamar, mandar, registrar
 * ============================================================ */

export type Envio = {
  id: string;
  claimedAt: Date;
  destinatarios: Destinatarios;
  subject: string;
  html: string;
};

/**
 * Reclama el aviso con compare-and-swap. Devuelve el id reclamado, o `null` si
 * no corresponde o lo tomó otro.
 */
export async function reclamarAviso(
  organizationId: string,
  sujeto: SujetoDeAviso,
  previo: (AvisoRegistrado & { id: string }) | null,
  now: Date
): Promise<string | null> {
  const db = getDb();
  if (!previo) {
    const id = newId("staffNotice");
    const insertado = await db
      .insert(schema.staffNotice)
      .values({
        id,
        organizationId,
        ...columnasDelSujeto(sujeto),
        dedupKey: claveDeAviso(sujeto),
        kind: sujeto.kind,
        status: "pending",
        attempts: 1,
        claimedAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: schema.staffNotice.id });
    return insertado[0]?.id ?? null;
  }
  const reclamado = await db
    .update(schema.staffNotice)
    .set({
      status: "pending",
      // Una cancelación (se quitó la confirmación) arranca la cuenta de nuevo.
      attempts: previo.status === "cancelled" ? 1 : previo.attempts + 1,
      claimedAt: now,
      detail: null,
      error: null,
      updatedAt: now,
    })
    .where(
      scoped(
        schema.staffNotice.organizationId,
        organizationId,
        eq(schema.staffNotice.id, previo.id),
        eq(schema.staffNotice.status, previo.status),
        eq(schema.staffNotice.attempts, previo.attempts)
      )
    )
    .returning({ id: schema.staffNotice.id });
  return reclamado[0]?.id ?? null;
}

export async function cerrarAviso(
  organizationId: string,
  id: string,
  claimedAt: Date,
  values: {
    status: StaffNoticeStatus;
    detail?: string | null;
    error?: string | null;
    recipients?: Destinatarios;
    subject?: string | null;
    sentAt?: Date | null;
  }
): Promise<void> {
  await getDb()
    .update(schema.staffNotice)
    .set({ ...values, updatedAt: new Date() })
    .where(
      scoped(
        schema.staffNotice.organizationId,
        organizationId,
        eq(schema.staffNotice.id, id),
        // La ficha del reclamo: si otro proceso lo volvió a tomar, el
        // resultado de este intento ya no es el que vale.
        eq(schema.staffNotice.claimedAt, claimedAt)
      )
    );
}

/**
 * Paso 1, en una transacción corta: decidir, reclamar y armar el correo. Lo
 * que se omite (área sin casilla, nada que facturar) se cierra acá mismo.
 */
async function prepararEnvio(
  organizationId: string,
  cohortId: string,
  kind: CohortNoticeKind,
  origen: Origen,
  now: Date
): Promise<Envio | ResultadoAviso> {
  const sujeto: SujetoDeAviso = { kind, cohortId };
  return withOrganizationScope(organizationId, ACTOR, async () => {
    const cohorte = await leerCohorte(organizationId, cohortId);
    if (!cohorte?.confirmedAt) return "no_corresponde";
    const timeZone = await organizationTimezone(organizationId);

    if (kind !== "cohorte_confirmada" && avisoDeFacturacionQueToca(cohorte, now, timeZone) !== kind) {
      return "no_corresponde";
    }

    const previo = await leerRegistroDeAviso(organizationId, sujeto);
    if (!puedeReclamar(previo, now, { reintentarOmitido: origen === "confirmacion" })) {
      return "no_corresponde";
    }
    const id = await reclamarAviso(organizationId, sujeto, previo, now);
    if (!id) return "no_corresponde";

    const area = await getAreaConfig(organizationId, AREA_DEL_AVISO[kind]);
    const destinatarios = destinatariosDeArea(area);
    if (!destinatarios) {
      await cerrarAviso(organizationId, id, now, { status: "skipped", detail: "area_sin_configurar" });
      return "skipped";
    }

    const base = {
      curso: cohorte.courseName,
      cohorte: cohorte.name,
      startDate: cohorte.startDate,
      startTime: cohorte.startTime,
      timeZone,
    };

    let correo: { subject: string; html: string };
    if (kind === "cohorte_confirmada") {
      const [alumnos, software] = await Promise.all([
        alumnosParaSoporte(organizationId, cohortId),
        softwareDeLaCohorte(organizationId, cohortId),
      ]);
      correo = armarAvisoSoporte({
        ...base,
        profesor: cohorte.teacherName,
        softwareDeLaCohorte: software.declarado,
        programasDelGrupo: software.grupo,
        alumnos,
      });
    } else {
      const pendientes = sinFacturar(await inscripcionesParaFacturar(organizationId, cohortId));
      if (pendientes.length === 0) {
        await cerrarAviso(organizationId, id, now, {
          status: "skipped",
          detail: "nada_que_enviar",
          recipients: destinatarios,
        });
        return "skipped";
      }
      correo = armarAvisoFacturacion(kind as BillingNoticeKind, { ...base, pendientes });
    }

    await getDb()
      .update(schema.staffNotice)
      .set({ recipients: destinatarios, subject: correo.subject, updatedAt: now })
      .where(scoped(schema.staffNotice.organizationId, organizationId, eq(schema.staffNotice.id, id)));
    return { id, claimedAt: now, destinatarios, ...correo };
  });
}

/**
 * Pasos 2 y 3: manda el correo FUERA de toda transacción y registra el
 * resultado, solo si el reclamo sigue siendo el mismo (`claimed_at`). Nunca
 * lanza. M365 sin configurar → `skipped / correo_sin_configurar`.
 */
export async function mandarAviso(
  organizationId: string,
  envio: Envio,
  etiqueta: string
): Promise<StaffNoticeStatus> {
  const r = await sendMail({
    to: envio.destinatarios.to,
    cc: envio.destinatarios.cc,
    subject: envio.subject,
    html: envio.html,
  }).catch((err: unknown) => ({
    ok: false as const,
    code: "send_failed" as const,
    message: err instanceof Error ? err.message : "error al enviar",
  }));

  const resultado: StaffNoticeStatus = r.ok
    ? "sent"
    : r.code === "not_configured"
      ? "skipped"
      : "failed";
  try {
    await withOrganizationScope(organizationId, ACTOR, () =>
      cerrarAviso(organizationId, envio.id, envio.claimedAt, {
        status: resultado,
        detail: !r.ok && r.code === "not_configured" ? "correo_sin_configurar" : null,
        error: r.ok ? null : r.message.slice(0, 500),
        sentAt: r.ok ? new Date() : null,
      })
    );
  } catch (err) {
    // El correo ya salió (o no): el reclamo vencido lo resuelve la próxima pasada.
    console.error(`[avisos] ${etiqueta}: no se pudo registrar (${err instanceof Error ? err.name : "error"})`);
  }
  return resultado;
}

/**
 * Manda UN aviso de una cohorte, si corresponde. Nunca lanza: devuelve en qué
 * quedó (`no_corresponde` si no tocaba, ya salió o lo tomó otro proceso).
 */
export async function enviarAviso(
  organizationId: string,
  cohortId: string,
  kind: CohortNoticeKind,
  origen: Origen,
  now = new Date()
): Promise<ResultadoAviso> {
  let envio: Envio | ResultadoAviso;
  try {
    envio = await prepararEnvio(organizationId, cohortId, kind, origen, now);
  } catch (err) {
    console.error(`[avisos] ${kind} ${cohortId}: no se pudo preparar (${err instanceof Error ? err.name : "error"})`);
    return "no_corresponde";
  }
  if (typeof envio === "string") return envio;
  return mandarAviso(organizationId, envio, `${kind} ${cohortId}`);
}

/* ============================================================
 * Confirmar / quitar la confirmación (efectos sobre los avisos)
 * ============================================================ */

/**
 * Al quitar la confirmación, los avisos de FACTURACIÓN que todavía no salieron
 * se cancelan (`pending`, `failed`, `skipped` → `cancelled`). Si la cohorte se
 * vuelve a confirmar, pueden salir; lo ya enviado no se repite nunca. El aviso
 * a Soporte no se toca: lo que ya se le dijo a Soporte no se des-dice por
 * correo, y reconfirmar no se lo vuelve a mandar si ya salió.
 *
 * Corre dentro de la transacción del pedido (RLS).
 */
export async function cancelarAvisosDeFacturacion(organizationId: string, cohortId: string): Promise<number> {
  const cancelados = await getDb()
    .update(schema.staffNotice)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(
      scoped(
        schema.staffNotice.organizationId,
        organizationId,
        eq(schema.staffNotice.cohortId, cohortId),
        inArray(schema.staffNotice.kind, ["facturacion_t7", "facturacion_t2"]),
        inArray(schema.staffNotice.status, ["pending", "failed", "skipped"])
      )
    )
    .returning({ id: schema.staffNotice.id });
  return cancelados.length;
}

/* ============================================================
 * La periódica
 * ============================================================ */

/** Margen hacia atrás de la consulta: el día de inicio en cualquier zona. */
const DIA_MS = 24 * 60 * 60_000;

/**
 * Los avisos que tocan AHORA en una organización: cohortes confirmadas que
 * todavía no empezaron, y por cada una lo que decide `avisosQueTocan`.
 */
export async function avisosPendientesEnOrg(
  organizationId: string,
  now = new Date()
): Promise<{ cohortId: string; kind: CohortNoticeKind }[]> {
  return withOrganizationScope(organizationId, ACTOR, async () => {
    const db = getDb();
    const timeZone = await organizationTimezone(organizationId);
    const cohortes = await db
      .select({
        id: schema.cohort.id,
        startDate: schema.cohort.startDate,
        confirmedAt: schema.cohort.confirmedAt,
      })
      .from(schema.cohort)
      .where(
        scoped(
          schema.cohort.organizationId,
          organizationId,
          isNotNull(schema.cohort.confirmedAt),
          gte(schema.cohort.startDate, new Date(now.getTime() - DIA_MS))
        )
      );
    if (cohortes.length === 0) return [];

    const registros = await db
      .select({
        cohortId: schema.staffNotice.cohortId,
        kind: schema.staffNotice.kind,
        status: schema.staffNotice.status,
        attempts: schema.staffNotice.attempts,
        claimedAt: schema.staffNotice.claimedAt,
      })
      .from(schema.staffNotice)
      .where(
        scoped(
          schema.staffNotice.organizationId,
          organizationId,
          inArray(
            schema.staffNotice.cohortId,
            cohortes.map((c) => c.id)
          ),
          inArray(schema.staffNotice.kind, [...COHORT_NOTICE_KINDS])
        )
      );

    const out: { cohortId: string; kind: CohortNoticeKind }[] = [];
    for (const c of cohortes) {
      const propios: Partial<Record<CohortNoticeKind, AvisoRegistrado>> = {};
      for (const r of registros) {
        if (r.cohortId !== c.id) continue;
        const kind = COHORT_NOTICE_KINDS.find((k) => k === r.kind);
        if (kind) propios[kind] = r;
      }
      for (const kind of avisosQueTocan(c, propios, now, timeZone)) out.push({ cohortId: c.id, kind });
    }
    return out;
  });
}

export async function runStaffNoticesForOrg(organizationId: string, now = new Date()): Promise<number> {
  const pendientes = await avisosPendientesEnOrg(organizationId, now);
  // Uno por uno, cada uno en sus alcances cortos: un fallo no frena al siguiente.
  for (const p of pendientes) await enviarAviso(organizationId, p.cohortId, p.kind, "periodica", now);
  return pendientes.length;
}

/* ============================================================
 * El temporizador (mismo diseño que `workshop-reminders.ts`)
 * ============================================================ */

export type StaffNoticeSchedulerDeps = {
  intervalMin: number;
  bootDelayMs: number;
  organizations: () => Promise<string[]>;
  /** Devuelve cuántos avisos intentó en esa organización. */
  runOrg: (orgId: string) => Promise<number>;
  log: (msg: string) => void;
};

const MIN = 60_000;

type State = { timeout: ReturnType<typeof setTimeout>; interval: ReturnType<typeof setInterval> };

// En globalThis: en desarrollo Next reevalúa los módulos y dos copias serían
// dos temporizadores.
const globalForNotices = globalThis as unknown as { __caditStaffNotices?: State | null };

/**
 * `STAFF_NOTICES_INTERVAL_MIN=0` la apaga (default), y no arranca nunca en
 * los tests ni durante `next build` (lo decide `shouldStartScheduler` en
 * `instrumentation-node.ts`). Los temporizadores van con `unref()`.
 */
export function startStaffNoticeScheduler(
  deps: StaffNoticeSchedulerDeps = defaultStaffNoticeDeps()
): boolean {
  if (!(deps.intervalMin > 0)) return false;
  if (globalForNotices.__caditStaffNotices) return false;

  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      let orgs: string[];
      try {
        orgs = await deps.organizations();
      } catch (err) {
        deps.log(`[avisos] periódica: no se pudo leer organizaciones (${err instanceof Error ? err.name : "error"})`);
        return;
      }
      for (const orgId of orgs) {
        try {
          const n = await deps.runOrg(orgId);
          if (n > 0) deps.log(`[avisos] periódica: ${orgId} → ${n} intento(s)`);
        } catch (err) {
          deps.log(`[avisos] periódica: ${orgId} falló (${err instanceof Error ? err.name : "error"})`);
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
  globalForNotices.__caditStaffNotices = { timeout, interval };
  deps.log(`[avisos] periódica encendida: cada ${deps.intervalMin} min`);
  return true;
}

export function stopStaffNoticeScheduler(): void {
  const s = globalForNotices.__caditStaffNotices;
  if (!s) return;
  clearTimeout(s.timeout);
  clearInterval(s.interval);
  globalForNotices.__caditStaffNotices = null;
}

export function defaultStaffNoticeDeps(): StaffNoticeSchedulerDeps {
  return {
    intervalMin: getEnv().STAFF_NOTICES_INTERVAL_MIN,
    bootDelayMs: 60_000,
    // `organization` no tiene RLS (no es tabla de dominio).
    organizations: async () =>
      (await getRootDb().select({ id: schema.organization.id }).from(schema.organization)).map((o) => o.id),
    // 041 — Una sola periódica: los avisos de cohorte (039) y los de cobranza.
    // Import dinámico: `billing-notices` ya importa este módulo.
    runOrg: async (orgId) => (await import("@/server/billing-notices")).runInternalNoticesForOrg(orgId),
    log: (m) => console.log(m),
  };
}

