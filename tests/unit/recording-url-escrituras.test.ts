import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 030 (riesgo R7) — `class_session.recording_url` es la PROYECCIÓN de la
 * adjudicación de grabaciones, y `recording_source` dice de dónde vino.
 *
 * Si alguien escribe el enlace por otro camino sin decir su origen, la
 * sincronización lo leería como "pegado a mano" (fallo seguro: no lo pisa)
 * pero la pantalla mentiría sobre de dónde salió. Este guard fija QUIÉN
 * escribe la columna:
 *
 *  - la carga manual del staff (`PATCH /api/class-sessions/[id]/links`),
 *  - la carga manual del profesor (`teacherSetRecording`, que usa
 *    `PUT /api/portal/classes/[id]/recording`),
 *  - la adjudicación (`src/server/zoom/assignment.ts`).
 *
 * Y que las dos cargas manuales escriben también `recordingSource`.
 */

const SRC = path.join(process.cwd(), "src");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const full = path.join(dir, e);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(e)) out.push(full);
  }
  return out;
}

const rel = (f: string) => path.relative(process.cwd(), f).replace(/\\/g, "/");

/** El texto de cada `.set( … )` del archivo, con paréntesis balanceados. */
function bloquesSet(src: string): string[] {
  const out: string[] = [];
  let i = src.indexOf(".set(");
  while (i >= 0) {
    let depth = 0;
    let j = i + 4;
    for (; j < src.length; j++) {
      if (src[j] === "(") depth++;
      else if (src[j] === ")" && --depth === 0) break;
    }
    out.push(src.slice(i, j + 1));
    i = src.indexOf(".set(", j);
  }
  return out;
}

const ESCRIBEN = [
  "src/app/api/class-sessions/[id]/links/route.ts",
  "src/server/teacher-portal.ts",
  "src/server/zoom/assignment.ts",
];

describe("quién escribe class_session.recording_url", () => {
  const escritores = new Map<string, string[]>();
  for (const f of walk(SRC)) {
    const r = rel(f);
    if (r === "src/lib/db/schema.ts") continue;
    const src = readFileSync(f, "utf8");
    const bloques = bloquesSet(src).filter((b) => /recordingUrl|recording_url/.test(b));
    const sqlCrudo = /update\s+"?class_session"?[\s\S]{0,300}recording_url\s*=/i.test(src);
    if (bloques.length > 0 || sqlCrudo) escritores.set(r, bloques);
  }

  it("solo las dos cargas manuales y la adjudicación", () => {
    expect([...escritores.keys()].sort()).toEqual([...ESCRIBEN].sort());
  });

  it.each(ESCRIBEN.slice(0, 2))("%s escribe también recordingSource", (archivo) => {
    const bloques = escritores.get(archivo) ?? [];
    expect(bloques.length).toBeGreaterThan(0);
    for (const b of bloques) expect(b, b).toMatch(/recordingSource/);
  });
});
