import { z } from "zod";
import type {
  OfflineAnswerType,
  OfflineCourseStatus,
  OfflineVideoShown,
} from "@/lib/db/schema";

/**
 * cursos-offline — The PURE half of the LearnDash import.
 *
 * (courses.json, quiz-map.json) → a normalized plan whose rows are keyed by
 * `legacy_ref` (`course:1776`, `quiz:1281`, `answer:1281:3:0`…). No database,
 * no file system: `scripts/import/offline-courses.ts` diffs this plan against
 * the organization and upserts.
 *
 * Rules:
 *  - only `confirmed` map entries are imported; `pending` waits for the owner
 *    and `skip` never enters. An exported quiz the map does not mention is
 *    reported as `unmapped` and not imported.
 *  - a map entry pointing at an unknown course, or a confirmed entry whose
 *    quiz is missing from the export, is an ERROR: the map is wrong and
 *    guessing would attach content to the wrong course.
 *  - a quiz hangs from a lesson only when that lesson belongs to the mapped
 *    course; otherwise it stays course-level with a warning.
 *  - positions follow array order (0-based). Quizzes in a course are ordered by
 *    the module letter in their title ("Módulo A…D"), then by legacy id: the
 *    export lists them in no meaningful order.
 *  - LearnDash repeats `sort` inside a quiz (the 40-question ones); a repeated
 *    sort gets `.<n>` appended from its second occurrence so refs stay unique
 *    and stable across re-imports of the same file.
 *  - (export v2) a topic video is kept only when it is an https Vimeo URL
 *    (`vimeo.com` / `player.vimeo.com`): anything else becomes NULL with a
 *    warning — the portal embeds ONLY the official Vimeo player
 *    (constitution II, item 4). `video_shown` BEFORE|AFTER, default after.
 */

/* ---------- Tolerant input validation ---------- */

const legacyId = z.union([z.number().int(), z.string().regex(/^\d+$/)]).transform(Number);

const text = z
  .string()
  .nullish()
  .transform((v) => v ?? "");

/** "80" | 80 | null | "" → int; `fallback` when absent or unparsable. */
function intOr<T extends number | null>(fallback: T) {
  return z
    .union([z.number(), z.string()])
    .nullish()
    .transform((v): number | T => {
      if (v === null || v === undefined) return fallback;
      const s = String(v).trim();
      if (s === "") return fallback;
      const n = Number(s);
      return Number.isFinite(n) ? Math.trunc(n) : fallback;
    });
}

const topicSchema = z.object({
  id: legacyId,
  title: text,
  content_md: text,
  video_url: z.string().nullish(),
  video_shown: z.string().nullish(),
});

const lessonSchema = z.object({
  id: legacyId,
  title: text,
  content_md: text,
  topics: z.array(topicSchema).default([]),
});

const courseSchema = z.object({
  id: legacyId,
  title: text,
  slug: text,
  status: text,
  description_md: text,
  thumbnail: z.string().nullish(),
  lessons: z.array(lessonSchema).default([]),
});

const questionSchema = z.object({
  sort: intOr(0),
  question_md: text,
  answer_type: z.enum(["single", "multiple"]),
  points: intOr(1),
  answers: z.array(z.object({ text, correct: z.boolean().nullish() })).default([]),
});

const quizSchema = z.object({
  id: legacyId,
  title: text,
  description_md: text,
  passing_percentage: intOr(80),
  retries_allowed: intOr(null),
  questions: z.array(questionSchema).default([]),
});

export const coursesFileSchema = z.object({
  courses: z.array(courseSchema),
  quizzes_all: z.array(quizSchema).default([]),
});

export const quizMapFileSchema = z.object({
  quizzes: z.record(
    z.string(),
    z.object({
      status: z.enum(["confirmed", "pending", "skip"]),
      course: legacyId.nullish(),
      lesson: legacyId.nullish(),
      reason: z.string().nullish(),
      title: z.string().nullish(),
    })
  ),
});

/* ---------- The plan ---------- */

export type PlanCourse = {
  legacyRef: string;
  title: string;
  slug: string;
  descriptionMd: string;
  status: OfflineCourseStatus;
  /** Basename of the old thumbnail URL (looked up in `--media`), never the URL. */
  thumbnailFile: string | null;
};
export type PlanLesson = {
  legacyRef: string;
  courseRef: string;
  title: string;
  contentMd: string;
  position: number;
};
export type PlanTopic = {
  legacyRef: string;
  lessonRef: string;
  title: string;
  contentMd: string;
  position: number;
  videoUrl: string | null;
  videoShown: OfflineVideoShown;
};
export type PlanQuiz = {
  legacyRef: string;
  courseRef: string;
  lessonRef: string | null;
  title: string;
  descriptionMd: string;
  passingPercentage: number;
  retriesAllowed: number | null;
  position: number;
};
export type PlanQuestion = {
  legacyRef: string;
  quizRef: string;
  questionMd: string;
  answerType: OfflineAnswerType;
  points: number;
  position: number;
};
export type PlanAnswer = {
  legacyRef: string;
  questionRef: string;
  text: string;
  isCorrect: boolean;
  position: number;
};
export type SkippedQuiz = {
  legacyRef: string;
  title: string;
  status: "pending" | "skip" | "unmapped";
  reason: string;
};

export type ImportPlan = {
  courses: PlanCourse[];
  lessons: PlanLesson[];
  topics: PlanTopic[];
  quizzes: PlanQuiz[];
  questions: PlanQuestion[];
  answers: PlanAnswer[];
  skipped: SkippedQuiz[];
  warnings: string[];
};

function thumbnailBasename(url: string | null | undefined): string | null {
  if (!url) return null;
  const last = url.split(/[?#]/)[0]!.split("/").pop() ?? "";
  if (!last) return null;
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

const VIMEO_HOSTS = new Set(["vimeo.com", "www.vimeo.com", "player.vimeo.com"]);

/** The URL when it is an https Vimeo one; `null` otherwise (never guessed). */
export function vimeoUrlOrNull(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && VIMEO_HOSTS.has(url.hostname) ? value : null;
  } catch {
    return null;
  }
}

function videoShown(raw: string | null | undefined): OfflineVideoShown {
  return raw?.trim().toLowerCase() === "before" ? "before" : "after";
}

function moduleLetter(title: string): string {
  return /m[oó]dulo\s+([a-z])\b/i.exec(title)?.[1]?.toUpperCase() ?? "~";
}

export function buildImportPlan(coursesJson: unknown, quizMapJson: unknown): ImportPlan {
  const input = coursesFileSchema.parse(coursesJson);
  const quizMap = quizMapFileSchema.parse(quizMapJson);

  const plan: ImportPlan = {
    courses: [],
    lessons: [],
    topics: [],
    quizzes: [],
    questions: [],
    answers: [],
    skipped: [],
    warnings: [],
  };

  const lessonCourse = new Map<number, number>();
  const courseIds = new Set<number>();

  for (const c of input.courses) {
    courseIds.add(c.id);
    const courseRef = `course:${c.id}`;
    plan.courses.push({
      legacyRef: courseRef,
      title: c.title,
      slug: c.slug,
      descriptionMd: c.description_md,
      status: c.status === "publish" ? "published" : "draft",
      thumbnailFile: thumbnailBasename(c.thumbnail),
    });
    c.lessons.forEach((l, li) => {
      lessonCourse.set(l.id, c.id);
      const lessonRef = `lesson:${l.id}`;
      plan.lessons.push({
        legacyRef: lessonRef,
        courseRef,
        title: l.title,
        contentMd: l.content_md,
        position: li,
      });
      l.topics.forEach((t, ti) => {
        const videoUrl = vimeoUrlOrNull(t.video_url);
        if (t.video_url?.trim() && !videoUrl) {
          plan.warnings.push(`topic:${t.id}: video "${t.video_url}" is not an https Vimeo URL — imported without video`);
        }
        plan.topics.push({
          legacyRef: `topic:${t.id}`,
          lessonRef,
          title: t.title,
          contentMd: t.content_md,
          position: ti,
          videoUrl,
          videoShown: videoShown(t.video_shown),
        });
      });
    });
  }

  const exported = new Map(input.quizzes_all.map((qz) => [qz.id, qz]));

  // The map is validated as a whole before anything is planned.
  for (const [key, entry] of Object.entries(quizMap.quizzes)) {
    if (entry.course != null && !courseIds.has(entry.course)) {
      throw new Error(`quiz-map: quiz ${key} points at unknown course ${entry.course}`);
    }
    if (entry.status === "confirmed") {
      if (entry.course == null) {
        throw new Error(`quiz-map: confirmed quiz ${key} has no course`);
      }
      if (!exported.has(Number(key))) {
        throw new Error(`quiz-map: confirmed quiz ${key} is not in courses.json`);
      }
    }
  }

  const confirmed: Array<Omit<PlanQuiz, "position">> = [];

  for (const qz of input.quizzes_all) {
    const quizRef = `quiz:${qz.id}`;
    const entry = quizMap.quizzes[String(qz.id)];
    if (!entry) {
      plan.skipped.push({
        legacyRef: quizRef,
        title: qz.title,
        status: "unmapped",
        reason: "not in quiz-map",
      });
      continue;
    }
    if (entry.status !== "confirmed") {
      plan.skipped.push({
        legacyRef: quizRef,
        title: qz.title,
        status: entry.status,
        reason: entry.reason ?? "",
      });
      continue;
    }

    const courseId = entry.course!;
    let lessonRef: string | null = null;
    if (entry.lesson != null) {
      if (lessonCourse.get(entry.lesson) === courseId) {
        lessonRef = `lesson:${entry.lesson}`;
      } else {
        plan.warnings.push(
          `${quizRef}: lesson:${entry.lesson} does not belong to course:${courseId} — linked to the course only`
        );
      }
    }

    confirmed.push({
      legacyRef: quizRef,
      courseRef: `course:${courseId}`,
      lessonRef,
      title: qz.title,
      descriptionMd: qz.description_md,
      passingPercentage: Math.min(100, Math.max(0, qz.passing_percentage)),
      retriesAllowed: qz.retries_allowed === null ? null : Math.max(0, qz.retries_allowed),
    });

    const seenSorts = new Map<number, number>();
    qz.questions.forEach((question, qi) => {
      const seen = (seenSorts.get(question.sort) ?? 0) + 1;
      seenSorts.set(question.sort, seen);
      const key = seen === 1 ? `${question.sort}` : `${question.sort}.${seen}`;
      const questionRef = `question:${qz.id}:${key}`;
      plan.questions.push({
        legacyRef: questionRef,
        quizRef,
        questionMd: question.question_md,
        answerType: question.answer_type,
        points: Math.max(0, question.points),
        position: qi,
      });
      question.answers.forEach((a, ai) => {
        plan.answers.push({
          legacyRef: `answer:${qz.id}:${key}:${ai}`,
          questionRef,
          text: a.text,
          isCorrect: a.correct === true,
          position: ai,
        });
      });
    });
  }

  const byCourse = new Map<string, Array<Omit<PlanQuiz, "position">>>();
  for (const qz of confirmed) {
    const list = byCourse.get(qz.courseRef) ?? [];
    list.push(qz);
    byCourse.set(qz.courseRef, list);
  }
  for (const list of byCourse.values()) {
    list
      .sort((a, b) => {
        const byLetter = moduleLetter(a.title).localeCompare(moduleLetter(b.title));
        if (byLetter !== 0) return byLetter;
        return Number(a.legacyRef.slice(5)) - Number(b.legacyRef.slice(5));
      })
      .forEach((qz, position) => plan.quizzes.push({ ...qz, position }));
  }

  return plan;
}
