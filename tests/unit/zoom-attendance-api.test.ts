import { describe, expect, it } from "vitest";
import { confirmarSchema, traerSchema, umbralesSchema } from "@/lib/zoom-attendance-api";

describe("cuerpos de la asistencia sugerida", () => {
  it("confirmar: decisiones, ignorar, rechazar y pisar", () => {
    const r = confirmarSchema.safeParse({
      decisions: [{ enrollmentId: "enr_1", status: "presente", personaKeys: ["nombre:ana"] }],
      ignore: ["nombre:otter ai"],
    });
    expect(r.success).toBe(true);
    expect(r.success && r.data.overwrite).toEqual([]);
  });

  it("confirmar rechaza una persona dos veces y estados inventados", () => {
    expect(
      confirmarSchema.safeParse({
        decisions: [
          { enrollmentId: "enr_1", status: "presente", personaKeys: [] },
          { enrollmentId: "enr_1", status: "ausente", personaKeys: [] },
        ],
      }).success
    ).toBe(false);
    expect(
      confirmarSchema.safeParse({ decisions: [{ enrollmentId: "e", status: "vino", personaKeys: [] }] }).success
    ).toBe(false);
  });

  it("umbrales: 1–100 %, 0–600 min, tarde opcional", () => {
    expect(umbralesSchema.safeParse({ minPct: 50, minMinutes: 20, lateMinutes: null }).success).toBe(true);
    expect(umbralesSchema.safeParse({ minPct: 0, minMinutes: 20, lateMinutes: null }).success).toBe(false);
    expect(umbralesSchema.safeParse({ minPct: 50, minMinutes: -1, lateMinutes: null }).success).toBe(false);
  });

  it("traer: solo un uuid opcional", () => {
    expect(traerSchema.safeParse({}).success).toBe(true);
    expect(traerSchema.safeParse({ instanceUuid: "abc==" }).success).toBe(true);
    expect(traerSchema.safeParse({ otra: 1 }).success).toBe(false);
  });
});
