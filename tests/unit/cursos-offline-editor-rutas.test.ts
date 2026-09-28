import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * cursos-offline T11 — Editing the library is `academico.editar`; reading it is
 * `academico.ver`. A new route under `api/offline-courses/**` that writes with
 * the read capability (or with none) would let anyone who may LOOK at the
 * library rewrite it. Structural, so the next route cannot forget it.
 */

const ROOT = path.join(process.cwd(), "src", "app", "api", "offline-courses");

function routes(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...routes(full));
    else if (entry === "route.ts") out.push(full);
  }
  return out;
}

const rel = (f: string) => path.relative(ROOT, f).replace(/\\/g, "/");

const WRITE = /export\s+const\s+(POST|PUT|PATCH|DELETE)\s*=\s*([\s\S]*?)\(\s*"([\w.]+)"/g;
const READ = /export\s+const\s+GET\s*=\s*([\s\S]*?)\(\s*"([\w.]+)"/g;

describe("offline-courses routes: capabilities", () => {
  const files = routes(ROOT);

  it("finds the editor routes", () => {
    expect(files.length).toBeGreaterThanOrEqual(12);
  });

  it("every write handler requires academico.editar", () => {
    const wrong: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      const declared = [...src.matchAll(/export\s+const\s+(POST|PUT|PATCH|DELETE)\b/g)].length;
      const matches = [...src.matchAll(WRITE)];
      if (matches.length !== declared) wrong.push(`${rel(file)}: a write handler without requireCapability`);
      for (const m of matches) {
        if (m[2]!.trim() !== "requireCapability" || m[3] !== "academico.editar") {
          wrong.push(`${rel(file)} ${m[1]}: ${m[2]!.trim()}("${m[3]}")`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it("every read handler requires academico.ver", () => {
    const wrong: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(READ)) {
        if (m[1]!.trim() !== "requireCapability" || m[2] !== "academico.ver") {
          wrong.push(`${rel(file)} GET: ${m[1]!.trim()}("${m[2]}")`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it("the course-scoped routes resolve nested ids through the editor (never a raw table write)", () => {
    const raw: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      if (/getDb\(|\.insert\(|\.update\(|\.delete\(/.test(src)) raw.push(rel(file));
    }
    expect(raw).toEqual([]);
  });
});
