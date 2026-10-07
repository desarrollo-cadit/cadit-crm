import { desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import type { Capability } from "@/lib/capabilities";
import { ACTIVITY_LABELS, type ActivityKind } from "@/lib/activity-kinds";
import { describeUserAgent } from "@/lib/user-agent";
import { mergeTimeline, type TimelineEvent } from "@/lib/activity-timeline";
import { listContactActivity, type ActivityEntry } from "@/server/activity-log";
import { effectiveCourseIdsForContact } from "@/server/offline-courses/access";
import { contactCourseProgress } from "@/server/offline-courses/outline";

/**
 * 2026-10-07 — La pestaña «Administración» del legajo.
 *
 * Vive APARTE de `student-record.ts` a propósito: el legajo lo ve cualquiera
 * con `contactos.ver`, y esto solo quien tiene `alumnos.auditoria`. Si los dos
 * se armaran en la misma función, bastaría un `if` mal puesto para que las IPs
 * viajaran con el legajo. Dos rutas, dos funciones: el dato que no se debe
 * ver no viaja (ver `admin-activity/route.ts`).
 *
 * El progreso de cursos offline NO se recalcula acá: sale de
 * `contactCourseProgress`, la única derivación de «qué cuenta como hecho» que
 * ya comparten el panel de la cohorte y el portal del alumno.
 */

export type SignInEntry = {
  id: string;
  at: string;
  ipAddress: string | null;
  device: string;
};

export type OfflineCourseSummary = {
  courseId: string;
  title: string;
  /** `null` = el curso no tiene temas: no hay porcentaje que afirmar. */
  topicsPct: number | null;
  topicsDone: number;
  topicsTotal: number;
  quizzesPassed: number;
  quizzesTotal: number;
  completed: boolean;
  attempts: number;
  /** Mejor puntaje en cualquier cuestionario del curso, 0–100. */
  bestScore: number | null;
  /** Curso entero reconocido, o cuántas lecciones lo están. */
  courseRecognized: boolean;
  recognizedLessons: number;
  lastActivityAt: string | null;
};

export type AdminActivityDto = {
  signIns: { lastAt: string | null; items: SignInEntry[] };
  offlineCourses: OfflineCourseSummary[];
  timeline: TimelineEvent[];
  /** `false` cuando la sesión no tiene `inbox.ver`: los mensajes no se leyeron. */
  timelineIncludesMessages: boolean;
  activity: (ActivityEntry & { label: string; device: string })[];
};

const ESTADO_ASISTENCIA: Record<string, string> = {
  presente: "Presente",
  tarde: "Tarde",
  ausente: "Ausente",
  justificado: "Justificado",
};

/** La fecha de la clase, sin hora: no se compone ningún instante acá. */
const fechaDeClase = (d: Date) =>
  d.toLocaleDateString("es-UY", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" });

const vistaPrevia = (text: string | null, type: string) => {
  const t = text?.trim();
  if (!t) return type === "text" ? null : `[${type}]`;
  return t.length > 140 ? `${t.slice(0, 139)}…` : t;
};

const etiqueta = (kind: string) => ACTIVITY_LABELS[kind as ActivityKind] ?? kind;

export async function getStudentAdminActivity(
  organizationId: string,
  contactId: string,
  capabilities: readonly Capability[]
): Promise<AdminActivityDto | null> {
  const db = getDb();

  const [contact] = await db
    .select({ id: schema.contact.id })
    .from(schema.contact)
    .where(scoped(schema.contact.organizationId, organizationId, eq(schema.contact.id, contactId)))
    .limit(1);
  if (!contact) return null;

  /**
   * Los mensajes de WhatsApp son CONVERSACIONES: los gobierna `inbox.ver`, no
   * la auditoría. Sin esa capacidad la consulta ni se hace.
   */
  const conMensajes = capabilities.includes("inbox.ver");

  const [activity, courseIds, mensajes, asistencias, intentos, temas] = await Promise.all([
    listContactActivity(organizationId, contactId, 50),
    effectiveCourseIdsForContact(organizationId, contactId),
    conMensajes
      ? db
          .select({
            id: schema.message.id,
            direction: schema.message.direction,
            type: schema.message.type,
            text: schema.message.text,
            createdAt: schema.message.createdAt,
          })
          .from(schema.message)
          .innerJoin(schema.conversation, eq(schema.message.conversationId, schema.conversation.id))
          .where(
            scoped(
              schema.message.organizationId,
              organizationId,
              eq(schema.conversation.contactId, contactId),
              eq(schema.conversation.isTest, false)
            )
          )
          .orderBy(desc(schema.message.createdAt))
          .limit(50)
      : Promise.resolve([]),
    db
      .select({
        id: schema.attendance.id,
        status: schema.attendance.status,
        updatedAt: schema.attendance.updatedAt,
        classNumber: schema.classSession.number,
        classDate: schema.classSession.date,
        cohortName: schema.cohort.name,
      })
      .from(schema.attendance)
      .innerJoin(schema.enrollment, eq(schema.attendance.enrollmentId, schema.enrollment.id))
      .innerJoin(schema.classSession, eq(schema.attendance.classSessionId, schema.classSession.id))
      .leftJoin(schema.cohort, eq(schema.classSession.cohortId, schema.cohort.id))
      .where(
        scoped(
          schema.attendance.organizationId,
          organizationId,
          eq(schema.enrollment.contactId, contactId)
        )
      )
      .orderBy(desc(schema.attendance.updatedAt))
      .limit(50),
    db
      .select({
        id: schema.offlineQuizAttempt.id,
        quizId: schema.offlineQuizAttempt.quizId,
        courseId: schema.offlineQuiz.courseId,
        quizTitle: schema.offlineQuiz.title,
        scorePercentage: schema.offlineQuizAttempt.scorePercentage,
        passed: schema.offlineQuizAttempt.passed,
        createdAt: schema.offlineQuizAttempt.createdAt,
      })
      .from(schema.offlineQuizAttempt)
      .innerJoin(schema.offlineQuiz, eq(schema.offlineQuizAttempt.quizId, schema.offlineQuiz.id))
      .where(
        scoped(
          schema.offlineQuizAttempt.organizationId,
          organizationId,
          eq(schema.offlineQuizAttempt.contactId, contactId)
        )
      )
      .orderBy(desc(schema.offlineQuizAttempt.createdAt)),
    db
      .select({
        id: schema.offlineTopicProgress.id,
        topicId: schema.offlineTopicProgress.topicId,
        topicTitle: schema.offlineTopic.title,
        completedAt: schema.offlineTopicProgress.completedAt,
        updatedAt: schema.offlineTopicProgress.updatedAt,
      })
      .from(schema.offlineTopicProgress)
      .innerJoin(schema.offlineTopic, eq(schema.offlineTopicProgress.topicId, schema.offlineTopic.id))
      .where(
        scoped(
          schema.offlineTopicProgress.organizationId,
          organizationId,
          eq(schema.offlineTopicProgress.contactId, contactId)
        )
      )
      .orderBy(desc(schema.offlineTopicProgress.updatedAt)),
  ]);

  const [progreso, titulos] = await Promise.all([
    contactCourseProgress(organizationId, contactId, courseIds),
    courseIds.length
      ? db
          .select({ id: schema.offlineCourse.id, title: schema.offlineCourse.title })
          .from(schema.offlineCourse)
          .where(
            scoped(
              schema.offlineCourse.organizationId,
              organizationId,
              inArray(schema.offlineCourse.id, courseIds)
            )
          )
      : Promise.resolve([]),
  ]);
  const tituloDe = new Map(titulos.map((t) => [t.id, t.title]));

  const offlineCourses: OfflineCourseSummary[] = courseIds.map((courseId) => {
    const p = progreso.get(courseId);
    const c = p?.state.completion;
    const topicIds = new Set(p?.outline.topics.map((t) => t.id) ?? []);
    const intentosDelCurso = intentos.filter((i) => i.courseId === courseId);
    const puntajes = intentosDelCurso.map((i) => Number(i.scorePercentage));
    const fechas = [
      ...intentosDelCurso.map((i) => i.createdAt.getTime()),
      ...temas.filter((t) => topicIds.has(t.topicId)).map((t) => t.updatedAt.getTime()),
    ];
    const total = c?.topicsTotal ?? 0;
    return {
      courseId,
      title: tituloDe.get(courseId) ?? "Curso sin título",
      topicsPct: total > 0 ? Math.round(((c?.topicsDone ?? 0) / total) * 100) : null,
      topicsDone: c?.topicsDone ?? 0,
      topicsTotal: total,
      quizzesPassed: c?.quizzesPassed ?? 0,
      quizzesTotal: c?.quizzesTotal ?? 0,
      completed: c?.completed ?? false,
      attempts: intentosDelCurso.length,
      bestScore: puntajes.length ? Math.max(...puntajes) : null,
      courseRecognized: p?.state.courseRecognized ?? false,
      recognizedLessons: p?.state.recognizedLessonIds.size ?? 0,
      lastActivityAt: fechas.length ? new Date(Math.max(...fechas)).toISOString() : null,
    };
  });

  const timeline = mergeTimeline([
    mensajes.map((m) => ({
      id: `msg:${m.id}`,
      kind: "mensaje" as const,
      at: m.createdAt.toISOString(),
      title: m.direction === "in" ? "Mensaje recibido por WhatsApp" : "Mensaje enviado por WhatsApp",
      detail: vistaPrevia(m.text, m.type),
    })),
    asistencias.map((a) => ({
      id: `att:${a.id}`,
      kind: "asistencia" as const,
      at: a.updatedAt.toISOString(),
      title: `Asistencia: ${ESTADO_ASISTENCIA[a.status] ?? a.status}`,
      detail: [`Clase ${a.classNumber} del ${fechaDeClase(a.classDate)}`, a.cohortName]
        .filter(Boolean)
        .join(" · "),
    })),
    intentos.map((i) => ({
      id: `oatt:${i.id}`,
      kind: "cuestionario" as const,
      at: i.createdAt.toISOString(),
      title: `Cuestionario «${i.quizTitle}»: ${i.passed ? "aprobado" : "no aprobado"}`,
      detail: `${Math.round(Number(i.scorePercentage))}%`,
    })),
    temas
      .filter((t): t is typeof t & { completedAt: Date } => t.completedAt !== null)
      .map((t) => ({
        id: `otpg:${t.id}`,
        kind: "tema" as const,
        at: t.completedAt.toISOString(),
        title: `Completó el tema «${t.topicTitle}»`,
        detail: null,
      })),
    activity.map((a) => ({
      id: `act:${a.id}`,
      kind: "actividad" as const,
      at: a.createdAt,
      title: etiqueta(a.kind),
      detail: [describeUserAgent(a.userAgent), a.ipAddress].filter(Boolean).join(" · "),
    })),
  ]);

  const signIns = activity
    .filter((a) => a.kind === "portal.sign_in")
    .slice(0, 20)
    .map((a) => ({
      id: a.id,
      at: a.createdAt,
      ipAddress: a.ipAddress,
      device: describeUserAgent(a.userAgent),
    }));

  return {
    signIns: { lastAt: signIns[0]?.at ?? null, items: signIns },
    offlineCourses,
    timeline,
    timelineIncludesMessages: conMensajes,
    activity: activity.map((a) => ({
      ...a,
      label: etiqueta(a.kind),
      device: describeUserAgent(a.userAgent),
    })),
  };
}
