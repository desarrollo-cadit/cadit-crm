import { describe, expect, it } from "vitest";
import {
  VIDEO_COMPLETE_THRESHOLD,
  courseCompletion,
  isVideoComplete,
  topicUnlocked,
} from "@/server/offline-courses/logic";

/**
 * cursos-offline — Progress rules (export v2, Vimeo videos).
 *
 *  - a video counts as watched from the REAL played ranges (merged, clamped),
 *    never from the `ended` event: seeking to the end is not watching;
 *  - topics open sequentially across the whole course;
 *  - a course is completed when every topic is complete AND every quiz passed.
 */

describe("isVideoComplete", () => {
  it("uses a 90% threshold", () => {
    expect(VIDEO_COMPLETE_THRESHOLD).toBe(0.9);
  });

  it("merges overlapping ranges instead of adding them twice", () => {
    const r = isVideoComplete(
      [
        { start: 0, end: 50 },
        { start: 40, end: 60 },
        { start: 10, end: 20 },
      ],
      100
    );
    expect(r.watchedRatio).toBeCloseTo(0.6);
    expect(r.complete).toBe(false);
  });

  it("merges touching ranges and unordered input", () => {
    const r = isVideoComplete(
      [
        { start: 50, end: 100 },
        { start: 0, end: 50 },
      ],
      100
    );
    expect(r).toEqual({ watchedRatio: 1, complete: true });
  });

  it("is complete exactly at the threshold", () => {
    expect(isVideoComplete([{ start: 0, end: 90 }], 100).complete).toBe(true);
    expect(isVideoComplete([{ start: 0, end: 89.9 }], 100).complete).toBe(false);
  });

  it("clamps ranges to [0, duration]", () => {
    const r = isVideoComplete(
      [
        { start: -10, end: 30 },
        { start: 80, end: 500 },
      ],
      100
    );
    expect(r.watchedRatio).toBeCloseTo(0.5);
  });

  it("ignores empty and inverted ranges", () => {
    const r = isVideoComplete(
      [
        { start: 30, end: 30 },
        { start: 60, end: 20 },
      ],
      100
    );
    expect(r).toEqual({ watchedRatio: 0, complete: false });
  });

  it("jumping to the end is not watching", () => {
    const r = isVideoComplete([{ start: 95, end: 100 }], 100);
    expect(r.complete).toBe(false);
  });

  it("duration <= 0 is ratio 0, never complete", () => {
    expect(isVideoComplete([{ start: 0, end: 10 }], 0)).toEqual({ watchedRatio: 0, complete: false });
    expect(isVideoComplete([{ start: 0, end: 10 }], -5)).toEqual({ watchedRatio: 0, complete: false });
  });

  it("no ranges → 0", () => {
    expect(isVideoComplete([], 100)).toEqual({ watchedRatio: 0, complete: false });
  });
});

describe("topicUnlocked", () => {
  const order = ["t1", "t2", "t3"];

  it("the first topic is always unlocked", () => {
    expect(topicUnlocked(order, [], "t1")).toBe(true);
  });

  it("topic k opens only when topic k-1 is complete", () => {
    expect(topicUnlocked(order, [], "t2")).toBe(false);
    expect(topicUnlocked(order, ["t1"], "t2")).toBe(true);
    expect(topicUnlocked(order, ["t1"], "t3")).toBe(false);
    expect(topicUnlocked(order, ["t1", "t2"], "t3")).toBe(true);
  });

  it("only the previous topic matters (a staff override further ahead opens its successor)", () => {
    expect(topicUnlocked(order, ["t2"], "t3")).toBe(true);
  });

  it("an unknown topic is locked", () => {
    expect(topicUnlocked(order, ["t1", "t2", "t3"], "zz")).toBe(false);
    expect(topicUnlocked([], [], "t1")).toBe(false);
  });
});

describe("courseCompletion", () => {
  it("completed = every topic complete AND every quiz passed", () => {
    expect(
      courseCompletion({
        topicIds: ["t1", "t2"],
        completedTopicIds: ["t1", "t2"],
        quizIds: ["q1", "q2"],
        passedQuizIds: ["q1"],
      })
    ).toEqual({ topicsDone: 2, topicsTotal: 2, quizzesPassed: 1, quizzesTotal: 2, completed: false });
    expect(
      courseCompletion({
        topicIds: ["t1", "t2"],
        completedTopicIds: ["t1", "t2"],
        quizIds: ["q1", "q2"],
        passedQuizIds: ["q2", "q1"],
      }).completed
    ).toBe(true);
  });

  it("topics missing → not completed even with every quiz passed", () => {
    expect(
      courseCompletion({
        topicIds: ["t1", "t2"],
        completedTopicIds: ["t1"],
        quizIds: ["q1"],
        passedQuizIds: ["q1"],
      }).completed
    ).toBe(false);
  });

  it("a course without quizzes needs only its topics", () => {
    expect(
      courseCompletion({ topicIds: ["t1"], completedTopicIds: ["t1"], quizIds: [], passedQuizIds: [] })
    ).toEqual({ topicsDone: 1, topicsTotal: 1, quizzesPassed: 0, quizzesTotal: 0, completed: true });
  });

  it("an empty course (no topics, no quizzes) is never completed", () => {
    expect(
      courseCompletion({ topicIds: [], completedTopicIds: [], quizIds: [], passedQuizIds: [] }).completed
    ).toBe(false);
  });

  it("ignores ids that do not belong to the course and counts duplicates once", () => {
    expect(
      courseCompletion({
        topicIds: ["t1"],
        completedTopicIds: ["t1", "t1", "other"],
        quizIds: ["q1"],
        passedQuizIds: ["q1", "q1", "qX"],
      })
    ).toEqual({ topicsDone: 1, topicsTotal: 1, quizzesPassed: 1, quizzesTotal: 1, completed: true });
  });
});
