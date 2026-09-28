import path from "node:path";
import { z } from "zod";
import type {
  OfflineAnswerType,
  OfflineCourseStatus,
  OfflineVideoShown,
} from "@/lib/db/schema";
import { parseVimeoUrl } from "@/lib/vimeo";

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
 *  - lessons in a course and topics in a lesson are ordered by `orderedByMenu`
 *    (menu_order, or the export order reversed when LearnDash gave them all
 *    the same one). Positions are 0-based. Quizzes in a course are ordered by
 *    the module letter in their title ("Módulo A…D"), then by legacy id: the
 *    export lists them in no meaningful order.
 *  - LearnDash repeats `sort` inside a quiz (the 40-question ones); a repeated
 *    sort gets `.<n>` appended from its second occurrence so refs stay unique
 *    and stable across re-imports of the same file.
 *  - (export v2) a topic video is kept only when `parseVimeoUrl` (the rule
 *    the player and the progress writes use) names one embeddable video: a
 *    showcase, a user page, another host or plain http becomes NULL with a
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
  menu_order: intOr(null),
});

const lessonSchema = z.object({
  id: legacyId,
  title: text,
  content_md: text,
  menu_order: intOr(null),
  topics: z.array(topicSchema).default([]),
});

const courseSchema = z.object({
  id: legacyId,
  title: text,
  slug: text,
  /** v2 exports no status: absent = what the site showed, i.e. published. */
  status: z.string().nullish(),
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

/**
 * The file name the importer looks up inside `--media`. The basename is taken
 * AFTER decoding: `..%2F..%2Fsecret.png` decodes to a path, and joining that
 * to the media folder would read outside it. `win32.basename` splits on both
 * `/` and `\`, so the answer does not depend on where the script runs.
 */
export function thumbnailBasename(url: string | null | undefined): string | null {
  if (!url) return null;
  const last = url.split(/[?#]/)[0]!.split("/").pop() ?? "";
  if (!last) return null;
  let decoded = last;
  try {
    decoded = decodeURIComponent(last);
  } catch {
    // Malformed escape: keep the raw segment, it still goes through basename.
  }
  const name = path.win32.basename(decoded);
  return name && name !== "." && name !== ".." ? name : null;
}

/**
 * The URL when `parseVimeoUrl` accepts it; `null` otherwise (never guessed).
 * One rule on purpose: a URL the importer kept but the player cannot parse
 * would be a topic that "has a video" nobody can watch — locked forever.
 */
export function vimeoUrlOrNull(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  return value && parseVimeoUrl(value) ? value : null;
}

function videoShown(raw: string | null | undefined): OfflineVideoShown {
  return raw?.trim().toLowerCase() === "before" ? "before" : "after";
}

function moduleLetter(title: string): string {
  return /m[oó]dulo\s+([a-z])\b/i.exec(title)?.[1]?.toUpperCase() ?? "~";
}

/**
 * The order a list of lessons (or topics) is shown in.
 *  - menu_order values that differ → ascending (ties keep export order;
 *    an item without one goes last).
 *  - every item has the SAME menu_order → the export order REVERSED. WHY:
 *    LearnDash exported newest-first — in all five v2 courses menu_order is 0
 *    everywhere and the arrays end with the introduction (RB01, RA01,
 *    "Lección 1"; the MEP "Módulo común" comes after "Módulo continuo").
 *  - no menu_order at all → the export order, as given (no evidence either way).
 */
export function orderedByMenu<T extends { menu_order: number | null }>(items: T[]): T[] {
  const orders = items.map((i) => i.menu_order).filter((o): o is number => o !== null);
  if (orders.length === 0) return [...items];
  if (orders.length === items.length && orders.every((o) => o === orders[0])) return [...items].reverse();
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const ao = a.item.menu_order ?? Number.POSITIVE_INFINITY;
      const bo = b.item.menu_order ?? Number.POSITIVE_INFINITY;
      return ao === bo ? a.index - b.index : ao - bo;
    })
    .map((x) => x.item);
}

/** Only an explicit non-"publish" status (draft, private, pending…) keeps a course hidden. */
function courseStatus(raw: string | null | undefined): OfflineCourseStatus {
  const value = raw?.trim();
  return !value || value === "publish" ? "published" : "draft";
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
      status: courseStatus(c.status),
      thumbnailFile: thumbnailBasename(c.thumbnail),
    });
    orderedByMenu(c.lessons).forEach((l, li) => {
      lessonCourse.set(l.id, c.id);
      const lessonRef = `lesson:${l.id}`;
      plan.lessons.push({
        legacyRef: lessonRef,
        courseRef,
        title: l.title,
        contentMd: l.content_md,
        position: li,
      });
      orderedByMenu(l.topics).forEach((t, ti) => {
        const videoUrl = vimeoUrlOrNull(t.video_url);
        if (t.video_url?.trim() && !videoUrl) {
          plan.warnings.push(`topic:${t.id}: video "${t.video_url}" is not an embeddable Vimeo video URL — imported without video`);
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

/* ============================================================
 * T11 — Re-import policy: the staff UI owns the content
 * ============================================================ */

export type UpsertDecision =
  | { kind: "insert" }
  /** Already in the database; left exactly as it is (default mode). */
  | { kind: "kept" }
  | { kind: "noop" }
  | { kind: "update"; changed: string[] };

/**
 * What the importer does with one planned row, given the stored row with the
 * same `legacy_ref` (if any).
 *
 * Since T11 the content is edited from the panel, so by default an existing
 * row is KEPT: re-running the import must not undo what staff changed. Only
 * `--overwrite` brings back "the export wins", and then only the differing
 * fields are written. `undefined` in the incoming row = "leave as it is".
 */
export function decideUpsert(
  old: Record<string, unknown> | undefined,
  row: Record<string, unknown>,
  fields: string[],
  overwrite: boolean
): UpsertDecision {
  if (!old) return { kind: "insert" };
  if (!overwrite) return { kind: "kept" };
  const changed = fields.filter((f) => row[f] !== undefined && old[f] !== row[f]);
  return changed.length === 0 ? { kind: "noop" } : { kind: "update", changed };
}
