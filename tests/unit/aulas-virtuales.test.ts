import { describe, expect, it } from "vitest";
import {
  findClashes,
  resolveMeetingUrl,
  toOccupiedSlots,
  type OccupiedSlot,
} from "@/server/virtual-rooms";

/**
 * 023 — El criterio de choque, probado sin base.
 *
 * Es la parte de la fase que puede estar mal sin que nada se rompa: un
 * detector que no detecta no falla, simplemente deja pasar el choque, y quien
 * se entera es el alumno que entró a un Zoom donde estaba dando clase otro.
 */

const slot = (
  id: string,
  room: string,
  desde: string,
  hasta: string,
  cohortId = `coh-${id}`
): OccupiedSlot => ({
  classSessionId: id,
  cohortId,
  virtualRoomId: room,
  startsAt: new Date(desde),
  endsAt: new Date(hasta),
});

describe("023 — choques de aula", () => {
  it("dos clases solapadas en la misma aula chocan", () => {
    const clashes = findClashes([
      slot("a", "zoom1", "2026-09-07T21:30:00Z", "2026-09-07T23:30:00Z"),
      slot("b", "zoom1", "2026-09-07T22:00:00Z", "2026-09-08T00:00:00Z"),
    ]);
    expect(clashes).toHaveLength(1);
    expect(clashes[0]!.roomId).toBe("zoom1");
  });

  it("las mismas dos clases en aulas DISTINTAS no chocan", () => {
    const clashes = findClashes([
      slot("a", "zoom1", "2026-09-07T21:30:00Z", "2026-09-07T23:30:00Z"),
      slot("b", "zoom2", "2026-09-07T22:00:00Z", "2026-09-08T00:00:00Z"),
    ]);
    expect(clashes).toEqual([]);
  });

  /**
   * SC-003 — El caso que más ruido haría si se reportara mal. Una clase de
   * 18:30 a 20:30 y otra de 20:30 a 22:30 comparten un instante y nada más.
   * Marcarlas llenaría la pantalla de avisos que coordinación sabe que son
   * falsos, y un aviso que siempre se ignora deja de avisar.
   */
  it("dos clases PEGADAS no chocan (solapamiento estricto)", () => {
    const clashes = findClashes([
      slot("a", "zoom1", "2026-09-07T21:30:00Z", "2026-09-07T23:30:00Z"),
      slot("b", "zoom1", "2026-09-07T23:30:00Z", "2026-09-08T01:30:00Z"),
    ]);
    expect(clashes).toEqual([]);
  });

  /** DV-003 — Con margen declarado, las pegadas SÍ chocan. */
  it("con margen de 15 minutos, las pegadas sí chocan", () => {
    const clashes = findClashes(
      [
        slot("a", "zoom1", "2026-09-07T21:30:00Z", "2026-09-07T23:30:00Z"),
        slot("b", "zoom1", "2026-09-07T23:30:00Z", "2026-09-08T01:30:00Z"),
      ],
      15
    );
    expect(clashes).toHaveLength(1);
  });

  it("una clase contenida dentro de otra choca", () => {
    const clashes = findClashes([
      slot("larga", "zoom1", "2026-09-07T21:00:00Z", "2026-09-08T01:00:00Z"),
      slot("corta", "zoom1", "2026-09-07T22:00:00Z", "2026-09-07T23:00:00Z"),
    ]);
    expect(clashes).toHaveLength(1);
  });

  it("tres clases solapadas reportan los tres pares", () => {
    const clashes = findClashes([
      slot("a", "zoom1", "2026-09-07T21:00:00Z", "2026-09-08T00:00:00Z"),
      slot("b", "zoom1", "2026-09-07T22:00:00Z", "2026-09-08T01:00:00Z"),
      slot("c", "zoom1", "2026-09-07T23:00:00Z", "2026-09-08T02:00:00Z"),
    ]);
    expect(clashes).toHaveLength(3);
  });

  it("el mismo día en aulas distintas no genera ruido", () => {
    const clashes = findClashes([
      slot("a", "zoom1", "2026-09-07T21:30:00Z", "2026-09-07T23:30:00Z"),
      slot("b", "zoom2", "2026-09-07T21:30:00Z", "2026-09-07T23:30:00Z"),
      slot("c", "zoom3", "2026-09-07T21:30:00Z", "2026-09-07T23:30:00Z"),
      slot("d", "zoom4", "2026-09-07T21:30:00Z", "2026-09-07T23:30:00Z"),
      slot("e", "zoom5", "2026-09-07T21:30:00Z", "2026-09-07T23:30:00Z"),
    ]);
    expect(clashes).toEqual([]);
  });
});

describe("023 — qué clases ocupan un aula", () => {
  const base = {
    date: new Date("2026-09-07T00:00:00Z"),
    startTime: "18:30",
    endTime: "20:30",
    canceledAt: null as Date | null,
    virtualRoomId: null as string | null,
    cohortVirtualRoomId: "zoom1" as string | null,
  };

  it("hereda el aula de la cohorte cuando la clase no declara la suya", () => {
    const slots = toOccupiedSlots(
      [{ id: "c1", cohortId: "coh1", ...base }],
      "America/Montevideo"
    );
    expect(slots).toHaveLength(1);
    expect(slots[0]!.virtualRoomId).toBe("zoom1");
  });

  /** FR-003 — La excepción por clase existe porque los choques se resuelven de a una. */
  it("el aula de la CLASE gana sobre la de la cohorte", () => {
    const slots = toOccupiedSlots(
      [{ id: "c1", cohortId: "coh1", ...base, virtualRoomId: "zoom2" }],
      "America/Montevideo"
    );
    expect(slots[0]!.virtualRoomId).toBe("zoom2");
  });

  /** SC-004 — Bloquear un aula por una clase que no va a existir llena la agenda de fantasmas. */
  it("una clase CANCELADA no ocupa el aula", () => {
    const slots = toOccupiedSlots(
      [{ id: "c1", cohortId: "coh1", ...base, canceledAt: new Date() }],
      "America/Montevideo"
    );
    expect(slots).toEqual([]);
  });

  /**
   * FR-008 — 6 de las 41 cohortes reales no tienen horario cargado. Suponerles
   * uno sería inventar un choque o esconderlo.
   */
  it("una clase SIN horario no puede chocar", () => {
    const slots = toOccupiedSlots(
      [{ id: "c1", cohortId: "coh1", ...base, startTime: null, endTime: null }],
      "America/Montevideo"
    );
    expect(slots).toEqual([]);
  });

  it("una clase sin aula, ni propia ni de la cohorte, no ocupa nada", () => {
    const slots = toOccupiedSlots(
      [{ id: "c1", cohortId: "coh1", ...base, cohortVirtualRoomId: null }],
      "America/Montevideo"
    );
    expect(slots).toEqual([]);
  });

  /**
   * SC-006 — La razón por la que los rangos se comparan como INSTANTES y no
   * como los textos `"18:30"`.
   *
   * Una clase a las 18:30 de Montevideo y otra a las 23:30 de Madrid son **el
   * mismo instante real** en julio (UTC-3 contra UTC+2). Comparando los textos
   * no chocarían nunca, y las dos cohortes terminarían en el mismo Zoom.
   *
   * Se eligió Madrid y no Asunción a propósito: Paraguay abolió el horario de
   * verano en 2024 y hoy comparte UTC-3 con Uruguay, así que ese par no prueba
   * nada. Madrid además CAMBIA de offset entre enero y julio, que es donde una
   * comparación de textos falla incluso contra sí misma.
   */
  it("dos zonas distintas que caen en el mismo instante SÍ chocan", () => {
    const enJulio = new Date("2026-07-06T00:00:00Z");

    const montevideo = toOccupiedSlots(
      [
        {
          id: "mvd",
          cohortId: "coh-mvd",
          date: enJulio,
          startTime: "18:30",
          endTime: "20:30",
          canceledAt: null,
          virtualRoomId: null,
          cohortVirtualRoomId: "zoom1",
        },
      ],
      "America/Montevideo"
    );
    const madrid = toOccupiedSlots(
      [
        {
          id: "mad",
          cohortId: "coh-mad",
          date: enJulio,
          startTime: "23:30",
          endTime: "01:30",
          canceledAt: null,
          virtualRoomId: null,
          cohortVirtualRoomId: "zoom1",
        },
      ],
      "Europe/Madrid"
    );

    // 18:30 en Montevideo y 23:30 en Madrid son el MISMO instante.
    expect(montevideo[0]!.startsAt.toISOString()).toBe("2026-07-06T21:30:00.000Z");
    expect(madrid[0]!.startsAt.toISOString()).toBe("2026-07-06T21:30:00.000Z");
    expect(findClashes([...montevideo, ...madrid])).toHaveLength(1);
  });
});

describe("023 — de dónde sale el enlace del alumno", () => {
  /**
   * FR-004 — El orden va de lo más específico a lo más general, y el último
   * escalón existe para NO romper lo que ya funciona: una academia con el
   * enlace pegado a mano en la cohorte sigue andando después de esta fase.
   */
  it("el enlace propio de la clase gana sobre todo", () => {
    expect(
      resolveMeetingUrl({
        classMeetingUrl: "https://zoom.us/clase",
        classRoomUrl: "https://zoom.us/aula-clase",
        cohortRoomUrl: "https://zoom.us/aula-cohorte",
        cohortMeetingUrl: "https://zoom.us/cohorte",
      })
    ).toBe("https://zoom.us/clase");
  });

  it("sin enlace propio, manda el aula de la clase", () => {
    expect(
      resolveMeetingUrl({
        classMeetingUrl: null,
        classRoomUrl: "https://zoom.us/aula-clase",
        cohortRoomUrl: "https://zoom.us/aula-cohorte",
        cohortMeetingUrl: "https://zoom.us/cohorte",
      })
    ).toBe("https://zoom.us/aula-clase");
  });

  it("después, el aula de la cohorte", () => {
    expect(
      resolveMeetingUrl({
        classMeetingUrl: null,
        classRoomUrl: null,
        cohortRoomUrl: "https://zoom.us/aula-cohorte",
        cohortMeetingUrl: "https://zoom.us/cohorte",
      })
    ).toBe("https://zoom.us/aula-cohorte");
  });

  it("y al final el enlace viejo de la cohorte: lo que ya andaba sigue andando", () => {
    expect(
      resolveMeetingUrl({
        classMeetingUrl: null,
        classRoomUrl: null,
        cohortRoomUrl: null,
        cohortMeetingUrl: "https://zoom.us/cohorte",
      })
    ).toBe("https://zoom.us/cohorte");
  });

  it("sin ninguno, null — y la pantalla dice que no hay enlace", () => {
    expect(
      resolveMeetingUrl({
        classMeetingUrl: null,
        classRoomUrl: null,
        cohortRoomUrl: null,
        cohortMeetingUrl: null,
      })
    ).toBeNull();
  });
});
