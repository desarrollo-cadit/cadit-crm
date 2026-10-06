import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  RECOGNITION_REASON_MAX,
  courseProgressState,
  nextUnlockedTopicId,
  planRecognition,
  topicUnlocked,
  validateRecognitionRequest,
  type CourseProgressInput,
  type RecognitionRef,
} from "@/server/offline-courses/logic";
import { deleteGuard } from "@/server/offline-courses/editor-logic";
import { quizStatus } from "@/server/offline-courses/portal-logic";

/**
 * cursos-offline — Recognizing what a student completed in the previous LMS.
 *
 * A recognition is its own record (course or lesson scope). It never creates
 * topic progress or quiz attempts: those keep meaning "what the student did
 * here". Every completion read derives from ONE helper, `courseProgressState`,
 * so the staff view, the student portal and the sequential gate cannot
 * disagree about what counts as done.
 */

// Course: lesson L1 (t1, t2) → lesson L2 (t3, t4); quizzes: q1 in L1, q2 in
// L2, q3 at course level (no lesson).
const base: CourseProgressInput = {
  topics: [
    { id: "t1", lessonId: "L1" },
    { id: "t2", lessonId: "L1" },
    { id: "t3", lessonId: "L2" },
    { id: "t4", lessonId: "L2" },
  ],
  quizzes: [
    { id: "q1", lessonId: "L1" },
    { id: "q2", lessonId: "L2" },
    { id: "q3", lessonId: null },
  ],
  completedTopicIds: [],
  passedQuizIds: [],
  recognitions: [],
};

const lesson = (lessonId: string, revokedAt: Date | null = null): RecognitionRef => ({ lessonId, revokedAt });
const course = (revokedAt: Date | null = null): RecognitionRef => ({ lessonId: null, revokedAt });

describe("courseProgressState — without recognitions it is the old rule", () => {
  it("counts only real progress and passed quizzes", () => {
    const s = courseProgressState({ ...base, completedTopicIds: ["t1"], passedQuizIds: ["q3"] });
    expect([...s.doneTopicIds]).toEqual(["t1"]);
    expect([...s.passedQuizIds]).toEqual(["q3"]);
    expect(s.recognizedTopicIds.size).toBe(0);
    expect(s.recognizedQuizIds.size).toBe(0);
    expect(s.courseRecognized).toBe(false);
    expect(s.completion).toEqual({
      topicsDone: 1,
      topicsTotal: 4,
      quizzesPassed: 1,
      quizzesTotal: 3,
      completed: false,
    });
    expect(s.orderedTopicIds).toEqual(["t1", "t2", "t3", "t4"]);
  });
});

describe("courseProgressState — lesson scope", () => {
  const s = courseProgressState({ ...base, recognitions: [lesson("L1")] });

  it("every topic of the lesson counts as complete, and only those", () => {
    expect([...s.doneTopicIds].sort()).toEqual(["t1", "t2"]);
    expect([...s.recognizedTopicIds].sort()).toEqual(["t1", "t2"]);
    expect([...s.recognizedLessonIds]).toEqual(["L1"]);
  });

  it("covers the quizzes of that lesson, not the course-level ones", () => {
    expect([...s.passedQuizIds]).toEqual(["q1"]);
    expect([...s.recognizedQuizIds]).toEqual(["q1"]);
    expect(s.passedQuizIds.has("q3")).toBe(false);
  });

  it("the course is not complete with one lesson recognized", () => {
    expect(s.completion).toMatchObject({ topicsDone: 2, quizzesPassed: 1, completed: false });
    expect(s.courseRecognized).toBe(false);
  });

  it("recognizing every lesson still leaves a course-level quiz pending", () => {
    const all = courseProgressState({ ...base, recognitions: [lesson("L1"), lesson("L2")] });
    expect(all.completion).toMatchObject({ topicsDone: 4, quizzesPassed: 2, quizzesTotal: 3, completed: false });
  });
});

describe("courseProgressState — course scope", () => {
  const s = courseProgressState({ ...base, recognitions: [course()] });

  it("covers every topic and every quiz, course-level quizzes included", () => {
    expect(s.doneTopicIds.size).toBe(4);
    expect([...s.passedQuizIds].sort()).toEqual(["q1", "q2", "q3"]);
    expect(s.courseRecognized).toBe(true);
    expect([...s.recognizedLessonIds].sort()).toEqual(["L1", "L2"]);
    expect(s.completion.completed).toBe(true);
  });

  it("an empty course is never completed, recognized or not", () => {
    const empty = courseProgressState({
      topics: [],
      quizzes: [],
      completedTopicIds: [],
      passedQuizIds: [],
      recognitions: [course()],
    });
    expect(empty.completion.completed).toBe(false);
  });
});

describe("courseProgressState — what is real stays real", () => {
  it("'recognized' marks only what counts BECAUSE of the recognition", () => {
    const s = courseProgressState({
      ...base,
      completedTopicIds: ["t1"],
      passedQuizIds: ["q1"],
      recognitions: [lesson("L1")],
    });
    expect([...s.doneTopicIds].sort()).toEqual(["t1", "t2"]);
    expect([...s.recognizedTopicIds]).toEqual(["t2"]);
    expect(s.recognizedQuizIds.size).toBe(0);
  });

  it("revoked recognitions are ignored", () => {
    const s = courseProgressState({
      ...base,
      completedTopicIds: ["t1"],
      recognitions: [course(new Date()), lesson("L2", new Date())],
    });
    expect([...s.doneTopicIds]).toEqual(["t1"]);
    expect(s.passedQuizIds.size).toBe(0);
    expect(s.courseRecognized).toBe(false);
    expect(s.recognizedLessonIds.size).toBe(0);
  });

  it("a recognition of a lesson outside the course covers nothing", () => {
    const s = courseProgressState({ ...base, recognitions: [lesson("OTHER")] });
    expect(s.doneTopicIds.size).toBe(0);
    expect(s.recognizedLessonIds.size).toBe(0);
  });
});

describe("sequential unlock over the derived state", () => {
  const s = courseProgressState({ ...base, recognitions: [lesson("L1")] });

  it("the student continues from the first lesson that is not recognized", () => {
    expect(topicUnlocked(s.orderedTopicIds, s.doneTopicIds, "t3")).toBe(true);
    expect(topicUnlocked(s.orderedTopicIds, s.doneTopicIds, "t4")).toBe(false);
  });

  it("recognized topics stay open for review", () => {
    expect(topicUnlocked(s.orderedTopicIds, s.doneTopicIds, "t1")).toBe(true);
    expect(topicUnlocked(s.orderedTopicIds, s.doneTopicIds, "t2")).toBe(true);
  });

  it("a recognized topic opens its successor", () => {
    expect(nextUnlockedTopicId(s.orderedTopicIds, "t2", s.doneTopicIds.has("t2"))).toBe("t3");
  });

  it("a recognized second lesson does not open itself past a pending first one", () => {
    const later = courseProgressState({ ...base, recognitions: [lesson("L2")] });
    expect(topicUnlocked(later.orderedTopicIds, later.doneTopicIds, "t2")).toBe(false);
    // ...but its own topics are open: they count as done (review).
    expect(topicUnlocked(later.orderedTopicIds, later.doneTopicIds, "t3")).toBe(true);
  });
});

describe("quizStatus with a recognition", () => {
  it("a real pass wins; otherwise a covered quiz reads 'reconocido'", () => {
    expect(quizStatus(true, 0, true)).toBe("aprobado");
    expect(quizStatus(false, 0, true)).toBe("reconocido");
    expect(quizStatus(false, 1, true)).toBe("reconocido");
    expect(quizStatus(false, 0, false)).toBe("sin_intentos");
    expect(quizStatus(false, null)).toBe("disponible");
  });
});

describe("validateRecognitionRequest", () => {
  it("accepts a whole course and a set of lessons, trimming the reason", () => {
    const c = validateRecognitionRequest.safeParse({
      scope: "course",
      courseId: "ocrs_1",
      reason: "  Completado en la academia anterior  ",
    });
    expect(c.success && c.data.reason).toBe("Completado en la academia anterior");
    const l = validateRecognitionRequest.safeParse({
      scope: "lessons",
      courseId: "ocrs_1",
      lessonIds: ["oles_1"],
      reason: "Migración",
    });
    expect(l.success).toBe(true);
  });

  it("the reason is required and bounded", () => {
    for (const reason of ["", "   ", "x".repeat(RECOGNITION_REASON_MAX + 1)]) {
      expect(validateRecognitionRequest.safeParse({ scope: "course", courseId: "c", reason }).success).toBe(false);
    }
    expect(validateRecognitionRequest.safeParse({ scope: "course", courseId: "c" }).success).toBe(false);
    expect(
      validateRecognitionRequest.safeParse({ scope: "course", courseId: "c", reason: "x".repeat(RECOGNITION_REASON_MAX) })
        .success
    ).toBe(true);
  });

  it("lessons need at least one id; unknown shapes are rejected", () => {
    expect(
      validateRecognitionRequest.safeParse({ scope: "lessons", courseId: "c", lessonIds: [], reason: "r" }).success
    ).toBe(false);
    expect(validateRecognitionRequest.safeParse({ scope: "topic", courseId: "c", reason: "r" }).success).toBe(false);
    expect(
      validateRecognitionRequest.safeParse({ scope: "course", courseId: "c", reason: "r", lessonIds: ["x"] }).success
    ).toBe(false);
  });
});

describe("planRecognition (the write decision)", () => {
  const lessons = ["L1", "L2"];

  it("a course recognition inserts one course-scope row", () => {
    expect(planRecognition({ scope: "course" }, lessons, [])).toEqual({ ok: true, lessonIds: [null] });
  });

  it("is idempotent: an active course recognition means nothing to write", () => {
    expect(planRecognition({ scope: "course" }, lessons, [{ lessonId: null }])).toEqual({ ok: true, lessonIds: [] });
    expect(planRecognition({ scope: "lessons", lessonIds: ["L1"] }, lessons, [{ lessonId: null }])).toEqual({
      ok: true,
      lessonIds: [],
    });
  });

  it("only the lessons not yet recognized are inserted, without duplicates", () => {
    expect(
      planRecognition({ scope: "lessons", lessonIds: ["L1", "L2", "L2"] }, lessons, [{ lessonId: "L1" }])
    ).toEqual({ ok: true, lessonIds: ["L2"] });
  });

  it("a lesson of another course is a 422, and nothing is written", () => {
    const r = planRecognition({ scope: "lessons", lessonIds: ["L1", "FOREIGN"] }, lessons, []);
    expect(r).toMatchObject({ ok: false, status: 422, code: "lesson_not_in_course" });
  });
});

describe("deleteGuard counts recognitions as history", () => {
  const none = { attempts: 0, progress: 0 };
  it("a course or lesson with recognitions cannot be deleted", () => {
    expect(deleteGuard("course", { ...none, recognitions: 1 })).toMatchObject({ status: 409, code: "has_history" });
    expect(deleteGuard("lesson", { ...none, recognitions: 2 })).toMatchObject({ status: 409, code: "has_history" });
    expect(deleteGuard("topic", { ...none, recognitions: 2 })).toBeNull();
  });
});

/* ============================================================
 * Structural guards
 * ============================================================ */

const read = (...parts: string[]) =>
  readFileSync(path.join(process.cwd(), ...parts), "utf8").replace(/\r\n/g, "\n");
const sinComentarios = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");

describe("recognition module — it never fabricates progress", () => {
  const codigo = sinComentarios(read("src", "server", "offline-courses", "recognition.ts"));

  it("writes only offline_recognition: no topic progress, no quiz attempts", () => {
    expect(codigo).not.toMatch(/offlineTopicProgress/);
    expect(codigo).not.toMatch(/offlineQuizAttempt/);
    for (const m of codigo.matchAll(/\.(insert|update|delete)\((\w+)\)/g)) {
      expect(m[2], `${m[1]} on ${m[2]}`).toBe("offlineRecognition");
    }
  });

  it("revoking is an update of revoked_at, never a delete", () => {
    expect(codigo).not.toContain(".delete(");
    expect(codigo).toContain("revokedAt");
  });

  it("every filtered query declares its organization and nothing answers 403", () => {
    const wheres = (codigo.match(/\.where\(/g) ?? []).length;
    expect(wheres).toBeGreaterThan(0);
    expect(wheres).toBe((codigo.match(/scoped\(/g) ?? []).length);
    expect(codigo).not.toMatch(/\b403\b/);
  });

  it("checks everything before writing: the insert tolerates a concurrent duplicate", () => {
    expect(codigo).toContain("onConflictDoNothing(");
  });
});

describe("the student never receives the reason or the author", () => {
  it("student.ts and the shared outline never read reason or recognized_by", () => {
    for (const file of ["student.ts", "outline.ts"]) {
      const codigo = sinComentarios(read("src", "server", "offline-courses", file));
      expect(codigo, file).not.toMatch(/\breason\b/);
      expect(codigo, file).not.toMatch(/recognizedBy|recognized_by|revokedBy/);
    }
  });

  it("the student DTOs carry the 'recognized' flag", () => {
    const codigo = sinComentarios(read("src", "server", "offline-courses", "student.ts"));
    expect(codigo).toContain("recognized:");
  });
});

describe("one derivation for every completion read", () => {
  it("the shared read feeds courseProgressState", () => {
    const codigo = sinComentarios(read("src", "server", "offline-courses", "outline.ts"));
    expect(codigo).toContain("courseProgressState(");
  });

  it("student.ts and progress.ts compute completion only through the shared state", () => {
    for (const file of ["student.ts", "progress.ts"]) {
      const codigo = sinComentarios(read("src", "server", "offline-courses", file));
      expect(codigo, `${file} does not use the shared read`).toContain("contactCourseProgress");
    }
    for (const file of ["student.ts", "progress.ts"]) {
      const codigo = sinComentarios(read("src", "server", "offline-courses", file));
      expect(codigo, `${file} calls courseCompletion directly`).not.toContain("courseCompletion(");
      expect(codigo, `${file} reads completedIds directly`).not.toContain("completedIds(");
      expect(codigo, `${file} reads passed quizzes directly`).not.toContain("passedQuizIdsFor(");
    }
  });
});
