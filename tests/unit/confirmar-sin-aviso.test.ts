import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { avisarAlConfirmarPorDefecto } from "@/lib/marca-de-confirmacion";

/**
 * 2026-10-22 — Confirmar un grupo que YA empezó (o terminó) y nunca se
 * confirmó porque la confirmación no existía: el correo a Soporte con la
 * lista de licencias sería información vieja. Quien confirma elige si avisa;
 * por defecto se avisa solo si el grupo todavía no empezó.
 */
describe("avisarAlConfirmarPorDefecto", () => {
  const ahora = new Date("2026-10-22T12:00:00Z");

  it("un grupo que todavía no empezó: avisa", () => {
    expect(avisarAlConfirmarPorDefecto(new Date("2026-11-01"), ahora)).toBe(true);
  });

  it("un grupo que ya empezó o terminó: no avisa", () => {
    expect(avisarAlConfirmarPorDefecto(new Date("2026-10-01"), ahora)).toBe(false);
    expect(avisarAlConfirmarPorDefecto(new Date("2025-03-01"), ahora)).toBe(false);
  });
});

describe("la ruta respeta la elección", () => {
  const ruta = readFileSync("src/app/api/cohorts/[id]/confirmation/route.ts", "utf8");
  const servidor = readFileSync("src/server/cohort-confirmation.ts", "utf8");

  it("el POST acepta `avisar` validado y lo pasa al servidor", () => {
    expect(ruta).toMatch(/avisar: z\.boolean\(\)/);
    expect(ruta).toMatch(/confirmarCohorte\([^)]*avisar/);
  });

  it("sin aviso, el servidor no encola el correo", () => {
    expect(servidor).toMatch(/if \(cambio && opts\.avisar !== false\)/);
  });
});
