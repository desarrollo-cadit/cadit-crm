import { eq, isNotNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";

/**
 * 028 fase 1 — Los guardas del árbol de una especialización.
 *
 * Hay dos árboles y no uno, porque contestan dos preguntas distintas:
 *
 * - **La estructura**: `cohort.parent_cohort_id` + `cohort.position` dicen
 *   cómo está armado el programa (EBIM 13 tiene 4 módulos, en este orden).
 * - **El recorrido**: `enrollment.parent_enrollment_id` dice qué cursó una
 *   persona, y el `cohort_id` de cada hija dice en qué corrida lo cursó —
 *   que puede ser la de OTRA especialización.
 *
 * ============================================================
 * Por qué estas reglas viven acá y no en la base
 * ============================================================
 * "Nadie es su propio padre" SÍ está en la base, como CHECK: mira una sola
 * fila, cuesta una línea y cubre el error más tonto (FR-004, FR-009).
 *
 * "Un solo nivel" NO es expresable en un CHECK: exige mirar OTRA fila. Las
 * opciones reales eran un trigger o el servidor, y se eligió el servidor. Un
 * trigger sería el primero del proyecto —hoy hay 0 en `drizzle/`—, quedaría
 * fuera de Drizzle y de los tests de TypeScript, y nadie recordaría que
 * existe hasta el día que rechace algo sin explicar qué.
 *
 * "Una cohorte de módulo no admite inscripciones directas" (FR-010) tampoco
 * es expresable: cruza `enrollment` con `cohort`.
 *
 * La contracara honesta: el servidor no protege contra un `UPDATE` a mano en
 * `psql`. Se acepta a cambio de que la regla sea legible, testeable y capaz
 * de devolver un mensaje que se entienda. Lo que sí se cuida es que no haya
 * un camino normal que la esquive: TODA escritura de estas columnas pasa por
 * `createCohort`/`updateCohort` (`src/server/courses.ts`) y por
 * `createEnrollment` (`src/server/enrollments.ts`), que son los únicos
 * lugares del código que insertan o actualizan `cohort` y `enrollment` con
 * un padre — el resto de los `insert` (leads, semillas, importador) nunca
 * toca las auto-referencias.
 *
 * ============================================================
 * Puras primero, asíncronas después
 * ============================================================
 * Cada regla se escribe como una función PURA que recibe los hechos ya
 * averiguados, y una función asíncrona delgada que los averigua. Es lo que
 * permite testear la regla sin una base de datos, que es la convención de
 * `tests/unit/`.
 */

export type ProgramGuardError = { code: string; message: string };

/* ============================================================
 * La estructura: cohortes
 * ============================================================ */

export type PadreDeCohorte = {
  /** La cohorte a la que se le está asignando (o cambiando) el padre. */
  cohorteId: string;
  /** El padre candidato. NULL = cohorte suelta, el estado normal. */
  padreId: string | null;
  /** ¿El candidato existe DENTRO de la misma organización? */
  padreExiste: boolean;
  /** ¿El candidato ya es módulo de otra camada, o sea tiene padre? */
  padreYaEsModulo: boolean;
  /** ¿Esta cohorte ya es madre de módulos? */
  cohorteYaTieneModulos: boolean;
};

/**
 * FR-003 + FR-004 — El anidamiento de cohortes es de UN solo nivel.
 *
 * Son dos mitades y hacen falta las dos:
 *
 * 1. El padre candidato no puede ser ya un módulo (si `A.parent = B`,
 *    entonces `B.parent` debe ser NULL).
 * 2. La cohorte que recibe padre no puede tener módulos propios, o quedaría
 *    convertida en un nodo del medio — dos niveles por la otra punta.
 *
 * Con las dos, el ciclo `A→B→A` queda impedido sin ninguna regla adicional.
 */
export function validarPadreDeCohorte(input: PadreDeCohorte): ProgramGuardError | null {
  if (input.padreId === null) return null;

  if (input.padreId === input.cohorteId) {
    return {
      code: "cohorte_padre_de_si_misma",
      message: "Una cohorte no puede ser su propia camada padre",
    };
  }
  if (!input.padreExiste) {
    return { code: "padre_inexistente", message: "Camada padre inexistente" };
  }
  if (input.padreYaEsModulo) {
    return {
      code: "anidamiento_de_dos_niveles",
      message:
        "La camada elegida ya es un módulo de otro programa: un módulo no tiene sub-módulos",
    };
  }
  if (input.cohorteYaTieneModulos) {
    return {
      code: "anidamiento_de_dos_niveles",
      message:
        "Esta camada ya tiene módulos propios: no puede pasar a ser módulo de otra",
    };
  }
  return null;
}

/* ============================================================
 * El recorrido: inscripciones
 * ============================================================ */

export type VinculoDeInscripcion = {
  /** NULL cuando la inscripción todavía no existe (alta). */
  inscripcionId: string | null;
  /** La cohorte de la inscripción. NULL = lead general de ventas. */
  cohorteId: string | null;
  /** ¿Esa cohorte es un módulo, o sea tiene `parent_cohort_id`? */
  cohorteEsModulo: boolean;
  /** La inscripción madre candidata. NULL = inscripción normal. */
  madreId: string | null;
  madreExiste: boolean;
  /** ¿La madre candidata es ella misma una hija? */
  madreYaEsHija: boolean;
  /** ¿Esta inscripción ya tiene hijas colgando? */
  inscripcionYaTieneHijas: boolean;
};

/**
 * FR-009 + FR-010 — El anidamiento de inscripciones es de UN solo nivel, y
 * madre y cohorte tienen que hablar del mismo tipo de nodo.
 *
 * La segunda mitad es la que cuesta más explicar y la que más importa:
 *
 * - Una **hija** cuelga de una cohorte de **módulo**. Colgarla de una cohorte
 *   suelta no significa nada: no habría programa del que ese módulo sea parte.
 * - Una cohorte de **módulo** NO admite inscripciones **directas**. La
 *   inscripción se cuelga de la madre, que es donde vive el paquete cerrado;
 *   una inscripción suelta contra un módulo sería un alumno sin recorrido, y
 *   además la fuente de los dos errores de plata de la fase: contar cinco
 *   inscripciones donde hubo una venta, y generarle cuotas a quien ya pagó
 *   el paquete.
 *
 * Las dos mitades juntas dicen: `parent_enrollment_id` es NULL exactamente
 * cuando `cohort.parent_cohort_id` lo es. Las 384 filas existentes cumplen
 * las dos condiciones hoy, así que la regla no las toca (FR-032).
 */
export function validarVinculoDeInscripcion(
  input: VinculoDeInscripcion
): ProgramGuardError | null {
  if (input.madreId === null) {
    if (input.cohorteEsModulo) {
      return {
        code: "modulo_sin_inscripcion_directa",
        message:
          "Una cohorte de módulo no admite inscripciones directas: la inscripción cuelga de la madre",
      };
    }
    return null;
  }

  if (input.inscripcionId !== null && input.madreId === input.inscripcionId) {
    return {
      code: "inscripcion_madre_de_si_misma",
      message: "Una inscripción no puede ser su propia madre",
    };
  }
  if (!input.madreExiste) {
    return { code: "madre_inexistente", message: "Inscripción madre inexistente" };
  }
  if (input.madreYaEsHija) {
    return {
      code: "anidamiento_de_dos_niveles",
      message:
        "La inscripción elegida ya es hija de otra: el recorrido tiene un solo nivel",
    };
  }
  if (input.inscripcionYaTieneHijas) {
    return {
      code: "anidamiento_de_dos_niveles",
      message: "Esta inscripción ya tiene módulos colgando: no puede pasar a ser hija",
    };
  }
  if (!input.cohorteEsModulo) {
    return {
      code: "hija_fuera_de_un_modulo",
      message:
        "Una inscripción hija tiene que apuntar a una cohorte de módulo, no a una camada suelta",
    };
  }
  return null;
}

/* ============================================================
 * Los hechos: las consultas que alimentan a las reglas puras
 * ============================================================ */

type Db = ReturnType<typeof getDb>;

/** ¿Esta cohorte es un módulo de programa? Es la condición de FR-033: un dato. */
export async function cohorteEsModulo(
  db: Db,
  organizationId: string,
  cohortId: string
): Promise<boolean> {
  const rows = await db
    .select({ parentCohortId: schema.cohort.parentCohortId })
    .from(schema.cohort)
    .where(
      scoped(schema.cohort.organizationId, organizationId, eq(schema.cohort.id, cohortId))
    )
    .limit(1);
  return rows[0]?.parentCohortId != null;
}

/**
 * Averigua los hechos y aplica `validarPadreDeCohorte`.
 *
 * `cohorteId` puede ser el id todavía no insertado de un alta: en ese caso no
 * hay módulos colgando por definición, y la consulta devuelve 0 filas igual.
 */
export async function verificarPadreDeCohorte(
  db: Db,
  organizationId: string,
  cohorteId: string,
  padreId: string | null
): Promise<ProgramGuardError | null> {
  if (padreId === null) return null;

  const padre = await db
    .select({ parentCohortId: schema.cohort.parentCohortId })
    .from(schema.cohort)
    .where(
      scoped(schema.cohort.organizationId, organizationId, eq(schema.cohort.id, padreId))
    )
    .limit(1);

  const modulosPropios = await db
    .select({ id: schema.cohort.id })
    .from(schema.cohort)
    .where(
      scoped(
        schema.cohort.organizationId,
        organizationId,
        eq(schema.cohort.parentCohortId, cohorteId)
      )
    )
    .limit(1);

  return validarPadreDeCohorte({
    cohorteId,
    padreId,
    padreExiste: padre.length > 0,
    padreYaEsModulo: padre[0]?.parentCohortId != null,
    cohorteYaTieneModulos: modulosPropios.length > 0,
  });
}

/**
 * Averigua los hechos y aplica `validarVinculoDeInscripcion`.
 *
 * Se llama SIEMPRE, también cuando `madreId` es NULL: es la mitad de FR-010
 * que impide colgar una inscripción suelta de una cohorte de módulo, y esa
 * mitad se rompe justamente cuando nadie declara nada.
 *
 * `cohorteEsModulo` se puede pasar ya resuelto. No es una micro-optimización:
 * quien llama casi siempre ACABA de leer esa cohorte para verificar que
 * existe, y volver a leerla sería agregarle una consulta al alta de las 33
 * cohortes simples para responder algo que ya está en la mano. El camino sin
 * madre y sin módulo no consulta nada (FR-032).
 */
export async function verificarVinculoDeInscripcion(
  db: Db,
  organizationId: string,
  input: {
    inscripcionId: string | null;
    cohorteId: string | null;
    cohorteEsModulo?: boolean;
    madreId: string | null;
  }
): Promise<ProgramGuardError | null> {
  const esModulo =
    input.cohorteEsModulo ??
    (input.cohorteId !== null
      ? await cohorteEsModulo(db, organizationId, input.cohorteId)
      : false);

  if (input.madreId === null) {
    return validarVinculoDeInscripcion({
      inscripcionId: input.inscripcionId,
      cohorteId: input.cohorteId,
      cohorteEsModulo: esModulo,
      madreId: null,
      madreExiste: false,
      madreYaEsHija: false,
      inscripcionYaTieneHijas: false,
    });
  }

  const madre = await db
    .select({ parentEnrollmentId: schema.enrollment.parentEnrollmentId })
    .from(schema.enrollment)
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        eq(schema.enrollment.id, input.madreId)
      )
    )
    .limit(1);

  const hijasPropias =
    input.inscripcionId === null
      ? []
      : await db
          .select({ id: schema.enrollment.id })
          .from(schema.enrollment)
          .where(
            scoped(
              schema.enrollment.organizationId,
              organizationId,
              eq(schema.enrollment.parentEnrollmentId, input.inscripcionId)
            )
          )
          .limit(1);

  return validarVinculoDeInscripcion({
    inscripcionId: input.inscripcionId,
    cohorteId: input.cohorteId,
    cohorteEsModulo: esModulo,
    madreId: input.madreId,
    madreExiste: madre.length > 0,
    madreYaEsHija: madre[0]?.parentEnrollmentId != null,
    inscripcionYaTieneHijas: hijasPropias.length > 0,
  });
}

/**
 * Los módulos de una camada, en el orden que decidió la academia (FR-002).
 *
 * Vive acá y no en `courses.ts` porque es la lectura elemental del árbol y la
 * van a necesitar varias superficies. Ordena por `position` y desempata por
 * `start_date`: dos módulos con la misma posición es un dato mal cargado, no
 * un motivo para devolverlos en orden aleatorio.
 */
export async function listarModulos(organizationId: string, parentCohortId: string) {
  return getDb()
    .select({
      id: schema.cohort.id,
      name: schema.cohort.name,
      position: schema.cohort.position,
      courseId: schema.cohort.courseId,
      teacherId: schema.cohort.teacherId,
      startDate: schema.cohort.startDate,
      endDate: schema.cohort.endDate,
      minAttendancePct: schema.cohort.minAttendancePct,
      /**
       * 028 fase 2 — Lo que hace falta para dibujar el cronograma del módulo
       * (`classes.ts`). Viajan en la consulta que YA se hacía: el árbol se
       * camina una vez, no una por columna que alguien descubra que falta.
       */
      daysOfWeek: schema.cohort.daysOfWeek,
      startTime: schema.cohort.startTime,
      endTime: schema.cohort.endTime,
      meetingUrl: schema.cohort.meetingUrl,
    })
    .from(schema.cohort)
    .where(
      scoped(
        schema.cohort.organizationId,
        organizationId,
        eq(schema.cohort.parentCohortId, parentCohortId)
      )
    )
    .orderBy(schema.cohort.position, schema.cohort.startDate);
}

/**
 * ¿Esta inscripción es una madre? Se responde por la PRESENCIA de hijas, no
 * por una bandera (FR-033).
 */
export async function tieneHijas(
  organizationId: string,
  enrollmentId: string
): Promise<boolean> {
  const rows = await getDb()
    .select({ id: schema.enrollment.id })
    .from(schema.enrollment)
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        eq(schema.enrollment.parentEnrollmentId, enrollmentId)
      )
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * 028 (FR-022/FR-023) — ¿Hay una dispensa de asistencia VIGENTE?
 *
 * Vigente = otorgada y no revocada. Se pregunta por los datos, no por un
 * booleano, y una dispensa sin motivo NO cuenta: sin motivo no hay dispensa
 * (FR-023). Que la regla esté acá y no repartida evita que una pantalla
 * decida distinto que otra.
 *
 * Qué hace `approvalState()` con esto es la fase 2 (FR-024): saltear la
 * compuerta de asistencia y NADA más.
 */
export function dispensaVigente(inscripcion: {
  attendanceWaiverAt: Date | null;
  attendanceWaiverReason: string | null;
  attendanceWaiverRevokedAt: Date | null;
}): boolean {
  /**
   * Fase 2 — Ausente y NULL significan lo mismo: no hay dispensa. La versión
   * anterior comparaba con `!== null` y una fila sin la columna —una consulta
   * que no la seleccionó— pasaba el primer filtro y reventaba en el `.trim()`.
   * La regla que decide si alguien aprueba no puede depender de qué columnas
   * pidió quien la llama.
   */
  const otorgadaEl = inscripcion.attendanceWaiverAt ?? null;
  const motivo = inscripcion.attendanceWaiverReason ?? null;
  const revocadaEl = inscripcion.attendanceWaiverRevokedAt ?? null;

  return (
    otorgadaEl !== null &&
    motivo !== null &&
    motivo.trim() !== "" &&
    revocadaEl === null
  );
}

/**
 * Las inscripciones hijas de un recorrido, para poder componer el estado de
 * la especialización (FR-016). Ordenadas por la `position` del módulo que
 * cada una cursó — que puede ser el módulo de otra camada (FR-008).
 */
export async function listarHijas(organizationId: string, parentEnrollmentId: string) {
  return getDb()
    .select({
      id: schema.enrollment.id,
      cohortId: schema.enrollment.cohortId,
      enrolledAt: schema.enrollment.enrolledAt,
      position: schema.cohort.position,
      /**
       * La camada a la que pertenece el módulo que REALMENTE cursó. Cuando no
       * es la de la madre, esto es una recursada o una baja voluntaria
       * (FR-008): es el único lugar donde ese hecho está escrito.
       */
      parentCohortId: schema.cohort.parentCohortId,
      cohortName: schema.cohort.name,
      courseName: schema.course.name,
      startDate: schema.cohort.startDate,
      endDate: schema.cohort.endDate,
      /** La cadena de DV-002: manda el módulo, con el curso como respaldo. */
      cohortMinAttendancePct: schema.cohort.minAttendancePct,
      courseMinAttendancePct: schema.course.minAttendancePct,
      /**
       * La dispensa es POR MÓDULO y por eso viaja acá, en la fila de la hija.
       * El nombre del autor se resuelve en el mismo viaje: sin él el motivo
       * no se puede escribir, y un motivo a medias es una dispensa silenciosa
       * (FR-025).
       */
      attendanceWaiverAt: schema.enrollment.attendanceWaiverAt,
      attendanceWaiverReason: schema.enrollment.attendanceWaiverReason,
      attendanceWaiverRevokedAt: schema.enrollment.attendanceWaiverRevokedAt,
      attendanceWaiverByName: schema.user.name,
    })
    .from(schema.enrollment)
    .leftJoin(schema.cohort, eq(schema.enrollment.cohortId, schema.cohort.id))
    .leftJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .leftJoin(schema.user, eq(schema.enrollment.attendanceWaiverBy, schema.user.id))
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        eq(schema.enrollment.parentEnrollmentId, parentEnrollmentId)
      )
    )
    .orderBy(schema.cohort.position);
}

/**
 * Las cohortes que son módulos de algo, para las pantallas que necesiten
 * distinguirlas. Existe para que nadie escriba `parent_cohort_id is not null`
 * suelto en una consulta y después no se pueda buscar quién lo hace.
 */
export async function listarCohortesModulo(organizationId: string) {
  return getDb()
    .select({
      id: schema.cohort.id,
      parentCohortId: schema.cohort.parentCohortId,
      position: schema.cohort.position,
    })
    .from(schema.cohort)
    .where(
      scoped(
        schema.cohort.organizationId,
        organizationId,
        isNotNull(schema.cohort.parentCohortId)
      )
    )
    .orderBy(schema.cohort.parentCohortId, schema.cohort.position);
}
