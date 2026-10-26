import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { getEnv } from "@/lib/env";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { withOrganizationScope } from "@/lib/db/with-tenant";
import {
  armarAvisoSinConfirmar,
  avisoSinConfirmarQueToca,
  avisoSinConfirmarQueTocaHoy,
  correosConCapacidad,
  grupoRecibeAvisoSinConfirmar,
  sujetoSinConfirmar,
} from "@/lib/avisos-sin-confirmar";
import {
  claveDeAviso,
  puedeReclamar,
  UNCONFIRMED_NOTICE_KINDS,
  type UnconfirmedNoticeKind,
} from "@/lib/staff-notices";
import { organizationTimezone } from "@/server/finanzas-periodo";
import {
  ACTOR_AVISOS,
  cerrarAviso,
  leerRegistroDeAviso,
  mandarAviso,
  reclamarAviso,
  type Envio,
  type ResultadoAviso,
} from "@/server/staff-notices";

/**
 * Avisos de grupos SIN CONFIRMAR (T-7, T-2 y el día de inicio) a quienes
 * pueden confirmarlos. Las reglas son puras (`src/lib/avisos-sin-confirmar.ts`);
 * acá se lee la base y se manda con la MISMA maquinaria de 039:
 *
 *  - se RECLAMA en `staff_notice` (compare-and-swap) en una transacción corta,
 *  - se manda FUERA de toda transacción (`mandarAviso`),
 *  - nunca lanza: sin destinatarios se OMITE y se registra.
 *
 * Corre en la misma periódica (`runInternalNoticesForOrg`, `STAFF_NOTICES_INTERVAL_MIN`).
 */

const DIA_MS = 24 * 60 * 60_000;

/** Quiénes tienen `cohortes.confirmar` en la organización (por capacidad, nunca por nombre de rol). */
async function correosDeQuienesConfirman(organizationId: string): Promise<string[]> {
  const db = getDb();
  // `member` y `role` están fuera de RLS a propósito (responden "¿de quién es esto?").
  const [miembros, roles] = await Promise.all([
    db
      .select({
        email: schema.user.email,
        role: schema.member.role,
        receivesInternalNotices: schema.member.receivesInternalNotices,
      })
      .from(schema.member)
      .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
      .where(eq(schema.member.organizationId, organizationId)),
    db
      .select({ key: schema.role.key, capabilities: schema.role.capabilities })
      .from(schema.role)
      .where(eq(schema.role.organizationId, organizationId)),
  ]);
  return correosConCapacidad(miembros, roles, "cohortes.confirmar");
}

async function leerGrupo(organizationId: string, cohortId: string) {
  const rows = await getDb()
    .select({
      id: schema.cohort.id,
      name: schema.cohort.name,
      startDate: schema.cohort.startDate,
      startTime: schema.cohort.startTime,
      confirmedAt: schema.cohort.confirmedAt,
      parentCohortId: schema.cohort.parentCohortId,
      courseName: schema.course.name,
      courseKind: schema.course.kind,
    })
    .from(schema.cohort)
    .innerJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .where(scoped(schema.cohort.organizationId, organizationId, eq(schema.cohort.id, cohortId)))
    .limit(1);
  return rows[0] ?? null;
}

/** Inscripciones del grupo con el contacto activo (lo mismo que cuenta el aviso a Soporte). */
async function contarInscriptos(organizationId: string, cohortId: string): Promise<number> {
  const rows = await getDb()
    .select({ id: schema.enrollment.id })
    .from(schema.enrollment)
    .innerJoin(schema.contact, eq(schema.enrollment.contactId, schema.contact.id))
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        eq(schema.enrollment.cohortId, cohortId),
        isNull(schema.contact.archivedAt)
      )
    );
  return rows.length;
}

async function prepararEnvio(
  organizationId: string,
  cohortId: string,
  kind: UnconfirmedNoticeKind,
  now: Date
): Promise<Envio | ResultadoAviso> {
  return withOrganizationScope(organizationId, ACTOR_AVISOS, async () => {
    const grupo = await leerGrupo(organizationId, cohortId);
    if (!grupo || !grupoRecibeAvisoSinConfirmar(grupo)) return "no_corresponde";
    const timeZone = await organizationTimezone(organizationId);
    // Se vuelve a decidir dentro del reclamo: si se confirmó recién, no sale.
    if (avisoSinConfirmarQueToca(grupo, now, timeZone) !== kind) return "no_corresponde";

    const sujeto = sujetoSinConfirmar(cohortId, kind, grupo.startDate);
    const previo = await leerRegistroDeAviso(organizationId, sujeto);
    if (!puedeReclamar(previo, now, { reintentarOmitido: false })) return "no_corresponde";
    const id = await reclamarAviso(organizationId, sujeto, previo, now);
    if (!id) return "no_corresponde";

    const to = await correosDeQuienesConfirman(organizationId);
    if (to.length === 0) {
      await cerrarAviso(organizationId, id, now, { status: "skipped", detail: "sin_destinatarios" });
      return "skipped";
    }
    const destinatarios = { to, cc: [] };

    const correo = armarAvisoSinConfirmar(kind, {
      curso: grupo.courseName,
      cohorte: grupo.name,
      startDate: grupo.startDate,
      startTime: grupo.startTime,
      timeZone,
      inscriptos: await contarInscriptos(organizationId, cohortId),
      url: `${getEnv().APP_BASE_URL.replace(/\/+$/, "")}/cohorts/${cohortId}`,
    });

    await getDb()
      .update(schema.staffNotice)
      .set({ recipients: destinatarios, subject: correo.subject, updatedAt: now })
      .where(scoped(schema.staffNotice.organizationId, organizationId, eq(schema.staffNotice.id, id)));
    return { id, claimedAt: now, destinatarios, ...correo };
  });
}

/** Manda UN aviso de grupo sin confirmar, si corresponde. Nunca lanza. */
export async function enviarAvisoSinConfirmar(
  organizationId: string,
  cohortId: string,
  kind: UnconfirmedNoticeKind,
  now = new Date()
): Promise<ResultadoAviso> {
  let envio: Envio | ResultadoAviso;
  try {
    envio = await prepararEnvio(organizationId, cohortId, kind, now);
  } catch (err) {
    console.error(`[avisos] ${kind} ${cohortId}: no se pudo preparar (${err instanceof Error ? err.name : "error"})`);
    return "no_corresponde";
  }
  if (typeof envio === "string") return envio;
  return mandarAviso(organizationId, envio, `${kind} ${cohortId}`);
}

/**
 * Los avisos que tocan AHORA: grupos sin confirmar que empiezan entre ayer y
 * dentro de 8 días (margen para cualquier zona), y por cada uno la ventana de
 * hoy si `puedeReclamar` la deja.
 */
export async function avisosSinConfirmarPendientesEnOrg(
  organizationId: string,
  now = new Date()
): Promise<{ cohortId: string; kind: UnconfirmedNoticeKind }[]> {
  return withOrganizationScope(organizationId, ACTOR_AVISOS, async () => {
    const db = getDb();
    const timeZone = await organizationTimezone(organizationId);
    const grupos = await db
      .select({
        id: schema.cohort.id,
        startDate: schema.cohort.startDate,
        confirmedAt: schema.cohort.confirmedAt,
        parentCohortId: schema.cohort.parentCohortId,
        courseKind: schema.course.kind,
      })
      .from(schema.cohort)
      .innerJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
      .where(
        scoped(
          schema.cohort.organizationId,
          organizationId,
          isNull(schema.cohort.confirmedAt),
          isNull(schema.cohort.parentCohortId),
          and(
            gte(schema.cohort.startDate, new Date(now.getTime() - 2 * DIA_MS)),
            lte(schema.cohort.startDate, new Date(now.getTime() + 9 * DIA_MS))
          )
        )
      );
    const elegibles = grupos.filter(grupoRecibeAvisoSinConfirmar);
    if (elegibles.length === 0) return [];

    const registros = await db
      .select({
        dedupKey: schema.staffNotice.dedupKey,
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
            elegibles.map((g) => g.id)
          ),
          inArray(schema.staffNotice.kind, [...UNCONFIRMED_NOTICE_KINDS])
        )
      );
    const porLlave = new Map(registros.map((r) => [r.dedupKey, r]));

    const out: { cohortId: string; kind: UnconfirmedNoticeKind }[] = [];
    for (const g of elegibles) {
      const ventana = avisoSinConfirmarQueToca(g, now, timeZone);
      if (!ventana) continue;
      const previo = porLlave.get(claveDeAviso(sujetoSinConfirmar(g.id, ventana, g.startDate))) ?? null;
      const kind = avisoSinConfirmarQueTocaHoy(g, previo, now, timeZone);
      if (kind) out.push({ cohortId: g.id, kind });
    }
    return out;
  });
}

export async function runUnconfirmedNoticesForOrg(organizationId: string, now = new Date()): Promise<number> {
  const pendientes = await avisosSinConfirmarPendientesEnOrg(organizationId, now);
  // Uno por uno, cada uno en sus alcances cortos: un fallo no frena al siguiente.
  for (const p of pendientes) await enviarAvisoSinConfirmar(organizationId, p.cohortId, p.kind, now);
  return pendientes.length;
}
