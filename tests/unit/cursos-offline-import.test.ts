import { describe, expect, it } from "vitest";
import { buildImportPlan, thumbnailBasename } from "@/server/offline-courses/import-plan";

/**
 * cursos-offline — The pure half of the LearnDash import.
 *
 * (courses.json, quiz-map.json) → a normalized plan of rows keyed by
 * `legacy_ref`. Only `confirmed` quizzes enter; `pending` waits for the owner
 * and `skip` never enters. The client content itself stays out of the repo,
 * so the fixture is a tiny inline invention.
 */

const q = (sort: number, correct: number, answerType = "single") => ({
  sort,
  question_md: `Pregunta ${sort}`,
  answer_type: answerType,
  points: 1,
  answers: [
    { text: "Verdadero", correct: correct === 0 },
    { text: "Falso", correct: correct === 1 },
  ],
});

function fixture() {
  return {
    courses: [
      {
        id: 10,
        title: "Revit Básico",
        slug: "revit-basico",
        status: "publish",
        description_md: "Intro",
        thumbnail: "https://old.example/wp-content/uploads/2025/04/Banner%20A.png",
        lessons: [
          {
            id: 11,
            title: "Módulo A",
            content_md: "a",
            menu_order: 5,
            topics: [
              {
                id: 12,
                title: "Tema 1",
                content_md: "t1",
                menu_order: 9,
                video_url: "https://vimeo.com/123456789",
                video_shown: "BEFORE",
              },
              { id: 13, title: "Tema 2", content_md: null, menu_order: 1 },
              {
                id: 15,
                title: "Tema 3",
                content_md: "t3",
                video_url: "https://player.vimeo.com/video/987654321?h=abc",
                video_shown: "after",
              },
              {
                id: 16,
                title: "Tema 4",
                content_md: "t4",
                video_url: "http://www.youtube.com/watch?v=x",
                video_shown: "sideways",
              },
            ],
            quizzes: [],
          },
          { id: 14, title: "Módulo B", content_md: "b", menu_order: 0, topics: [], quizzes: [] },
        ],
      },
      {
        id: 20,
        title: "Civil 3D",
        slug: "civil-3d",
        status: "draft",
        description_md: null,
        thumbnail: null,
        lessons: [{ id: 21, title: "Único", content_md: "", menu_order: 0, topics: [], quizzes: [] }],
      },
    ],
    quizzes_all: [
      {
        id: 101,
        title: "Cuestionario Módulo B",
        description_md: "desc",
        passing_percentage: "70",
        retries_allowed: "3",
        questions: [q(1, 0), q(2, 1, "multiple")],
      },
      {
        id: 100,
        title: "Cuestionario Módulo A",
        description_md: null,
        passing_percentage: null,
        retries_allowed: "",
        questions: [q(1, 1)],
      },
      {
        id: 102,
        title: "Pendiente",
        description_md: "",
        passing_percentage: "80",
        retries_allowed: null,
        questions: [q(1, 0)],
      },
      {
        id: 103,
        title: "Vacío",
        description_md: "",
        passing_percentage: "80",
        retries_allowed: null,
        questions: [],
      },
      {
        id: 104,
        title: "Lección ajena",
        description_md: "",
        passing_percentage: 90,
        retries_allowed: 0,
        questions: [q(3, 0), q(3, 1)],
      },
    ],
  };
}

function map() {
  return {
    _readme: "ignored",
    quizzes: {
      "100": { status: "confirmed", course: 10, lesson: 11 },
      "101": { status: "confirmed", course: 10, lesson: 14 },
      "102": { status: "pending", course: 10, lesson: null, reason: "ambiguous" },
      "103": { status: "skip", reason: "no questions" },
      "104": { status: "confirmed", course: 20, lesson: 11 },
    },
  };
}

describe("buildImportPlan", () => {
  it("imports only confirmed quizzes and lists pending/skip with their reason", () => {
    const plan = buildImportPlan(fixture(), map());
    expect(plan.quizzes.map((x) => x.legacyRef).sort()).toEqual([
      "quiz:100",
      "quiz:101",
      "quiz:104",
    ]);
    expect(plan.skipped).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ legacyRef: "quiz:102", status: "pending", reason: "ambiguous" }),
        expect.objectContaining({ legacyRef: "quiz:103", status: "skip", reason: "no questions" }),
      ])
    );
    expect(plan.questions.some((x) => x.quizRef === "quiz:102")).toBe(false);
  });

  it("keys every row by legacy_ref and takes positions from array order", () => {
    const plan = buildImportPlan(fixture(), map());
    expect(plan.courses.map((c) => c.legacyRef)).toEqual(["course:10", "course:20"]);
    expect(plan.lessons.map((l) => [l.legacyRef, l.courseRef, l.position])).toEqual([
      ["lesson:11", "course:10", 0],
      ["lesson:14", "course:10", 1],
      ["lesson:21", "course:20", 0],
    ]);
    expect(plan.topics.map((t) => [t.legacyRef, t.lessonRef, t.position, t.contentMd])).toEqual([
      ["topic:12", "lesson:11", 0, "t1"],
      ["topic:13", "lesson:11", 1, ""],
      ["topic:15", "lesson:11", 2, "t3"],
      ["topic:16", "lesson:11", 3, "t4"],
    ]);
    const q101 = plan.questions.filter((x) => x.quizRef === "quiz:101");
    expect(q101.map((x) => [x.legacyRef, x.position, x.answerType])).toEqual([
      ["question:101:1", 0, "single"],
      ["question:101:2", 1, "multiple"],
    ]);
    const a = plan.answers.filter((x) => x.questionRef === "question:101:2");
    expect(a.map((x) => [x.legacyRef, x.position, x.isCorrect])).toEqual([
      ["answer:101:2:0", 0, false],
      ["answer:101:2:1", 1, true],
    ]);
  });

  it("maps the course status and keeps only the thumbnail file name", () => {
    const plan = buildImportPlan(fixture(), map());
    expect(plan.courses[0]).toMatchObject({ status: "published", thumbnailFile: "Banner A.png" });
    expect(plan.courses[1]).toMatchObject({ status: "draft", thumbnailFile: null, descriptionMd: "" });
  });

  it("orders quizzes within a course by module letter", () => {
    const plan = buildImportPlan(fixture(), map());
    const inCourse = plan.quizzes.filter((x) => x.courseRef === "course:10");
    expect(inCourse.map((x) => [x.legacyRef, x.position])).toEqual([
      ["quiz:100", 0],
      ["quiz:101", 1],
    ]);
  });

  it("links a quiz to a lesson only when the lesson belongs to the mapped course", () => {
    const plan = buildImportPlan(fixture(), map());
    const byRef = new Map(plan.quizzes.map((x) => [x.legacyRef, x]));
    expect(byRef.get("quiz:100")?.lessonRef).toBe("lesson:11");
    expect(byRef.get("quiz:104")?.lessonRef).toBeNull();
    expect(plan.warnings.some((w) => w.includes("quiz:104") && w.includes("lesson:11"))).toBe(true);
  });

  it("parses the numeric fields tolerantly", () => {
    const plan = buildImportPlan(fixture(), map());
    const byRef = new Map(plan.quizzes.map((x) => [x.legacyRef, x]));
    expect(byRef.get("quiz:101")).toMatchObject({ passingPercentage: 70, retriesAllowed: 3 });
    expect(byRef.get("quiz:100")).toMatchObject({ passingPercentage: 80, retriesAllowed: null });
    expect(byRef.get("quiz:104")).toMatchObject({ passingPercentage: 90, retriesAllowed: 0 });
  });

  it("gives duplicated question sorts a stable, distinct legacy_ref", () => {
    const plan = buildImportPlan(fixture(), map());
    const refs = plan.questions.filter((x) => x.quizRef === "quiz:104").map((x) => x.legacyRef);
    expect(refs).toEqual(["question:104:3", "question:104:3.2"]);
    expect(new Set(plan.answers.map((x) => x.legacyRef)).size).toBe(plan.answers.length);
  });

  it("rejects a map entry that points at an unknown course", () => {
    const bad = map();
    bad.quizzes["100"] = { status: "confirmed", course: 999, lesson: null } as never;
    expect(() => buildImportPlan(fixture(), bad)).toThrow(/999/);
  });

  it("rejects a confirmed map entry whose quiz is not in the export", () => {
    const bad = map() as { quizzes: Record<string, unknown> };
    bad.quizzes["555"] = { status: "confirmed", course: 10, lesson: null };
    expect(() => buildImportPlan(fixture(), bad)).toThrow(/555/);
  });

  it("skips an exported quiz the map does not mention", () => {
    const partial = map() as { quizzes: Record<string, unknown> };
    delete partial.quizzes["104"];
    const plan = buildImportPlan(fixture(), partial);
    expect(plan.skipped).toEqual(
      expect.arrayContaining([expect.objectContaining({ legacyRef: "quiz:104", status: "unmapped" })])
    );
  });

  it("reads the Vimeo video of each topic and where it is shown", () => {
    const plan = buildImportPlan(fixture(), map());
    const byRef = new Map(plan.topics.map((t) => [t.legacyRef, t]));
    expect(byRef.get("topic:12")).toMatchObject({
      videoUrl: "https://vimeo.com/123456789",
      videoShown: "before",
    });
    expect(byRef.get("topic:13")).toMatchObject({ videoUrl: null, videoShown: "after" });
    expect(byRef.get("topic:15")).toMatchObject({
      videoUrl: "https://player.vimeo.com/video/987654321?h=abc",
      videoShown: "after",
    });
  });

  it("drops a video that is not an https Vimeo URL, with a warning", () => {
    const plan = buildImportPlan(fixture(), map());
    const t16 = plan.topics.find((t) => t.legacyRef === "topic:16");
    expect(t16).toMatchObject({ videoUrl: null, videoShown: "after" });
    expect(plan.warnings.some((w) => w.includes("topic:16") && w.includes("video"))).toBe(true);
    expect(plan.warnings.some((w) => w.includes("topic:12"))).toBe(false);
  });

  it("rejects look-alike hosts and plain http", () => {
    const f = fixture();
    const topics = f.courses[0]!.lessons[0]!.topics as Array<Record<string, unknown>>;
    topics[0]!.video_url = "https://vimeo.com.evil.example/1";
    topics[2]!.video_url = "http://vimeo.com/1";
    const plan = buildImportPlan(f, map());
    const byRef = new Map(plan.topics.map((t) => [t.legacyRef, t]));
    expect(byRef.get("topic:12")?.videoUrl).toBeNull();
    expect(byRef.get("topic:15")?.videoUrl).toBeNull();
  });
});

describe("thumbnailBasename", () => {
  it("keeps only the decoded file name", () => {
    expect(thumbnailBasename("https://old.example/a/b/Banner%20A.png?x=1#y")).toBe("Banner A.png");
  });

  it("an encoded path cannot climb out of the media folder", () => {
    expect(thumbnailBasename("https://old.example/up/..%2F..%2Fsecret.png")).toBe("secret.png");
    expect(thumbnailBasename("https://old.example/up/..%5C..%5Csecret.png")).toBe("secret.png");
    expect(thumbnailBasename("https://old.example/up/%2E%2E")).toBeNull();
  });

  it("nothing to name → null", () => {
    expect(thumbnailBasename(null)).toBeNull();
    expect(thumbnailBasename("https://old.example/")).toBeNull();
  });
});
