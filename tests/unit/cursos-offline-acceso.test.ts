import { describe, expect, it } from "vitest";
import {
  accessState,
  resolveEffectiveAccess,
  studentCourseIds,
} from "@/server/offline-courses/logic";

/**
 * cursos-offline — Who reads which library course.
 *
 * The rule, from the feature document:
 *   effective(enrollment, course) = (cohort assigned AND NOT revoke) OR grant
 * and a student's courses are the UNION over their enrollments.
 */

const sorted = (ids: string[]) => [...ids].sort();

describe("resolveEffectiveAccess", () => {
  it("inherits every course of the cohort when there are no overrides", () => {
    expect(
      sorted(resolveEffectiveAccess({ cohortCourseIds: ["a", "b"], overrides: [] }))
    ).toEqual(["a", "b"]);
  });

  it("a revoke removes an inherited course", () => {
    expect(
      resolveEffectiveAccess({
        cohortCourseIds: ["a", "b"],
        overrides: [{ courseId: "a", mode: "revoke" }],
      })
    ).toEqual(["b"]);
  });

  it("a grant adds a course the cohort does not have", () => {
    expect(
      sorted(
        resolveEffectiveAccess({
          cohortCourseIds: ["a"],
          overrides: [{ courseId: "z", mode: "grant" }],
        })
      )
    ).toEqual(["a", "z"]);
  });

  it("a grant on a course the cohort already has does not duplicate it", () => {
    expect(
      resolveEffectiveAccess({
        cohortCourseIds: ["a"],
        overrides: [{ courseId: "a", mode: "grant" }],
      })
    ).toEqual(["a"]);
  });

  it("a revoke on a course the cohort does not have changes nothing", () => {
    expect(
      resolveEffectiveAccess({
        cohortCourseIds: ["a"],
        overrides: [{ courseId: "z", mode: "revoke" }],
      })
    ).toEqual(["a"]);
  });

  it("grant wins over revoke on the same course (the rule is an OR)", () => {
    expect(
      resolveEffectiveAccess({
        cohortCourseIds: ["a"],
        overrides: [
          { courseId: "a", mode: "revoke" },
          { courseId: "a", mode: "grant" },
        ],
      })
    ).toEqual(["a"]);
  });

  it("no cohort courses and no overrides → nothing", () => {
    expect(resolveEffectiveAccess({ cohortCourseIds: [], overrides: [] })).toEqual([]);
  });

  it("duplicated cohort ids come out once", () => {
    expect(
      resolveEffectiveAccess({ cohortCourseIds: ["a", "a"], overrides: [] })
    ).toEqual(["a"]);
  });
});

describe("accessState", () => {
  const cohortCourseIds = ["a", "b"];

  it("inherited: the cohort has it and there is no override", () => {
    expect(accessState("a", { cohortCourseIds, overrides: [] })).toBe("inherited");
  });

  it("revoked: the cohort has it and the enrollment revokes it", () => {
    expect(
      accessState("a", { cohortCourseIds, overrides: [{ courseId: "a", mode: "revoke" }] })
    ).toBe("revoked");
  });

  it("granted: individual grant on a course the cohort does not have", () => {
    expect(
      accessState("z", { cohortCourseIds, overrides: [{ courseId: "z", mode: "grant" }] })
    ).toBe("granted");
  });

  it("granted: individual grant on a course the cohort already has", () => {
    expect(
      accessState("a", { cohortCourseIds, overrides: [{ courseId: "a", mode: "grant" }] })
    ).toBe("granted");
  });

  it("none: the cohort does not have it and there is no override", () => {
    expect(accessState("z", { cohortCourseIds, overrides: [] })).toBe("none");
  });

  it("none: a revoke on a course the cohort does not have", () => {
    expect(
      accessState("z", { cohortCourseIds, overrides: [{ courseId: "z", mode: "revoke" }] })
    ).toBe("none");
  });

  it("an override on ANOTHER course does not affect this one", () => {
    expect(
      accessState("a", { cohortCourseIds, overrides: [{ courseId: "b", mode: "revoke" }] })
    ).toBe("inherited");
  });

  it("agrees with resolveEffectiveAccess on every state", () => {
    const input = {
      cohortCourseIds: ["a", "b"],
      overrides: [
        { courseId: "a", mode: "revoke" as const },
        { courseId: "z", mode: "grant" as const },
        { courseId: "y", mode: "revoke" as const },
      ],
    };
    const effective = new Set(resolveEffectiveAccess(input));
    for (const id of ["a", "b", "z", "y", "x"]) {
      const state = accessState(id, input);
      expect(effective.has(id), `${id} → ${state}`).toBe(
        state === "inherited" || state === "granted"
      );
    }
  });
});

describe("studentCourseIds", () => {
  it("is the union over the student's enrollments", () => {
    expect(
      sorted(
        studentCourseIds([
          { cohortCourseIds: ["a", "b"], overrides: [{ courseId: "b", mode: "revoke" }] },
          { cohortCourseIds: ["c"], overrides: [{ courseId: "d", mode: "grant" }] },
        ])
      )
    ).toEqual(["a", "c", "d"]);
  });

  it("a revoke in one enrollment does not hide a course another enrollment gives", () => {
    expect(
      studentCourseIds([
        { cohortCourseIds: ["a"], overrides: [{ courseId: "a", mode: "revoke" }] },
        { cohortCourseIds: ["a"], overrides: [] },
      ])
    ).toEqual(["a"]);
  });

  it("no enrollments → no courses", () => {
    expect(studentCourseIds([])).toEqual([]);
  });
});
