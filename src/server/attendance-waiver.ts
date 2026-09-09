import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { dispensaVigente } from "@/server/program-modules";

/**
 * 028 fase 5 (FR-022, FR-023, DV-003, DV-004) — La dispensa de asistencia:
 * los dos actos que la ESCRIBEN.
 *
 * Las seis columnas viven en `enrollment` desde la fase 1 y hasta acá nadie
 * las escribía: la fase 2 le enseñó a `moduleApprovalState` a leerlas, y las
 * pantallas de las fases 3 y 4 las muestran. Falta el acto.
 *
 * Tres reglas gobiernan este módulo y ninguna es de forma:
 *
 * 1. **Sin motivo no hay dispensa** (FR-023). Una excepción sin autor ni
 *    motivo es indistinguible de un error de cálculo: a los seis meses,
 *    frente a alguien aprobado con 62% de asistencia, nadie puede decidir si
 *    tenía permiso o si el sistema falló.
 * 2. **Se marca revocada, no se borra** (DV-004). Borrar el acto dejaría un
 *    alumno aprobado sin que ningún registro explique por qué lo estuvo.
 * 3. **Revocar la dispensa NO revoca el certificado.** Son dos actos
 *    separados y explícitos, y por eso este archivo no importa una sola línea
 *    de `certificates.ts`: encadenarlos revocaría un certificado ya entregado
 *    en la mano de una persona sin que nadie lo haya decidido. Hay un test que
 *    falla si acá aparece un import o una llamada a ese módulo — anclado en el
 *    mecanismo y no en el sustantivo, porque este mismo párrafo lo nombra.
 *
 * La gobierna `evaluacion.editar` (DV-003) y no una capacidad nueva: lo que
 * la dispensa cambia es si el alumno aprueba, no quién pasó lista.
 */

export type DispensaResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: 404 | 409 | 422; code: string; message: string };

export type DispensaDto = {
  enrollmentId: string;
  /** Cuándo se otorgó. `null` = nunca hubo dispensa. */
  otorgadaEl: string | null;
  /** El id del usuario que la otorgó, o `null` si ya no está en el sistema. */
  otorgadaPor: string | null;
  motivo: string | null;
  revocadaEl: string | null;
  revocadaPor: string | null;
  motivoDeRevocacion: string | null;
  /**
   * Otorgada y no revocada, según `dispensaVigente` (fase 1). Se calcula con
   * la MISMA función que usa la aprobación: si cada superficie mirara las
   * columnas por su cuenta, una acabaría honrando una dispensa que otra ya
   * descartó.
   */
  vigente: boolean;
};

type FilaDeDispensa = {
  id: string;
  attendanceWaiverAt: Date | null;
  attendanceWaiverBy: string | null;
  attendanceWaiverReason: string | null;
  attendanceWaiverRevokedAt: Date | null;
  attendanceWaiverRevokedBy: string | null;
  attendanceWaiverRevokeReason: string | null;
};

function serialize(fila: FilaDeDispensa): DispensaDto {
  return {
    enrollmentId: fila.id,
    otorgadaEl: fila.attendanceWaiverAt?.toISOString() ?? null,
    otorgadaPor: fila.attendanceWaiverBy ?? null,
    motivo: fila.attendanceWaiverReason ?? null,
    revocadaEl: fila.attendanceWaiverRevokedAt?.toISOString() ?? null,
    revocadaPor: fila.attendanceWaiverRevokedBy ?? null,
    motivoDeRevocacion: fila.attendanceWaiverRevokeReason ?? null,
    vigente: dispensaVigente(fila),
  };
}

/** Las columnas que los dos actos necesitan leer antes de escribir. */
async function leerInscripcion(organizationId: string, enrollmentId: string) {
  const rows = await getDb()
    .select({
      id: schema.enrollment.id,
      attendanceWaiverAt: schema.enrollment.attendanceWaiverAt,
      attendanceWaiverBy: schema.enrollment.attendanceWaiverBy,
      attendanceWaiverReason: schema.enrollment.attendanceWaiverReason,
      attendanceWaiverRevokedAt: schema.enrollment.attendanceWaiverRevokedAt,
      attendanceWaiverRevokedBy: schema.enrollment.attendanceWaiverRevokedBy,
      attendanceWaiverRevokeReason: schema.enrollment.attendanceWaiverRevokeReason,
    })
    .from(schema.enrollment)
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        eq(schema.enrollment.id, enrollmentId)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Otorga la dispensa de asistencia de UNA inscripción.
 *
 * Es por módulo y nunca por especialización: el dueño dijo "dependiendo del
 * módulo", y una dispensa sobre la madre sería un salvoconducto de ocho meses
 * que nadie pidió. La inscripción hija es exactamente el tramo concreto.
 *
 * Re-otorgar después de una revocación LIMPIA el trío de revocación: si no,
 * la dispensa nueva nacería revocada —`dispensaVigente` exige
 * `revocadaEl === null`— y el dueño habría dicho "la habilito" para que nada
 * cambiara.
 */
export async function otorgarDispensa(
  organizationId: string,
  enrollmentId: string,
  input: { motivo: string; otorgadaPor?: string | null }
): Promise<DispensaResult<DispensaDto>> {
  const motivo = input.motivo.trim();
  // FR-023 — la regla, antes que cualquier consulta: sin motivo no hay
  // dispensa, así que no hay nada que ir a buscar.
  if (motivo === "") {
    return {
      ok: false,
      status: 422,
      code: "motivo_requerido",
      message: "Sin motivo no hay dispensa: hay que decir por qué se habilita",
    };
  }

  const fila = await leerInscripcion(organizationId, enrollmentId);
  if (!fila) {
    return { ok: false, status: 404, code: "not_found", message: "Inscripción no encontrada" };
  }

  // Otorgar sobre una dispensa vigente pisaría el acto original —su autor, su
  // fecha y su motivo— sin dejar rastro de que hubo dos.
  if (dispensaVigente(fila)) {
    return {
      ok: false,
      status: 409,
      code: "dispensa_vigente",
      message: "Esta inscripción ya tiene una dispensa vigente",
    };
  }

  const updated = await getDb()
    .update(schema.enrollment)
    .set({
      attendanceWaiverAt: new Date(),
      attendanceWaiverBy: input.otorgadaPor ?? null,
      attendanceWaiverReason: motivo,
      attendanceWaiverRevokedAt: null,
      attendanceWaiverRevokedBy: null,
      attendanceWaiverRevokeReason: null,
      updatedAt: new Date(),
    })
    /*
      Scopeada aunque `leerInscripcion` ya filtró por organización: apoyar la
      escritura en el orden de las llamadas dentro de esta función es una
      defensa que dura hasta que alguien reordene dos líneas. Constitución III
      no admite el atajo, y los tres hermanos que escriben esta misma tabla
      —`enrollments.ts` dos veces y `program-staff.ts`— la scopean igual.
    */
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        eq(schema.enrollment.id, enrollmentId)
      )
    )
    .returning();

  return { ok: true, data: serialize(updated[0]!) };
}

/**
 * Revoca la dispensa, conservando el acto original.
 *
 * DV-004 — revocar la dispensa y revocar el certificado son DOS ACTOS
 * SEPARADOS. Esta función no toca `certificate` ni sabe que existe: quien
 * quiera anular además el certificado tiene que decidirlo y pedirlo.
 */
export async function revocarDispensa(
  organizationId: string,
  enrollmentId: string,
  input: { motivo: string; revocadaPor?: string | null }
): Promise<DispensaResult<DispensaDto>> {
  const motivo = input.motivo.trim();
  // El mismo criterio que para otorgarla: quitarle a alguien una habilitación
  // sin decir por qué es tan poco auditable como dársela.
  if (motivo === "") {
    return {
      ok: false,
      status: 422,
      code: "motivo_requerido",
      message: "Hay que decir por qué se revoca la dispensa",
    };
  }

  const fila = await leerInscripcion(organizationId, enrollmentId);
  if (!fila) {
    return { ok: false, status: 404, code: "not_found", message: "Inscripción no encontrada" };
  }

  if (!dispensaVigente(fila)) {
    return {
      ok: false,
      status: 409,
      code: "sin_dispensa",
      message: "Esta inscripción no tiene una dispensa vigente",
    };
  }

  const updated = await getDb()
    .update(schema.enrollment)
    .set({
      attendanceWaiverRevokedAt: new Date(),
      attendanceWaiverRevokedBy: input.revocadaPor ?? null,
      attendanceWaiverRevokeReason: motivo,
      updatedAt: new Date(),
    })
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        eq(schema.enrollment.id, enrollmentId)
      )
    )
    .returning();

  return { ok: true, data: serialize(updated[0]!) };
}
