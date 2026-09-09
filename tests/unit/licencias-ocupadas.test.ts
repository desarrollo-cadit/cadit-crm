import { describe, expect, it } from "vitest";
import { licenciaOcupada } from "@/server/licenses";

/**
 * 023 — Una licencia ocupada se DERIVA, no se marca.
 *
 * El bug que esto corrige, reportado por el dueño: *"debe automatizarse que
 * cuando termina un curso, libere esas licencias"*. Tenía razón — hoy no
 * libera nada.
 *
 * El inventario contaba `license.assigned = true`, un booleano que **alguien
 * tenía que apagar a mano**. Nadie lo apaga nunca. Una licencia asignada a un
 * curso que terminó hace un año seguía contando como ocupada para siempre, y
 * el campo `expires_at` existía sin que nada lo mirara.
 *
 * Y no tiene nada que ver con el correo de términos de ATC: eso no existe en
 * el modelo. La asignación siempre fue manual.
 *
 * La regla nueva sigue el patrón que la plataforma ya usa en el estado de la
 * cohorte, la aprobación del alumno y el estado de las cuotas: **derivar en
 * vez de almacenar**. Y por eso **no necesita scheduler**: el día que la
 * cohorte termina, la licencia aparece libre sola.
 */

const HOY = new Date("2026-09-01T12:00:00.000Z");
const ANTES = new Date("2026-01-01T00:00:00.000Z");
const DESPUES = new Date("2027-01-01T00:00:00.000Z");

describe("la licencia se ocupa mientras el curso está vivo", () => {
  it("una cohorte EN CURSO ocupa la licencia", () => {
    expect(
      licenciaOcupada(
        { assigned: true, expiresAt: null },
        { startDate: ANTES, endDate: DESPUES },
        HOY
      )
    ).toBe(true);
  });

  /**
   * Una cohorte que todavía no arrancó **también** ocupa: el alumno ya está
   * anotado y la licencia le está reservada. Liberarla sería prometer dos
   * veces el mismo cupo.
   */
  it("una cohorte PLANIFICADA también la ocupa", () => {
    expect(
      licenciaOcupada(
        { assigned: true, expiresAt: null },
        { startDate: DESPUES, endDate: DESPUES },
        HOY
      )
    ).toBe(true);
  });

  /** **El pedido del dueño.** */
  it("una cohorte FINALIZADA la libera, sin que nadie toque nada", () => {
    expect(
      licenciaOcupada(
        { assigned: true, expiresAt: null },
        { startDate: ANTES, endDate: ANTES },
        HOY
      )
    ).toBe(false);
  });

  /**
   * Una cohorte sin fecha de fin nunca termina, así que nunca libera. Es
   * correcto y conviene tenerlo presente: **6 de las 41 cohortes reales no
   * tienen fecha de fin**, y sus licencias van a quedar ocupadas hasta que
   * alguien se la cargue.
   */
  it("sin fecha de fin, la cohorte sigue viva y la licencia ocupada", () => {
    expect(
      licenciaOcupada(
        { assigned: true, expiresAt: null },
        { startDate: ANTES, endDate: null },
        HOY
      )
    ).toBe(true);
  });
});

describe("el vencimiento manda sobre la cohorte", () => {
  /**
   * `expires_at` existía en el modelo desde 005 y **el inventario no lo
   * miraba**. Una licencia anual vencida no vuelve a estar disponible por
   * quererlo: Autodesk ya la dio de baja.
   */
  it("una licencia VENCIDA está libre aunque el curso siga", () => {
    expect(
      licenciaOcupada(
        { assigned: true, expiresAt: ANTES },
        { startDate: ANTES, endDate: DESPUES },
        HOY
      )
    ).toBe(false);
  });

  it("una que vence en el futuro sigue ocupada", () => {
    expect(
      licenciaOcupada(
        { assigned: true, expiresAt: DESPUES },
        { startDate: ANTES, endDate: DESPUES },
        HOY
      )
    ).toBe(true);
  });
});

describe("lo que nunca se asignó no ocupa nada", () => {
  it("`assigned: false` no ocupa, pase lo que pase con la cohorte", () => {
    expect(
      licenciaOcupada(
        { assigned: false, expiresAt: null },
        { startDate: ANTES, endDate: DESPUES },
        HOY
      )
    ).toBe(false);
  });

  /**
   * Sin cohorte, la inscripción es un lead general del pipeline: no está
   * cursando nada, así que su licencia —si alguien se la asignó— no debería
   * seguir descontando del inventario.
   */
  it("una inscripción sin cohorte no ocupa", () => {
    expect(licenciaOcupada({ assigned: true, expiresAt: null }, null, HOY)).toBe(false);
  });
});
