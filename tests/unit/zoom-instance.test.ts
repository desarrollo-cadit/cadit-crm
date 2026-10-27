import { describe, expect, it } from "vitest";
import { elegirInstancia } from "@/lib/zoom-instance";

/**
 * Qué INSTANCIA de reunión es la de una clase. En un aula PMI el número se
 * repite entre grupos: se decide por horario (y por número si la clase lo
 * tiene). Igual que la adjudicación de grabaciones: ante dos, no elige.
 */

const clase = {
  startsAt: new Date("2026-10-20T21:00:00Z"),
  endsAt: new Date("2026-10-20T23:00:00Z"),
  meetingId: null as string | null,
};
const tolerancia = { beforeMin: 20, afterFallbackMin: 180 };
const inst = (uuid: string, hhmm: string, meetingId = "5551234567") => ({
  uuid,
  meetingId,
  startTime: new Date(`2026-10-20T${hhmm}:00Z`),
  topic: null,
});

describe("elegirInstancia", () => {
  it("una en el horario → esa", () => {
    const r = elegirInstancia({ clase, instancias: [inst("a", "18:00"), inst("b", "20:50"), inst("c", "23:30")], tolerancia });
    expect(r).toEqual({ kind: "unica", instancia: inst("b", "20:50") });
  });

  it("dos en el horario (se reinició la reunión) → ambigua, ordenadas", () => {
    const r = elegirInstancia({ clase, instancias: [inst("z", "21:30"), inst("y", "21:02")], tolerancia });
    expect(r).toMatchObject({ kind: "ambigua" });
    expect(r.kind === "ambigua" && r.candidatas.map((c) => c.uuid)).toEqual(["y", "z"]);
  });

  it("con número de reunión en la clase, solo esas", () => {
    const r = elegirInstancia({
      clase: { ...clase, meetingId: "999" },
      instancias: [inst("pmi", "21:00"), inst("prog", "21:05", "999")],
      tolerancia,
    });
    expect(r).toMatchObject({ kind: "unica", instancia: { uuid: "prog" } });
  });

  it("ninguna en el horario → ninguna", () => {
    expect(elegirInstancia({ clase, instancias: [inst("a", "18:00")], tolerancia })).toEqual({ kind: "ninguna" });
  });

  it("clase sin hora de fin: usa el fin supuesto", () => {
    const r = elegirInstancia({ clase: { ...clase, endsAt: null }, instancias: [inst("a", "23:59")], tolerancia });
    expect(r.kind).toBe("unica");
  });
});
