import { describe, expect, it } from "vitest";
import {
  courseStatesFor,
  planCohortCourses,
  planOverride,
} from "@/server/offline-courses/logic";

/**
 * cursos-offline (T4) — The write decisions behind the staff screens, kept
 * pure so every branch is tested without a database:
 *
 * - `planCohortCourses`: the cohort multi-check REPLACES the set — what to
 *   insert and what to delete, never touching what stays.
 * - `planOverride`: one (enrollment, course) row at most; grant/revoke upsert
 *   it and "clear" deletes it.
 * - `courseStatesFor`: the per-student panel, one state per library course.
 */

const sorted = (ids: string[]) => [...ids].sort();

describe("planCohortCourses", () => {
  it("inserts the new ones and deletes the removed ones", () => {
    const plan = planCohortCourses(["a", "b"], ["b", "c"]);
    expect(plan.toInsert).toEqual(["c"]);
    expect(plan.toDelete).toEqual(["a"]);
  });

  it("an unchanged set produces no writes", () => {
    expect(planCohortCourses(["a", "b"], ["b", "a"])).toEqual({ toInsert: [], toDelete: [] });
  });

  it("an empty desired set removes every course", () => {
    expect(sorted(planCohortCourses(["a", "b"], []).toDelete)).toEqual(["a", "b"]);
  });

  it("duplicate ids in the request count once", () => {
    expect(planCohortCourses([], ["a", "a", "b"]).toInsert).toEqual(["a", "b"]);
  });
});

describe("planOverride", () => {
  it("grant with no row inserts a grant", () => {
    expect(planOverride(null, "grant")).toEqual({ kind: "insert", mode: "grant" });
  });

  it("revoke over an existing grant updates the same row", () => {
    expect(planOverride({ id: "x", mode: "grant" }, "revoke")).toEqual({
      kind: "update",
      id: "x",
      mode: "revoke",
    });
  });

  it("repeating the same mode is a no-op (idempotent)", () => {
    expect(planOverride({ id: "x", mode: "revoke" }, "revoke")).toEqual({ kind: "none" });
  });

  it("clear deletes the row", () => {
    expect(planOverride({ id: "x", mode: "grant" }, "clear")).toEqual({ kind: "delete", id: "x" });
  });

  it("clear with no row is a no-op", () => {
    expect(planOverride(null, "clear")).toEqual({ kind: "none" });
  });
});

describe("courseStatesFor", () => {
  const courses = [
    { id: "a", title: "A" },
    { id: "b", title: "B" },
    { id: "c", title: "C" },
    { id: "d", title: "D" },
  ];

  it("labels every library course, keeping the library order", () => {
    const states = courseStatesFor(courses, {
      cohortCourseIds: ["a", "b"],
      overrides: [
        { courseId: "b", mode: "revoke" },
        { courseId: "c", mode: "grant" },
      ],
    });
    expect(states).toEqual([
      { courseId: "a", title: "A", state: "inherited", cohortHas: true, override: null },
      { courseId: "b", title: "B", state: "revoked", cohortHas: true, override: "revoke" },
      { courseId: "c", title: "C", state: "granted", cohortHas: false, override: "grant" },
      { courseId: "d", title: "D", state: "none", cohortHas: false, override: null },
    ]);
  });

  it("a revoke on a course the cohort lacks reads as no access, with its override visible", () => {
    const [state] = courseStatesFor([{ id: "a", title: "A" }], {
      cohortCourseIds: [],
      overrides: [{ courseId: "a", mode: "revoke" }],
    });
    expect(state?.state).toBe("none");
    expect(state?.override).toBe("revoke");
  });
});
