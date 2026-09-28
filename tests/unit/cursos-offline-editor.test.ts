import { describe, expect, it } from "vitest";
import {
  deleteGuard,
  normalizeVideoUrl,
  planAnswerSet,
  questionBodySchema,
  quizBodySchema,
  uniqueSlug,
  validateAnswerSet,
  validateReorder,
} from "@/server/offline-courses/editor-logic";

/**
 * cursos-offline T11 — The pure decisions behind editing the library from the
 * staff UI: ordering, answer sets, slugs, Vimeo URLs and when a delete must be
 * refused because a student already has history on that content.
 */

describe("validateReorder", () => {
  it("accepts exactly the current ids in any order", () => {
    expect(validateReorder(["a", "b", "c"], ["c", "a", "b"])).toBeNull();
    expect(validateReorder([], [])).toBeNull();
  });

  it("rejects a missing id", () => {
    expect(validateReorder(["a", "b", "c"], ["a", "b"])).toMatchObject({ status: 422, code: "invalid_order" });
  });

  it("rejects an id of another parent (or unknown)", () => {
    expect(validateReorder(["a", "b"], ["a", "zz"])).toMatchObject({ status: 422, code: "invalid_order" });
  });

  it("rejects duplicates even when the length matches", () => {
    expect(validateReorder(["a", "b"], ["a", "a"])).toMatchObject({ status: 422, code: "invalid_order" });
  });

  it("rejects extra ids", () => {
    expect(validateReorder(["a"], ["a", "b"])).toMatchObject({ status: 422 });
  });
});

describe("uniqueSlug", () => {
  it("derives the slug from the title (accents, spaces, symbols)", () => {
    expect(uniqueSlug("Revit Básico 2025!", [])).toBe("revit-basico-2025");
  });

  it("suffixes -2, -3… when taken", () => {
    expect(uniqueSlug("Revit", ["revit"])).toBe("revit-2");
    expect(uniqueSlug("Revit", ["revit", "revit-2", "revit-3"])).toBe("revit-4");
  });

  it("an empty title still produces a slug", () => {
    expect(uniqueSlug("¡¡!!", [])).toBe("curso");
  });
});

describe("validateAnswerSet", () => {
  const a = (text: string, isCorrect: boolean) => ({ text, isCorrect });

  it("needs at least two answers", () => {
    expect(validateAnswerSet("single", [a("Sí", true)])).toMatchObject({ status: 422, code: "invalid_answers" });
    expect(validateAnswerSet("multiple", [])).toMatchObject({ status: 422 });
  });

  it("single choice needs exactly one correct answer", () => {
    expect(validateAnswerSet("single", [a("Sí", true), a("No", false)])).toBeNull();
    expect(validateAnswerSet("single", [a("Sí", false), a("No", false)])).toMatchObject({ status: 422 });
    expect(validateAnswerSet("single", [a("Sí", true), a("No", true)])).toMatchObject({ status: 422 });
  });

  it("multiple choice needs at least one correct answer", () => {
    expect(validateAnswerSet("multiple", [a("A", true), a("B", true), a("C", false)])).toBeNull();
    expect(validateAnswerSet("multiple", [a("A", false), a("B", false)])).toMatchObject({ status: 422 });
  });
});

describe("planAnswerSet (answers are replaced as a set)", () => {
  it("keeps ids that come back, inserts the new ones, removes the missing ones, renumbers", () => {
    const plan = planAnswerSet(
      ["x", "y", "z"],
      [
        { id: "z", text: "Z!", isCorrect: true },
        { text: "Nueva", isCorrect: false },
        { id: "x", text: "X", isCorrect: false },
      ]
    );
    expect(plan).toEqual({
      ok: true,
      data: {
        update: [
          { id: "z", text: "Z!", isCorrect: true, position: 0 },
          { id: "x", text: "X", isCorrect: false, position: 2 },
        ],
        insert: [{ text: "Nueva", isCorrect: false, position: 1 }],
        remove: ["y"],
      },
    });
  });

  it("an id that is not one of this question's answers is refused", () => {
    expect(planAnswerSet(["x"], [{ id: "other", text: "t", isCorrect: true }])).toMatchObject({
      ok: false,
      status: 422,
      code: "invalid_answers",
    });
  });

  it("the same id twice is refused", () => {
    expect(
      planAnswerSet(
        ["x"],
        [
          { id: "x", text: "a", isCorrect: true },
          { id: "x", text: "b", isCorrect: false },
        ]
      )
    ).toMatchObject({ ok: false, status: 422 });
  });
});

describe("deleteGuard (history blocks deletion)", () => {
  const none = { attempts: 0, progress: 0 };

  it("without history everything can be deleted", () => {
    for (const kind of ["course", "lesson", "topic", "quiz"] as const) {
      expect(deleteGuard(kind, none)).toBeNull();
    }
  });

  it("a course with attempts or progress is blocked and the message offers draft", () => {
    const withAttempts = deleteGuard("course", { attempts: 1, progress: 0 });
    expect(withAttempts).toMatchObject({ status: 409, code: "has_history" });
    expect(withAttempts?.message).toMatch(/borrador/i);
    expect(deleteGuard("course", { attempts: 0, progress: 3 })).toMatchObject({ status: 409 });
  });

  it("lessons and topics are blocked by progress", () => {
    expect(deleteGuard("lesson", { attempts: 0, progress: 1 })).toMatchObject({ status: 409, code: "has_history" });
    expect(deleteGuard("topic", { attempts: 0, progress: 1 })).toMatchObject({ status: 409, code: "has_history" });
  });

  it("a quiz is blocked by attempts", () => {
    expect(deleteGuard("quiz", { attempts: 2, progress: 0 })).toMatchObject({ status: 409, code: "has_history" });
  });
});

describe("normalizeVideoUrl", () => {
  it("empty or null → no video", () => {
    expect(normalizeVideoUrl("")).toEqual({ ok: true, data: null });
    expect(normalizeVideoUrl("   ")).toEqual({ ok: true, data: null });
    expect(normalizeVideoUrl(null)).toEqual({ ok: true, data: null });
  });

  it("a Vimeo video URL is kept, trimmed", () => {
    expect(normalizeVideoUrl("  https://vimeo.com/1071179224  ")).toEqual({
      ok: true,
      data: "https://vimeo.com/1071179224",
    });
  });

  it("anything the player cannot embed is a 422 with a Spanish message", () => {
    for (const bad of ["https://youtube.com/watch?v=x", "http://vimeo.com/123", "https://vimeo.com/showcase/1", "hola"]) {
      const r = normalizeVideoUrl(bad);
      expect(r).toMatchObject({ ok: false, status: 422, code: "invalid_video_url" });
      if (!r.ok) expect(r.message).toMatch(/Vimeo/);
    }
  });
});

describe("body schemas", () => {
  it("quiz: passing percentage 0–100 and retries null or ≥ 0", () => {
    expect(quizBodySchema.safeParse({ title: "Q", passingPercentage: 101 }).success).toBe(false);
    expect(quizBodySchema.safeParse({ title: "Q", passingPercentage: -1 }).success).toBe(false);
    expect(quizBodySchema.safeParse({ title: "Q", retriesAllowed: -1 }).success).toBe(false);
    expect(quizBodySchema.safeParse({ title: "Q", retriesAllowed: null }).success).toBe(true);
    expect(quizBodySchema.safeParse({ title: "Q", passingPercentage: 0, retriesAllowed: 0 }).success).toBe(true);
  });

  it("question: points ≥ 0 and a bounded answer list", () => {
    const answers = [
      { text: "a", isCorrect: true },
      { text: "b", isCorrect: false },
    ];
    expect(questionBodySchema.safeParse({ questionMd: "¿?", answerType: "single", points: -1, answers }).success).toBe(
      false
    );
    expect(questionBodySchema.safeParse({ questionMd: "¿?", answerType: "single", points: 0, answers }).success).toBe(
      true
    );
    expect(questionBodySchema.safeParse({ questionMd: "¿?", answerType: "other", answers }).success).toBe(false);
  });
});
