import { describe, expect, it } from "vitest";
import {
  MAX_STORED_RANGES,
  VIDEO_COMPLETE_THRESHOLD,
  accumulateVideoProgress,
  courseCompletion,
  mergePlayedRanges,
  resolveVideoDuration,
  decideCompletion,
  decideVideoProgress,
  isVideoComplete,
  nextUnlockedTopicId,
  topicUnlocked,
  validateProgressReport,
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

/* ============================================================
 * T9 — What a progress report may change (monotonic, never un-completes)
 * ============================================================ */

describe("decideVideoProgress", () => {
  const now = new Date("2026-09-25T12:00:00Z");
  const done = new Date("2026-09-20T10:00:00Z");

  it("first report under the threshold: stores the ratio, not complete", () => {
    expect(decideVideoProgress(null, { watchedRatio: 0.5, complete: false }, now)).toEqual({
      watchedRatio: 0.5,
      completedAt: null,
      completionSource: null,
      becameComplete: false,
    });
  });

  it("reaching the threshold completes it from the video, now", () => {
    expect(decideVideoProgress(null, { watchedRatio: 0.93, complete: true }, now)).toEqual({
      watchedRatio: 0.93,
      completedAt: now,
      completionSource: "video",
      becameComplete: true,
    });
  });

  it("the stored ratio only goes up", () => {
    const existing = { watchedRatio: 0.7, completedAt: null, completionSource: null };
    expect(decideVideoProgress(existing, { watchedRatio: 0.2, complete: false }, now).watchedRatio).toBe(0.7);
  });

  it("the max of old and new counts toward completion", () => {
    const existing = { watchedRatio: 0.95, completedAt: null, completionSource: null };
    const r = decideVideoProgress(existing, { watchedRatio: 0.1, complete: false }, now);
    expect(r).toMatchObject({ completionSource: "video", becameComplete: true, completedAt: now });
  });

  it("never un-completes and keeps who completed it and when", () => {
    const existing = { watchedRatio: 0, completedAt: done, completionSource: "staff" as const };
    expect(decideVideoProgress(existing, { watchedRatio: 0.3, complete: false }, now)).toEqual({
      watchedRatio: 0.3,
      completedAt: done,
      completionSource: "staff",
      becameComplete: false,
    });
  });

  it("floors the ratio to the 4 decimals the column keeps (0.89996 is not 0.9)", () => {
    const r = decideVideoProgress(null, { watchedRatio: 0.89996, complete: false }, now);
    expect(r.watchedRatio).toBe(0.8999);
    expect(r.completedAt).toBeNull();
  });

  it("clamps a ratio out of [0, 1]", () => {
    expect(decideVideoProgress(null, { watchedRatio: 1.5, complete: true }, now).watchedRatio).toBe(1);
    expect(decideVideoProgress(null, { watchedRatio: -1, complete: false }, now).watchedRatio).toBe(0);
  });
});

/* ============================================================
 * T9b — Playback accumulates across sessions (union of ranges)
 * ============================================================ */

describe("mergePlayedRanges", () => {
  it("merges stored and incoming into sorted, disjoint ranges", () => {
    expect(
      mergePlayedRanges(
        [{ start: 0, end: 30 }],
        [
          { start: 60, end: 80 },
          { start: 20, end: 40 },
        ],
        100
      )
    ).toEqual([
      { start: 0, end: 40 },
      { start: 60, end: 80 },
    ]);
  });

  it("clamps a bogus huge range to the duration", () => {
    expect(mergePlayedRanges([], [{ start: -50, end: 1e9 }], 100)).toEqual([{ start: 0, end: 100 }]);
  });

  it("drops empty and fully out-of-video ranges", () => {
    expect(
      mergePlayedRanges(
        [{ start: 10, end: 10 }],
        [
          { start: 150, end: 200 },
          { start: 5, end: 6 },
        ],
        100
      )
    ).toEqual([{ start: 5, end: 6 }]);
  });

  it("does not depend on the order of the reports", () => {
    const a = [{ start: 0, end: 30 }, { start: 70, end: 90 }];
    const b = [{ start: 25, end: 50 }, { start: 95, end: 99 }];
    expect(mergePlayedRanges(a, b, 100)).toEqual(mergePlayedRanges(b, a, 100));
    expect(mergePlayedRanges([], [...b, ...a], 100)).toEqual(mergePlayedRanges(a, b, 100));
  });

  it(`caps the stored set at ${MAX_STORED_RANGES} ranges, dropping the shortest (never inventing coverage)`, () => {
    const many = Array.from({ length: MAX_STORED_RANGES + 50 }, (_, i) => ({
      start: i * 10,
      end: i * 10 + (i < 50 ? 1 : 5),
    }));
    const merged = mergePlayedRanges([], many, 100_000);
    expect(merged).toHaveLength(MAX_STORED_RANGES);
    expect(merged.every((r) => r.end - r.start === 5)).toBe(true);
    expect(merged.every((r, i) => i === 0 || merged[i - 1]!.end < r.start)).toBe(true);
  });
});

describe("resolveVideoDuration", () => {
  it("first report: takes the reported duration", () => {
    expect(resolveVideoDuration(null, 120)).toBe(120);
  });

  it("within 2s of the stored one: keeps the stored duration", () => {
    expect(resolveVideoDuration(120, 121.5)).toBe(120);
    expect(resolveVideoDuration(120, 118.5)).toBe(120);
  });

  it("differs by more than 2s: keeps the larger", () => {
    expect(resolveVideoDuration(120, 60)).toBe(120);
    expect(resolveVideoDuration(120, 300)).toBe(300);
  });
});

describe("accumulateVideoProgress", () => {
  const now = new Date("2026-09-25T12:00:00Z");
  const done = new Date("2026-09-20T10:00:00Z");
  const fresh = (ranges: Array<{ start: number; end: number }>, duration: number, ratio = 0) => ({
    watchedRatio: ratio,
    completedAt: null,
    completionSource: null,
    playedRanges: ranges,
    videoDuration: duration,
  });

  it("split viewing across two reports reaches completion (0–50%, then 50–100%)", () => {
    const first = accumulateVideoProgress(null, { playedRanges: [{ start: 0, end: 50 }], duration: 100 }, now);
    expect(first).toMatchObject({ watchedRatio: 0.5, completedAt: null, videoDuration: 100 });
    const second = accumulateVideoProgress(
      fresh(first.playedRanges, first.videoDuration, first.watchedRatio),
      { playedRanges: [{ start: 50, end: 100 }], duration: 100 },
      now
    );
    expect(second).toMatchObject({
      watchedRatio: 1,
      completedAt: now,
      completionSource: "video",
      becameComplete: true,
      playedRanges: [{ start: 0, end: 100 }],
    });
  });

  it("overlapping reports do not double count", () => {
    const r = accumulateVideoProgress(
      fresh([{ start: 0, end: 50 }], 100, 0.5),
      { playedRanges: [{ start: 0, end: 50 }, { start: 40, end: 60 }], duration: 100 },
      now
    );
    expect(r.watchedRatio).toBe(0.6);
    expect(r.completedAt).toBeNull();
  });

  it("a bogus huge range is clamped to the duration (ratio ≤ 1)", () => {
    const r = accumulateVideoProgress(null, { playedRanges: [{ start: 0, end: 86_400 }], duration: 100 }, now);
    expect(r.watchedRatio).toBe(1);
    expect(r.playedRanges).toEqual([{ start: 0, end: 100 }]);
  });

  it("never lowers the stored ratio (e.g. ranges from before T9b were not kept)", () => {
    const r = accumulateVideoProgress(
      fresh([], 100, 0.7),
      { playedRanges: [{ start: 0, end: 10 }], duration: 100 },
      now
    );
    expect(r.watchedRatio).toBe(0.7);
  });

  it("never un-completes", () => {
    const r = accumulateVideoProgress(
      { watchedRatio: 0, completedAt: done, completionSource: "staff", playedRanges: [], videoDuration: null },
      { playedRanges: [{ start: 0, end: 5 }], duration: 100 },
      now
    );
    expect(r).toMatchObject({ completedAt: done, completionSource: "staff", becameComplete: false });
  });

  it("a shorter reported duration cannot inflate the ratio", () => {
    const r = accumulateVideoProgress(
      fresh([{ start: 0, end: 50 }], 100, 0.5),
      { playedRanges: [{ start: 0, end: 50 }], duration: 50 },
      now
    );
    expect(r.videoDuration).toBe(100);
    expect(r.watchedRatio).toBe(0.5);
    expect(r.completedAt).toBeNull();
  });
});

describe("decideCompletion (topic without video, staff override)", () => {
  const now = new Date("2026-09-25T12:00:00Z");

  it("completes a topic that was not complete", () => {
    expect(decideCompletion(null, "no_video", now)).toEqual({ completedAt: now, completionSource: "no_video" });
    expect(
      decideCompletion({ watchedRatio: 0.4, completedAt: null, completionSource: null }, "staff", now)
    ).toEqual({ completedAt: now, completionSource: "staff" });
  });

  it("an already complete topic stays as it was (null = nothing to write)", () => {
    const existing = {
      watchedRatio: 1,
      completedAt: new Date("2026-09-01T00:00:00Z"),
      completionSource: "video" as const,
    };
    expect(decideCompletion(existing, "staff", now)).toBeNull();
  });
});

describe("nextUnlockedTopicId", () => {
  it("is the next topic in course order once the current one is complete", () => {
    expect(nextUnlockedTopicId(["a", "b", "c"], "a", true)).toBe("b");
  });

  it("is null while the current topic is not complete, or at the end", () => {
    expect(nextUnlockedTopicId(["a", "b"], "a", false)).toBeNull();
    expect(nextUnlockedTopicId(["a", "b"], "b", true)).toBeNull();
    expect(nextUnlockedTopicId(["a", "b"], "zz", true)).toBeNull();
  });
});

describe("validateProgressReport", () => {
  it("accepts played ranges with a duration", () => {
    const r = validateProgressReport.safeParse({ playedRanges: [{ start: 0, end: 10 }], duration: 20 });
    expect(r.success).toBe(true);
  });

  it("accepts the no-video completion", () => {
    expect(validateProgressReport.safeParse({ noVideo: true }).success).toBe(true);
  });

  it("rejects what should never reach the database", () => {
    const bad: unknown[] = [
      {},
      { noVideo: false },
      { noVideo: true, playedRanges: [], duration: 1 },
      { playedRanges: [], duration: -1 },
      { playedRanges: [], duration: 86_401 },
      { playedRanges: [{ start: -1, end: 2 }], duration: 10 },
      { playedRanges: [{ start: 5, end: 2 }], duration: 10 },
      { playedRanges: [{ start: "0", end: 2 }], duration: 10 },
      { playedRanges: Array.from({ length: 501 }, () => ({ start: 0, end: 1 })), duration: 10 },
      { playedRanges: "nope", duration: 10 },
    ];
    for (const body of bad) {
      expect(validateProgressReport.safeParse(body).success, JSON.stringify(body).slice(0, 80)).toBe(false);
    }
  });

  it("allows exactly 500 ranges", () => {
    const body = { playedRanges: Array.from({ length: 500 }, (_, i) => ({ start: i, end: i + 1 })), duration: 600 };
    expect(validateProgressReport.safeParse(body).success).toBe(true);
  });
});
