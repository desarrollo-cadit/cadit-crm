import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 029 — Guard estructural del correo de derivación (como `send-sandbox`).
 *
 * Una conversación del Laboratorio (`is_test`) JAMÁS manda correo. La
 * garantía no puede depender de que cada llamador se acuerde: por eso hay UN
 * solo archivo que llama a `sendMail` en `src/server/areas/`, y a ese archivo
 * solo lo invoca la tarea post-commit de `handoff.ts`, que solo se agenda
 * cuando el correo quedó `pendiente` (nunca `simulado`).
 */

const SRC = path.join(process.cwd(), "src");
const AREAS_DIR = path.join(SRC, "server", "areas");

function files(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...files(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const rel = (f: string) => path.relative(SRC, f).replace(/\\/g, "/");
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("sandbox del correo de derivación", () => {
  it("el único archivo de src/server/areas/ que usa `sendMail` es email.ts", () => {
    const usan = files(AREAS_DIR)
      .filter((f) => /\bsendMail\b/.test(sinComentarios(readFileSync(f, "utf8"))))
      .map(rel);
    expect(usan).toEqual(["server/areas/email.ts"]);
  });

  it("`sendHandoffEmail` solo se invoca desde areas/handoff.ts", () => {
    const usan = files(SRC)
      .filter((f) => !f.endsWith(path.join("areas", "email.ts")))
      .filter((f) => /\bsendHandoffEmail\b/.test(sinComentarios(readFileSync(f, "utf8"))))
      .map(rel);
    expect(usan).toEqual(["server/areas/handoff.ts"]);
  });

  it("handoff.ts: is_test → simulado, y el envío solo se agenda post-commit para `pendiente`", () => {
    const code = sinComentarios(readFileSync(path.join(AREAS_DIR, "handoff.ts"), "utf8"));
    expect(code).toMatch(/if \(isTest\) return "simulado";/);
    expect(code).toMatch(/onAfterCommit\(/);
    expect(code).toMatch(/emailStatus === "pendiente"[\s\S]{0,200}onAfterCommit\(/);
    // El envío en sí corre en su propio alcance de organización, nunca en el turno.
    expect(code).toMatch(/withOrganizationScope\([^)]*"system:derivacion"/);
  });

  it("idempotencia: el correo se inserta con on conflict do nothing (handoff_id, source_message_id)", () => {
    const code = sinComentarios(readFileSync(path.join(AREAS_DIR, "handoff.ts"), "utf8"));
    expect(code).toMatch(/onConflictDoNothing\(/);
    expect(code).toMatch(/pg_advisory_xact_lock/);
  });
});
