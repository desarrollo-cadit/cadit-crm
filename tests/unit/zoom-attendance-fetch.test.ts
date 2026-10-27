import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZoomError, type ZoomParticipantSegment, type ZoomPastMeeting } from "@/lib/zoom";
import {
  procesarCola,
  traerAsistenciaDeClase,
  type AttendanceFetchDeps,
  type AttendanceFetchStore,
  type ClaseParaTraer,
  type ResultadoDeTraida,
} from "@/server/zoom/attendance-fetch";

/**
 * "Traer de Zoom" (constitución 1.9.0) con almacenamiento y Zoom en memoria:
 * cómo se ubica la instancia, qué se guarda, cómo se reintenta, y que un
 * fallo jamás toca la asistencia.
 */

const AHORA = new Date("2026-10-21T12:00:00Z");
const INICIO = new Date("2026-10-20T21:00:00Z");
const FIN = new Date("2026-10-20T23:00:00Z");

function clase(extra: Partial<ClaseParaTraer> = {}): ClaseParaTraer {
  return {
    classSessionId: "cs_1",
    timeZone: "America/Montevideo",
    startsAt: INICIO,
    endsAt: FIN,
    canceled: false,
    meetingId: "5551234567",
    room: { zoomConnectionId: "zc_1", zoomUserId: "zu_aula1" },
    recording: null,
    connectionIds: ["zc_1"],
    fetch: null,
    ...extra,
  };
}

const segmento = (name: string, dur = 3600): ZoomParticipantSegment => ({
  participantId: `p-${name}`,
  participantUserId: null,
  registrantId: null,
  name,
  email: null,
  joinTime: INICIO,
  leaveTime: new Date(INICIO.getTime() + dur * 1000),
  durationSec: dur,
  breakout: false,
  waitingRoom: false,
});

const reunion = (uuid: string | null, hhmm: string, id = "5551234567"): ZoomPastMeeting => ({
  uuid,
  meetingId: id,
  topic: null,
  startTime: new Date(`2026-10-20T${hhmm}:00Z`),
  endTime: null,
  durationMin: 120,
});

let clases: Map<string, ClaseParaTraer>;
let guardados: { classId: string; r: ResultadoDeTraida }[];
let cola: string[];
let conMarcas: Set<string>;
let descartadas: string[];
let leaseLibre: boolean;
let liberado: number;

const zoom = {
  listMeetingParticipants: vi.fn(async (): Promise<ZoomParticipantSegment[]> => [segmento("Ana Pérez")]),
  listUserPastMeetings: vi.fn(async (): Promise<ZoomPastMeeting[]> => [reunion("inst-1", "20:58")]),
  listPastInstances: vi.fn(async () => [{ uuid: "inst-x", startTime: new Date("2026-10-20T21:01:00Z") }]),
};

const store: AttendanceFetchStore = {
  clase: async (_o, id) => clases.get(id) ?? null,
  guardar: async (_o, classId, r) => {
    guardados.push({ classId, r });
  },
  marcarPendiente: async () => "ok",
  encolar: async () => ({ encoladas: 0, fueraDePlazo: 0 }),
  pendientes: async (_o, _n, limit) => cola.splice(0, limit),
  tieneMarcas: async (_o, id) => conMarcas.has(id),
  descartar: async (_o, id) => {
    descartadas.push(id);
  },
  purgar: async () => 0,
};

const sleeps: number[] = [];
const deps = (): AttendanceFetchDeps => ({
  store,
  lease: {
    acquire: async () => (leaseLibre ? { ok: true, startedAt: AHORA } : { ok: false, startedAt: AHORA }),
    renew: async () => undefined,
    release: async () => {
      liberado++;
    },
  },
  zoom,
  credentials: async (_o, connectionId) => ({ connectionId, accountId: "a", clientId: "c", clientSecret: "s" }),
  now: () => AHORA,
  sleep: async (ms) => {
    sleeps.push(ms);
  },
  owner: "test",
  config: { beforeMin: 30, afterFallbackMin: 180, delayMin: 30, rawDays: 180, batch: 2, pauseMs: 1000 },
});

beforeEach(() => {
  clases = new Map([["cs_1", clase()]]);
  guardados = [];
  cola = [];
  conMarcas = new Set();
  descartadas = [];
  leaseLibre = true;
  liberado = 0;
  sleeps.length = 0;
  zoom.listMeetingParticipants.mockClear();
  zoom.listUserPastMeetings.mockClear();
  zoom.listPastInstances.mockClear();
  zoom.listMeetingParticipants.mockImplementation(async () => [segmento("Ana Pérez")]);
  zoom.listUserPastMeetings.mockImplementation(async () => [reunion("inst-1", "20:58")]);
  zoom.listPastInstances.mockImplementation(async () => [
    { uuid: "inst-x", startTime: new Date("2026-10-20T21:01:00Z") },
  ]);
});

const ultimo = () => guardados.at(-1)!.r;

describe("ubicar la instancia", () => {
  it("1. la grabación adjudicada trae el UUID: ni se mira el reporte de reuniones", async () => {
    clases.set("cs_1", clase({ recording: { uuid: "/rec==", zoomConnectionId: "zc_2", meetingId: "999" } }));
    expect(await traerAsistenciaDeClase("org", "cs_1", {}, deps())).toEqual({ ok: true, status: "lista" });
    expect(zoom.listUserPastMeetings).not.toHaveBeenCalled();
    expect(zoom.listMeetingParticipants).toHaveBeenCalledWith(expect.objectContaining({ connectionId: "zc_2" }), "/rec==");
    expect(ultimo()).toMatchObject({ status: "lista", instanceSource: "grabacion", zoomMeetingUuid: "/rec==", segmentos: [expect.anything()] });
  });

  it("2. el aula vinculada: reporte de reuniones del usuario en el horario", async () => {
    await traerAsistenciaDeClase("org", "cs_1", {}, deps());
    expect(zoom.listUserPastMeetings).toHaveBeenCalledWith(expect.anything(), "zu_aula1", { from: "2026-10-19", to: "2026-10-21" });
    expect(ultimo()).toMatchObject({ status: "lista", instanceSource: "reporte_usuario", zoomMeetingUuid: "inst-1" });
  });

  it("3. [U] el reporte sin uuid cae a las instancias del número", async () => {
    zoom.listUserPastMeetings.mockImplementation(async () => [reunion(null, "20:58")]);
    await traerAsistenciaDeClase("org", "cs_1", {}, deps());
    expect(zoom.listPastInstances).toHaveBeenCalledWith(expect.anything(), "5551234567");
    expect(ultimo()).toMatchObject({ status: "lista", instanceSource: "instancias", zoomMeetingUuid: "inst-x" });
  });

  it("3b. [U] sin el permiso del reporte de reuniones, también por instancias", async () => {
    zoom.listUserPastMeetings.mockImplementation(async () => {
      throw new ZoomError("sin_permiso", "x");
    });
    await traerAsistenciaDeClase("org", "cs_1", {}, deps());
    expect(ultimo()).toMatchObject({ status: "lista", instanceSource: "instancias" });
  });

  it("dos reuniones en el horario → ambigua con candidatas; elegir una la trae", async () => {
    zoom.listUserPastMeetings.mockImplementation(async () => [reunion("a", "21:00"), reunion("b", "21:25")]);
    await traerAsistenciaDeClase("org", "cs_1", {}, deps());
    expect(ultimo()).toMatchObject({ status: "ambigua", zoomConnectionId: "zc_1" });
    expect(ultimo().candidates.map((c) => c.uuid)).toEqual(["a", "b"]);
    expect(zoom.listMeetingParticipants).not.toHaveBeenCalled();

    clases.set("cs_1", clase({ fetch: { status: "ambigua", attempts: 1, reviewedAt: null, zoomConnectionId: "zc_1", candidates: ultimo().candidates } }));
    expect(await traerAsistenciaDeClase("org", "cs_1", { uuidElegido: "b" }, deps())).toEqual({ ok: true, status: "lista" });
    expect(ultimo()).toMatchObject({ instanceSource: "manual", zoomMeetingUuid: "b" });
    expect(await traerAsistenciaDeClase("org", "cs_1", { uuidElegido: "otra" }, deps())).toEqual({ ok: false, error: "candidata_invalida" });
  });

  it("nada en el horario → sin_reunion; sin aula ni número → pide vincular", async () => {
    zoom.listUserPastMeetings.mockImplementation(async () => [reunion("a", "15:00")]);
    clases.set("cs_1", clase({ meetingId: null }));
    await traerAsistenciaDeClase("org", "cs_1", {}, deps());
    expect(ultimo()).toMatchObject({ status: "sin_reunion", errorMessage: expect.stringContaining("No hubo reunión") });

    clases.set("cs_1", clase({ room: null, meetingId: null }));
    await traerAsistenciaDeClase("org", "cs_1", {}, deps());
    expect(ultimo().errorMessage).toContain("Vinculá el aula a Zoom o cargá el enlace de la reunión");
  });
});

describe("fallos: estado con mensaje propio y reintentos", () => {
  it("todavía no está en Zoom → no_lista, reintenta a los 30 min; al 4.º intento deja de reintentar", async () => {
    zoom.listMeetingParticipants.mockImplementation(async () => {
      throw new ZoomError("no_terminada", "Zoom todavía no tiene el reporte");
    });
    await traerAsistenciaDeClase("org", "cs_1", {}, deps());
    expect(ultimo()).toMatchObject({ status: "no_lista", attempts: 1, nextAttemptAt: new Date(AHORA.getTime() + 30 * 60_000) });

    clases.set("cs_1", clase({ fetch: { status: "no_lista", attempts: 4, reviewedAt: null, zoomConnectionId: "zc_1", candidates: [] } }));
    await traerAsistenciaDeClase("org", "cs_1", {}, deps());
    expect(ultimo()).toMatchObject({ status: "no_lista", attempts: 5, nextAttemptAt: null });
  });

  it("reporte con todas las duraciones en 0 = todavía procesando", async () => {
    zoom.listMeetingParticipants.mockImplementation(async () => [segmento("Ana", 0)]);
    await traerAsistenciaDeClase("org", "cs_1", {}, deps());
    expect(ultimo().status).toBe("no_lista");
  });

  it("sin permiso → sin_permiso, sin reintento, con el mensaje del adaptador", async () => {
    zoom.listMeetingParticipants.mockImplementation(async () => {
      throw new ZoomError("sin_permiso", "Faltan permisos: report:read:list_meeting_participants:admin");
    });
    await traerAsistenciaDeClase("org", "cs_1", {}, deps());
    expect(ultimo()).toMatchObject({ status: "sin_permiso", nextAttemptAt: null, errorMessage: expect.stringContaining("report:read") });
  });

  it("un error inesperado no lanza: queda en error y se reintenta", async () => {
    zoom.listMeetingParticipants.mockImplementation(async () => {
      throw new Error("boom");
    });
    expect(await traerAsistenciaDeClase("org", "cs_1", {}, deps())).toEqual({ ok: true, status: "error" });
    expect(ultimo()).toMatchObject({ errorCode: "interno", errorMessage: "Error inesperado al leer Zoom." });
    expect(ultimo().nextAttemptAt).not.toBeNull();
  });

  it("más de un año atrás → fuera de plazo SIN llamar a Zoom", async () => {
    clases.set("cs_1", clase({ startsAt: new Date("2025-09-01T21:00:00Z"), endsAt: new Date("2025-09-01T23:00:00Z") }));
    await traerAsistenciaDeClase("org", "cs_1", {}, deps());
    expect(ultimo().status).toBe("fuera_de_plazo");
    expect(zoom.listUserPastMeetings).not.toHaveBeenCalled();
    expect(zoom.listMeetingParticipants).not.toHaveBeenCalled();
  });

  it("clase que no terminó, cancelada o ya confirmada: no se trae", async () => {
    clases.set("cs_1", clase({ startsAt: new Date("2026-10-21T11:00:00Z"), endsAt: new Date("2026-10-21T13:00:00Z") }));
    expect(await traerAsistenciaDeClase("org", "cs_1", {}, deps())).toEqual({ ok: false, error: "no_termino" });
    clases.set("cs_1", clase({ canceled: true }));
    expect(await traerAsistenciaDeClase("org", "cs_1", {}, deps())).toEqual({ ok: false, error: "cancelada" });
    clases.set("cs_1", clase({ fetch: { status: "lista", attempts: 1, reviewedAt: AHORA, zoomConnectionId: "zc_1", candidates: [] } }));
    expect(await traerAsistenciaDeClase("org", "cs_1", {}, deps())).toEqual({ ok: false, error: "ya_confirmada" });
    expect(guardados).toEqual([]);
  });
});

describe("la cola", () => {
  it("con el lease tomado (sincronización o botón) no corre", async () => {
    leaseLibre = false;
    expect(await procesarCola("org", { max: 10, encolar: true }, deps())).toMatchObject({ ok: false, error: "en_curso" });
  });

  it("procesa de a una con pausa, saca las que ya tienen asistencia y libera el lease", async () => {
    clases.set("cs_2", clase({ classSessionId: "cs_2" }));
    clases.set("cs_3", clase({ classSessionId: "cs_3" }));
    cola = ["cs_1", "cs_2", "cs_3"];
    conMarcas.add("cs_2");
    const r = await procesarCola("org", { max: 10, encolar: true }, deps());
    expect(r).toMatchObject({ ok: true, procesadas: 2 });
    expect(descartadas).toEqual(["cs_2"]);
    expect(guardados.map((g) => g.classId)).toEqual(["cs_1", "cs_3"]);
    expect(sleeps).toEqual([1000, 1000]);
    expect(liberado).toBe(1);
  });

  it("respeta el máximo por pasada", async () => {
    clases.set("cs_2", clase({ classSessionId: "cs_2" }));
    cola = ["cs_1", "cs_2"];
    expect(await procesarCola("org", { max: 1, encolar: false }, deps())).toMatchObject({ procesadas: 1 });
  });
});

describe("guardas estructurales", () => {
  const src = readFileSync(join(process.cwd(), "src/server/zoom/attendance-fetch.ts"), "utf8");

  it("traer de Zoom jamás escribe asistencia", () => {
    expect(src).not.toMatch(/insert\(schema\.attendance\)|update\(schema\.attendance\)|delete\(schema\.attendance\)/);
    expect(src).not.toContain("markAttendance");
  });

  it("no habla con Zoom por fuera del adaptador", () => {
    expect(src).not.toMatch(/fetch\(|api\.zoom\.us/);
  });
});
