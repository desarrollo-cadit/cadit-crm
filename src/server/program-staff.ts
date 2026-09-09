import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { fullName } from "@/lib/utils";
import type { Capability } from "@/lib/capabilities";
import { attendanceByModule, resolveMinAttendance } from "@/server/attendance";
import { listProgramClasses } from "@/server/classes";
import {
  dispensaDeInscripcion,
  moduleApprovalState,
  programApprovalState,
  type ApprovalState,
} from "@/server/grading";
import {
  etiquetaDeModulo,
  listarHijasDeVarias,
  listarModulos,
  lugaresDelPrograma,
  modulosConOrdinal,
  verificarVinculoDeInscripcion,
} from "@/server/program-modules";

/**
 * 028 fase 4 — La superficie del STAFF de una especialización.
 *
 * Las fases 1 a 3 dejaron el modelo, el cómputo y los dos portales. Falta la
 * pantalla desde la que la academia **opera** el programa, y son dos cosas
 * distintas que conviene no mezclar:
 *
 * - **Armar la especialización (US3)** — la camada padre muestra sus módulos
 *   ordenados por `position`, cada uno con su profesor, sus fechas, su avance
 *   de clases y el estado de aprobación de cada alumno POR MÓDULO.
 * - **Recursar en otra camada (US4)** — los dos caminos del dueño, que son el
 *   MISMO mecanismo y se distinguen sólo por la plata.
 *
 * ============================================================
 * `position` ordena; el nombre rotula
 * ============================================================
 * En todo este archivo el número guardado en `position` **no se imprime
 * nunca**. Ordena, y el ordinal que la pantalla muestra sale del lugar en la
 * lista ya ordenada (`etiquetaDeModulo`, fase 1). El motivo está escrito allá:
 * quien carga 10/20/30 para dejar hueco entre módulos no puede terminar con
 * una especialización que dice "Módulo 30" en el tercero de tres.
 *
 * ============================================================
 * Por qué la grilla se lee en lote y no alumno por alumno
 * ============================================================
 * `programGrading` (fase 2) resuelve UN recorrido con seis consultas, y es la
 * función correcta cuando lo que se abre es el legajo de una persona. Acá se
 * abre la camada entera: `EBIM 13` tiene 16 alumnos, y llamarla por alumno
 * serían ~96 consultas para dibujar una sola pantalla.
 *
 * Así que las consultas se hacen en lote y **las reglas se reusan tal cual**:
 * `attendanceByModule` cruza asistencia, `moduleApprovalState` decide cada
 * módulo —dispensa incluida— y `programApprovalState` compone la madre. No se
 * reimplementa ninguna: lo único propio de este archivo es el orden en que se
 * piden las filas.
 */

type Db = ReturnType<typeof getDb>;

/* ============================================================
 * Los módulos de la camada
 * ============================================================ */

/** El avance del cronograma de un módulo, dicho en números. */
export type ProgresoDeClases = {
  /** Clases que hay: reales si se generó el cronograma, proyectadas si no. */
  total: number;
  /** Reales, no canceladas y con fecha ya pasada. */
  dictadas: number;
  canceladas: number;
  /**
   * `true` = el módulo **todavía no tiene cronograma generado**. Se muestra
   * igual, declarándolo: un módulo invisible es un módulo que nadie carga, y
   * de ahí salieron los 0 `class_session` de las 9 camadas reales (US3).
   */
  sinCronograma: boolean;
  /** Por qué no se puede generar, en palabras. `null` = se puede. */
  cannotGenerateReason: string | null;
};

export type ModuloDeCamada = {
  cohortId: string;
  courseId: string;
  /** El rótulo humano: nombre propio de la cohorte, o el del curso. */
  name: string;
  /**
   * La CLAVE DE ORDEN. Viaja para poder editarla desde la pantalla, jamás para
   * imprimirla: el ordinal de abajo es lo que se muestra.
   */
  position: number | null;
  /** 1..n según el lugar en la lista ordenada. `null` = sin `position` cargada. */
  ordinal: number | null;
  /** "Módulo 2 — Revit Estructura", ya armado con el ordinal derivado. */
  label: string;
  teacher: { id: string; name: string } | null;
  startDate: string | null;
  endDate: string | null;
  minAttendancePct: number | null;
  clases: ProgresoDeClases;
};

type FilaDeModulo = {
  id: string;
  courseId: string;
  name: string | null;
  position: number | null;
  teacherId: string | null;
  startDate: Date | null;
  endDate: Date | null;
  minAttendancePct: number | null;
};

type ClasesDelModulo = {
  projected: boolean;
  cannotGenerateReason: string | null;
  classes: readonly { id: string | null; projected: boolean; date: string; canceled: boolean }[];
};

/**
 * Arma los módulos de la camada. PURA: recibe las filas ya leídas.
 *
 * Vuelve a ordenar aunque la consulta ya ordene, y no por desconfianza: es la
 * única forma de que la regla —`position` asc, los sin cargar al final— tenga
 * un test sin base de datos, que es la convención de `tests/unit/`.
 *
 * El orden y el ordinal salen de `modulosConOrdinal` (fase 1) y no de una
 * copia local: es la misma función que usa el recorrido del alumno, y es lo
 * que garantiza que las dos pantallas digan el mismo número de la misma
 * persona.
 */
export function armarModulosDeCamada(
  modulos: readonly FilaDeModulo[],
  nombreDeCurso: ReadonlyMap<string, string>,
  nombreDeProfesor: ReadonlyMap<string, string>,
  clasesPorCohorte: ReadonlyMap<string, ClasesDelModulo>,
  ahora: Date
): ModuloDeCamada[] {
  return modulosConOrdinal(modulos).map((m) => {
    const clases = clasesPorCohorte.get(m.id);
    const reales = (clases?.classes ?? []).filter((c) => !c.projected);
    const name = m.name ?? nombreDeCurso.get(m.courseId) ?? "Módulo sin nombre";
    // El ordinal sale del LUGAR, nunca de `position` (ver el bloque de arriba).
    const ordinal = m.ordinal;

    return {
      cohortId: m.id,
      courseId: m.courseId,
      name,
      position: m.position,
      ordinal,
      label: etiquetaDeModulo(ordinal, name),
      teacher:
        m.teacherId && nombreDeProfesor.has(m.teacherId)
          ? { id: m.teacherId, name: nombreDeProfesor.get(m.teacherId)! }
          : null,
      startDate: m.startDate?.toISOString() ?? null,
      endDate: m.endDate?.toISOString() ?? null,
      minAttendancePct: m.minAttendancePct,
      clases: {
        total: clases?.classes.length ?? 0,
        dictadas: reales.filter((c) => !c.canceled && new Date(c.date) <= ahora).length,
        canceladas: reales.filter((c) => c.canceled).length,
        // Sin ninguna fila REAL no hay cronograma, aunque haya proyección.
        sinCronograma: reales.length === 0,
        cannotGenerateReason: clases?.cannotGenerateReason ?? null,
      },
    };
  });
}

/* ============================================================
 * Los alumnos, con su estado por módulo
 * ============================================================ */

export type ModuloDelAlumno = {
  /** La inscripción HIJA: es contra ella que se registró todo. */
  enrollmentId: string;
  /** La corrida del módulo que REALMENTE cursó. */
  cohortId: string | null;
  courseId: string | null;
  cohortName: string;
  position: number | null;
  ordinal: number | null;
  label: string;
  state: ApprovalState;
  reasons: string[];
  /** El porcentaje REAL, nunca inflado por la dispensa (FR-026). */
  attendancePct: number | null;
  minAttendancePct: number | null;
  dispensada: boolean;
  /** US4 — `true` si lo cursó con OTRA camada: recursada o baja voluntaria. */
  otraCamada: boolean;
  camadaId: string | null;
  camadaName: string | null;
};

export type AlumnoDeEspecializacion = {
  /** La inscripción MADRE: la que lleva el paquete cerrado. */
  enrollmentId: string;
  contact: { id: string; name: string };
  state: ApprovalState;
  reasons: string[];
  modules: ModuloDelAlumno[];
};

export type CamadaDeEspecializacionDto = {
  cohortId: string;
  name: string;
  courseName: string;
  modules: ModuloDeCamada[];
  /**
   * La grilla de aprobación. **Ausente —no vacía— sin `evaluacion.ver`**: el
   * estado de aprobación de cada persona no se manda por la red a quien no
   * puede verlo y después se esconde en la pantalla. Es el mismo criterio de
   * `buildRosterEntry` con `cobranza.ver` (012).
   */
  students?: AlumnoDeEspecializacion[];
};

/**
 * 028 (US3, mitad staff) — La especialización, entera y en una pantalla.
 *
 * El pedido literal del dueño: los módulos en orden, las notas de cada módulo
 * y quién va cómo, sin abrir cuatro pantallas y anotar a mano.
 *
 * **FR-032/FR-033** — Una camada sin módulos no es una especialización y no
 * entra a este camino: se corta después de la segunda consulta, antes de mirar
 * una sola inscripción. La condición es un dato —la presencia de cohortes
 * hijas—, no una bandera que alguien pueda encender por error.
 */
export async function camadaDeEspecializacion(
  organizationId: string,
  cohortId: string,
  capabilities: readonly Capability[],
  ahora: Date = new Date()
): Promise<CamadaDeEspecializacionDto | null> {
  const db = getDb();

  const camadaRows = await db
    .select({
      id: schema.cohort.id,
      name: schema.cohort.name,
      courseName: schema.course.name,
      parentCohortId: schema.cohort.parentCohortId,
    })
    .from(schema.cohort)
    .innerJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .where(
      scoped(schema.cohort.organizationId, organizationId, eq(schema.cohort.id, cohortId))
    )
    .limit(1);
  const camada = camadaRows[0];
  if (!camada) return null;

  const base = {
    cohortId: camada.id,
    name: camada.name ?? camada.courseName,
    courseName: camada.courseName,
  };

  const modulos = (await listarModulos(organizationId, cohortId)) as FilaDeModulo[];
  if (modulos.length === 0) {
    // Una camada suelta: cero módulos, cero alumnos de programa. No se lee nada más.
    return { ...base, modules: [], students: [] };
  }

  /**
   * El cronograma de cada módulo sale de `listProgramClasses` (fase 2) y no de
   * un conteo propio. Cuesta releer el árbol —esa función también llama a
   * `listarModulos`— y se paga a conciencia: ahí viven la proyección, el
   * motivo por el que un módulo no puede generar cronograma y la regla de que
   * un módulo sin clases se muestra igual. Una segunda copia de todo eso
   * divergiría, y la que diverge es siempre la que nadie mira.
   */
  const programa = await listProgramClasses(organizationId, cohortId, ahora);
  const clasesPorCohorte = new Map<string, ClasesDelModulo>(
    (programa?.modules ?? []).map((m) => [
      m.cohortId,
      { projected: m.projected, cannotGenerateReason: m.cannotGenerateReason, classes: m.classes },
    ])
  );

  const [nombreDeProfesor, nombreDeCurso] = await Promise.all([
    nombresDeProfesores(db, organizationId, modulos),
    nombresDeCursos(db, organizationId, modulos.map((m) => m.courseId)),
  ]);

  const modules = armarModulosDeCamada(
    modulos,
    nombreDeCurso,
    nombreDeProfesor,
    clasesPorCohorte,
    ahora
  );

  if (!capabilities.includes("evaluacion.ver")) return { ...base, modules };

  return {
    ...base,
    modules,
    students: await grillaDeAlumnos(db, organizationId, camada.id, modules),
  };
}

async function nombresDeProfesores(
  db: Db,
  organizationId: string,
  modulos: readonly FilaDeModulo[]
): Promise<Map<string, string>> {
  const ids = [...new Set(modulos.map((m) => m.teacherId).filter((t): t is string => !!t))];
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: schema.teacher.id, name: schema.teacher.name })
    .from(schema.teacher)
    .where(
      scoped(schema.teacher.organizationId, organizationId, inArray(schema.teacher.id, ids))
    );
  return new Map(rows.map((r) => [r.id, r.name]));
}

async function nombresDeCursos(
  db: Db,
  organizationId: string,
  courseIds: readonly string[]
): Promise<Map<string, string>> {
  const ids = [...new Set(courseIds)];
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: schema.course.id, name: schema.course.name })
    .from(schema.course)
    .where(
      scoped(schema.course.organizationId, organizationId, inArray(schema.course.id, ids))
    );
  return new Map(rows.map((r) => [r.id, r.name]));
}

/**
 * La grilla: una fila por alumno de la camada, una celda por módulo cursado.
 *
 * Las inscripciones que cuelgan de la camada padre son las **madres** por
 * construcción —el guarda de FR-010 impide que una cohorte sin padre reciba
 * hijas—, pero el `IS NULL` va igual y explícito: un filtro que depende de
 * otra regla para ser correcto es un filtro que se rompe el día que la otra
 * regla cambie.
 */
async function grillaDeAlumnos(
  db: Db,
  organizationId: string,
  camadaId: string,
  modulosDelPrograma: readonly ModuloDeCamada[]
): Promise<AlumnoDeEspecializacion[]> {
  const madres = await db
    .select({
      id: schema.enrollment.id,
      contactId: schema.contact.id,
      firstName: schema.contact.firstName,
      lastName: schema.contact.lastName,
    })
    .from(schema.enrollment)
    .innerJoin(schema.contact, eq(schema.enrollment.contactId, schema.contact.id))
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        eq(schema.enrollment.cohortId, camadaId),
        isNull(schema.enrollment.parentEnrollmentId)
      )
    )
    .orderBy(asc(schema.contact.firstName));
  if (madres.length === 0) return [];

  const hijas = await listarHijasDeVarias(
    organizationId,
    madres.map((m) => m.id)
  );
  if (hijas.length === 0) {
    // DV-005 — madres sin hijas: `pendiente`, jamás `aprobado`. El default
    // optimista de `approvalState([], null, null)` afirmaría que alguien
    // aprobó una especialización de la que no se cargó un solo módulo.
    return madres.map((m) => ({
      enrollmentId: m.id,
      contact: { id: m.contactId, name: fullName(m) },
      ...programApprovalState([]),
      modules: [],
    }));
  }

  /**
   * Las cohortes que hay que mirar son las de las HIJAS y no las de la camada:
   * una hija puede estar cursando el módulo de OTRA especialización (FR-008),
   * y sus clases y sus evaluaciones viven allá. Filtrar por los módulos del
   * padre le borraría la asistencia y las notas justo a la persona que recursó.
   */
  const cohorteIds = [
    ...new Set(hijas.map((h) => h.cohortId).filter((id): id is string => id !== null)),
  ];
  const inscripcionIds = hijas.map((h) => h.id);

  const [sesiones, marcas, evaluaciones, resultados] = await Promise.all([
    cohorteIds.length
      ? db
          .select({
            id: schema.classSession.id,
            cohortId: schema.classSession.cohortId,
            date: schema.classSession.date,
            canceledAt: schema.classSession.canceledAt,
          })
          .from(schema.classSession)
          .where(
            scoped(
              schema.classSession.organizationId,
              organizationId,
              inArray(schema.classSession.cohortId, cohorteIds)
            )
          )
      : [],
    db
      .select({
        enrollmentId: schema.attendance.enrollmentId,
        classSessionId: schema.attendance.classSessionId,
        status: schema.attendance.status,
      })
      .from(schema.attendance)
      .where(
        scoped(
          schema.attendance.organizationId,
          organizationId,
          inArray(schema.attendance.enrollmentId, inscripcionIds)
        )
      ),
    cohorteIds.length
      ? db
          .select({
            id: schema.assessment.id,
            cohortId: schema.assessment.cohortId,
            required: schema.assessment.required,
          })
          .from(schema.assessment)
          .where(
            scoped(
              schema.assessment.organizationId,
              organizationId,
              inArray(schema.assessment.cohortId, cohorteIds)
            )
          )
      : [],
    db
      .select({
        assessmentId: schema.assessmentResult.assessmentId,
        enrollmentId: schema.assessmentResult.enrollmentId,
        passed: schema.assessmentResult.passed,
      })
      .from(schema.assessmentResult)
      .where(
        scoped(
          schema.assessmentResult.organizationId,
          organizationId,
          inArray(schema.assessmentResult.enrollmentId, inscripcionIds)
        )
      ),
  ]);

  /**
   * US4 — Los módulos cursados con OTRA camada se dicen con el NOMBRE de esa
   * camada, no con un asterisco. Es una lectura más y sólo cuando hay alguna:
   * en la camada normal —todas las hijas en su propio programa— no se consulta
   * nada (FR-032).
   */
  const ajenas = [
    ...new Set(
      hijas
        .map((h) => h.parentCohortId)
        .filter((id): id is string => id !== null && id !== camadaId)
    ),
  ];
  const nombreDeCamada = new Map<string, string>();
  if (ajenas.length > 0) {
    const rows = await db
      .select({ id: schema.cohort.id, name: schema.cohort.name })
      .from(schema.cohort)
      .where(
        scoped(schema.cohort.organizationId, organizationId, inArray(schema.cohort.id, ajenas))
      );
    for (const r of rows) if (r.name) nombreDeCamada.set(r.id, r.name);
  }

  const porModulo = attendanceByModule(
    hijas.map((h) => ({ enrollmentId: h.id, cohortId: h.cohortId, enrolledAt: h.enrolledAt })),
    sesiones,
    marcas
  );

  /**
   * El ordinal de una celda sale del orden del PROGRAMA, no del lugar que ese
   * módulo ocupa en la lista de esa persona. La diferencia muerde en el caso
   * que la fase existe para representar: si alguien todavía no tiene cargado
   * el módulo 2, contar sobre su propia lista rotularía su módulo 3 como
   * "Módulo 2" — y quedaría debajo de la columna equivocada.
   *
   * Se indexa por cohorte **y** por curso: el módulo recursado con otra camada
   * es otra cohorte, pero es el MISMO módulo, y su lugar en el programa es el
   * que la persona venía cursando. El índice lo arma `lugaresDelPrograma`
   * (fase 1), que es exactamente el mismo que usa el recorrido del alumno: si
   * cada pantalla armara el suyo, volverían a discrepar.
   */
  const ordinalDelPrograma = lugaresDelPrograma(modulosDelPrograma);

  return madres.map((madre) => {
    const mias = hijas.filter((h) => h.parentEnrollmentId === madre.id);

    const modules: ModuloDelAlumno[] = mias.map((h, i) => {
      const minPct = resolveMinAttendance(h.cohortMinAttendancePct, h.courseMinAttendancePct);
      const pct = porModulo.get(h.id) ?? null;

      // Sólo las obligatorias definen la aprobación, y una sin resultado
      // cargado cuenta como pendiente y no como reprobada (FR-017).
      const obligatorias = evaluaciones.filter((a) => a.cohortId === h.cohortId && a.required);
      const evaluadas = obligatorias.map(
        (a) =>
          resultados.find((r) => r.assessmentId === a.id && r.enrollmentId === h.id)?.passed ??
          null
      );

      const dispensa = dispensaDeInscripcion(h);
      const { state, reasons } = moduleApprovalState(evaluadas, pct, minPct, dispensa);
      const cohortName = h.cohortName ?? h.courseName ?? "Módulo sin nombre";
      const enElPrograma =
        (h.cohortId ? ordinalDelPrograma.get(`cohorte:${h.cohortId}`) : undefined) ??
        (h.courseId ? ordinalDelPrograma.get(`curso:${h.courseId}`) : undefined);
      // Sin lugar en el programa —un módulo que la camada no tiene cargado—
      // se cae al lugar en la propia lista, que es lo único que hay.
      const ordinal =
        enElPrograma?.ordinal ?? (h.position === null ? null : i + 1);
      const camadaAjena = h.parentCohortId !== null && h.parentCohortId !== camadaId;

      return {
        enrollmentId: h.id,
        cohortId: h.cohortId,
        courseId: h.courseId,
        cohortName,
        position: h.position,
        ordinal,
        label: etiquetaDeModulo(ordinal, cohortName),
        state,
        reasons,
        attendancePct: pct,
        minAttendancePct: minPct,
        dispensada: dispensa !== null,
        otraCamada: camadaAjena,
        camadaId: h.parentCohortId,
        camadaName: camadaAjena ? (nombreDeCamada.get(h.parentCohortId!) ?? null) : null,
      };
    });

    const compuesto = programApprovalState(modules.map((m) => m.state));
    // SC-010 — las razones nombran el módulo que las causó, por su ordinal.
    const culpables = modules.filter((m) =>
      compuesto.state === "reprobado" ? m.state === "reprobado" : m.state === "pendiente"
    );

    return {
      enrollmentId: madre.id,
      contact: { id: madre.contactId, name: fullName(madre) },
      state: compuesto.state,
      reasons: [...compuesto.reasons, ...culpables.map((m) => `${m.label}: ${m.state}`)],
      modules,
    };
  });
}

/* ============================================================
 * US4 — Recursar un módulo en una camada posterior
 * ============================================================
 * Los dos caminos del dueño son el MISMO mecanismo y se distinguen sólo por
 * la plata:
 *
 * - **Baja voluntaria (regla 3)** — falta de tiempo, enfermedad. La inscripción
 *   hija que ya existe pasa a apuntar a la cohorte del mismo módulo en la
 *   camada siguiente. **La madre no se toca y el plan de cuotas del paquete no
 *   se toca**: ya está pago. Es `moverModuloDeRecorrido`, acá abajo.
 * - **Recursada tras reprobar (regla 4)** — se crea una inscripción hija NUEVA
 *   contra el módulo de la otra camada, con su propio monto y su propio plan de
 *   cuotas. Eso **no necesita código nuevo**: es `createEnrollment` con
 *   `parentEnrollmentId`, y el plan sale por `/api/enrollments/[id]/installments`
 *   como el de cualquier inscripción (FR-011). El intento anterior NO se borra:
 *   quedó reprobado y esa es la evidencia de por qué hay que recursar (FR-021).
 */

export type MovimientoDeModulo =
  | { ok: true; enrollmentId: string; cohortId: string }
  | { ok: false; status: 404 | 422; code: string; message: string };

/**
 * Baja voluntaria: la misma cursada, otra camada.
 *
 * Tres cosas que esta función NO hace, y ninguna por olvido:
 *
 * - **No decide el anidamiento.** Esa regla es de la fase 1 y vive en
 *   `verificarVinculoDeInscripcion`. Acá se la llama; escribir una segunda
 *   copia sería tener dos reglas que pueden divergir, y la que diverge es
 *   siempre la que nadie mira. En particular, el caso peligroso —una
 *   inscripción DIRECTA apuntando a una cohorte de módulo— lo rechaza ese
 *   guarda, no una comparación local.
 * - **No toca la plata.** El `set` lleva exactamente `cohort_id`: ni el monto,
 *   ni la moneda, ni las cuotas, ni la madre. El paquete ya está pago y
 *   reescribirlo por mudar un módulo sería cobrar dos veces lo mismo.
 * - **No elige la camada.** Cuál es "la siguiente" lo sabe coordinación y no
 *   el CRM: haría falta conocer cupos, fechas y disponibilidad (fuera de
 *   alcance, explícito en la spec). El sistema registra la decisión.
 *
 * La precondición propia —que la inscripción SEA una hija— no es una segunda
 * validación del árbol: es qué operación es ésta. Mover una inscripción suelta
 * de una cohorte a otra le cambia el significado entero a una venta, y para
 * eso no hay ni pedido ni pantalla.
 */
export async function moverModuloDeRecorrido(
  organizationId: string,
  enrollmentId: string,
  nuevaCohorteId: string
): Promise<MovimientoDeModulo> {
  const db = getDb();

  const filas = await db
    .select({
      id: schema.enrollment.id,
      cohortId: schema.enrollment.cohortId,
      parentEnrollmentId: schema.enrollment.parentEnrollmentId,
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
  const inscripcion = filas[0];
  if (!inscripcion) {
    return { ok: false, status: 404, code: "not_found", message: "Inscripción no encontrada" };
  }

  if (inscripcion.parentEnrollmentId === null) {
    return {
      ok: false,
      status: 422,
      code: "no_es_una_cursada_de_modulo",
      message:
        "Esta inscripción no es la cursada de un módulo: sólo se muda una inscripción hija a otra camada",
    };
  }

  const destino = await db
    .select({ id: schema.cohort.id, parentCohortId: schema.cohort.parentCohortId })
    .from(schema.cohort)
    .where(
      scoped(
        schema.cohort.organizationId,
        organizationId,
        eq(schema.cohort.id, nuevaCohorteId)
      )
    )
    .limit(1);
  if (!destino[0]) {
    return { ok: false, status: 422, code: "invalid_body", message: "Cohorte inexistente" };
  }

  const treeError = await verificarVinculoDeInscripcion(db, organizationId, {
    inscripcionId: enrollmentId,
    cohorteId: nuevaCohorteId,
    cohorteEsModulo: destino[0].parentCohortId != null,
    madreId: inscripcion.parentEnrollmentId,
  });
  if (treeError) {
    return { ok: false, status: 422, code: treeError.code, message: treeError.message };
  }

  const actualizadas = await db
    .update(schema.enrollment)
    .set({ cohortId: nuevaCohorteId, updatedAt: new Date() })
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        and(
          eq(schema.enrollment.id, enrollmentId),
          // Sólo se mueve lo que sigue siendo una hija: si otra pestaña la
          // desenganchó mientras tanto, este UPDATE no toca ninguna fila en vez
          // de dejar una inscripción suelta apuntando a un módulo.
          eq(schema.enrollment.parentEnrollmentId, inscripcion.parentEnrollmentId)
        )
      )
    )
    .returning();
  if (!actualizadas[0]) {
    return { ok: false, status: 404, code: "not_found", message: "Inscripción no encontrada" };
  }

  return { ok: true, enrollmentId, cohortId: nuevaCohorteId };
}
