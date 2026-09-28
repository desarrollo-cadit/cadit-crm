import { describe, expect, it } from "vitest";
import {
  attemptsRemaining,
  canAttempt,
  gradeQuiz,
  validateSubmission,
  type GradableQuestion,
} from "@/server/offline-courses/logic";

/**
 * cursos-offline — Automatic grading and the retry limit.
 *
 * single → the chosen answer is the correct one; multiple → exact set match
 * (all-or-nothing). Score = correct points / total points × 100, 2 decimals.
 * Passed = score >= passing percentage. Max attempts = 1 + retries_allowed;
 * null = unlimited.
 */

const single = (id: string, correct: string, others: string[], points = 1): GradableQuestion => ({
  id,
  answerType: "single",
  points,
  answers: [
    { id: correct, isCorrect: true },
    ...others.map((o) => ({ id: o, isCorrect: false })),
  ],
});

const multiple = (
  id: string,
  correct: string[],
  others: string[],
  points = 1
): GradableQuestion => ({
  id,
  answerType: "multiple",
  points,
  answers: [
    ...correct.map((c) => ({ id: c, isCorrect: true })),
    ...others.map((o) => ({ id: o, isCorrect: false })),
  ],
});

describe("gradeQuiz — single choice", () => {
  const q = [single("q1", "a1", ["a2", "a3"])];

  it("the correct answer scores", () => {
    expect(gradeQuiz(q, { q1: ["a1"] }, 80)).toEqual({
      scorePercentage: 100,
      passed: true,
      correctQuestionIds: ["q1"],
    });
  });

  it("a wrong answer does not score", () => {
    expect(gradeQuiz(q, { q1: ["a2"] }, 80)).toEqual({
      scorePercentage: 0,
      passed: false,
      correctQuestionIds: [],
    });
  });

  it("choosing the correct one AND another is wrong (exactly one)", () => {
    expect(gradeQuiz(q, { q1: ["a1", "a2"] }, 80).correctQuestionIds).toEqual([]);
  });

  it("the same answer sent twice counts once", () => {
    expect(gradeQuiz(q, { q1: ["a1", "a1"] }, 80).correctQuestionIds).toEqual(["q1"]);
  });

  it("unanswered (missing key or empty list) is wrong", () => {
    expect(gradeQuiz(q, {}, 80).correctQuestionIds).toEqual([]);
    expect(gradeQuiz(q, { q1: [] }, 80).correctQuestionIds).toEqual([]);
  });

  it("an answer id from another question is wrong", () => {
    const two = [single("q1", "a1", ["a2"]), single("q2", "b1", ["b2"])];
    expect(gradeQuiz(two, { q1: ["b1"], q2: ["b1"] }, 50).correctQuestionIds).toEqual(["q2"]);
  });

  it("an unknown answer id is wrong", () => {
    expect(gradeQuiz(q, { q1: ["nope"] }, 80).correctQuestionIds).toEqual([]);
  });
});

describe("gradeQuiz — multiple choice", () => {
  const q = [multiple("q1", ["a1", "a2"], ["a3"])];

  it("exactly the correct set scores, in any order", () => {
    expect(gradeQuiz(q, { q1: ["a2", "a1"] }, 80).correctQuestionIds).toEqual(["q1"]);
  });

  it("a subset of the correct set is wrong (all-or-nothing)", () => {
    expect(gradeQuiz(q, { q1: ["a1"] }, 80).correctQuestionIds).toEqual([]);
  });

  it("the correct set plus an extra is wrong", () => {
    expect(gradeQuiz(q, { q1: ["a1", "a2", "a3"] }, 80).correctQuestionIds).toEqual([]);
  });

  it("the correct set plus an unknown id is wrong", () => {
    expect(gradeQuiz(q, { q1: ["a1", "a2", "zz"] }, 80).correctQuestionIds).toEqual([]);
  });

  it("unanswered is wrong", () => {
    expect(gradeQuiz(q, {}, 80).correctQuestionIds).toEqual([]);
  });

  it("a malformed question with no correct answer is never right, even left empty", () => {
    const broken = [multiple("q1", [], ["a1"])];
    expect(gradeQuiz(broken, { q1: [] }, 0).correctQuestionIds).toEqual([]);
  });
});

describe("gradeQuiz — score and pass", () => {
  it("weights by points and rounds to 2 decimals", () => {
    const q = [single("q1", "a", ["x"]), single("q2", "b", ["x"]), single("q3", "c", ["x"])];
    // 2 of 3 → 66.666… → 66.67
    expect(gradeQuiz(q, { q1: ["a"], q2: ["b"], q3: ["x"] }, 80).scorePercentage).toBe(66.67);
    // 1 of 3 → 33.33
    expect(gradeQuiz(q, { q1: ["a"] }, 80).scorePercentage).toBe(33.33);
  });

  it("points, not question count, decide the score", () => {
    const q = [single("q1", "a", ["x"], 3), single("q2", "b", ["x"], 1)];
    expect(gradeQuiz(q, { q1: ["a"] }, 80).scorePercentage).toBe(75);
  });

  it("passes exactly at the passing percentage", () => {
    const q = [1, 2, 3, 4, 5].map((n) => single(`q${n}`, `a${n}`, ["x"]));
    const given = { q1: ["a1"], q2: ["a2"], q3: ["a3"], q4: ["a4"], q5: ["x"] };
    expect(gradeQuiz(q, given, 80)).toMatchObject({ scorePercentage: 80, passed: true });
    expect(gradeQuiz(q, given, 81)).toMatchObject({ scorePercentage: 80, passed: false });
  });

  it("answers for questions that are not in the quiz are ignored", () => {
    const q = [single("q1", "a", ["x"])];
    expect(gradeQuiz(q, { q1: ["a"], ghost: ["a"] }, 80).correctQuestionIds).toEqual(["q1"]);
  });

  it("a quiz with no questions scores 0 and does not pass (never throws)", () => {
    expect(gradeQuiz([], {}, 0)).toEqual({
      scorePercentage: 0,
      passed: false,
      correctQuestionIds: [],
    });
  });

  it("a quiz whose questions are all worth 0 points scores 0 and does not pass", () => {
    const q = [single("q1", "a", ["x"], 0)];
    expect(gradeQuiz(q, { q1: ["a"] }, 0)).toMatchObject({ scorePercentage: 0, passed: false });
  });
});

describe("attemptsRemaining / canAttempt", () => {
  it("null retries = unlimited", () => {
    expect(attemptsRemaining(null, 0)).toBeNull();
    expect(attemptsRemaining(null, 500)).toBeNull();
    expect(canAttempt(null, 500)).toBe(true);
  });

  it("0 retries → exactly 1 attempt", () => {
    expect(attemptsRemaining(0, 0)).toBe(1);
    expect(canAttempt(0, 0)).toBe(true);
    expect(attemptsRemaining(0, 1)).toBe(0);
    expect(canAttempt(0, 1)).toBe(false);
  });

  it("3 retries → 4 attempts", () => {
    expect(attemptsRemaining(3, 0)).toBe(4);
    expect(attemptsRemaining(3, 3)).toBe(1);
    expect(canAttempt(3, 3)).toBe(true);
    expect(attemptsRemaining(3, 4)).toBe(0);
    expect(canAttempt(3, 4)).toBe(false);
  });

  it("never goes negative when attempts exceed the limit", () => {
    expect(attemptsRemaining(1, 9)).toBe(0);
    expect(canAttempt(1, 9)).toBe(false);
  });
});

describe("validateSubmission", () => {
  it("accepts a record of question id → answer ids", () => {
    const parsed = validateSubmission.safeParse({ answers: { q1: ["a1"], q2: ["a2", "a3"] } });
    expect(parsed.success).toBe(true);
  });

  it("accepts an unanswered question as an empty list", () => {
    expect(validateSubmission.safeParse({ answers: { q1: [] } }).success).toBe(true);
  });

  it("rejects a non-array value", () => {
    expect(validateSubmission.safeParse({ answers: { q1: "a1" } }).success).toBe(false);
  });

  it("rejects empty or oversized ids", () => {
    expect(validateSubmission.safeParse({ answers: { q1: [""] } }).success).toBe(false);
    expect(
      validateSubmission.safeParse({ answers: { q1: ["x".repeat(200)] } }).success
    ).toBe(false);
  });

  it("rejects too many answers for one question", () => {
    const many = Array.from({ length: 51 }, (_, i) => `a${i}`);
    expect(validateSubmission.safeParse({ answers: { q1: many } }).success).toBe(false);
  });

  it("rejects too many questions", () => {
    const answers = Object.fromEntries(
      Array.from({ length: 501 }, (_, i) => [`q${i}`, ["a"]])
    );
    expect(validateSubmission.safeParse({ answers }).success).toBe(false);
  });

  it("rejects a missing answers object", () => {
    expect(validateSubmission.safeParse({}).success).toBe(false);
  });
});
