import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const files = walk(join(root, "src")).map((p) => ({
  path: relative(root, p).split(sep).join("/"),
  text: readFileSync(p, "utf8"),
}));

describe("push single-adapter guard (constitution 1.10.0)", () => {
  it("imports web-push only inside src/lib/push/", () => {
    const offenders = files
      .filter((f) => /from\s+["']web-push["']|require\(["']web-push["']\)/.test(f.text))
      .filter((f) => !f.path.startsWith("src/lib/push/"))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it("never exposes the VAPID private key to client code", () => {
    const offenders = files
      .filter((f) => f.text.includes("VAPID_PRIVATE_KEY") || f.text.includes("privateKey"))
      .filter((f) => !f.path.startsWith("src/lib/push/"))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it("gates the dev test route behind pushDevToolsEnabled", () => {
    const route = files.find((f) => f.path === "src/app/api/portal/me/push/dev-test/route.ts");
    expect(route).toBeDefined();
    expect(route!.text).toContain("pushDevToolsEnabled()");
    expect(route!.text).toMatch(/status:\s*404/);
  });

  it("the push subscription stores keys encrypted, not in clear", () => {
    const server = files.find((f) => f.path === "src/server/push/subscriptions.ts")!;
    expect(server.text).toContain("encryptSecret");
    const schema = files.find((f) => f.path === "src/lib/db/schema.ts")!;
    expect(schema.text).not.toMatch(/p256dh:\s*text\(/);
  });
});
