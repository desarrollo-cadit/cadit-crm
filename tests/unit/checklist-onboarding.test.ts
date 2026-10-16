import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CHECKLIST_ITEMS, checklistProgress } from "@/lib/onboarding-checklist";

/**
 * 035 (US4, FR-017..FR-020) — El checklist del alumno sin pasos viejos.
 * "Acceso a Academia Online" deja de ser casilla y de contar; "Correo de T&C
 * enviado" deja de ser casilla (es un botón que MANDA el correo) pero sigue
 * contando como paso hecho. Los datos guardados no se tocan.
 */

const base = {
  licenseAssigned: false,
  hadOwnLicense: false,
  termsEmailSentAt: null as string | null,
  softwareInstalledAt: null as string | null,
  academiaOnlineAccessAt: null as string | null,
};

describe("CHECKLIST_ITEMS (FR-017)", () => {
  it("sólo queda 'Software instalado' como casilla", () => {
    expect(CHECKLIST_ITEMS.map((i) => i.key)).toEqual(["softwareInstalledAt"]);
    expect(CHECKLIST_ITEMS.map((i) => i.label)).not.toContain("Acceso a Academia Online");
    expect(CHECKLIST_ITEMS.map((i) => i.label)).not.toContain("Correo de T&C enviado");
  });
});

describe("checklistProgress (FR-019)", () => {
  it("son tres pasos: licencia, T&C y software", () => {
    expect(checklistProgress(base)).toEqual({ done: 0, total: 3 });
  });

  it("Academia Online ya no cuenta, aunque el dato exista (FR-020)", () => {
    expect(checklistProgress({ ...base, academiaOnlineAccessAt: "2026-09-01T00:00:00Z" })).toEqual({
      done: 0,
      total: 3,
    });
  });

  it("todo hecho = 3/3", () => {
    expect(
      checklistProgress({
        ...base,
        licenseAssigned: true,
        termsEmailSentAt: "2026-10-12T00:00:00Z",
        softwareInstalledAt: "2026-10-12T00:00:00Z",
      })
    ).toEqual({ done: 3, total: 3 });
  });

  it("licencia propia o una de módulo cuentan como licencia", () => {
    expect(checklistProgress({ ...base, hadOwnLicense: true }).done).toBe(1);
    expect(checklistProgress(base, true).done).toBe(1);
  });
});

describe("el roster ya no dibuja las casillas viejas", () => {
  const roster = readFileSync(
    path.join(process.cwd(), "src", "components", "cohorts", "roster-client.tsx"),
    "utf8"
  );

  it("no menciona Academia Online ni la casilla de T&C", () => {
    expect(roster).not.toContain("Acceso a Academia Online");
    expect(roster).not.toContain("Correo de T&C enviado");
  });

  it("ofrece el botón 'Enviar T&C'", () => {
    expect(roster).toContain("Enviar T&C");
  });
});
