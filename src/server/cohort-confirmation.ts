import { asc, eq, isNotNull, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { onAfterCommit } from "@/lib/db/tenant-context";
import { STAFF_NOTICE_KINDS, type AvisoDto, type ConfirmacionDto } from "@/lib/staff-notices";
import { marcaDeConfirmacion } from "@/lib/marca-de-confirmacion";
import { organizationTimezone } from "@/server/finanzas-periodo";
import {
  cancelarAvisosDeFacturacion,
  cerrarAviso,
  enviarAviso,
  leerRegistroDeAviso,
  reclamarAviso,
} from "@/server/staff-notices";

/**
 * 039 — Confirmar una cohorte ("esta cohorte sale") y quitar la confirmación.
 *
 * Corre dentro de la transacción del pedido (RLS). El aviso a Soporte sale
 * DESPUÉS del commit (`onAfterCommit`): una tarea suelta no ve las filas que
 * la transacción que la disparó todavía no confirmó, y un fallo del correo no
 * puede deshacer la confirmación — que a esa altura ya confirmó.
 *
 * Las dos operaciones son idempotentes: confirmar una confirmada no cambia
 * quién ni cuándo, y no vuelve a disparar nada.
 */

export type ResultadoConfirmacion =
  | { ok: true; data: ConfirmacionDto; cambio: boolean }
  | { ok: false; status: 404; code: "not_found"; message: string };

const NO_ENCONTRADA = {
  ok: false,
  status: 404,
  code: "not_found",
  message: "Grupo no encontrado",
} as const;

/** El estado de confirmación y de sus avisos; `null` si la cohorte no existe. */
export async function estadoDeConfirmacion(
  organizationId: string,
  cohortId: string
): Promise<ConfirmacionDto | null> {
  const db = getDb();
  const rows = await db
    .select({
      confirmedAt: schema.cohort.confirmedAt,
      startDate: schema.cohort.startDate,
      endDate: schema.cohort.endDate,
      parentCohortId: schema.cohort.parentCohortId,
      courseKind: schema.course.kind,
      byId: schema.user.id,
      byName: schema.user.name,
    })
    .from(schema.cohort)
    .innerJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .leftJoin(schema.user, eq(schema.cohort.confirmedBy, schema.user.id))
    .where(scoped(schema.cohort.organizationId, organizationId, eq(schema.cohort.id, cohortId)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  const avisos = await db
    .select({
      kind: schema.staffNotice.kind,
      status: schema.staffNotice.status,
      detail: schema.staffNotice.detail,
      error: schema.staffNotice.error,
      sentAt: schema.staffNotice.sentAt,
      updatedAt: schema.staffNotice.updatedAt,
    })
    .from(schema.staffNotice)
    .where(
      scoped(schema.staffNotice.organizationId, organizationId, eq(schema.staffNotice.cohortId, cohortId))
    )
    .orderBy(asc(schema.staffNotice.createdAt));

  // Uno por tipo: los avisos de grupo sin confirmar llevan la fecha de inicio
  // en la llave, y un grupo reprogramado puede tener dos del mismo tipo. Gana
  // el más reciente (vienen ordenados por creación).
  const porTipo = new Map<AvisoDto["kind"], AvisoDto>();
  for (const a of avisos) {
    porTipo.set(a.kind, {
      kind: a.kind,
      status: a.status,
      detail: a.detail,
      error: a.error,
      sentAt: a.sentAt?.toISOString() ?? null,
      updatedAt: a.updatedAt.toISOString(),
    });
  }

  return {
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    confirmedBy: row.confirmedAt && row.byId && row.byName ? { id: row.byId, name: row.byName } : null,
    marca: marcaDeConfirmacion(row, new Date(), await organizationTimezone(organizationId)),
    avisos: [...porTipo.values()].sort(
      (a, b) => STAFF_NOTICE_KINDS.indexOf(a.kind) - STAFF_NOTICE_KINDS.indexOf(b.kind)
    ),
  };
}

/**
 * Confirma la cohorte. Si ya estaba confirmada no cambia nada (`cambio:
 * false`). Si la confirmación es nueva —o vuelve después de quitarla—, agenda
 * el aviso a Soporte para después del commit; `enviarAviso` no lo repite si
 * ya salió.
 */
export async function confirmarCohorte(
  organizationId: string,
  cohortId: string,
  userId: string,
  /**
   * 2026-10-22 — `avisar: false` confirma sin el correo a Soporte: para los
   * grupos que ya empezaron y se confirman tarde.
   */
  opts: { avisar?: boolean } = {}
): Promise<ResultadoConfirmacion> {
  const now = new Date();
  const confirmadas = await getDb()
    .update(schema.cohort)
    .set({ confirmedAt: now, confirmedBy: userId, updatedAt: now })
    .where(
      scoped(
        schema.cohort.organizationId,
        organizationId,
        eq(schema.cohort.id, cohortId),
        // Solo si no estaba confirmada: confirmar dos veces no pisa quién ni cuándo.
        isNull(schema.cohort.confirmedAt)
      )
    )
    .returning({ id: schema.cohort.id });
  const cambio = confirmadas.length > 0;

  const data = await estadoDeConfirmacion(organizationId, cohortId);
  if (!data) return NO_ENCONTRADA;

  if (cambio && opts.avisar === false) {
    // Queda registrado como OMITIDO: la periódica no insiste con un `skipped`
    // (`puedeReclamar`), así que el correo no sale "solo" más tarde.
    const sujeto = { kind: "cohorte_confirmada" as const, cohortId };
    const previo = await leerRegistroDeAviso(organizationId, sujeto);
    if (previo?.status !== "sent") {
      const id = await reclamarAviso(organizationId, sujeto, previo, now);
      if (id) await cerrarAviso(organizationId, id, now, { status: "skipped", detail: "sin_aviso_por_eleccion" });
    }
  }
  if (cambio && opts.avisar !== false) {
    onAfterCommit(() => {
      void enviarAviso(organizationId, cohortId, "cohorte_confirmada", "confirmacion").catch(() => {});
    });
  }
  return { ok: true, data, cambio };
}

/**
 * Quita la confirmación. Los avisos de facturación que no salieron se
 * cancelan (ver `cancelarAvisosDeFacturacion`). Idempotente.
 */
export async function quitarConfirmacion(
  organizationId: string,
  cohortId: string
): Promise<ResultadoConfirmacion> {
  const now = new Date();
  const quitadas = await getDb()
    .update(schema.cohort)
    .set({ confirmedAt: null, confirmedBy: null, updatedAt: now })
    .where(
      scoped(
        schema.cohort.organizationId,
        organizationId,
        eq(schema.cohort.id, cohortId),
        isNotNull(schema.cohort.confirmedAt)
      )
    )
    .returning({ id: schema.cohort.id });
  const cambio = quitadas.length > 0;
  if (cambio) await cancelarAvisosDeFacturacion(organizationId, cohortId);

  const data = await estadoDeConfirmacion(organizationId, cohortId);
  if (!data) return NO_ENCONTRADA;
  return { ok: true, data, cambio };
}
