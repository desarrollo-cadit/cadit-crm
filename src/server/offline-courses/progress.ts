import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { parseVimeoUrl } from "@/lib/vimeo";
import { enrollmentCourseStates } from "./access";
import {
  accumulateVideoProgress,
  courseCompletion,
  decideCompletion,
  nextUnlockedTopicId,
  topicUnlocked,
  type CompletionSource,
  type CourseState,
  type CourseCompletion,
  type PlayedRange,
  type StoredProgress,
} from "./logic";
import {
  completedIds,
  courseOutline,
  courseOutlines,
  passedQuizIdsFor,
  progressRowsFor,
  quizIdsByCourse,
  type OutlineTopic,
} from "./outline";
import { canReadCourse } from "./student";

/**
 * cursos-offline (T9) — Topic progress: the writes, and the staff read of it.
 *
 * Outside `student.ts` (read-only by test), like `submit.ts`. Three ways a
 * topic becomes complete, one row per (contact, topic):
 *
 *  - `video`: the student's player reports the played ranges; they are
 *    merged with every range stored for the topic (T9b) and the UNION must
 *    cover ≥ 90% (`accumulateVideoProgress`), so viewing split across days
 *    counts. Client-side tracking can be spoofed; accepted for an academy
 *    (feature decision).
 *  - `no_video`: a topic without an embeddable video completes on open.
 *  - `staff`: someone with `academico.editar` marks it (author + date) — the
 *    fallback when the player cannot play (domain restriction, a blocker).
 *
 * Everything is validated BEFORE the write: an error Response does not roll
 * back the tenant transaction. The write is an upsert whose SET is monotonic
 * in SQL too (`greatest`, `coalesce`): two concurrent reports can race, and
 * neither may lower the ratio or undo a completion.
 *
 * Status codes: 404 for anything the student cannot see (course, topic,
 * locked topic — a 403 would confirm it exists), 422 for a report that does
 * not fit the topic.
 */

export type ProgressResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: 404 | 422; code: string; message: string };

export type TopicProgressAnswer = {
  watchedRatio: number;
  completed: boolean;
  /** The topic that just opened, when this one is complete; `null` at the end. */
  nextTopicId: string | null;
};

const { offlineTopicProgress, offlineTopic, offlineLesson, enrollment } = schema;

const NOT_FOUND = { ok: false, status: 404, code: "not_found", message: "Tema no encontrado" } as const;

const hasVideo = (topic: OutlineTopic) => parseVimeoUrl(topic.videoUrl) !== null;

/** The one write. The decision (pure, tested) says what to insert; SQL keeps it monotonic. */
async function upsertProgress(
  orgId: string,
  contactId: string,
  topicId: string,
  values: {
    watchedRatio: number;
    completedAt: Date | null;
    completionSource: CompletionSource | null;
    completedBy: string | null;
    /** Only a video report sends these; the other writes leave them as they are. */
    playback?: { playedRanges: PlayedRange[]; videoDuration: number };
  }
): Promise<{ watchedRatio: number; completed: boolean }> {
  const t = offlineTopicProgress;
  const [row] = await getDb()
    .insert(t)
    .values({
      id: newId("offlineTopicProgress"),
      organizationId: orgId,
      contactId,
      topicId,
      watchedRatio: values.watchedRatio.toFixed(4),
      completedAt: values.completedAt,
      completionSource: values.completionSource,
      completedBy: values.completedBy,
      ...(values.playback && {
        playedRanges: values.playback.playedRanges,
        videoDuration: String(values.playback.videoDuration),
      }),
    })
    .onConflictDoUpdate({
      target: [t.contactId, t.topicId],
      set: {
        watchedRatio: sql`greatest(${t.watchedRatio}, excluded.watched_ratio)`,
        // Every SET expression sees the OLD row: once completed, all three
        // completion columns keep their values together (the CHECKs need it).
        completedAt: sql`coalesce(${t.completedAt}, excluded.completed_at)`,
        completionSource: sql`case when ${t.completedAt} is null then excluded.completion_source else ${t.completionSource} end`,
        completedBy: sql`case when ${t.completedAt} is null then excluded.completed_by else ${t.completedBy} end`,
        // The merged ranges were computed from the row read just before: the
        // union is monotonic by itself. A concurrent report can still win the
        // race and drop the other's new ranges — the ratio above does not go
        // down, and the next report (the player sends the whole session) adds
        // them back.
        ...(values.playback && {
          playedRanges: sql`excluded.played_ranges`,
          videoDuration: sql`excluded.video_duration`,
        }),
        updatedAt: sql`now()`,
      },
    })
    .returning({ watchedRatio: t.watchedRatio, completedAt: t.completedAt });
  return { watchedRatio: Number(row?.watchedRatio ?? 0), completed: Boolean(row?.completedAt) };
}

/** What a video report accumulates on: the stored ranges and duration. */
async function storedPlayback(orgId: string, contactId: string, topicId: string) {
  const t = offlineTopicProgress;
  const [row] = await getDb()
    .select({ playedRanges: t.playedRanges, videoDuration: t.videoDuration })
    .from(t)
    .where(scoped(t.organizationId, orgId, and(eq(t.contactId, contactId), eq(t.topicId, topicId))))
    .limit(1);
  return {
    playedRanges: row?.playedRanges ?? [],
    videoDuration: row?.videoDuration == null ? null : Number(row.videoDuration),
  };
}

/* ============================================================
 * Student writes
 * ============================================================ */

/** Course readable, topic in it and unlocked — or the 404 that hides all three. */
async function studentTopic(orgId: string, contactId: string, courseId: string, topicId: string) {
  if (!(await canReadCourse(orgId, contactId, courseId))) return null;
  const outline = await courseOutline(orgId, courseId);
  const topic = outline.topics.find((t) => t.id === topicId);
  if (!topic) return null;
  const orderedIds = outline.topics.map((t) => t.id);
  const rows = await progressRowsFor(orgId, contactId, orderedIds);
  if (!topicUnlocked(orderedIds, completedIds(rows), topicId)) return null;
  const existing: StoredProgress | null = rows.find((r) => r.topicId === topicId) ?? null;
  return { topic, orderedIds, existing };
}

const answer = (
  orderedIds: string[],
  topicId: string,
  stored: { watchedRatio: number; completed: boolean }
): TopicProgressAnswer => ({
  ...stored,
  nextTopicId: nextUnlockedTopicId(orderedIds, topicId, stored.completed),
});

/** The player's report: played ranges + duration of a topic WITH a video. */
export async function recordVideoProgress(
  orgId: string,
  contactId: string,
  courseId: string,
  topicId: string,
  report: { playedRanges: PlayedRange[]; duration: number }
): Promise<ProgressResult<TopicProgressAnswer>> {
  const found = await studentTopic(orgId, contactId, courseId, topicId);
  if (!found) return NOT_FOUND;
  if (!hasVideo(found.topic)) {
    return {
      ok: false,
      status: 422,
      code: "topic_without_video",
      message: "Este tema no tiene video: se completa al abrirlo",
    };
  }

  const playback = await storedPlayback(orgId, contactId, topicId);
  const decision = accumulateVideoProgress(
    found.existing ? { ...found.existing, ...playback } : null,
    report,
    new Date()
  );
  const stored = await upsertProgress(orgId, contactId, topicId, {
    watchedRatio: decision.watchedRatio,
    completedAt: decision.completedAt,
    completionSource: decision.completionSource,
    completedBy: null,
    playback: { playedRanges: decision.playedRanges, videoDuration: decision.videoDuration },
  });
  return { ok: true, data: answer(found.orderedIds, topicId, stored) };
}

/** A topic without an embeddable video completes when the student opens it. */
export async function completeTopicWithoutVideo(
  orgId: string,
  contactId: string,
  courseId: string,
  topicId: string
): Promise<ProgressResult<TopicProgressAnswer>> {
  const found = await studentTopic(orgId, contactId, courseId, topicId);
  if (!found) return NOT_FOUND;
  if (hasVideo(found.topic)) {
    return {
      ok: false,
      status: 422,
      code: "topic_has_video",
      message: "Este tema tiene video: se completa al verlo",
    };
  }

  const decision = decideCompletion(found.existing, "no_video", new Date());
  const stored = decision
    ? await upsertProgress(orgId, contactId, topicId, {
        watchedRatio: 0,
        ...decision,
        completedBy: null,
      })
    : { watchedRatio: found.existing?.watchedRatio ?? 0, completed: true };
  return { ok: true, data: answer(found.orderedIds, topicId, stored) };
}

/* ============================================================
 * Staff: the override and the per-enrollment view
 * ============================================================ */

async function findEnrollment(orgId: string, enrollmentId: string) {
  const [row] = await getDb()
    .select({ id: enrollment.id, contactId: enrollment.contactId })
    .from(enrollment)
    .where(scoped(enrollment.organizationId, orgId, eq(enrollment.id, enrollmentId)))
    .limit(1);
  return row ?? null;
}

/** The library courses this enrollment effectively reads (inherited or granted). */
const effectiveCourses = (states: CourseState[]) =>
  states.filter((c) => c.state === "inherited" || c.state === "granted");

/**
 * Staff marks a topic complete for the enrollment's student. Not gated by
 * the sequence: it is the way out when the player cannot play. The course
 * must be one this enrollment reads — completing a topic of a course the
 * student does not have would be a record with nothing behind it.
 */
export async function staffCompleteTopic(
  orgId: string,
  enrollmentId: string,
  topicId: string,
  userId: string
): Promise<ProgressResult<{ completed: true; completionSource: CompletionSource }>> {
  const found = await findEnrollment(orgId, enrollmentId);
  if (!found) {
    return { ok: false, status: 404, code: "not_found", message: "Inscripción no encontrada" };
  }

  const [topic] = await getDb()
    .select({ id: offlineTopic.id, courseId: offlineLesson.courseId })
    .from(offlineTopic)
    .innerJoin(offlineLesson, eq(offlineLesson.id, offlineTopic.lessonId))
    .where(scoped(offlineTopic.organizationId, orgId, eq(offlineTopic.id, topicId)))
    .limit(1);
  if (!topic) return NOT_FOUND;

  const courses = effectiveCourses((await enrollmentCourseStates(orgId, enrollmentId)) ?? []);
  if (!courses.some((c) => c.courseId === topic.courseId)) {
    return {
      ok: false,
      status: 422,
      code: "course_not_assigned",
      message: "El alumno no tiene acceso a este curso offline",
    };
  }

  const [existing] = await progressRowsFor(orgId, found.contactId, [topicId]);
  const decision = decideCompletion(existing ?? null, "staff", new Date());
  if (!decision) {
    return { ok: true, data: { completed: true, completionSource: existing?.completionSource ?? "staff" } };
  }
  await upsertProgress(orgId, found.contactId, topicId, {
    watchedRatio: 0,
    ...decision,
    completedBy: userId,
  });
  return { ok: true, data: { completed: true, completionSource: decision.completionSource } };
}

export type StaffTopicProgress = {
  id: string;
  title: string;
  lessonTitle: string;
  completed: boolean;
  completionSource: CompletionSource | null;
  completedAt: string | null;
  watchedRatio: number;
};

export type StaffCourseProgress = {
  courseId: string;
  completion: CourseCompletion;
  topics: StaffTopicProgress[];
};

/**
 * Per course this enrollment reads: the completion and every topic's state.
 * Progress and passed quizzes count per CONTACT, the same way the student
 * sees them. `null` → the enrollment is not in this organization (404).
 *
 * `states` are the enrollment's course states the caller already has
 * (`enrollmentCourseStates`): the route needs them for its own answer, and
 * computing them twice per request was a second round of the same queries.
 */
export async function enrollmentCourseProgress(
  orgId: string,
  enrollmentId: string,
  states: CourseState[]
): Promise<StaffCourseProgress[] | null> {
  const found = await findEnrollment(orgId, enrollmentId);
  if (!found) return null;
  const courseIds = effectiveCourses(states).map((c) => c.courseId);
  if (courseIds.length === 0) return [];

  const [outlines, quizzes] = await Promise.all([
    courseOutlines(orgId, courseIds),
    quizIdsByCourse(orgId, courseIds),
  ]);
  const topicIds = [...outlines.values()].flatMap((o) => o.topics.map((t) => t.id));
  const [rows, passed] = await Promise.all([
    progressRowsFor(orgId, found.contactId, topicIds),
    passedQuizIdsFor(orgId, found.contactId, [...quizzes.values()].flat()),
  ]);
  const byTopic = new Map(rows.map((r) => [r.topicId, r]));
  const done = completedIds(rows);

  return courseIds.map((courseId) => {
    const outline = outlines.get(courseId) ?? { lessons: [], topics: [] };
    const lessonTitle = new Map(outline.lessons.map((l) => [l.id, l.title]));
    return {
      courseId,
      completion: courseCompletion({
        topicIds: outline.topics.map((t) => t.id),
        completedTopicIds: done,
        quizIds: quizzes.get(courseId) ?? [],
        passedQuizIds: passed,
      }),
      topics: outline.topics.map((t) => {
        const row = byTopic.get(t.id);
        return {
          id: t.id,
          title: t.title,
          lessonTitle: lessonTitle.get(t.lessonId) ?? "",
          completed: Boolean(row?.completedAt),
          completionSource: row?.completionSource ?? null,
          completedAt: row?.completedAt?.toISOString() ?? null,
          watchedRatio: row?.watchedRatio ?? 0,
        };
      }),
    };
  });
}
