import { describe, expect, it } from "vitest";
import { classInstant } from "@/lib/schedule-time";
import {
  matchRecording,
  toMatchableClasses,
  toMatchableRooms,
  type MatchableClass,
  type MatchableRoom,
  type MatchInput,
} from "@/server/zoom/matching";

/**
 * 030 US2 (contrato adjudicacion.md, invariantes 1–5) — El matcher PURO.
 *
 * Es la pieza donde un error pone la grabación de otra cohorte frente a un
 * alumno (SC-002). Por eso la regla es "mejor ningún enlace que el
 * equivocado": ante dos candidatas igual de válidas no elige, avisa.
 */

const TOL = { beforeMin: 30, afterFallbackMin: 180 };
const MVD = "America/Montevideo";

function clase(id: string, startsAt: string, extra: Partial<MatchableClass> = {}): MatchableClass {
  const s = new Date(startsAt);
  return {
    classSessionId: id,
    cohortId: `coh_${id}`,
    startsAt: s,
    endsAt: new Date(s.getTime() + 3 * 3_600_000),
    meetingId: null,
    roomId: null,
    ...extra,
  };
}

const ROOMS: MatchableRoom[] = [
  { roomId: "aula_1", zoomConnectionId: "zc_1", zoomUserId: "u1", pmiMeetingId: "1110000001" },
  { roomId: "aula_2", zoomConnectionId: "zc_1", zoomUserId: "u2", pmiMeetingId: "2220000002" },
];

function input(
  rec: Partial<MatchInput["recording"]>,
  classes: MatchableClass[],
  rooms: MatchableRoom[] = ROOMS
): MatchInput {
  return {
    recording: {
      zoomConnectionId: "zc_1",
      meetingId: "9990000001",
      hostZoomUserId: "u1",
      startTime: new Date("2026-09-15T21:34:00Z"),
      ...rec,
    },
    classes,
    rooms,
    tolerance: TOL,
  };
}

describe("señal A — número de reunión", () => {
  it("una clase con esa reunión en la ventana → única por reunión", () => {
    const r = matchRecording(
      input({}, [clase("A1", "2026-09-15T21:30:00Z", { meetingId: "9990000001", roomId: "aula_1" })])
    );
    expect(r).toEqual({ kind: "unica", classSessionId: "A1", signal: "reunion" });
  });

  it("invariante 1: A gana sobre B aunque el anfitrión sea otro usuario (cuenta prestada)", () => {
    const r = matchRecording(
      input({ hostZoomUserId: "u2" }, [
        clase("A1", "2026-09-15T21:30:00Z", { meetingId: "9990000001", roomId: "aula_1" }),
        clase("B1", "2026-09-15T21:30:00Z", { roomId: "aula_2" }),
      ])
    );
    expect(r).toEqual({ kind: "unica", classSessionId: "A1", signal: "reunion" });
  });

  it("dos clases con la misma reunión en la ventana → ambigua por reunión", () => {
    const r = matchRecording(
      input({}, [
        clase("A1", "2026-09-15T21:30:00Z", { meetingId: "9990000001" }),
        clase("X1", "2026-09-15T21:00:00Z", { meetingId: "9990000001" }),
      ])
    );
    expect(r).toEqual({ kind: "ambigua", candidateIds: ["A1", "X1"], signal: "reunion" });
  });
});

describe("señal B — aula del anfitrión o PMI", () => {
  it("sin reunión que coincida, el aula vinculada al anfitrión decide", () => {
    const r = matchRecording(
      input({ hostZoomUserId: "u2", meetingId: "5555555555" }, [clase("B1", "2026-09-15T21:30:00Z", { roomId: "aula_2" })])
    );
    expect(r).toEqual({ kind: "unica", classSessionId: "B1", signal: "aula" });
  });

  it("el PMI del aula cuenta como aula del anfitrión", () => {
    const r = matchRecording(
      input({ hostZoomUserId: "otro", meetingId: "2220000002" }, [clase("B1", "2026-09-15T21:30:00Z", { roomId: "aula_2" })])
    );
    expect(r).toEqual({ kind: "unica", classSessionId: "B1", signal: "aula" });
  });

  it("el usuario se compara DENTRO de la conexión: u1 de otra cuenta no es el aula", () => {
    const r = matchRecording(
      input({ zoomConnectionId: "zc_otra", meetingId: "5555555555" }, [clase("A1", "2026-09-15T21:30:00Z", { roomId: "aula_1" })])
    );
    expect(r).toEqual({ kind: "ninguna" });
  });

  it("invariante 2: choque de aulas → ambigua, nunca 'la más cercana'", () => {
    const r = matchRecording(
      input({ meetingId: "1110000001" }, [
        clase("A2", "2026-09-15T21:30:00Z", { roomId: "aula_1" }),
        clase("C2", "2026-09-15T21:33:00Z", { roomId: "aula_1" }),
      ])
    );
    expect(r).toEqual({ kind: "ambigua", candidateIds: ["A2", "C2"], signal: "aula" });
  });

  it("nada compatible → ninguna", () => {
    expect(matchRecording(input({}, [clase("A1", "2026-09-20T21:30:00Z", { roomId: "aula_1" })]))).toEqual({
      kind: "ninguna",
    });
  });
});

describe("invariante 4 — bordes de la ventana, inclusive", () => {
  const c = clase("A1", "2026-09-15T21:30:00Z", { meetingId: "9990000001" });
  const en = (iso: string) => matchRecording(input({ startTime: new Date(iso) }, [c])).kind;

  it("justo 30 min antes entra; 1 ms antes no", () => {
    expect(en("2026-09-15T21:00:00.000Z")).toBe("unica");
    expect(en("2026-09-15T20:59:59.999Z")).toBe("ninguna");
  });
  it("justo al fin entra; 1 ms después no", () => {
    expect(en("2026-09-16T00:30:00.000Z")).toBe("unica");
    expect(en("2026-09-16T00:30:00.001Z")).toBe("ninguna");
  });
  it("sin end_time, el fin supuesto es inicio + 180 min", () => {
    const sinFin = { ...c, endsAt: null };
    const k = (iso: string) => matchRecording(input({ startTime: new Date(iso) }, [sinFin])).kind;
    expect(k("2026-09-16T00:30:00.000Z")).toBe("unica");
    expect(k("2026-09-16T00:30:00.001Z")).toBe("ninguna");
  });

  it.each([
    ["America/Santiago", new Date("2026-09-06T00:00:00Z")], // semana del cambio de hora en Chile
    [MVD, new Date("2026-09-08T00:00:00Z")],
  ])("%s — con instantes de classInstant, una grabación 4 min después cae en su clase", (tz, dia) => {
    const startsAt = classInstant(dia, "18:30", tz)!;
    const endsAt = classInstant(dia, "21:30", tz)!;
    const cl = { ...clase("Z1", startsAt.toISOString(), { meetingId: "9990000001" }), endsAt };
    const r = matchRecording(input({ startTime: new Date(startsAt.getTime() + 4 * 60_000) }, [cl]));
    expect(r).toEqual({ kind: "unica", classSessionId: "Z1", signal: "reunion" });
    // Una hora corrida (el bug del cambio de hora) también tendría que caer: la
    // tolerancia es de 30 min antes, así que +60 min no puede ser "antes".
    expect(matchRecording(input({ startTime: new Date(startsAt.getTime() - 61 * 60_000) }, [cl])).kind).toBe("ninguna");
  });
});

describe("invariante 5 — determinismo", () => {
  it("el orden de las clases no cambia el resultado ni el orden de candidatas", () => {
    const cs = [
      clase("C2", "2026-09-15T21:30:00Z", { roomId: "aula_1" }),
      clase("A2", "2026-09-15T21:30:00Z", { roomId: "aula_1" }),
      clase("Z9", "2026-09-15T21:30:00Z", { roomId: "aula_2" }),
    ];
    const r1 = matchRecording(input({ meetingId: "1110000001" }, cs));
    const r2 = matchRecording(input({ meetingId: "1110000001" }, [...cs].reverse()));
    expect(r1).toEqual(r2);
    expect(r1).toEqual({ kind: "ambigua", candidateIds: ["A2", "C2"], signal: "aula" });
  });
});

describe("cargador — qué llega al matcher", () => {
  const base = {
    cohortId: "coh_A",
    date: new Date("2026-09-15T00:00:00Z"),
    startTime: "18:30" as string | null,
    endTime: "21:30" as string | null,
    canceledAt: null as Date | null,
    classMeetingUrl: null as string | null,
    cohortMeetingUrl: "https://zoom.us/j/9990000001?pwd=x" as string | null,
    classRoomId: null as string | null,
    cohortRoomId: "aula_1" as string | null,
  };

  it("canceladas y sin horario no se cargan; instantes vía classInstant", () => {
    const out = toMatchableClasses(
      [
        { id: "ok", ...base },
        { id: "cancelada", ...base, canceledAt: new Date() },
        { id: "sin_hora", ...base, startTime: null },
      ],
      MVD
    );
    expect(out.map((c) => c.classSessionId)).toEqual(["ok"]);
    expect(out[0]!.startsAt).toEqual(classInstant(base.date, "18:30", MVD));
    expect(out[0]!.endsAt).toEqual(classInstant(base.date, "21:30", MVD));
  });

  it("aula efectiva = clase → cohorte; reunión efectiva = clase → cohorte, por número", () => {
    const [heredada, propia] = toMatchableClasses(
      [
        { id: "h", ...base },
        { id: "p", ...base, classRoomId: "aula_2", classMeetingUrl: "https://us02web.zoom.us/j/4440000004" },
      ],
      MVD
    );
    expect(heredada).toMatchObject({ roomId: "aula_1", meetingId: "9990000001" });
    expect(propia).toMatchObject({ roomId: "aula_2", meetingId: "4440000004" });
  });

  it("sin end_time, endsAt queda null (el matcher usa el fin supuesto)", () => {
    const [c] = toMatchableClasses([{ id: "x", ...base, endTime: null }], MVD);
    expect(c!.endsAt).toBeNull();
  });

  it("aulas: PMI desde la URL del aula", () => {
    expect(
      toMatchableRooms([
        { id: "aula_1", url: "https://zoom.us/j/1110000001", zoomConnectionId: "zc_1", zoomUserId: "u1" },
        { id: "aula_v", url: "https://zoom.us/my/academia", zoomConnectionId: "zc_1", zoomUserId: "u3" },
      ])
    ).toEqual([
      { roomId: "aula_1", zoomConnectionId: "zc_1", zoomUserId: "u1", pmiMeetingId: "1110000001" },
      { roomId: "aula_v", zoomConnectionId: "zc_1", zoomUserId: "u3", pmiMeetingId: null },
    ]);
  });
});
