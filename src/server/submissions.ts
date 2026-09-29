import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { classInstant } from "@/lib/schedule-time";
import { recordResults } from "@/server/grading";
import { teacherCohortDetail, teacherReachesCohort } from "@/server/teacher-portal";

/**
 * 016 — Entregas y corrección: entrega → corrección → resultado.
 *
 * [010](../../specs/010-evaluacion-y-certificados/spec.md) registra el
 * RESULTADO de una evaluación, pero no el TRABAJO. Hoy el alumno manda su
 * archivo por WhatsApp, el profesor lo busca entre veinte mensajes, corrige y
 * avisa por otro canal: si después alguien reclama, no hay fecha de entrega ni
 * devolución escrita en ningún lado.
 *
 * **Por qué este módulo existe aparte de los dos portales.** El alumno ESCRIBE
 * —entrega— y `student-portal.ts` es de solo lectura por construcción (015,
 * FR-003), con un test que falla si aparece un `.insert(` ahí adentro. Y el
 * profesor corrige, pero `teacher-portal.ts` tiene su propio guard estructural.
 * Meter la escritura en cualquiera de los dos rompería una garantía que costó
 * dos ciclos; lo que hace falta es un tercer módulo que las TRES audiencias
 * llamen desde su propia puerta.
 *
 * Regla del archivo, heredada de esos dos: **ausencia = `null` o un resultado
 * tipado, jamás un código de estado**. Quien elige el 404 es la ruta — un 404
 * y no otra cosa, porque confirmarle a alguien que la entrega de otro existe ya
 * es información que no tenía (FR-009).
 */

/* ============================================================
 * Las reglas, puras
 * ============================================================
 * Las cuatro funciones de acá abajo no tocan la base a propósito. Lo que
 * deciden —cuál es la fecha vigente de una persona, si llegó tarde, si puede
 * volver a entregar— lo imprimen TRES pantallas distintas. Con la regla
 * repartida, la del profesor y la del alumno contestan distinto sobre la misma
 * entrega, que es exactamente la discusión que esta fase vino a cerrar.
 */

export type EstadoDeEntrega = "sin_entrega" | "entregada" | "tardia" | "corregida";

/** Lo mínimo para decidir el estado: no hace falta la fila entera. */
export type EntregaVigente = {
  submittedAt: Date;
  correctedAt: Date | null;
  reopenedAt: Date | null;
};

/**
 * FR-005c — La fecha vigente de un alumno: la **más tardía** entre la del
 * grupo y su prórroga.
 *
 * Dicho al revés, que es como se entiende por qué: **una prórroga sólo puede
 * SUMAR plazo.** Tomando siempre la individual, correr después la fecha del
 * grupo más allá de ella dejaría al alumno con prórroga POR DETRÁS de sus
 * compañeros — castigado por una excepción que se le dio para ayudarlo.
 *
 * Las dos en `null` es un estado legítimo (DV-001): no todas las evaluaciones
 * tienen plazo, y sin plazo no hay "tardía" que marcar.
 */
export function fechaVigente(
  grupo: Date | null,
  individual: Date | null
): Date | null {
  if (!grupo) return individual;
  if (!individual) return grupo;
  return individual.getTime() > grupo.getTime() ? individual : grupo;
}

/**
 * FR-005d — **"Fuera de plazo" se calcula AL MOSTRAR**, contra la fecha
 * vigente de este momento, y nunca se congela en una columna.
 *
 * Es la diferencia entre un sistema que registra y uno que acusa: una prórroga
 * otorgada después convierte una entrega tardía en entrega a tiempo, y eso sólo
 * puede pasar si el dato se deriva cada vez. Guardado al entregar, el alumno
 * seguiría figurando tarde para siempre y alguien tendría que "arreglarlo" a
 * mano.
 */
export function esTardia(entregadaEl: Date, vigente: Date | null): boolean {
  if (!vigente) return false;
  return entregadaEl.getTime() > vigente.getTime();
}

/**
 * El estado de una evaluación para una persona.
 *
 * `corregida` gana sobre `tardia` porque lo que importa saber es que ya tiene
 * devolución. Que llegó tarde no se borra: viaja en la entrega misma, que es
 * donde el profesor lo mira para decidir si la toma igual (DV-006).
 */
export function estadoDeEntrega(
  actual: EntregaVigente | null,
  vigente: Date | null
): EstadoDeEntrega {
  if (!actual) return "sin_entrega";
  if (actual.correctedAt) return "corregida";
  return esTardia(actual.submittedAt, vigente) ? "tardia" : "entregada";
}

/**
 * FR-010/FR-013 — **El permiso de reentregar es un ESTADO de la entrega, no un
 * contador.**
 *
 * Sin entrega previa, se puede. Con una entrega hecha, no — hasta que el
 * profesor la REABRA. No hay tope de reentregas (DV-003): un número fijo
 * obligaría a adivinar hoy un límite que ningún profesor pidió, y el día que
 * hiciera falta una más habría que tocar código.
 */
export function puedeEntregar(actual: EntregaVigente | null): boolean {
  if (!actual) return true;
  return actual.reopenedAt !== null;
}

/* ============================================================
 * Los DTO
 * ============================================================ */

export type EntregaDto = {
  id: string;
  url: string;
  title: string | null;
  submittedAt: string;
  /** FR-005 de 010 — `null` es SIN CORREGIR, jamás desaprobado. */
  passed: boolean | null;
  /** FR-007 — la devolución escrita, visible para el alumno. */
  feedback: string | null;
  correctedAt: string | null;
  correctedByName: string | null;
  reopenedAt: string | null;
  /** FR-005d — derivado AHORA, contra la fecha vigente de ahora. */
  tardia: boolean;
};

export type ProrrogaDto = {
  dueAt: string;
  reason: string;
  grantedByName: string | null;
};

/** Una evaluación con lo que esta persona entregó en ella. */
export type EntregaDeEvaluacionDto = {
  assessmentId: string;
  assessmentName: string;
  required: boolean;
  /** El plazo del grupo (FR-005). `null` = sin plazo (DV-001). */
  dueAt: string | null;
  /** La prórroga individual (FR-005b). */
  prorroga: ProrrogaDto | null;
  /** FR-005c — la más tardía de las dos: la que de verdad rige. */
  vigenteAt: string | null;
  estado: EstadoDeEntrega;
  /** FR-013 — si puede entregar AHORA. */
  puedeEntregar: boolean;
  /** FR-008 — el historial completo, la más reciente primero. */
  entregas: EntregaDto[];
};

export type EntregaResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: 404 | 422; code: string; message: string };

/* ============================================================
 * La fecha límite, compuesta en UN solo lugar
 * ============================================================ */

/**
 * Lo que manda una pantalla: un día y una hora de pared. Nunca un instante.
 *
 * El esquema vive acá —y no en cada ruta— porque las dos puertas que fijan
 * plazo comparten el MÓDULO, nunca el envoltorio (014/015): con una copia por
 * ruta, apretar la validación en una dejaba la otra aceptando lo de antes. Es
 * el mismo criterio que `cohortInputSchema` en `courses.ts`.
 *
 * La hora se valida acá y no más adentro: `^\d{1,2}:\d{2}$` aceptaba `99:99` y
 * lo dejaba morir en `componerPlazo` como "la fecha o la hora no se
 * entienden", que no dice qué está mal.
 */
export const plazoSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha con formato AAAA-MM-DD"),
  hora: z
    .string()
    .regex(/^([01]?\d|2[0-3]):[0-5]\d$/, "Hora de 00:00 a 23:59"),
});

export type PlazoInput = z.infer<typeof plazoSchema>;

/**
 * FR-005e — El plazo se compone con `classInstant()`, **el único lugar del
 * repositorio autorizado a armar una fecha con hora de pared**.
 *
 * El texto `"23:59"` no lleva zona. Interpretado con el reloj del servidor
 * —o peor, con el del navegador de quien carga la fecha— el plazo cierra a una
 * hora distinta para cada persona, y los 87 alumnos que cursan desde fuera de
 * Uruguay se quedan afuera sin que nadie entienda por qué.
 *
 * `null` cuando la fecha no se entiende, con el mismo criterio que
 * `classInstant`: antes devolver nada que una fecha inventada.
 */
export function componerPlazo(input: PlazoInput, timezone: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.fecha.trim());
  if (!m) return null;
  const dia = new Date(
    Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  );
  if (Number.isNaN(dia.getTime())) return null;
  return classInstant(dia, input.hora, timezone);
}

async function zonaDeLaOrganizacion(organizationId: string): Promise<string | null> {
  const rows = await getDb()
    .select({ timezone: schema.organization.timezone })
    .from(schema.organization)
    .where(eq(schema.organization.id, organizationId))
    .limit(1);
  return rows[0]?.timezone ?? null;
}

/* ============================================================
 * Lecturas
 * ============================================================ */

type FilaDeEntrega = {
  id: string;
  assessmentId: string;
  enrollmentId: string;
  url: string;
  title: string | null;
  submittedAt: Date;
  passed: boolean | null;
  feedback: string | null;
  correctedAt: Date | null;
  reopenedAt: Date | null;
  correctedByName: string | null;
};

function serializar(fila: FilaDeEntrega, vigente: Date | null): EntregaDto {
  return {
    id: fila.id,
    url: fila.url,
    title: fila.title,
    submittedAt: fila.submittedAt.toISOString(),
    passed: fila.passed,
    feedback: fila.feedback,
    correctedAt: fila.correctedAt?.toISOString() ?? null,
    correctedByName: fila.correctedByName,
    reopenedAt: fila.reopenedAt?.toISOString() ?? null,
    tardia: esTardia(fila.submittedAt, vigente),
  };
}

/**
 * Indexa por evaluación y ordena cada historial de la más reciente a la más
 * vieja, porque en las tres pantallas `entregas[0]` es la que manda: es la que
 * decide el estado y la que el profesor corrige.
 */
function porEvaluacion(filas: FilaDeEntrega[]): Map<string, FilaDeEntrega[]> {
  const out = new Map<string, FilaDeEntrega[]>();
  for (const f of filas) {
    out.set(f.assessmentId, [...(out.get(f.assessmentId) ?? []), f]);
  }
  for (const [k, v] of out) {
    out.set(
      k,
      [...v].sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime())
    );
  }
  return out;
}

function armarEvaluacion(
  evaluacion: { id: string; name: string; required: boolean; dueAt: Date | null },
  entregas: FilaDeEntrega[],
  prorroga: ProrrogaDto | null
): EntregaDeEvaluacionDto {
  const vigente = fechaVigente(
    evaluacion.dueAt,
    prorroga ? new Date(prorroga.dueAt) : null
  );
  const actual = entregas[0] ?? null;

  return {
    assessmentId: evaluacion.id,
    assessmentName: evaluacion.name,
    required: evaluacion.required,
    dueAt: evaluacion.dueAt?.toISOString() ?? null,
    prorroga,
    vigenteAt: vigente?.toISOString() ?? null,
    estado: estadoDeEntrega(actual, vigente),
    puedeEntregar: puedeEntregar(actual),
    entregas: entregas.map((e) => serializar(e, vigente)),
  };
}

const COLUMNAS_DE_ENTREGA = {
  id: schema.submission.id,
  assessmentId: schema.submission.assessmentId,
  enrollmentId: schema.submission.enrollmentId,
  url: schema.submission.url,
  title: schema.submission.title,
  submittedAt: schema.submission.submittedAt,
  passed: schema.submission.passed,
  feedback: schema.submission.feedback,
  correctedAt: schema.submission.correctedAt,
  reopenedAt: schema.submission.reopenedAt,
  correctedByName: schema.user.name,
};

/**
 * 016 (US1, US4) — Las entregas del ALUMNO en una cursada suya.
 *
 * Arranca SIEMPRE por el contacto y cruza la inscripción contra él (FR-009):
 * no existe un camino de lectura que no pase por "¿de quién es esto?". Una
 * inscripción ajena devuelve `null`, exactamente igual que una inexistente.
 *
 * FR-012 — En un programa multi-módulo esto se pide sobre la inscripción del
 * MÓDULO, que es la que tiene la cohorte con las evaluaciones. No hace falta
 * ninguna rama: la hija es una inscripción como cualquier otra y su `cohortId`
 * apunta al módulo que la persona realmente cursa.
 */
export async function entregasDeCursada(
  organizationId: string,
  contactId: string,
  enrollmentId: string
): Promise<EntregaDeEvaluacionDto[] | null> {
  const db = getDb();

  const inscripciones = await db
    .select({ id: schema.enrollment.id, cohortId: schema.enrollment.cohortId })
    .from(schema.enrollment)
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        and(
          eq(schema.enrollment.id, enrollmentId),
          // La cerradura: la inscripción tiene que ser de ESTA persona.
          eq(schema.enrollment.contactId, contactId)
        )
      )
    )
    .limit(1);

  const inscripcion = inscripciones[0];
  if (!inscripcion?.cohortId) return null;

  const evaluaciones = await db
    .select({
      id: schema.assessment.id,
      name: schema.assessment.name,
      required: schema.assessment.required,
      dueAt: schema.assessment.dueAt,
    })
    .from(schema.assessment)
    .where(
      scoped(
        schema.assessment.organizationId,
        organizationId,
        eq(schema.assessment.cohortId, inscripcion.cohortId)
      )
    )
    .orderBy(asc(schema.assessment.position));

  if (evaluaciones.length === 0) return [];

  const [prorrogas, entregas] = await Promise.all([
    db
      .select({
        assessmentId: schema.assessmentExtension.assessmentId,
        dueAt: schema.assessmentExtension.dueAt,
        reason: schema.assessmentExtension.reason,
        grantedByName: schema.user.name,
      })
      .from(schema.assessmentExtension)
      .leftJoin(schema.user, eq(schema.assessmentExtension.grantedBy, schema.user.id))
      .where(
        scoped(
          schema.assessmentExtension.organizationId,
          organizationId,
          eq(schema.assessmentExtension.enrollmentId, enrollmentId)
        )
      ),
    db
      .select(COLUMNAS_DE_ENTREGA)
      .from(schema.submission)
      .leftJoin(schema.user, eq(schema.submission.correctedBy, schema.user.id))
      .where(
        scoped(
          schema.submission.organizationId,
          organizationId,
          eq(schema.submission.enrollmentId, enrollmentId)
        )
      )
      .orderBy(desc(schema.submission.submittedAt)),
  ]);

  const historial = porEvaluacion(entregas);

  return evaluaciones.map((a) => {
    const p = prorrogas.find((x) => x.assessmentId === a.id);
    return armarEvaluacion(
      a,
      historial.get(a.id) ?? [],
      p
        ? {
            dueAt: p.dueAt.toISOString(),
            reason: p.reason,
            grantedByName: p.grantedByName,
          }
        : null
    );
  });
}

export type EntregaDeAlumnoDto = {
  enrollmentId: string;
  studentName: string;
  prorroga: ProrrogaDto | null;
  vigenteAt: string | null;
  estado: EstadoDeEntrega;
  entregas: EntregaDto[];
};

export type EvaluacionConEntregasDto = {
  assessmentId: string;
  assessmentName: string;
  required: boolean;
  dueAt: string | null;
  students: EntregaDeAlumnoDto[];
};

/**
 * FR-005e — La zona viaja CON las entregas, igual que en el cronograma
 * (`listCohortClasses`) y en la cursada del alumno.
 *
 * Sin ella la pantalla formatea el plazo con el reloj del navegador: el
 * profesor escribe "23:59" de la academia y lee otra hora, que es exactamente
 * lo que FR-005e existe para evitar. El servidor ya sabe cuál es; mandarla es
 * más barato que hacer que cada pantalla la adivine.
 */
export type EntregasDeCohorteDto = {
  timezone: string;
  assessments: EvaluacionConEntregasDto[];
};

/**
 * 016 (US2, US3) — Las entregas de una cohorte, como las ve el PROFESOR.
 *
 * `null` si no la alcanza, y la ruta lo traduce a 404: la misma regla de la
 * 014, suplencia incluida (`cohort.teacher_id` ∪ `class_session.teacher_id`).
 *
 * De cada alumno viaja **el nombre y nada más** (DV-004 de 014). No hay correo,
 * no hay teléfono y no hay estado de cuenta: el roster del staff hace casi lo
 * mismo que esto, y ese "casi" es exactamente cómo un campo financiero termina
 * en la pantalla equivocada. Por eso se consulta acá en vez de reusarlo.
 */
export async function entregasDeCohorte(
  organizationId: string,
  teacherId: string,
  cohortId: string
): Promise<EntregasDeCohorteDto | null> {
  if (!(await teacherReachesCohort(organizationId, teacherId, cohortId))) return null;

  const timezone = await zonaDeLaOrganizacion(organizationId);
  if (!timezone) return null;

  const db = getDb();

  const evaluaciones = await db
    .select({
      id: schema.assessment.id,
      name: schema.assessment.name,
      required: schema.assessment.required,
      dueAt: schema.assessment.dueAt,
    })
    .from(schema.assessment)
    .where(
      scoped(
        schema.assessment.organizationId,
        organizationId,
        eq(schema.assessment.cohortId, cohortId)
      )
    )
    .orderBy(asc(schema.assessment.position));

  const inscriptos = await db
    .select({
      enrollmentId: schema.enrollment.id,
      firstName: schema.contact.firstName,
      lastName: schema.contact.lastName,
    })
    .from(schema.enrollment)
    .innerJoin(schema.contact, eq(schema.enrollment.contactId, schema.contact.id))
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        eq(schema.enrollment.cohortId, cohortId)
      )
    )
    .orderBy(asc(schema.contact.firstName));

  if (evaluaciones.length === 0 || inscriptos.length === 0) {
    return {
      timezone,
      assessments: evaluaciones.map((a) => ({
        assessmentId: a.id,
        assessmentName: a.name,
        required: a.required,
        dueAt: a.dueAt?.toISOString() ?? null,
        students: [],
      })),
    };
  }

  const ids = inscriptos.map((i) => i.enrollmentId);

  const [prorrogas, entregas] = await Promise.all([
    db
      .select({
        assessmentId: schema.assessmentExtension.assessmentId,
        enrollmentId: schema.assessmentExtension.enrollmentId,
        dueAt: schema.assessmentExtension.dueAt,
        reason: schema.assessmentExtension.reason,
        grantedByName: schema.user.name,
      })
      .from(schema.assessmentExtension)
      .leftJoin(schema.user, eq(schema.assessmentExtension.grantedBy, schema.user.id))
      .where(
        scoped(
          schema.assessmentExtension.organizationId,
          organizationId,
          inArray(schema.assessmentExtension.enrollmentId, ids)
        )
      ),
    db
      .select(COLUMNAS_DE_ENTREGA)
      .from(schema.submission)
      .leftJoin(schema.user, eq(schema.submission.correctedBy, schema.user.id))
      .where(
        scoped(
          schema.submission.organizationId,
          organizationId,
          inArray(schema.submission.enrollmentId, ids)
        )
      )
      .orderBy(desc(schema.submission.submittedAt)),
  ]);

  const assessments = evaluaciones.map((a) => ({
    assessmentId: a.id,
    assessmentName: a.name,
    required: a.required,
    dueAt: a.dueAt?.toISOString() ?? null,
    students: inscriptos.map((alumno) => {
      const p = prorrogas.find(
        (x) => x.assessmentId === a.id && x.enrollmentId === alumno.enrollmentId
      );
      const prorroga: ProrrogaDto | null = p
        ? {
            dueAt: p.dueAt.toISOString(),
            reason: p.reason,
            grantedByName: p.grantedByName,
          }
        : null;
      const mias = entregas
        .filter((e) => e.assessmentId === a.id && e.enrollmentId === alumno.enrollmentId)
        .sort((x, y) => y.submittedAt.getTime() - x.submittedAt.getTime());
      const vigente = fechaVigente(a.dueAt, p?.dueAt ?? null);

      return {
        enrollmentId: alumno.enrollmentId,
        studentName: [alumno.firstName, alumno.lastName].filter(Boolean).join(" "),
        prorroga,
        vigenteAt: vigente?.toISOString() ?? null,
        estado: estadoDeEntrega(mias[0] ?? null, vigente),
        entregas: mias.map((e) => serializar(e, vigente)),
      };
    }),
  }));

  return { timezone, assessments };
}

/* ============================================================
 * Escrituras — el alumno (US1, US5)
 * ============================================================ */

/**
 * La misma respuesta para los DOS caminos que terminan en el mismo hecho: la
 * reentrega sin reapertura (FR-013), y la entrega que pierde la carrera contra
 * otra simultánea. Para el alumno es una sola cosa —"tu entrega ya está, para
 * cambiarla pedí que la reabran"—, y dos códigos distintos obligarían a la
 * pantalla a conocer los dos para decir la misma frase.
 */
const ENTREGA_CERRADA = {
  ok: false,
  status: 422,
  code: "entrega_cerrada",
  message:
    "Esta entrega ya fue registrada. Para realizar una nueva entrega, tu profesor tiene que habilitar la reapertura.",
} as const;

/**
 * 016 (US1, FR-001..FR-004) — El alumno entrega el ENLACE de su trabajo.
 *
 * Tres cosas que esta función hace y conviene decir:
 *
 * - **No verifica que el enlace abra** (DV-004). El sistema no puede
 *   autenticarse contra el Drive del alumno, y un chequeo que falla en falso es
 *   peor que ninguno. La FORMA la valida `httpUrl` en el esquema de la ruta,
 *   la misma regla que todo campo que termina en un `href`.
 * - **No rechaza por fecha** (DV-006). Pasada la fecha vigente la entrega entra
 *   igual y se marca tardía; la decisión de tomarla es del profesor.
 * - **Inserta, no pisa** (FR-008). La reentrega es una fila nueva; la anterior
 *   queda con su fecha y su devolución.
 */
export async function estudianteEntregar(
  organizationId: string,
  contactId: string,
  input: { assessmentId: string; url: string; title?: string | null }
): Promise<EntregaResult<EntregaDto>> {
  const db = getDb();

  const evaluaciones = await db
    .select({
      id: schema.assessment.id,
      cohortId: schema.assessment.cohortId,
      dueAt: schema.assessment.dueAt,
    })
    .from(schema.assessment)
    .where(
      scoped(
        schema.assessment.organizationId,
        organizationId,
        eq(schema.assessment.id, input.assessmentId)
      )
    )
    .limit(1);

  const evaluacion = evaluaciones[0];
  // Ausencia = "no la encontré". Una evaluación de otra cohorte sale igual que
  // una inventada: distinguirlas confirmaría que existe (FR-009).
  if (!evaluacion) {
    return { ok: false, status: 404, code: "not_found", message: "Evaluación no encontrada" };
  }

  /**
   * FR-012 — La inscripción es la que ESTA persona tiene en la cohorte de la
   * evaluación. En un programa multi-módulo eso es la inscripción del MÓDULO
   * —la hija—, sin ninguna rama: la evaluación ya es por cohorte y la cohorte
   * de módulo es la que tiene profesor, clases y asistencia.
   */
  const inscripciones = await db
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

  const inscripcion = inscripciones[0];
  if (!inscripcion) {
    return { ok: false, status: 404, code: "not_found", message: "Evaluación no encontrada" };
  }

  const previas = await db
    .select({
      submittedAt: schema.submission.submittedAt,
      correctedAt: schema.submission.correctedAt,
      reopenedAt: schema.submission.reopenedAt,
    })
    .from(schema.submission)
    .where(
      scoped(
        schema.submission.organizationId,
        organizationId,
        and(
          eq(schema.submission.assessmentId, evaluacion.id),
          eq(schema.submission.enrollmentId, inscripcion.id)
        )
      )
    )
    .orderBy(desc(schema.submission.submittedAt))
    .limit(1);

  if (!puedeEntregar(previas[0] ?? null)) return ENTREGA_CERRADA;

  const prorrogas = await db
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

  const title = input.title?.trim();
  /**
   * **Constitución IV — el permiso lo arbitra la BASE, no el `if` de arriba.**
   *
   * Entre aquel `puedeEntregar()` y este insert hay una ventana, y dos POST
   * rápidos la cruzan los dos: los dos leen "sí, puede" y los dos insertan. Lo
   * que queda no es una fila de más — es una reentrega que el profesor nunca
   * habilitó, o sea FR-013 roto por la velocidad del dedo.
   *
   * El único PARCIAL `submission_abierta_uq` cubre la entrega ABIERTA —sin
   * corregir y sin reabrir—, que es la única que el modelo permite tener a la
   * vez. La reentrega legítima entra igual: para llegar hasta acá la anterior
   * tuvo que ser reabierta, y una entrega reabierta queda FUERA del índice. El
   * historial de FR-008 no se toca.
   *
   * `on conflict do nothing` y no dejar que la base lance: perder la carrera no
   * es un error del servidor, es el hecho que ya tiene respuesta escrita.
   */
  const insertadas = await db
    .insert(schema.submission)
    .values({
      id: newId("submission"),
      organizationId,
      assessmentId: evaluacion.id,
      enrollmentId: inscripcion.id,
      url: input.url,
      title: title ? title : null,
    })
    .onConflictDoNothing()
    .returning();

  const fila = insertadas[0];
  if (!fila) return ENTREGA_CERRADA;

  return {
    ok: true,
    data: serializar(
      { ...fila, correctedByName: null },
      fechaVigente(evaluacion.dueAt, prorrogas[0]?.dueAt ?? null)
    ),
  };
}

/* ============================================================
 * Escrituras — el profesor (US3, US5)
 * ============================================================ */

async function entregaConCohorte(organizationId: string, submissionId: string) {
  const filas = await getDb()
    .select({
      id: schema.submission.id,
      assessmentId: schema.submission.assessmentId,
      enrollmentId: schema.submission.enrollmentId,
      cohortId: schema.assessment.cohortId,
    })
    .from(schema.submission)
    .innerJoin(schema.assessment, eq(schema.submission.assessmentId, schema.assessment.id))
    .where(
      scoped(
        schema.submission.organizationId,
        organizationId,
        eq(schema.submission.id, submissionId)
      )
    )
    .limit(1);
  return filas[0] ?? null;
}

const NO_ENCONTRADA = {
  ok: false,
  status: 404,
  code: "not_found",
  message: "Entrega no encontrada",
} as const;

const EVALUACION_NO_ENCONTRADA = {
  ok: false,
  status: 404,
  code: "not_found",
  message: "Evaluación no encontrada",
} as const;

/**
 * DV-005 de 014 — **Una cohorte finalizada se VE, no se cambia.**
 *
 * El mismo código y la misma forma de mensaje que la asistencia y la planilla
 * del profesor (`teacherMarkAttendance`, `teacherRecordResult`): dos reglas
 * gemelas con códigos distintos obligan a cada pantalla a conocer las dos, y a
 * la larga una se olvida.
 *
 * Corregir una entrega escribe en `assessment_result` (DV-002), así que sin
 * esto la puerta de las entregas cambiaba una nota de una cohorte cerrada
 * esquivando la regla que la planilla ya aplicaba — la misma escritura, por
 * otro camino.
 */
const COHORTE_FINALIZADA = {
  ok: false,
  status: 422,
  code: "cohorte_finalizada",
  message: "La cohorte ya finalizó: las entregas no se pueden cambiar",
} as const;

type VeredictoDeAlcance =
  | { ok: true }
  | { ok: false; status: 404 | 422; code: string; message: string };

/**
 * Si el profesor puede TOCAR algo de esta cohorte: que la alcance y que siga
 * abierta, en una sola pregunta.
 *
 * Las dos salen de `teacherCohortDetail`, que es donde 014 ya las resuelve —y
 * no de una copia de la cuenta de fechas acá: el día que "finalizada" cambie de
 * definición, tiene que cambiar en un solo lugar.
 *
 * Quien no la alcanza recibe el 404 de SU superficie y nunca el 422: un
 * "existe pero terminó" ya le confirma a un profesor ajeno que existe (FR-009).
 *
 * **El staff no pasa por acá.** Coordinación edita cohortes finalizadas en toda
 * la aplicación —carga resultados y asistencia sin este corte—, así que su
 * puerta (`/api/assessments/[id]/plazo`) sigue exactamente como estaba: esta
 * fase no inventa para el staff una restricción que no tiene en ningún lado.
 */
async function alcanceParaEditar(
  organizationId: string,
  teacherId: string,
  cohortId: string,
  noEncontrada: VeredictoDeAlcance
): Promise<VeredictoDeAlcance> {
  const detalle = await teacherCohortDetail(organizationId, teacherId, cohortId);
  if (!detalle) return noEncontrada;
  if (!detalle.editable) return COHORTE_FINALIZADA;
  return { ok: true };
}

/**
 * 016 (US3, FR-006/FR-007, DV-002) — **Corregir escribe las dos cosas de una
 * vez.**
 *
 * La devolución va a la entrega y el resultado a `assessment_result`, en el
 * mismo movimiento. El doble paso —corregir acá, cargar la nota allá— es la
 * razón por la que hoy los datos no se cargan: nadie hace dos veces el mismo
 * trabajo, y lo que queda a medias es siempre la segunda mitad.
 *
 * `recordResults` hace `on conflict do update`, así que volver a corregir
 * SOBREESCRIBE y nunca duplica — el índice único de `assessment_result` es la
 * idempotencia (constitución IV).
 *
 * **La devolución NO viaja a `assessment_result`** (FR-011): ese campo lo carga
 * el staff como nota interna y el alumno lee ésta.
 */
export async function corregirEntrega(
  organizationId: string,
  teacherId: string,
  userId: string,
  submissionId: string,
  input: { passed: boolean; feedback: string }
): Promise<EntregaResult<{ submissionId: string }>> {
  const entrega = await entregaConCohorte(organizationId, submissionId);
  if (!entrega) return NO_ENCONTRADA;
  // Misma respuesta que si no existiera: no se confirma que exista.
  const alcance = await alcanceParaEditar(
    organizationId,
    teacherId,
    entrega.cohortId,
    NO_ENCONTRADA
  );
  if (!alcance.ok) return alcance;

  const ahora = new Date();
  await getDb()
    .update(schema.submission)
    .set({
      passed: input.passed,
      feedback: input.feedback,
      correctedAt: ahora,
      correctedBy: userId,
      // Corregir cierra la reapertura: para volver a entregar hace falta que
      // el profesor la reabra otra vez (FR-010).
      reopenedAt: null,
      reopenedBy: null,
      updatedAt: ahora,
    })
    .where(
      scoped(
        schema.submission.organizationId,
        organizationId,
        eq(schema.submission.id, submissionId)
      )
    );

  const r = await recordResults(
    organizationId,
    entrega.assessmentId,
    [{ enrollmentId: entrega.enrollmentId, passed: input.passed }],
    userId
  );
  /**
   * **Lanza, no devuelve.** La devolución ya se escribió en la entrega: una
   * `Response` de error NO revierte la transacción del pedido, así que
   * devolverla dejaría la entrega marcada como corregida y la planilla de 010
   * sin el resultado. Media corrección es exactamente el estado que DV-002 vino
   * a hacer imposible; lanzando, `withOrganizationScope` revierte las dos.
   */
  if (!r.ok) {
    throw new Error(
      `016: no se pudo registrar el resultado de la evaluación (${r.code}): ${r.message}`
    );
  }

  return { ok: true, data: { submissionId } };
}

/**
 * 016 (US5, FR-013) — El profesor REABRE la entrega, y con eso el alumno puede
 * volver a entregar.
 *
 * No borra nada: la corrección y la devolución quedan, y la reentrega va a ser
 * una fila nueva (FR-008). Lo único que cambia es el permiso, que es un estado
 * de esta entrega y no un contador de intentos.
 */
export async function reabrirEntrega(
  organizationId: string,
  teacherId: string,
  userId: string,
  submissionId: string
): Promise<EntregaResult<{ submissionId: string }>> {
  const entrega = await entregaConCohorte(organizationId, submissionId);
  if (!entrega) return NO_ENCONTRADA;
  const alcance = await alcanceParaEditar(
    organizationId,
    teacherId,
    entrega.cohortId,
    NO_ENCONTRADA
  );
  if (!alcance.ok) return alcance;

  const ahora = new Date();
  await getDb()
    .update(schema.submission)
    .set({ reopenedAt: ahora, reopenedBy: userId, updatedAt: ahora })
    .where(
      scoped(
        schema.submission.organizationId,
        organizationId,
        eq(schema.submission.id, submissionId)
      )
    );

  return { ok: true, data: { submissionId } };
}

/* ============================================================
 * El plazo: del grupo y de una persona (FR-005b)
 * ============================================================
 * Las dos funciones de acá abajo NO preguntan por el alcance: lo resuelve
 * quien llama, porque las llaman dos audiencias con dos puertas distintas — el
 * staff por `requireCapability("evaluacion.editar")` y el profesor por
 * `requireTeacherPortal` + su alcance de cohorte. Meter las dos respuestas
 * adentro sería el envoltorio único que 015 descartó por tener, por
 * construcción, un camino en el que la respuesta se elige mal.
 */

async function cohorteDeEvaluacion(
  organizationId: string,
  assessmentId: string
): Promise<string | null> {
  const filas = await getDb()
    .select({ cohortId: schema.assessment.cohortId })
    .from(schema.assessment)
    .where(
      scoped(
        schema.assessment.organizationId,
        organizationId,
        eq(schema.assessment.id, assessmentId)
      )
    )
    .limit(1);
  return filas[0]?.cohortId ?? null;
}

/**
 * FR-005b — Si el profesor puede mover el plazo de ESTA evaluación.
 *
 * La pregunta entera —¿la alcanza? ¿sigue abierta la cohorte?— vive acá y no en
 * la ruta: es una regla de la fase, y en la ruta cada superficie nueva tendría
 * que acordarse de repetirla. La ruta sigue eligiendo el código de estado, que
 * es lo suyo.
 */
export async function plazoEditablePorProfesor(
  organizationId: string,
  teacherId: string,
  assessmentId: string
): Promise<EntregaResult<{ cohortId: string }>> {
  const cohortId = await cohorteDeEvaluacion(organizationId, assessmentId);
  if (!cohortId) return EVALUACION_NO_ENCONTRADA;

  const alcance = await alcanceParaEditar(
    organizationId,
    teacherId,
    cohortId,
    EVALUACION_NO_ENCONTRADA
  );
  if (!alcance.ok) return alcance;

  return { ok: true, data: { cohortId } };
}

/**
 * FR-005/FR-005b — Fija (o borra) la fecha límite de TODA la cohorte.
 *
 * `null` la borra, y eso es un estado legítimo: una evaluación sin plazo no
 * tiene "tardías" que marcar (DV-001). No hay ninguna validación de "la fecha
 * tiene que ser futura": correr un plazo hacia atrás es una decisión de la
 * academia, y el efecto —que algunas entregas pasen a figurar tardías— se ve al
 * instante en la pantalla porque se calcula al mostrar (FR-005d).
 */
export async function fijarPlazoDeGrupo(
  organizationId: string,
  assessmentId: string,
  plazo: PlazoInput | null
): Promise<EntregaResult<{ dueAt: string | null }>> {
  const cohortId = await cohorteDeEvaluacion(organizationId, assessmentId);
  if (!cohortId) {
    return { ok: false, status: 404, code: "not_found", message: "Evaluación no encontrada" };
  }

  let dueAt: Date | null = null;
  if (plazo) {
    const timezone = await zonaDeLaOrganizacion(organizationId);
    if (!timezone) {
      return { ok: false, status: 404, code: "not_found", message: "Organización no encontrada" };
    }
    dueAt = componerPlazo(plazo, timezone);
    if (!dueAt) {
      return {
        ok: false,
        status: 422,
        code: "invalid_due_at",
        message: "La fecha o la hora del plazo no son válidas",
      };
    }
  }

  const ahora = new Date();
  await getDb()
    .update(schema.assessment)
    .set({ dueAt, updatedAt: ahora })
    .where(
      scoped(
        schema.assessment.organizationId,
        organizationId,
        eq(schema.assessment.id, assessmentId)
      )
    );

  return { ok: true, data: { dueAt: dueAt?.toISOString() ?? null } };
}

/**
 * FR-005b/FR-005c — La prórroga individual: nueva fecha, quién la otorgó y por
 * qué.
 *
 * **Sin motivo no hay prórroga.** Es el mismo criterio que la dispensa de
 * asistencia (028/FR-023): una excepción sin autor ni motivo es indistinguible
 * de un error de carga, y a los seis meses, frente a una entrega que figura a
 * tiempo tres semanas después del plazo, nadie puede decidir cuál de las dos
 * cosas fue.
 *
 * Volver a otorgarla la CORRIGE —índice único por evaluación e inscripción—:
 * dos fechas distintas sobre la misma entrega no significan nada.
 */
export async function otorgarProrroga(
  organizationId: string,
  assessmentId: string,
  enrollmentId: string,
  input: { plazo: PlazoInput; motivo: string },
  userId: string
): Promise<EntregaResult<ProrrogaDto>> {
  const db = getDb();

  const cohortId = await cohorteDeEvaluacion(organizationId, assessmentId);
  if (!cohortId) {
    return { ok: false, status: 404, code: "not_found", message: "Evaluación no encontrada" };
  }

  /**
   * La inscripción tiene que ser de la MISMA cohorte que la evaluación. Sin
   * esto se podría correrle el plazo a alguien de otra cohorte pasando su id:
   * no rompería nada visible, y esa es justamente la clase de fila incoherente
   * que después nadie sabe explicar.
   */
  const inscripciones = await db
    .select({ id: schema.enrollment.id })
    .from(schema.enrollment)
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        and(
          eq(schema.enrollment.id, enrollmentId),
          eq(schema.enrollment.cohortId, cohortId)
        )
      )
    )
    .limit(1);
  if (!inscripciones[0]) {
    return { ok: false, status: 404, code: "not_found", message: "Inscripción no encontrada" };
  }

  const timezone = await zonaDeLaOrganizacion(organizationId);
  if (!timezone) {
    return { ok: false, status: 404, code: "not_found", message: "Organización no encontrada" };
  }
  const dueAt = componerPlazo(input.plazo, timezone);
  if (!dueAt) {
    return {
      ok: false,
      status: 422,
      code: "invalid_due_at",
      message: "La fecha o la hora de la prórroga no son válidas",
    };
  }

  const ahora = new Date();
  await db
    .insert(schema.assessmentExtension)
    .values({
      id: newId("assessmentExtension"),
      organizationId,
      assessmentId,
      enrollmentId,
      dueAt,
      reason: input.motivo,
      grantedBy: userId,
    })
    .onConflictDoUpdate({
      target: [
        schema.assessmentExtension.assessmentId,
        schema.assessmentExtension.enrollmentId,
      ],
      set: { dueAt, reason: input.motivo, grantedBy: userId, updatedAt: ahora },
    });

  return {
    ok: true,
    data: { dueAt: dueAt.toISOString(), reason: input.motivo, grantedByName: null },
  };
}
