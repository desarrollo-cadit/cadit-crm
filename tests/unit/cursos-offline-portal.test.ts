import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * cursos-offline (T5) — Structural guards of the student side of the library.
 *
 * Same discipline as `student-portal.test.ts`: the rules live in the SHAPE of
 * the modules, and breaking them fails nothing visible. A read that forgets
 * the contact compiles, answers 200 and shows someone else's course; a select
 * that adds `isCorrect` compiles and hands out the answer key.
 */

const read = (...parts: string[]) => readFileSync(path.join(process.cwd(), ...parts), "utf8");

/** The source without comments: the rules talk about code, not prose. */
const sinComentarios = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");

describe("cursos-offline — student read module", () => {
  const src = read("src", "server", "offline-courses", "student.ts");
  const codigo = sinComentarios(src);

  it("is read-only", () => {
    for (const verbo of [".insert(", ".update(", ".delete("]) {
      expect(codigo, `student.ts uses ${verbo}`).not.toContain(verbo);
    }
  });

  it("does not choose status codes: it returns null, never 403", () => {
    expect(codigo).not.toMatch(/\b403\b/);
    expect(codigo).not.toMatch(/apiError\s*\(/);
  });

  it("every exported function starts from the contact", () => {
    const firmas = [...src.matchAll(/export async function (\w+)\(([^)]*)\)/g)];
    expect(firmas.length, "no exported functions found").toBeGreaterThanOrEqual(4);
    const sinAlcance = firmas
      .filter(([, , args]) => !(args ?? "").includes("contactId"))
      .map(([, nombre]) => nombre);
    expect(sinAlcance, `functions without contactId: ${sinAlcance.join(", ")}`).toEqual([]);
  });

  /**
   * The answer key never travels to a student, before or after an attempt.
   * The only place that may read `isCorrect` is the grading path in
   * `submit.ts`, and it answers score + passed only.
   */
  it("never reads isCorrect", () => {
    expect(codigo).not.toContain("isCorrect");
    expect(codigo).not.toContain("is_correct");
  });

  it("does not reuse the staff reads, which carry the answer key", () => {
    expect(codigo).not.toMatch(/from\s+"(@\/server\/offline-courses|\.)\/library"/);
    expect(codigo).not.toMatch(/from\s+"(@\/server\/offline-courses|\.)\/attempts"/);
  });

  it("every query declares its organization", () => {
    const wheres = (codigo.match(/\.where\(/g) ?? []).length;
    const scoped = (codigo.match(/scoped\(/g) ?? []).length;
    expect(wheres).toBeGreaterThan(0);
    expect(wheres).toBe(scoped);
  });

  /**
   * T9 — Sequential topics are enforced HERE, not in the UI: a locked topic
   * answers null (→ 404) like one that does not exist. Hiding the link alone
   * would leave the content one typed URL away.
   */
  it("gates the topic content on topicUnlocked", () => {
    const myTopic = codigo.slice(codigo.indexOf("export async function myTopic"));
    expect(myTopic).toContain("topicUnlocked(");
  });

  it("does not import the progress writes", () => {
    expect(codigo).not.toMatch(/from\s+"(@\/server\/offline-courses|\.)\/progress"/);
  });
});

describe("cursos-offline — shared outline reads (T9)", () => {
  const codigo = sinComentarios(read("src", "server", "offline-courses", "outline.ts"));

  it("is read-only, never reads the answer key and scopes every query", () => {
    for (const verbo of [".insert(", ".update(", ".delete("]) {
      expect(codigo, `outline.ts uses ${verbo}`).not.toContain(verbo);
    }
    expect(codigo).not.toContain("isCorrect");
    const wheres = (codigo.match(/\.where\(/g) ?? []).length;
    expect(wheres).toBeGreaterThan(0);
    expect(wheres).toBe((codigo.match(/scoped\(/g) ?? []).length);
  });
});

describe("cursos-offline — progress write module (T9)", () => {
  const codigo = sinComentarios(read("src", "server", "offline-courses", "progress.ts"));

  it("does not answer 403 and never reads the answer key", () => {
    expect(codigo).not.toMatch(/\b403\b/);
    expect(codigo).not.toContain("isCorrect");
  });

  it("every filtered query declares its organization", () => {
    const wheres = (codigo.match(/\.where\(/g) ?? []).length;
    expect(wheres).toBe((codigo.match(/scoped\(/g) ?? []).length);
  });

  it("merges played ranges over the row read under a lock (concurrent reports serialize)", () => {
    expect(codigo).toContain("onConflictDoNothing(");
    expect(codigo).toContain('.for("update")');
  });

  it("writes through the (contact, topic) upsert, never a blind update", () => {
    expect(codigo).toContain("onConflictDoUpdate(");
    expect(codigo).not.toContain(".update(");
    expect(codigo).not.toContain(".delete(");
  });
});

describe("cursos-offline — student write module", () => {
  const codigo = sinComentarios(read("src", "server", "offline-courses", "submit.ts"));

  it("returns score, passed and attempts only — never the correct questions", () => {
    expect(codigo).not.toContain("correctQuestionIds");
  });

  it("does not answer 403", () => {
    expect(codigo).not.toMatch(/\b403\b/);
  });
});

describe("cursos-offline — portal routes", () => {
  const BASE = ["src", "app", "api", "portal", "me", "offline-courses"];
  const LECTURA = [
    "route.ts",
    "[id]/route.ts",
    "[id]/topics/[topicId]/route.ts",
    "[id]/quizzes/[quizId]/route.ts",
    "[id]/thumbnail/route.ts",
  ];

  it("the read routes are GET-only and use the student door", () => {
    for (const rel of LECTURA) {
      const src = read(...BASE, rel);
      for (const metodo of ["POST", "PUT", "PATCH", "DELETE"]) {
        expect(src, `${rel} exports ${metodo}`).not.toMatch(new RegExp(`export const ${metodo}\\b`));
      }
      expect(src, `${rel} does not use the student door`).toContain("requireStudentPortal(");
      expect(sinComentarios(src), `${rel} answers 403`).not.toMatch(/\b403\b/);
    }
  });

  it("the only writes are the attempt and the topic progress, through the student door", () => {
    for (const rel of [
      "[id]/quizzes/[quizId]/attempts/route.ts",
      "[id]/topics/[topicId]/progress/route.ts",
    ]) {
      const src = read(...BASE, rel);
      expect(src, rel).toMatch(/export const POST\b/);
      expect(src, rel).not.toMatch(/export const (GET|PUT|PATCH|DELETE)\b/);
      expect(src, rel).toContain("requireStudentPortal(");
      expect(src, rel).toContain("parseBody(");
      expect(sinComentarios(src), `${rel} answers 403`).not.toMatch(/\b403\b/);
    }
  });

  it("the staff override uses the staff door with academico.editar", () => {
    const src = read(
      "src", "app", "api", "enrollments", "[id]", "offline-courses", "topics", "[topicId]", "complete", "route.ts"
    );
    expect(src).toMatch(/export const PUT\b/);
    expect(src).toContain('requireCapability(\n  "academico.editar"');
    expect(src).not.toContain("requireStudentPortal(");
  });

  it("the teacher history uses the teacher door and hides foreign cohorts as 404", () => {
    const src = read("src", "app", "api", "portal", "cohorts", "[id]", "offline-attempts", "route.ts");
    expect(src).toContain("requireTeacherPortal(");
    expect(src).toContain("teacherReachesCohort(");
    expect(sinComentarios(src)).not.toMatch(/\b403\b/);
  });
});

/**
 * T9 — Constitution 1.4.0, Principle II item 4: the Vimeo player is isolated
 * behind ONE component. A second place that builds the embed (or names the
 * player host) is a second integration nobody reviewed as one.
 */
describe("cursos-offline — Vimeo stays behind one component", () => {
  it("only vimeo-player.tsx renders the embed, and only src/lib/vimeo.ts builds it", () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const full = path.join(dir, name);
        return statSync(full).isDirectory() ? walk(full) : /\.(tsx?|mjs)$/.test(name) ? [full] : [];
      });
    const rel = (f: string) => path.relative(process.cwd(), f).split(path.sep).join("/");
    const files = walk(path.join(process.cwd(), "src"));

    const embeds = files.filter((f) => sinComentarios(readFileSync(f, "utf8")).includes("vimeoEmbedUrl("));
    expect(embeds.map(rel).sort()).toEqual([
      "src/components/offline-courses/vimeo-player.tsx",
      "src/lib/vimeo.ts",
    ]);

    const playerHost = files.filter((f) =>
      sinComentarios(readFileSync(f, "utf8")).includes("https://player.vimeo.com")
    );
    expect(playerHost.map(rel).sort()).toEqual([
      "src/components/offline-courses/vimeo-player.tsx",
      "src/lib/vimeo.ts",
    ]);
  });
});
