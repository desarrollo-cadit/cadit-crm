import { describe, expect, it } from "vitest";
import { marcaDeConfirmacion } from "@/lib/marca-de-confirmacion";

/**
 * La marca de confirmación que se ve en el encabezado del grupo y en la lista
 * de Académico. El estado sigue saliendo de las fechas (`computeCohortStatus`);
 * esto es solo lo que se DIBUJA al lado: un grupo que ya empezó sin que nadie
 * lo confirme no puede verse como un "En curso" más.
 */

const TZ = "America/Montevideo";
const base = {
  startDate: new Date("2026-11-10T00:00:00.000Z"),
  endDate: new Date("2026-12-20T00:00:00.000Z") as Date | null,
  confirmedAt: null as Date | null,
  courseKind: "curso" as const,
  parentCohortId: null as string | null,
};
const dia = (d: string) => new Date(`${d}T15:00:00.000Z`);

describe("marca de confirmación", () => {
  it("confirmado → confirmado, antes o después del inicio", () => {
    const c = { ...base, confirmedAt: dia("2026-11-01") };
    expect(marcaDeConfirmacion(c, dia("2026-11-05"), TZ)).toBe("confirmado");
    expect(marcaDeConfirmacion(c, dia("2026-11-15"), TZ)).toBe("confirmado");
  });

  it("sin confirmar antes del inicio → neutral", () => {
    expect(marcaDeConfirmacion(base, dia("2026-11-09"), TZ)).toBe("sin_confirmar");
  });

  it("sin confirmar el día de inicio o después → vencido (rojo)", () => {
    expect(marcaDeConfirmacion(base, dia("2026-11-10"), TZ)).toBe("sin_confirmar_vencido");
    expect(marcaDeConfirmacion(base, dia("2026-11-20"), TZ)).toBe("sin_confirmar_vencido");
  });

  it("el día se cuenta en la zona de la academia", () => {
    // 10/11 01:00 UTC = 9/11 22:00 en Montevideo: todavía no empezó.
    expect(marcaDeConfirmacion(base, new Date("2026-11-10T01:00:00.000Z"), TZ)).toBe("sin_confirmar");
  });

  it("sin fecha de fin, una vez empezado, sigue vencido", () => {
    expect(marcaDeConfirmacion({ ...base, endDate: null }, dia("2027-03-01"), TZ)).toBe(
      "sin_confirmar_vencido"
    );
  });

  it("un grupo ya finalizado no se marca: no queda nada que decidir", () => {
    expect(marcaDeConfirmacion(base, dia("2026-12-21"), TZ)).toBe("sin_confirmar");
  });

  it("talleres y módulos nunca se marcan en rojo", () => {
    expect(marcaDeConfirmacion({ ...base, courseKind: "taller" }, dia("2026-11-15"), TZ)).toBe(
      "sin_confirmar"
    );
    expect(marcaDeConfirmacion({ ...base, parentCohortId: "coh_madre" }, dia("2026-11-15"), TZ)).toBe(
      "sin_confirmar"
    );
  });

  it("zona inválida → cae a la comparación en UTC (nunca lanza)", () => {
    expect(marcaDeConfirmacion(base, dia("2026-11-15"), "No/Existe")).toBe("sin_confirmar_vencido");
    expect(marcaDeConfirmacion(base, dia("2026-11-05"), "No/Existe")).toBe("sin_confirmar");
  });
});
