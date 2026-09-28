import { describe, expect, it } from "vitest";
import {
  buildAnswersGiven,
  pickAttemptEnrollment,
  quizStatus,
  thumbnailAssetId,
  toStudentQuestions,
  topicNeighbors,
} from "@/server/offline-courses/portal-logic";

/**
 * cursos-offline (T5) — The pure decisions behind the student portal: which
 * enrollment an attempt is recorded against, what the answers snapshot
 * stores, and the quiz shape a student receives (never `isCorrect`).
 */

describe("pickAttemptEnrollment", () => {
  const d = (s: string) => new Date(s);

  it("picks the earliest-created enrollment that grants the course", () => {
    expect(
      pickAttemptEnrollment(
        [
          { id: "enr_b", createdAt: d("2026-03-01"), courseIds: ["c1"] },
          { id: "enr_a", createdAt: d("2026-01-01"), courseIds: ["c1", "c2"] },
          { id: "enr_c", createdAt: d("2025-01-01"), courseIds: ["c2"] },
        ],
        "c1"
      )
    ).toBe("enr_a");
  });

  it("ignores an older enrollment that does not grant the course", () => {
    expect(
      pickAttemptEnrollment(
        [
          { id: "enr_old", createdAt: d("2024-01-01"), courseIds: [] },
          { id: "enr_new", createdAt: d("2026-01-01"), courseIds: ["c1"] },
        ],
        "c1"
      )
    ).toBe("enr_new");
  });

  it("breaks a tie on the creation date by id, so the choice is stable", () => {
    const same = d("2026-01-01");
    expect(
      pickAttemptEnrollment(
        [
          { id: "enr_z", createdAt: same, courseIds: ["c1"] },
          { id: "enr_m", createdAt: same, courseIds: ["c1"] },
        ],
        "c1"
      )
    ).toBe("enr_m");
  });

  it("returns null when no enrollment grants the course", () => {
    expect(
      pickAttemptEnrollment([{ id: "enr_a", createdAt: d("2026-01-01"), courseIds: ["c2"] }], "c1")
    ).toBeNull();
    expect(pickAttemptEnrollment([], "c1")).toBeNull();
  });
});

describe("buildAnswersGiven", () => {
  const questions = [
    {
      id: "q1",
      questionMd: "¿Qué es un muro?",
      answers: [
        { id: "a1", text: "Un elemento vertical" },
        { id: "a2", text: "Un piso" },
      ],
    },
    {
      id: "q2",
      questionMd: "Elegí las vistas",
      answers: [
        { id: "b1", text: "Planta" },
        { id: "b2", text: "Corte" },
        { id: "b3", text: "Tabla" },
      ],
    },
  ];

  it("stores every question in quiz order with the chosen ids and texts", () => {
    expect(buildAnswersGiven(questions, { q2: ["b2", "b1"], q1: ["a1"] })).toEqual([
      {
        questionId: "q1",
        questionText: "¿Qué es un muro?",
        answerIds: ["a1"],
        answerTexts: ["Un elemento vertical"],
      },
      {
        questionId: "q2",
        questionText: "Elegí las vistas",
        // Answer order, not click order: the snapshot reads like the quiz.
        answerIds: ["b1", "b2"],
        answerTexts: ["Planta", "Corte"],
      },
    ]);
  });

  it("keeps an unanswered question with empty lists", () => {
    const [, q2] = buildAnswersGiven(questions, { q1: ["a2"] });
    expect(q2).toEqual({
      questionId: "q2",
      questionText: "Elegí las vistas",
      answerIds: [],
      answerTexts: [],
    });
  });

  it("drops unknown ids, answers of another question and duplicates", () => {
    const [q1] = buildAnswersGiven(questions, { q1: ["a1", "a1", "b1", "nope"] });
    expect(q1?.answerIds).toEqual(["a1"]);
    expect(q1?.answerTexts).toEqual(["Un elemento vertical"]);
  });

  it("ignores ids of questions that are not in the quiz", () => {
    expect(buildAnswersGiven(questions, { other: ["a1"] }).map((q) => q.questionId)).toEqual([
      "q1",
      "q2",
    ]);
  });
});

describe("toStudentQuestions", () => {
  it("never carries isCorrect, even when the input rows have it", () => {
    const rows = [
      {
        id: "q1",
        questionMd: "Pregunta",
        answerType: "single" as const,
        points: 2,
        answers: [
          { id: "a1", text: "Sí", isCorrect: true },
          { id: "a2", text: "No", isCorrect: false },
        ],
      },
    ];
    const out = toStudentQuestions(rows);

    expect(out).toEqual([
      {
        id: "q1",
        questionMd: "Pregunta",
        answerType: "single",
        answers: [
          { id: "a1", text: "Sí" },
          { id: "a2", text: "No" },
        ],
      },
    ]);
    expect(JSON.stringify(out)).not.toContain("isCorrect");
    expect(JSON.stringify(out)).not.toContain("true");
  });
});

describe("quizStatus", () => {
  it("passed wins over the remaining attempts", () => {
    expect(quizStatus(true, 0)).toBe("aprobado");
    expect(quizStatus(true, null)).toBe("aprobado");
  });

  it("not passed with attempts left (or unlimited) is available", () => {
    expect(quizStatus(false, 2)).toBe("disponible");
    expect(quizStatus(false, null)).toBe("disponible");
  });

  it("not passed and no attempts left is exhausted", () => {
    expect(quizStatus(false, 0)).toBe("sin_intentos");
  });
});

describe("topicNeighbors", () => {
  const topics = [
    { id: "t1", title: "Uno" },
    { id: "t2", title: "Dos" },
    { id: "t3", title: "Tres" },
  ];

  it("returns the previous and next topic", () => {
    expect(topicNeighbors(topics, "t2")).toEqual({
      prev: { id: "t1", title: "Uno" },
      next: { id: "t3", title: "Tres" },
    });
  });

  it("has no previous at the start and no next at the end", () => {
    expect(topicNeighbors(topics, "t1").prev).toBeNull();
    expect(topicNeighbors(topics, "t3").next).toBeNull();
  });

  it("returns nulls for a topic that is not in the list", () => {
    expect(topicNeighbors(topics, "x")).toEqual({ prev: null, next: null });
  });
});

describe("thumbnailAssetId", () => {
  it("reads the asset id of a stored thumbnail", () => {
    expect(thumbnailAssetId("/api/media/mda_abc123")).toBe("mda_abc123");
  });

  it("refuses anything that is not our own media route", () => {
    expect(thumbnailAssetId(null)).toBeNull();
    expect(thumbnailAssetId("")).toBeNull();
    expect(thumbnailAssetId("https://old.example.com/wp-content/x.png")).toBeNull();
    expect(thumbnailAssetId("/api/media/../secrets")).toBeNull();
    expect(thumbnailAssetId("/api/media/a/b")).toBeNull();
    expect(thumbnailAssetId(`/api/media/${"x".repeat(65)}`)).toBeNull();
  });
});
