import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hayClaseCerca } from "@/components/portal/use-refresco-de-clases";

/**
 * El botón "Ingresar" lo decide el servidor en el momento del pedido. Quien
 * abría el portal a las 18:00 para la clase de las 18:30 no lo veía aparecer a
 * las 18:15 sin recargar: la pantalla tiene que volver a pedir sola.
 */
const clase = { startsAt: "2026-10-14T21:30:00.000Z", endsAt: "2026-10-14T23:30:00.000Z" }; // 18:30–20:30 UY
const t = (iso: string) => new Date(iso).getTime();

describe("¿hay una clase cerca? (decide si vale la pena refrescar)", () => {
  it("media hora antes, sí", () => {
    expect(hayClaseCerca([clase], t("2026-10-14T21:00:00.000Z"))).toBe(true);
  });
  it("durante la clase y poco después, sí", () => {
    expect(hayClaseCerca([clase], t("2026-10-14T22:30:00.000Z"))).toBe(true);
    expect(hayClaseCerca([clase], t("2026-10-15T01:00:00.000Z"))).toBe(true);
  });
  it("a la mañana, o días después, no: nada de sondeo permanente", () => {
    expect(hayClaseCerca([clase], t("2026-10-14T12:00:00.000Z"))).toBe(false);
    expect(hayClaseCerca([clase], t("2026-10-16T21:00:00.000Z"))).toBe(false);
  });
  it("sin horario cargado, no", () => {
    expect(hayClaseCerca([{ startsAt: null, endsAt: null }], t("2026-10-14T21:00:00.000Z"))).toBe(false);
  });
});

describe("las tres pantallas con el botón se refrescan solas", () => {
  for (const f of [
    "src/components/portal/student-course-client.tsx",
    "src/components/portal/student-dashboard.tsx",
    "src/components/portal/portal-cohort-client.tsx",
  ]) {
    it(f, () => {
      expect(readFileSync(join(process.cwd(), f), "utf8")).toContain("useRefrescoDeClases(");
    });
  }
});

describe("la página del curso también tiene el botón para ingresar", () => {
  it("el detalle de la cursada trae la próxima clase con la misma regla que el inicio", () => {
    const src = readFileSync(join(process.cwd(), "src/server/student-portal.ts"), "utf8");
    // 043 — Con el acceso vencido no hay próxima clase (su enlace no viaja).
    expect(src).toContain("nextClass: vencida ? null : pickNextClass(recorrido, sesiones, clock, now)");
  });
  it("y la dibuja con la misma tarjeta del inicio", () => {
    const src = readFileSync(join(process.cwd(), "src/components/portal/student-course-client.tsx"), "utf8");
    expect(src).toContain("<ProximaClase course={course} next={data.nextClass}");
  });
});
