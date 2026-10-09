import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 030 (constitución 1.6.0, principio II) — Zoom vive SOLO en `src/lib/zoom`.
 *
 * Mismo espíritu que `send-sandbox.test.ts`: la regla se rompe con una línea
 * bien intencionada ("un fetch rapidito a la API para ver los usuarios") y no
 * se nota hasta que el dominio quedó acoplado a Zoom o un secreto viajó por
 * un camino que nadie revisó. Este archivo la vuelve ruidosa.
 *
 * Única excepción: el zoom-mock, que IMITA a Zoom sin llamarlo.
 */

const SRC = path.join(process.cwd(), "src");
const ADAPTER = path.join(SRC, "lib", "zoom");
const MOCK = path.join(SRC, "app", "api", "dev", "zoom-mock");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx|js|mjs)$/.test(entry)) out.push(full);
  }
  return out;
}

const dentro = (file: string, dir: string) => file.startsWith(dir + path.sep);
const rel = (f: string) => path.relative(process.cwd(), f).replace(/\\/g, "/");

describe("Zoom solo en src/lib/zoom", () => {
  it("el adaptador existe y tiene su punto de entrada", () => {
    expect(existsSync(path.join(ADAPTER, "index.ts"))).toBe(true);
  });

  it("ninguna URL de la API ni del OAuth de Zoom fuera del adaptador", () => {
    const culpables = walk(SRC)
      .filter((f) => !dentro(f, ADAPTER) && !dentro(f, MOCK))
      .filter((f) => /api\.zoom\.us|zoom\.us\/oauth|ZOOM_(API|OAUTH)_BASE_URL/.test(readFileSync(f, "utf8")))
      .map(rel)
      // `env.ts` DECLARA las variables; no las usa para llamar a nadie.
      .filter((f) => f !== "src/lib/env.ts");
    expect(culpables, `Zoom fuera del adaptador: ${culpables.join(", ")}`).toEqual([]);
  });

  it("el mock no llama a Zoom real", () => {
    if (!existsSync(MOCK)) return;
    const culpables = walk(MOCK)
      .filter((f) => /fetch\(|api\.zoom\.us|https:\/\/zoom\.us/.test(readFileSync(f, "utf8")))
      .map(rel);
    expect(culpables).toEqual([]);
  });

  it("el adaptador es de SOLO LECTURA: ninguna función exportada con verbo de escritura", () => {
    const culpables: string[] = [];
    for (const f of walk(ADAPTER)) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/export\s+(?:async\s+)?function\*?\s+(\w+)/g)) {
        if (/^(create|update|delete|patch|post|remove|put)/i.test(m[1]!)) {
          culpables.push(`${rel(f)}: ${m[1]}`);
        }
      }
      for (const m of src.matchAll(/export\s+const\s+(\w+)/g)) {
        if (/^(create|update|delete|patch|post|remove|put)/i.test(m[1]!)) {
          culpables.push(`${rel(f)}: ${m[1]}`);
        }
      }
    }
    expect(culpables).toEqual([]);
  });

  it("el adaptador no pide métodos HTTP de escritura salvo el POST del token", () => {
    for (const f of walk(ADAPTER)) {
      const src = readFileSync(f, "utf8");
      expect(src, rel(f)).not.toMatch(/method:\s*["'](PUT|PATCH|DELETE)["']/);
      const posts = [...src.matchAll(/method:\s*["']POST["']/g)].length;
      expect(posts, `${rel(f)}: solo el token usa POST`).toBeLessThanOrEqual(1);
    }
  });
});
