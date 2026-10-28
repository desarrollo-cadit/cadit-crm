import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import type { ExtensionRequestStatus } from "@/lib/db/schema";
import { plazoDeEvaluacion, validarPedidoDeProrroga } from "@/lib/entrega-final";
import { estadosDeAcceso, zonaDeLaOrganizacion } from "@/server/access-expiry";
import {
  componerPlazo,
  entregaFinalDeCohorte,
  fechaVigente,
  type EntregaResult,
  type PlazoInput,
} from "@/server/submissions";

/**
 * 0083 — Los PEDIDOS de prórroga: el alumno pide, Coordinación decide.
 *
 * Un pedido no es una prórroga. Hasta que alguien con `evaluacion.editar` lo
 * aprueba no corre ningún plazo ni extiende ningún acceso (el acceso solo
 * mira `assessment_extension`). Aprobar escribe la prórroga con el motivo del
 * alumno y quien decidió como autor, en la transacción del pedido; rechazar
 * solo marca el pedido.
 *
 * Mismas reglas que `submissions.ts`: ausencia = `null` o resultado tipado,
 * jamás un código de estado elegido acá; la ruta elige el 404. El lado del
 * alumno arranca SIEMPRE por su `contactId`.
 */

export type PedidoDeProrrogaDto = {
  id: string;
  assessmentId: string;
  requestedDueAt: string;
  reason: string;
  status: ExtensionRequestStatus;
  /** La nota de quien decidió (opcional en el rechazo). */
  decisionNote: string | null;
  decidedAt: string | null;
  createdAt: string;
};

export type EstadoDePedidoDto = {
  /** El plazo que rige HOY para esta persona (grupo o entrega final, y su prórroga). */
  vigenteAt: string | null;
  /** El último pedido, en cualquier estado. */
  pedido: PedidoDeProrrogaDto | null;
  /** Puede pedir: no tiene uno pendiente. */
  puedePedir: boolean;
};

const NO_ENCONTRADA = {
  ok: false,
  status: 404,
  code: "not_found",
  message: "Evaluación no encontrada",
} as const;

const COLUMNAS_DE_PEDIDO = {
  id: schema.assessmentExtensionRequest.id,
  assessmentId: schema.assessmentExtensionRequest.assessmentId,
  requestedDueAt: schema.assessmentExtensionRequest.requestedDueAt,
  reason: schema.assessmentExtensionRequest.reason,
  status: schema.assessmentExtensionRequest.status,
  decisionNote: schema.assessmentExtensionRequest.decisionNote,
  decidedAt: schema.assessmentExtensionRequest.decidedAt,
  createdAt: schema.assessmentExtensionRequest.createdAt,
};

type FilaDePedido = {
  id: string;
  assessmentId: string;
  requestedDueAt: Date;
  reason: string;
  status: ExtensionRequestStatus;
  decisionNote: string | null;
  decidedAt: Date | null;
  createdAt: Date;
};

function serializarPedido(f: FilaDePedido): PedidoDeProrrogaDto {
  return {
    id: f.id,
    assessmentId: f.assessmentId,
    requestedDueAt: f.requestedDueAt.toISOString(),
    reason: f.reason,
    status: f.status,
    decisionNote: f.decisionNote,
    decidedAt: f.decidedAt?.toISOString() ?? null,
    createdAt: f.createdAt.toISOString(),
  };
}

/**
 * La evaluación, la inscripción de ESTA persona en su grupo y su plazo
 * vigente. `null` si no existe, si no es suya o si el acceso a los
 * contenidos de esa cursada venció (CONTENIDO, 043: vencido = no viaja).
 */
async function evaluacionDelAlumno(
  organizationId: string,
  contactId: string,
  assessmentId: string,
  now: Date
): Promise<{ assessmentId: string; enrollmentId: string; vigente: Date | null } | null> {
  const db = getDb();
  const [evaluacion] = await db
    .select({
      id: schema.assessment.id,
      cohortId: schema.assessment.cohortId,
      dueAt: schema.assessment.dueAt,
    })
    .from(schema.assessment)
    .where(scoped(schema.assessment.organizationId, organizationId, eq(schema.assessment.id, assessmentId)))
    .limit(1);
  if (!evaluacion) return null;

  // La cerradura: la inscripción es de ESTA persona en el grupo de la evaluación.
  const [inscripcion] = await db
    .select({ id: schema.enrollment.id })
    .from(schema.enrollment)
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        and(
          eq(schema.enrollment.contactId, contactId),
          eq(schema.enrollment.cohortId, evaluacion.cohortId)
        )
      )
    )
    .limit(1);
  if (!inscripcion) return null;

  // 043 — Vencido el acceso, no hay pedido que hacer ni que mirar.
  const accesos = await estadosDeAcceso(organizationId, [inscripcion.id], now);
  if (accesos.get(inscripcion.id)?.vencido) return null;

  const [prorroga] = await db
    .select({ dueAt: schema.assessmentExtension.dueAt })
    .from(schema.assessmentExtension)
    .where(
      scoped(
        schema.assessmentExtension.organizationId,
        organizationId,
        and(
          eq(schema.assessmentExtension.assessmentId, evaluacion.id),
          eq(schema.assessmentExtension.enrollmentId, inscripcion.id)
        )
      )
    )
    .limit(1);

  const grupo = plazoDeEvaluacion(
    evaluacion.dueAt,
    await entregaFinalDeCohorte(organizationId, evaluacion.cohortId)
  );
  return {
    assessmentId: evaluacion.id,
    enrollmentId: inscripcion.id,
    vigente: fechaVigente(grupo, prorroga?.dueAt ?? null),
  };
}

async function ultimoPedido(
  organizationId: string,
  assessmentId: string,
  enrollmentId: string
): Promise<FilaDePedido | null> {
  const filas = await getDb()
    .select(COLUMNAS_DE_PEDIDO)
    .from(schema.assessmentExtensionRequest)
    .where(
      scoped(
        schema.assessmentExtensionRequest.organizationId,
        organizationId,
        and(
          eq(schema.assessmentExtensionRequest.assessmentId, assessmentId),
          eq(schema.assessmentExtensionRequest.enrollmentId, enrollmentId)
        )
      )
    );
  // El pendiente manda; si no hay, el más reciente.
  const ordenadas = [...filas].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return ordenadas.find((f) => f.status === "pendiente") ?? ordenadas[0] ?? null;
}

/** El estado del pedido del alumno en una evaluación. `null` = 404. */
export async function pedidoDelAlumno(
  organizationId: string,
  contactId: string,
  assessmentId: string,
  now: Date = new Date()
): Promise<EstadoDePedidoDto | null> {
  const base = await evaluacionDelAlumno(organizationId, contactId, assessmentId, now);
  if (!base) return null;
  const pedido = await ultimoPedido(organizationId, base.assessmentId, base.enrollmentId);
  return {
    vigenteAt: base.vigente?.toISOString() ?? null,
    pedido: pedido ? serializarPedido(pedido) : null,
    puedePedir: pedido?.status !== "pendiente",
  };
}

/**
 * El alumno pide una prórroga: un día (se cierra a las 23:59 de la academia,
 * igual que la entrega final) posterior a su plazo vigente, con motivo.
 *
 * El único pendiente lo arbitra la BASE (índice parcial): dos clics rápidos
 * no dejan dos pedidos.
 */
export async function pedirProrroga(
  organizationId: string,
  contactId: string,
  assessmentId: string,
  input: { fecha: string; motivo: string },
  now: Date = new Date()
): Promise<EntregaResult<PedidoDeProrrogaDto>> {
  const base = await evaluacionDelAlumno(organizationId, contactId, assessmentId, now);
  if (!base) return NO_ENCONTRADA;

  const timezone = await zonaDeLaOrganizacion(organizationId);
  const solicitada = componerPlazo({ fecha: input.fecha, hora: "23:59" }, timezone);
  const error = validarPedidoDeProrroga(
    { solicitada, vigente: base.vigente, motivo: input.motivo },
    now
  );
  if (error) return { ok: false, ...error };

  const [fila] = await getDb()
    .insert(schema.assessmentExtensionRequest)
    .values({
      id: newId("assessmentExtensionRequest"),
      organizationId,
      assessmentId: base.assessmentId,
      enrollmentId: base.enrollmentId,
      requestedDueAt: solicitada!,
      reason: input.motivo.trim(),
    })
    .onConflictDoNothing()
    .returning(COLUMNAS_DE_PEDIDO);
  if (!fila) {
    return {
      ok: false,
      status: 409,
      code: "pedido_pendiente",
      message: "Ya tenés un pedido de prórroga esperando respuesta.",
    };
  }
  return { ok: true, data: serializarPedido(fila) };
}

/* ============================================================
 * El staff: los pendientes de un grupo y la decisión
 * ============================================================ */

export type PedidoParaDecidirDto = PedidoDeProrrogaDto & {
  assessmentName: string;
  enrollmentId: string;
  studentName: string;
  /** El plazo vigente de la persona hoy, para comparar con lo que pide. */
  vigenteAt: string | null;
};

/** Los pedidos PENDIENTES de las evaluaciones de un grupo, el más viejo primero. */
export async function pedidosPendientesDeCohorte(
  organizationId: string,
  cohortId: string
): Promise<PedidoParaDecidirDto[]> {
  const db = getDb();
  const r = schema.assessmentExtensionRequest;
  const filas = await db
    .select({
      ...COLUMNAS_DE_PEDIDO,
      assessmentName: schema.assessment.name,
      assessmentDueAt: schema.assessment.dueAt,
      enrollmentId: r.enrollmentId,
      firstName: schema.contact.firstName,
      lastName: schema.contact.lastName,
    })
    .from(r)
    .innerJoin(schema.assessment, eq(r.assessmentId, schema.assessment.id))
    .innerJoin(schema.enrollment, eq(r.enrollmentId, schema.enrollment.id))
    .innerJoin(schema.contact, eq(schema.enrollment.contactId, schema.contact.id))
    .where(
      scoped(r.organizationId, organizationId, eq(schema.assessment.cohortId, cohortId), eq(r.status, "pendiente"))
    )
    .orderBy(asc(r.createdAt));
  if (filas.length === 0) return [];

  const [entregaFinal, prorrogas] = await Promise.all([
    entregaFinalDeCohorte(organizationId, cohortId),
    db
      .select({
        assessmentId: schema.assessmentExtension.assessmentId,
        enrollmentId: schema.assessmentExtension.enrollmentId,
        dueAt: schema.assessmentExtension.dueAt,
      })
      .from(schema.assessmentExtension)
      .innerJoin(schema.assessment, eq(schema.assessmentExtension.assessmentId, schema.assessment.id))
      .where(
        scoped(
          schema.assessmentExtension.organizationId,
          organizationId,
          eq(schema.assessment.cohortId, cohortId)
        )
      ),
  ]);

  return filas.map((f) => {
    const p = prorrogas.find((x) => x.assessmentId === f.assessmentId && x.enrollmentId === f.enrollmentId);
    const vigente = fechaVigente(plazoDeEvaluacion(f.assessmentDueAt, entregaFinal), p?.dueAt ?? null);
    return {
      ...serializarPedido(f),
      assessmentName: f.assessmentName,
      enrollmentId: f.enrollmentId,
      studentName: [f.firstName, f.lastName].filter((s) => s?.trim()).join(" ").trim() || "Sin nombre",
      vigenteAt: vigente?.toISOString() ?? null,
    };
  });
}

export type DecisionDePedido =
  | { decision: "aprobar"; plazo?: PlazoInput | null; nota?: string | null }
  | { decision: "rechazar"; nota?: string | null };

/**
 * Aprobar o rechazar un pedido PENDIENTE.
 *
 * Primero se cierra el pedido (`... where status = 'pendiente'`): si otra
 * persona ya lo decidió, no se toca nada y responde 409. Al aprobar, en la
 * MISMA transacción del pedido, se escribe (o corrige) la prórroga con el
 * motivo del alumno y quien decidió como autor; la fecha es la pedida, o la
 * que ajustó quien aprueba.
 */
export async function decidirPedido(
  organizationId: string,
  requestId: string,
  userId: string,
  input: DecisionDePedido
): Promise<EntregaResult<{ id: string; status: ExtensionRequestStatus; dueAt: string | null }>> {
  const db = getDb();
  const r = schema.assessmentExtensionRequest;

  const [pedido] = await db
    .select({ id: r.id, status: r.status, requestedDueAt: r.requestedDueAt })
    .from(r)
    .where(scoped(r.organizationId, organizationId, eq(r.id, requestId)))
    .limit(1);
  if (!pedido) {
    return { ok: false, status: 404, code: "not_found", message: "Pedido no encontrado" };
  }

  let dueAt: Date | null = null;
  if (input.decision === "aprobar") {
    dueAt = pedido.requestedDueAt;
    if (input.plazo) {
      dueAt = componerPlazo(input.plazo, await zonaDeLaOrganizacion(organizationId));
      if (!dueAt) {
        return {
          ok: false,
          status: 422,
          code: "invalid_due_at",
          message: "La fecha o la hora de la prórroga no son válidas",
        };
      }
    }
  }

  const ahora = new Date();
  const nota = input.nota?.trim() ? input.nota.trim() : null;
  const [cerrado] = await db
    .update(r)
    .set({
      status: input.decision === "aprobar" ? "aprobada" : "rechazada",
      decidedBy: userId,
      decidedAt: ahora,
      decisionNote: nota,
      updatedAt: ahora,
    })
    .where(scoped(r.organizationId, organizationId, eq(r.id, requestId), eq(r.status, "pendiente")))
    .returning({
      id: r.id,
      status: r.status,
      assessmentId: r.assessmentId,
      enrollmentId: r.enrollmentId,
      reason: r.reason,
    });
  if (!cerrado) {
    return {
      ok: false,
      status: 409,
      code: "pedido_ya_decidido",
      message: "Este pedido ya fue resuelto.",
    };
  }

  if (dueAt) {
    await db
      .insert(schema.assessmentExtension)
      .values({
        id: newId("assessmentExtension"),
        organizationId,
        assessmentId: cerrado.assessmentId,
        enrollmentId: cerrado.enrollmentId,
        dueAt,
        reason: cerrado.reason,
        grantedBy: userId,
      })
      .onConflictDoUpdate({
        target: [schema.assessmentExtension.assessmentId, schema.assessmentExtension.enrollmentId],
        set: { dueAt, reason: cerrado.reason, grantedBy: userId, updatedAt: ahora },
      });
  }

  return {
    ok: true,
    data: { id: cerrado.id, status: cerrado.status, dueAt: dueAt?.toISOString() ?? null },
  };
}
