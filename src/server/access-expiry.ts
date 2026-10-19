import { and, eq, inArray, isNull, max, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import {
  diaCalendario,
  diaComoFecha,
  estadoDeAcceso,
  referenciaDeRecorrido,
  type CohorteFechas,
  type EstadoDeAcceso,
} from "@/lib/access-expiry";
import { ACADEMY_TIME_ZONE } from "@/lib/schedule-time";

/**
 * 043 — Vencimiento de accesos: las lecturas (y la única escritura, la fecha
 * manual).
 *
 * Las reglas viven en `src/lib/access-expiry.ts` y se prueban ahí. Este
 * módulo junta lo que necesitan —cohortes, últimas clases, el árbol de una
 * especialización— y devuelve UN estado por inscripción.
 *
 * Lo leen tres audiencias, cada una desde su puerta: el portal del alumno
 * (que corta los contenidos), los cursos offline (que dejan de contar la
 * cohorte vencida) y el staff (que ve y corrige la fecha). El portal del
 * profesor NO lo lee: el profesor conserva sus cohortes.
 */

export type EstadoDeAccesoDeInscripcion = EstadoDeAcceso & {
  /**
   * La inscripción MADRE de la que hereda (hija de una especialización), o
   * `null` si la fecha es suya. Las hijas no tienen fecha propia: el recorrido
   * entero vence junto.
   */
  heredadoDe: string | null;
  /** Quién y cuándo fijó la fecha manual (de la inscripción que la define). */
  fijadoPor: string | null;
  fijadoEn: string | null;
};

type FilaInscripcion = {
  id: string;
  parentEnrollmentId: string | null;
  cohortId: string | null;
  accessUntil: Date | null;
  accessUntilSetAt: Date | null;
  accessUntilSetByName: string | null;
};

/** La zona de la academia. Sin organización (no debería pasar), la de siempre. */
export async function zonaDeLaOrganizacion(organizationId: string): Promise<string> {
  const [row] = await getDb()
    .select({ timezone: schema.organization.timezone })
    .from(schema.organization)
    .where(eq(schema.organization.id, organizationId))
    .limit(1);
  return row?.timezone ?? ACADEMY_TIME_ZONE;
}

async function filasDeInscripciones(
  organizationId: string,
  where: SQL
): Promise<FilaInscripcion[]> {
  return getDb()
    .select({
      id: schema.enrollment.id,
      parentEnrollmentId: schema.enrollment.parentEnrollmentId,
      cohortId: schema.enrollment.cohortId,
      accessUntil: schema.enrollment.accessUntil,
      accessUntilSetAt: schema.enrollment.accessUntilSetAt,
      accessUntilSetByName: schema.user.name,
    })
    .from(schema.enrollment)
    .leftJoin(schema.user, eq(schema.enrollment.accessUntilSetBy, schema.user.id))
    .where(scoped(schema.enrollment.organizationId, organizationId, where));
}

/**
 * El estado de acceso de cada inscripción pedida.
 *
 * Trae lo que haga falta para decidir aunque no se haya pedido: la madre de
 * una hija, las hijas de una madre y los módulos de una especialización.
 */
export async function estadosDeAcceso(
  organizationId: string,
  enrollmentIds: string[],
  now: Date = new Date()
): Promise<Map<string, EstadoDeAccesoDeInscripcion>> {
  const out = new Map<string, EstadoDeAccesoDeInscripcion>();
  const ids = [...new Set(enrollmentIds)];
  if (ids.length === 0) return out;
  const db = getDb();

  const filas = new Map<string, FilaInscripcion>();
  for (const f of await filasDeInscripciones(
    organizationId,
    inArray(schema.enrollment.id, ids)
  )) {
    filas.set(f.id, f);
  }

  // Las madres de las hijas pedidas.
  const madresFaltantes = [...filas.values()]
    .map((f) => f.parentEnrollmentId)
    .filter((id): id is string => id !== null && !filas.has(id));
  if (madresFaltantes.length > 0) {
    for (const f of await filasDeInscripciones(
      organizationId,
      inArray(schema.enrollment.id, madresFaltantes)
    )) {
      filas.set(f.id, f);
    }
  }

  // Las hijas de cada raíz: su cohorte es parte del recorrido.
  const raices = [...filas.values()].filter((f) => f.parentEnrollmentId === null);
  const hijasDe = new Map<string, FilaInscripcion[]>();
  if (raices.length > 0) {
    const hijas = await filasDeInscripciones(
      organizationId,
      inArray(
        schema.enrollment.parentEnrollmentId,
        raices.map((r) => r.id)
      )
    );
    for (const h of hijas) {
      if (!h.parentEnrollmentId) continue;
      hijasDe.set(h.parentEnrollmentId, [...(hijasDe.get(h.parentEnrollmentId) ?? []), h]);
    }
  }

  // Las cohortes: las de las raíces, las de las hijas y los módulos de cada programa.
  const cohortIds = new Set<string>();
  for (const r of raices) {
    if (r.cohortId) cohortIds.add(r.cohortId);
    for (const h of hijasDe.get(r.id) ?? []) if (h.cohortId) cohortIds.add(h.cohortId);
  }
  const cohortes = new Map<
    string,
    { id: string; endDate: Date | null; isSpecialization: boolean; parentCohortId: string | null }
  >();
  const traerCohortes = async (where: SQL) => {
    const rows = await db
      .select({
        id: schema.cohort.id,
        endDate: schema.cohort.endDate,
        isSpecialization: schema.cohort.isSpecialization,
        parentCohortId: schema.cohort.parentCohortId,
      })
      .from(schema.cohort)
      .where(scoped(schema.cohort.organizationId, organizationId, where));
    for (const c of rows) cohortes.set(c.id, c);
    return rows;
  };
  if (cohortIds.size > 0) {
    await traerCohortes(inArray(schema.cohort.id, [...cohortIds]));
  }
  const programas = [...cohortes.values()].filter((c) => c.parentCohortId === null).map((c) => c.id);
  const modulosDe = new Map<string, string[]>();
  if (programas.length > 0) {
    const modulos = await traerCohortes(
      inArray(schema.cohort.parentCohortId, programas)
    );
    for (const m of modulos) {
      if (!m.parentCohortId) continue;
      modulosDe.set(m.parentCohortId, [...(modulosDe.get(m.parentCohortId) ?? []), m.id]);
    }
  }

  const ultimaClase = new Map<string, Date>();
  if (cohortes.size > 0) {
    const rows = await db
      .select({ cohortId: schema.classSession.cohortId, last: max(schema.classSession.date) })
      .from(schema.classSession)
      .where(
        scoped(
          schema.classSession.organizationId,
          organizationId,
          and(
            inArray(schema.classSession.cohortId, [...cohortes.keys()]),
            isNull(schema.classSession.canceledAt)
          )
        )
      )
      .groupBy(schema.classSession.cohortId);
    for (const r of rows) if (r.last) ultimaClase.set(r.cohortId, r.last);
  }

  const fechas = (id: string | null): CohorteFechas | null => {
    if (!id) return null;
    const c = cohortes.get(id);
    if (!c) return null;
    return { id: c.id, endDate: c.endDate, lastClassDate: ultimaClase.get(c.id) ?? null };
  };

  const timeZone = await zonaDeLaOrganizacion(organizationId);

  const deRaiz = (r: FilaInscripcion): EstadoDeAccesoDeInscripcion => {
    const cohorte = r.cohortId ? cohortes.get(r.cohortId) : undefined;
    const modulosIds = new Set<string>(cohorte ? (modulosDe.get(cohorte.id) ?? []) : []);
    for (const h of hijasDe.get(r.id) ?? []) if (h.cohortId) modulosIds.add(h.cohortId);
    const modulos = [...modulosIds]
      .map((id) => fechas(id))
      .filter((c): c is CohorteFechas => c !== null);
    const referencia = referenciaDeRecorrido({
      cohorte: fechas(r.cohortId),
      esPrograma: Boolean(cohorte?.isSpecialization) || modulos.length > 0,
      modulos,
    });
    return {
      ...estadoDeAcceso(
        { referencia, override: r.accessUntil ? diaCalendario(r.accessUntil) : null },
        now,
        timeZone
      ),
      heredadoDe: null,
      fijadoPor: r.accessUntil ? r.accessUntilSetByName : null,
      fijadoEn: r.accessUntil ? (r.accessUntilSetAt?.toISOString() ?? null) : null,
    };
  };

  const cache = new Map<string, EstadoDeAccesoDeInscripcion>();
  for (const id of ids) {
    const f = filas.get(id);
    if (!f) continue;
    const madre = f.parentEnrollmentId ? filas.get(f.parentEnrollmentId) : undefined;
    const raiz = madre ?? f;
    const base = cache.get(raiz.id) ?? deRaiz(raiz);
    cache.set(raiz.id, base);
    out.set(id, madre ? { ...base, heredadoDe: madre.id } : base);
  }
  return out;
}

/** El estado de cada inscripción con cohorte de una persona. */
export async function estadosDeAccesoDeContacto(
  organizationId: string,
  contactId: string,
  now: Date = new Date()
): Promise<Map<string, EstadoDeAccesoDeInscripcion>> {
  const rows = await getDb()
    .select({ id: schema.enrollment.id })
    .from(schema.enrollment)
    .where(
      scoped(schema.enrollment.organizationId, organizationId, eq(schema.enrollment.contactId, contactId))
    );
  return estadosDeAcceso(
    organizationId,
    rows.map((r) => r.id),
    now
  );
}

/** El estado de cada inscripción de una cohorte (roster del staff). */
export async function estadosDeAccesoDeCohorte(
  organizationId: string,
  cohortId: string,
  now: Date = new Date()
): Promise<{
  cohort: { referencia: string | null; sinFecha: boolean } | null;
  inscripciones: Array<{ enrollmentId: string } & EstadoDeAccesoDeInscripcion>;
}> {
  const [cohorte] = await getDb()
    .select({ id: schema.cohort.id })
    .from(schema.cohort)
    .where(scoped(schema.cohort.organizationId, organizationId, eq(schema.cohort.id, cohortId)))
    .limit(1);
  if (!cohorte) return { cohort: null, inscripciones: [] };

  const rows = await getDb()
    .select({ id: schema.enrollment.id })
    .from(schema.enrollment)
    .where(
      scoped(schema.enrollment.organizationId, organizationId, eq(schema.enrollment.cohortId, cohortId))
    );
  const estados = await estadosDeAcceso(
    organizationId,
    rows.map((r) => r.id),
    now
  );
  const inscripciones = [...estados.entries()].map(([enrollmentId, e]) => ({ enrollmentId, ...e }));

  // La referencia que se muestra arriba del roster es la de la cohorte misma
  // (la cursada simple), o —en una especialización— la del programa.
  const propia = inscripciones.find((i) => i.heredadoDe === null);
  const referencia = propia?.referencia ?? inscripciones[0]?.referencia ?? null;
  return {
    cohort: { referencia, sinFecha: inscripciones.length > 0 && referencia === null },
    inscripciones,
  };
}

/* ============================================================
 * La fecha manual
 * ============================================================ */

export type FijarAccesoResult =
  | { ok: true; data: { accessUntil: string | null } }
  | { ok: false; status: 404 | 422; code: string; message: string };

/**
 * Fija (o borra, con `null`) la fecha de acceso de una inscripción. Reemplaza
 * a la calculada, sea más tarde o más temprano. Estampa quién y cuándo.
 *
 * Una hija de especialización responde 422: su acceso es el de la madre, y
 * dos fechas en un mismo recorrido serían dos verdades.
 */
export async function fijarAccesoHasta(
  organizationId: string,
  enrollmentId: string,
  accessUntil: string | null,
  userId: string
): Promise<FijarAccesoResult> {
  const db = getDb();
  const [fila] = await db
    .select({
      id: schema.enrollment.id,
      parentEnrollmentId: schema.enrollment.parentEnrollmentId,
      cohortId: schema.enrollment.cohortId,
    })
    .from(schema.enrollment)
    .where(scoped(schema.enrollment.organizationId, organizationId, eq(schema.enrollment.id, enrollmentId)))
    .limit(1);
  if (!fila) {
    return { ok: false, status: 404, code: "not_found", message: "Inscripción no encontrada" };
  }
  if (fila.parentEnrollmentId) {
    return {
      ok: false,
      status: 422,
      code: "acceso_en_la_madre",
      message:
        "Este módulo comparte el acceso de su especialización: la fecha se fija en la inscripción a la especialización.",
    };
  }
  if (!fila.cohortId) {
    return {
      ok: false,
      status: 422,
      code: "sin_cohorte",
      message: "Una inscripción sin cohorte no da acceso a contenidos.",
    };
  }

  await db
    .update(schema.enrollment)
    .set({
      accessUntil: accessUntil ? diaComoFecha(accessUntil) : null,
      accessUntilSetAt: new Date(),
      accessUntilSetBy: userId,
      updatedAt: new Date(),
    })
    .where(scoped(schema.enrollment.organizationId, organizationId, eq(schema.enrollment.id, enrollmentId)));

  return { ok: true, data: { accessUntil } };
}
