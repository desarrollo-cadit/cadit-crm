import { describe, expect, it } from "vitest";
import {
  answerSetProblem,
  moveBy,
  moveItem,
  parseRetries,
  videoUrlState,
} from "@/lib/offline-course-editor";
import { validateAnswerSet } from "@/server/offline-courses/editor-logic";

/**
 * cursos-offline T11b — The pure half of the staff editor UI: the checks the
 * question form runs before calling the API (they must say exactly what the
 * server would say), reordering by drag or by keyboard, the inline Vimeo
 * validation and the retries field.
 */

const a = (...correct: boolean[]) => correct.map((isCorrect) => ({ isCorrect }));

describe("answerSetProblem (client mirror of the server rule)", () => {
  it("accepts a gradable set", () => {
    expect(answerSetProblem("single", a(true, false))).toBeNull();
    expect(answerSetProblem("multiple", a(true, true, false))).toBeNull();
    expect(answerSetProblem("multiple", a(false, true))).toBeNull();
  });

  it("needs at least two answers", () => {
    expect(answerSetProblem("single", a(true))).toMatch(/al menos 2 respuestas/);
    expect(answerSetProblem("multiple", [])).toMatch(/al menos 2 respuestas/);
  });

  it("single choice needs exactly one correct answer", () => {
    expect(answerSetProblem("single", a(false, false))).toMatch(/exactamente una/);
    expect(answerSetProblem("single", a(true, true))).toMatch(/exactamente una/);
  });

  it("multiple choice needs at least one correct answer", () => {
    expect(answerSetProblem("multiple", a(false, false))).toMatch(/al menos una respuesta correcta/);
  });

  it("says exactly what the server says (one rule, two places)", () => {
    const cases: Array<["single" | "multiple", Array<{ isCorrect: boolean }>]> = [
      ["single", a(true)],
      ["single", a(false, false)],
      ["single", a(true, true)],
      ["multiple", a(false, false)],
      ["multiple", a(true, false)],
    ];
    for (const [type, answers] of cases) {
      expect(answerSetProblem(type, answers)).toBe(validateAnswerSet(type, answers)?.message ?? null);
    }
  });
});

describe("moveItem", () => {
  it("moves an element to another index without mutating the input", () => {
    const list = ["a", "b", "c", "d"];
    expect(moveItem(list, 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveItem(list, 3, 0)).toEqual(["d", "a", "b", "c"]);
    expect(list).toEqual(["a", "b", "c", "d"]);
  });

  it("returns an unchanged copy for out-of-range or equal indexes", () => {
    const list = ["a", "b"];
    expect(moveItem(list, 1, 1)).toEqual(["a", "b"]);
    expect(moveItem(list, -1, 0)).toEqual(["a", "b"]);
    expect(moveItem(list, 0, 5)).toEqual(["a", "b"]);
    expect(moveItem(list, 0, 5)).not.toBe(list);
  });
});

describe("moveBy (keyboard reorder: subir / bajar)", () => {
  const ids = ["x", "y", "z"];

  it("moves one step up or down", () => {
    expect(moveBy(ids, "y", -1)).toEqual(["y", "x", "z"]);
    expect(moveBy(ids, "y", 1)).toEqual(["x", "z", "y"]);
  });

  it("returns null when it cannot move (edges, unknown id)", () => {
    expect(moveBy(ids, "x", -1)).toBeNull();
    expect(moveBy(ids, "z", 1)).toBeNull();
    expect(moveBy(ids, "nope", 1)).toBeNull();
  });
});

describe("videoUrlState (inline validation of the topic's Vimeo URL)", () => {
  it("empty means no video", () => {
    expect(videoUrlState("")).toEqual({ kind: "empty" });
    expect(videoUrlState("   ")).toEqual({ kind: "empty" });
  });

  it("a Vimeo video gives the page to check it", () => {
    expect(videoUrlState("https://vimeo.com/123456789")).toEqual({
      kind: "valid",
      pageUrl: "https://vimeo.com/123456789",
    });
    expect(videoUrlState(" https://player.vimeo.com/video/42?h=abc123 ")).toEqual({
      kind: "valid",
      pageUrl: "https://vimeo.com/42/abc123",
    });
  });

  it("anything else is invalid (same parser as the server and the player)", () => {
    expect(videoUrlState("https://youtube.com/watch?v=1").kind).toBe("invalid");
    expect(videoUrlState("http://vimeo.com/123").kind).toBe("invalid");
    expect(videoUrlState("vimeo").kind).toBe("invalid");
  });
});

describe("parseRetries", () => {
  it("unlimited is null", () => {
    expect(parseRetries(true, "")).toEqual({ ok: true, value: null });
    expect(parseRetries(true, "abc")).toEqual({ ok: true, value: null });
  });

  it("a whole number between 0 and 1000", () => {
    expect(parseRetries(false, "0")).toEqual({ ok: true, value: 0 });
    expect(parseRetries(false, " 3 ")).toEqual({ ok: true, value: 3 });
  });

  it("refuses anything else", () => {
    for (const raw of ["", "-1", "1.5", "1001", "dos"]) {
      expect(parseRetries(false, raw).ok).toBe(false);
    }
  });
});
