import { asc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { fullName } from "@/lib/utils";
import type { Capability } from "@/lib/capabilities";
import type { Currency } from "@/lib/db/schema";
import {
  attendancePercentage,
  resolveMinAttendance,
} from "@/server/attendance";
import {
  dispensaDeInscripcion,
  moduleApprovalState,
  programApprovalState,
  type ApprovalState,
} from "@/server/grading";

/**
 * 013 (T026, US6/FR-009) — El legajo: todo el recorrido de una persona en una
 * sola pantalla.
 *
 * Es la pantalla que resume el cambio de CRM a academia. Un CRM muestra el
 * estado de una venta; una academia muestra el recorrido de una persona: qué
 * cursó, cuánto asistió, qué aprobó, qué certificados tiene y cómo está su
 * cuenta.
 *
 * **Por CONTACTO, no por inscripción** (DV-004). Una persona puede haber
 * cursado tres veces, y la pregunta que hace el coordinador es "contame de
 * Ana", no "contame de la inscripción 47". Es coherente con 012, donde el
 * acceso al portal se otorga al contacto justamente por lo mismo.
 */

export type RecordCourse = {
  enrollmentId: string;
  cohortId: string | null;
  cohortName: string;
  courseName: string;
  startDate: string | null;
  endDate: string | null;
  enrolledAt: string | null;
  /** `null` = la cohorte no tiene clases registradas todavía. */
  attendancePct: number | null;
  minAttendancePct: number | null;
  /**
   * 013 (T030) — `"sin_datos"` NO viene de `approvalState`: se decide acá.
   *
   * `approvalState([], null, null)` devuelve **"aprobado"**, y para la
   * planilla de la cohorte (010) está bien: ahí el coordinador sabe que
   * todavía no cargó nada. En el LEGAJO no: es un documento sobre una persona,
   * y decir "Aprobado" sin una sola evaluación ni una asistencia registrada es
   * afirmar algo que el sistema no puede respaldar.
   *
   * Encontrado con datos reales: un alumno con 5 cursadas figuraba aprobado en
   * las cinco, sin un solo dato cargado.
   */
  approval: ApprovalState | "sin_datos";
  approvalReasons: string[];
  assessments: { name: string; passed: boolean | null }[];
  certificate: { code: string; issuedAt: string; revokedAt: string | null } | null;
  /**
   * 028 (FR-022) — `true` cuando esta inscripción tiene una dispensa vigente.
   * La dispensa es POR MÓDULO, así que en las 33 cohortes simples y en la
   * madre de una especialización es siempre `false`.
   */
  dispensada: boolean;
  /**
   * 028 (FR-031) — Los módulos, cuando esta cursada es una especialización.
   *
   * `undefined` en las 33 cohortes simples: la clave no existe y el legajo es
   * el de siempre (FR-032). La condición es la PRESENCIA de inscripciones
   * hijas, no una bandera ni una heurística sobre el nombre (FR-033).
   */
  modules?: RecordModule[];
};

/**
 * 028 (FR-031) — Un módulo del recorrido, tal como lo cursó esta persona.
 *
 * Lo que lo distingue de una cursada suelta es que dice **qué corrida** fue:
 * un módulo puede haberse cursado con OTRA camada —baja voluntaria o
 * recursada (US4)—, y sin decirlo el legajo mostraría el módulo 3 de EBIM 13
 * cuando la persona lo cursó con EBIM 14. Es el hecho que el ciclo existe
 * para poder representar; esconderlo lo desperdicia.
 */
export type RecordModule = {
  enrollmentId: string;
  cohortId: string | null;
  cohortName: string;
  courseName: string;
  /** El orden que decidió la academia (FR-002). */
  position: number | null;
  /** La camada del módulo que efectivamente cursó. */
  camadaId: string | null;
  camadaName: string | null;
  /** `true` = lo cursó con otra camada, no con la de su especialización. */
  otraCamada: boolean;
  startDate: string | null;
  endDate: string | null;
  enrolledAt: string | null;
  /** El porcentaje REAL: la dispensa no lo infla (FR-026). */
  attendancePct: number | null;
  minAttendancePct: number | null;
  approval: ApprovalState | "sin_datos";
  approvalReasons: string[];
  assessments: { name: string; passed: boolean | null }[];
  certificate: { code: string; issuedAt: string; revokedAt: string | null } | null;
  /** `true` cuando este módulo tiene una dispensa vigente (FR-022). */
  dispensada: boolean;
};

export type RecordAccount = {
  currency: Currency;
  total: number;
  paid: number;
  balance: number;
  overdueCount: number;
};

export type StudentRecordDto = {
  contact: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    nationalId: string | null;
  };
  courses: RecordCourse[];
  /**
   * 013 (T027, FR-010) — Estado de cuenta.
   *
   * **`undefined` cuando la sesión no tiene `cobranza.ver`.** No se arma en el
   * objeto: no es un filtro de UI. Mismo criterio que `buildRosterEntry` — un
   * dato que no se debe ver no viaja, aunque nadie lo dibuje.
   */
  account?: RecordAccount[];
};

export async function getStudentRecord(
  organizationId: string,
  contactId: string,
  capabilities: readonly Capability[]
): Promise<StudentRecordDto | null> {
  const db = getDb();

  const contactRows = await db
    .select()
    .from(schema.contact)
    .where(scoped(schema.contact.organizationId, organizationId, eq(schema.contact.id, contactId)))
    .limit(1);
  const contact = contactRows[0];
  if (!contact) return null;

  const enrollments = await db
    .select({
      enrollment: schema.enrollment,
      cohort: schema.cohort,
      course: schema.course,
      /**
       * 028 (FR-025) — Quién otorgó la dispensa, resuelto a nombre en el mismo
       * viaje. Sin autor el motivo no se puede escribir, y un motivo a medias
       * es una dispensa silenciosa. No agrega una consulta: es un `leftJoin`
       * sobre la que ya traía las inscripciones.
       */
      waiverAuthor: schema.user.name,
    })
    .from(schema.enrollment)
    .leftJoin(schema.cohort, eq(schema.enrollment.cohortId, schema.cohort.id))
    .leftJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .leftJoin(schema.user, eq(schema.enrollment.attendanceWaiverBy, schema.user.id))
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        eq(schema.enrollment.contactId, contactId)
      )
    )
    .orderBy(asc(schema.enrollment.createdAt));

  const enrollmentIds = enrollments.map((e) => e.enrollment.id);
  const cohortIds = enrollments
    .map((e) => e.cohort?.id)
    .filter((id): id is string => Boolean(id));

  /**
   * 028 (FR-031) — Las camadas de los módulos que esta persona cursó y que NO
   * están ya entre sus cohortes: es el caso de la recursada (US4), donde el
   * módulo pertenece a la EBIM siguiente y esa camada no aparece por ningún
   * otro lado del legajo. Sin su nombre, "lo cursó con otra camada" queda sin
   * decir CUÁL, que es justo el dato que coordinación necesita.
   *
   * Vacío —y por lo tanto sin consulta— para toda persona sin especialización.
   */
  const camadasAjenas = [
    ...new Set(
      enrollments
        .map((e) => e.cohort?.parentCohortId)
        .filter((id): id is string => Boolean(id))
        .filter((id) => !cohortIds.includes(id))
    ),
  ];

  // Se traen todas las piezas de una vez y se cruzan en memoria: una persona
  // con tres cursadas no debería costar quince consultas.
  const [asistencias, clases, resultados, evaluaciones, certificados, camadas] =
    await Promise.all([
      enrollmentIds.length
        ? db
            .select()
            .from(schema.attendance)
            .where(
              scoped(
                schema.attendance.organizationId,
                organizationId,
                inArray(schema.attendance.enrollmentId, enrollmentIds)
              )
            )
        : [],
      cohortIds.length
        ? db
            .select()
            .from(schema.classSession)
            .where(
              scoped(
                schema.classSession.organizationId,
                organizationId,
                inArray(schema.classSession.cohortId, cohortIds)
              )
            )
        : [],
      enrollmentIds.length
        ? db
            .select()
            .from(schema.assessmentResult)
            .where(
              scoped(
                schema.assessmentResult.organizationId,
                organizationId,
                inArray(schema.assessmentResult.enrollmentId, enrollmentIds)
              )
            )
        : [],
      cohortIds.length
        ? db
            .select()
            .from(schema.assessment)
            .where(
              scoped(
                schema.assessment.organizationId,
                organizationId,
                inArray(schema.assessment.cohortId, cohortIds)
              )
            )
        : [],
      enrollmentIds.length
        ? db
            .select()
            .from(schema.certificate)
            .where(
              scoped(
                schema.certificate.organizationId,
                organizationId,
                inArray(schema.certificate.enrollmentId, enrollmentIds)
              )
            )
        : [],
      camadasAjenas.length
        ? db
            .select({ id: schema.cohort.id, name: schema.cohort.name })
            .from(schema.cohort)
            .where(
              scoped(
                schema.cohort.organizationId,
                organizationId,
                inArray(schema.cohort.id, camadasAjenas)
              )
            )
        : [],
    ]);

  const camadaNombre = new Map<string, string>([
    ...enrollments
      .map((e) => e.cohort)
      .filter((c): c is NonNullable<typeof c> => Boolean(c))
      .map((c) => [c.id, c.name ?? ""] as const),
    ...camadas.map((c) => [c.id, c.name ?? ""] as const),
  ]);

  /**
   * 028 (FR-031) — El recorrido, agrupado por madre. Se arma sobre las
   * inscripciones que YA se leyeron: las hijas son inscripciones de la misma
   * persona, así que caminar el árbol no cuesta ni una consulta más.
   */
  const hijasPorMadre = new Map<string, typeof enrollments>();
  for (const fila of enrollments) {
    const madre = fila.enrollment.parentEnrollmentId;
    if (!madre) continue;
    const lista = hijasPorMadre.get(madre) ?? [];
    lista.push(fila);
    hijasPorMadre.set(madre, lista);
  }

  /**
   * Una cursada, con la regla de aprobación de siempre más la dispensa.
   *
   * La comparten la cursada suelta y el módulo porque son **la misma cosa**:
   * un módulo es una cohorte y se evalúa con la regla de cualquier cohorte
   * (FR-016). Lo que el módulo agrega —posición, camada, si la cursó con otra—
   * se pega afuera, donde se sabe de qué recorrido es.
   */
  const armarCursada = ({
    enrollment,
    cohort,
    course,
    waiverAuthor,
  }: (typeof enrollments)[number]): Omit<
    RecordModule,
    "position" | "camadaId" | "camadaName" | "otraCamada"
  > => {
    const clasesDeLaCohorte = clases.filter((c) => c.cohortId === cohort?.id);
    const asistenciaDeEsta = asistencias.filter((a) => a.enrollmentId === enrollment.id);

    /**
     * 013 (T034) — **0% porque nadie pasó lista NO es 0% porque no vino.**
     *
     * `attendancePercentage` devuelve 0 cuando hay clases y ninguna marca de
     * presencia, y para la planilla de asistencia está bien. En el legajo es
     * una acusación: dice que la persona no fue a ninguna clase, cuando lo que
     * pasó es que el profesor todavía no tomó lista.
     *
     * Lo encontró el arnés E2E, no el test unitario: hacía falta una cohorte
     * CON cronograma generado y SIN asistencia cargada, que es exactamente el
     * estado de las 41 cohortes reales el día que se genere el cronograma.
     */
    const pct =
      asistenciaDeEsta.length === 0
        ? null
        : attendancePercentage(
            clasesDeLaCohorte.map((c) => ({
              sessionDate: c.date,
              canceled: Boolean(c.canceledAt),
              status:
                asistenciaDeEsta.find((a) => a.classSessionId === c.id)?.status ?? null,
            })),
            enrollment.enrolledAt
          );

    const minPct = resolveMinAttendance(
      cohort?.minAttendancePct ?? null,
      course?.minAttendancePct ?? null
    );

    const evalsDeLaCohorte = evaluaciones.filter((a) => a.cohortId === cohort?.id);
    const misResultados = evalsDeLaCohorte.map((a) => ({
      name: a.name,
      passed:
        resultados.find(
          (r) => r.assessmentId === a.id && r.enrollmentId === enrollment.id
        )?.passed ?? null,
      required: a.required,
    }));

    /**
     * 028 (FR-024) — La dispensa entra acá y en ningún otro lado: saltea la
     * compuerta de asistencia y nada más. Sin dispensa —las 384 filas de
     * hoy— `moduleApprovalState` devuelve exactamente lo que devolvía
     * `approvalState` (FR-032).
     */
    const dispensa = dispensaDeInscripcion({
      ...enrollment,
      attendanceWaiverByName: waiverAuthor,
    });
    const { state, reasons } = moduleApprovalState(
      misResultados.filter((r) => r.required).map((r) => r.passed),
      pct,
      minPct,
      dispensa
    );

    // Sin evaluaciones Y sin asistencia registrada no hay nada que afirmar.
    const sinDatos = misResultados.length === 0 && pct === null;

    const cert = certificados.find((c) => c.enrollmentId === enrollment.id);

    return {
      dispensada: dispensa !== null,
      enrollmentId: enrollment.id,
      cohortId: cohort?.id ?? null,
      cohortName: cohort?.name ?? course?.name ?? "Lead sin cohorte",
      courseName: course?.name ?? "—",
      startDate: cohort?.startDate?.toISOString() ?? null,
      endDate: cohort?.endDate?.toISOString() ?? null,
      enrolledAt: enrollment.enrolledAt?.toISOString() ?? null,
      attendancePct: pct,
      minAttendancePct: minPct,
      approval: sinDatos ? "sin_datos" : state,
      approvalReasons: sinDatos
        ? ["Todavía no hay evaluaciones ni asistencia registradas en esta cohorte"]
        : reasons,
      assessments: misResultados.map(({ name, passed }) => ({ name, passed })),
      certificate: cert
        ? {
            code: cert.code,
            issuedAt: cert.issuedAt.toISOString(),
            revokedAt: cert.revokedAt?.toISOString() ?? null,
          }
        : null,
    };
  };

  /**
   * 028 (FR-031) — El legajo muestra la especialización ENTERA, y una sola vez.
   *
   * Las hijas no vuelven a aparecer sueltas arriba: cinco filas donde hubo una
   * venta es el mismo número inflado que FR-014 persigue en el tablero, y
   * además rompe la pregunta que el legajo contesta ("¿qué cursó Ana?" es una
   * especialización, no cinco cursos).
   *
   * El estado de la madre se **compone** (FR-016) y no se calcula: su cohorte
   * no tiene clases ni evaluaciones propias (DV-009), así que preguntarle a
   * `approvalState` daría el default optimista `aprobado` sobre una persona.
   * Es exactamente la trampa que en este mismo archivo obligó a inventar
   * `sin_datos`, un nivel más arriba.
   */
  const courses: RecordCourse[] = enrollments
    // Ausente o NULL significan lo mismo: inscripción normal, sin recorrido
    // arriba. Es el estado de las 384 filas de hoy (FR-006).
    .filter((e) => !e.enrollment.parentEnrollmentId)
    .map((fila) => {
      const cursada = armarCursada(fila);
      const hijas = hijasPorMadre.get(fila.enrollment.id) ?? [];
      if (hijas.length === 0) return cursada;

      const camadaDeLaMadre = fila.cohort?.id ?? null;
      const modules: RecordModule[] = hijas
        .map((h) => {
          const modulo = armarCursada(h);
          const camadaId = h.cohort?.parentCohortId ?? null;
          return {
            ...modulo,
            position: h.cohort?.position ?? null,
            camadaId,
            camadaName: camadaId ? (camadaNombre.get(camadaId) || null) : null,
            // US4 — el módulo cursado con la camada siguiente, dicho como tal.
            otraCamada: camadaId !== null && camadaId !== camadaDeLaMadre,
          };
        })
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

      /**
       * Un módulo en `sin_datos` cuenta como `pendiente`: todavía no hay nada
       * que afirmar sobre él, y "nada que afirmar" nunca puede empujar una
       * especialización a `aprobado`.
       */
      const compuesto = programApprovalState(
        modules.map((m) => (m.approval === "sin_datos" ? "pendiente" : m.approval))
      );
      const culpables = modules.filter((m) =>
        compuesto.state === "reprobado"
          ? m.approval === "reprobado"
          : m.approval !== "aprobado"
      );

      return {
        ...cursada,
        // Regla 5 — no existe "la asistencia de la especialización". Cada
        // módulo tiene la suya, y promediarlas inventaría un criterio.
        attendancePct: null,
        minAttendancePct: null,
        approval: compuesto.state,
        approvalReasons: [
          ...compuesto.reasons,
          // SC-010 — las razones nombran el módulo que las causó.
          ...culpables.map((m) =>
            m.position === null
              ? `${m.cohortName}: ${m.approval}`
              : `Módulo ${m.position} — ${m.cohortName}: ${m.approval}`
          ),
        ],
        modules,
      };
    });

  const base: StudentRecordDto = {
    contact: {
      id: contact.id,
      name: fullName(contact),
      email: contact.email,
      phone: contact.phone,
      nationalId: contact.nationalId,
    },
    courses,
  };

  /**
   * 013 (T027, FR-010) — El estado de cuenta solo si la sesión puede verlo.
   *
   * El `return` temprano es deliberado: sin la capacidad, la clave `account`
   * **no existe** en la respuesta. Armarla y esconderla en la UI sería mandar
   * los montos por la red a quien no debe verlos — el mismo error que 012
   * corrigió en el roster.
   */
  if (!capabilities.includes("cobranza.ver")) return base;

  return { ...base, account: await buildAccount(organizationId, enrollmentIds) };
}

/** Saldo por moneda: nunca se suman monedas distintas (corrección de 007). */
async function buildAccount(
  organizationId: string,
  enrollmentIds: string[]
): Promise<RecordAccount[]> {
  if (enrollmentIds.length === 0) return [];
  const db = getDb();

  const cuotas = await db
    .select()
    .from(schema.installment)
    .where(
      scoped(
        schema.installment.organizationId,
        organizationId,
        inArray(schema.installment.enrollmentId, enrollmentIds)
      )
    );
  const vigentes = cuotas.filter((c) => !c.canceledAt);
  if (vigentes.length === 0) return [];

  const pagos = await db
    .select()
    .from(schema.payment)
    .where(
      scoped(
        schema.payment.organizationId,
        organizationId,
        inArray(
          schema.payment.installmentId,
          vigentes.map((c) => c.id)
        )
      )
    );

  const hoy = new Date();
  const porMoneda = new Map<Currency, RecordAccount>();

  for (const cuota of vigentes) {
    const acc =
      porMoneda.get(cuota.currency) ??
      ({
        currency: cuota.currency,
        total: 0,
        paid: 0,
        balance: 0,
        overdueCount: 0,
      } satisfies RecordAccount);

    const pagado = pagos
      .filter((p) => p.installmentId === cuota.id && !p.voidedAt)
      .reduce((sum, p) => sum + p.amount, 0);

    acc.total += cuota.amount;
    acc.paid += pagado;
    acc.balance += cuota.amount - pagado;
    if (pagado < cuota.amount && cuota.dueDate && cuota.dueDate < hoy) {
      acc.overdueCount += 1;
    }
    porMoneda.set(cuota.currency, acc);
  }

  return [...porMoneda.values()];
}
