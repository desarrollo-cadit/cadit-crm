import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZoomError, type ZoomRecordingMeeting } from "@/lib/zoom/types";
import type { LeaseStore, RecordingUpsert } from "@/server/zoom/sync";
import type { VerifyDeps, VerifyStore } from "@/server/zoom/verify";

/**
 * La verificación diaria: una pasada larga (ZOOM_VERIFY_DAYS) que vuelve a
 * listar las grabaciones para descubrir las que se borraron de Zoom DESPUÉS
 * de que la sincronización incremental las trajo.
 *
 * La regla que sostiene todo: un listado PARCIAL nunca se lee como "borrado".
 * Si cualquier página o tramo falla —o la conexión no abre— la corrida no
 * marca nada como faltante y no borra nada.
 */

vi.mock("@/lib/env", () => ({
  getEnv: () => ({ ENCRYPTION_KEY: Buffer.alloc(32, 5).toString("base64") }),
}));

const ORG = "org_1";
const HOY = new Date("2026-10-22T15:00:00Z");

type Room = { id: string; name: string; zoomUserId: string; syncedThrough: string | null };

let conns: { id: string; name: string; syncedThrough: string | null }[];
let roomsBy: Record<string, Room[]>;
let upserts: { rows: RecordingUpsert[]; seenAt: Date }[];
let touched: { connectionId: string; uuids: string[]; seenAt: Date }[];
let missing: { connectionId: string; roomId: string; from: Date; toExclusive: Date; seenBefore: Date }[];
let verified: Record<string, { at: Date; error: string | null }>;
let reconciled: string[];
let purged: { connectionId: string; purgeDays: number }[];
let leaseHeld: { owner: string } | null;
let released: string[];
let calls: { userId: string; range: { from: string; to: string } }[];
/** Por usuario de Zoom: las páginas, o un error en la página N (índice). */
let pagesBy: Record<string, { pages: ZoomRecordingMeeting[][]; failAt?: number }>;
let credsFail: boolean;
/** Por aula: cuántas conocidas en la ventana y cuántas se marcarían (lo que diría la base). */
let candidatesBy: Record<string, { known: number; wouldFlag: number }>;

const store: VerifyStore = {
  async activeConnections(_org, connectionId) {
    return conns.filter((c) => !connectionId || c.id === connectionId);
  },
  async linkedActiveRooms(_org, connectionId) {
    return roomsBy[connectionId] ?? [];
  },
  async upsertRecordings(_org, rows, seenAt) {
    upserts.push({ rows, seenAt });
    return 0;
  },
  async touchSeen(_org, connectionId, uuids, seenAt) {
    touched.push({ connectionId, uuids, seenAt });
  },
  async markMissing(_org, args) {
    missing.push(args);
  },
  async missingCandidates(_org, args) {
    return candidatesBy[args.roomId] ?? { known: 0, wouldFlag: 0 };
  },
  async setVerified(_org, connectionId, at, error) {
    verified[connectionId] = { at, error };
  },
};

const lease: LeaseStore = {
  async acquire(_org, owner) {
    if (leaseHeld) return { ok: false, startedAt: HOY };
    leaseHeld = { owner };
    return { ok: true, startedAt: HOY };
  },
  async renew() {},
  async release(_org, owner) {
    released.push(owner);
    if (leaseHeld?.owner === owner) leaseHeld = null;
  },
};

function meeting(uuid: string): ZoomRecordingMeeting {
  return {
    uuid,
    meetingId: "9990000001",
    hostId: "u1",
    hostEmail: null,
    topic: "Clase",
    startTime: new Date("2026-06-01T21:30:00Z"),
    durationMin: 120,
    totalSizeBytes: 1000,
    fileCount: 2,
    shareUrl: `https://zoom.us/rec/share/${uuid}`,
    playPasscode: null,
    password: null,
    autoDeleteDate: null,
    fileTypes: ["MP4"],
  };
}

const deps = (): VerifyDeps => ({
  store,
  lease,
  zoom: {
    async *listUserRecordings(_creds, userId, range) {
      calls.push({ userId, range });
      const spec = pagesBy[userId] ?? { pages: [] };
      for (let i = 0; i < spec.pages.length; i++) {
        if (spec.failAt === i) throw new ZoomError("limite_de_tasa", "Zoom limitó la cantidad de pedidos.");
        yield spec.pages[i]!;
      }
      if (spec.failAt !== undefined && spec.failAt >= spec.pages.length) {
        throw new ZoomError("zoom_caido", "Zoom no respondió después de varios intentos.");
      }
    },
  },
  credentials: async (_org, connectionId) => {
    if (credsFail) throw new ZoomError("credenciales_invalidas", "Zoom rechazó las credenciales.");
    return { connectionId, accountId: "acc", clientId: "cli", clientSecret: "secreto-largo" };
  },
  now: () => HOY,
  owner: "test:verify",
  config: { verifyDays: 180, purgeDays: 30 },
  reconcile: async (_org, connectionId) => {
    reconciled.push(connectionId);
  },
  purge: async (_org, connectionId, purgeDays) => {
    purged.push({ connectionId, purgeDays });
    return 0;
  },
});

beforeEach(() => {
  conns = [{ id: "zc_1", name: "Zoom academia", syncedThrough: "2026-10-21" }];
  roomsBy = {
    zc_1: [
      { id: "aula_1", name: "Zoom 1", zoomUserId: "u1", syncedThrough: "2026-10-21" },
      { id: "aula_2", name: "Zoom 2", zoomUserId: "u2", syncedThrough: "2026-10-21" },
    ],
  };
  upserts = [];
  touched = [];
  missing = [];
  verified = {};
  reconciled = [];
  purged = [];
  leaseHeld = null;
  released = [];
  calls = [];
  pagesBy = {
    u1: { pages: [[meeting("a")], [meeting("b")]] },
    u2: { pages: [[meeting("c")]] },
  };
  credsFail = false;
  candidatesBy = {};
});

describe("la ventana y sus tramos", () => {
  it("180 días se piden en tramos contiguos de a lo sumo 30 días (lo que acepta Zoom)", async () => {
    const { recordingRangeChunks } = await import("@/lib/zoom");
    const tramos = recordingRangeChunks("2026-04-25", "2026-10-22");
    expect(tramos[0]!.from).toBe("2026-04-25");
    expect(tramos.at(-1)!.to).toBe("2026-10-22");
    const DIA = 86_400_000;
    for (let i = 0; i < tramos.length; i++) {
      const t = tramos[i]!;
      const dias = (Date.parse(t.to) - Date.parse(t.from)) / DIA + 1;
      expect(dias).toBeGreaterThan(0);
      expect(dias).toBeLessThanOrEqual(30);
      // Sin huecos ni solapes: cada tramo empieza el día siguiente al anterior.
      if (i > 0) expect(Date.parse(t.from) - Date.parse(tramos[i - 1]!.to)).toBe(DIA);
    }
    expect(tramos).toHaveLength(7);
  });

  it("verifyWindow: pide [hoy − N, hoy] y marca con un día de margen en el borde viejo", async () => {
    const { verifyWindow } = await import("@/server/zoom/verify");
    const w = verifyWindow(HOY, 180);
    expect(w.fetch).toEqual({ from: "2026-04-25", to: "2026-10-22" });
    // El borde viejo depende de la zona horaria con la que Zoom corta los
    // días: lo que cae en ese día no se da por borrado.
    expect(w.mark.from.toISOString()).toBe("2026-04-26T00:00:00.000Z");
    expect(w.mark.toExclusive.toISOString()).toBe("2026-10-23T00:00:00.000Z");
  });
});

describe("corrida completa", () => {
  it("lista cada aula en la ventana larga, guarda lo visto y recién al final marca, reconcilia y purga", async () => {
    const { runVerify } = await import("@/server/zoom/verify");
    const r = await runVerify(ORG, {}, deps());
    expect(r).toMatchObject({ ok: true });

    expect(calls).toEqual([
      { userId: "u1", range: { from: "2026-04-25", to: "2026-10-22" } },
      { userId: "u2", range: { from: "2026-04-25", to: "2026-10-22" } },
    ]);
    // Lo visto se guarda con la MISMA marca de inicio que después decide quién faltó.
    expect(upserts.flatMap((u) => u.rows.map((x) => x.zoomMeetingUuid))).toEqual(["a", "b", "c"]);
    expect(new Set(upserts.map((u) => u.seenAt.getTime()))).toEqual(new Set([HOY.getTime()]));

    expect(missing.map((m) => m.roomId)).toEqual(["aula_1", "aula_2"]);
    expect(missing[0]).toMatchObject({
      connectionId: "zc_1",
      from: new Date("2026-04-26T00:00:00Z"),
      toExclusive: new Date("2026-10-23T00:00:00Z"),
      seenBefore: HOY,
    });
    expect(reconciled).toEqual(["zc_1"]);
    expect(purged).toEqual([{ connectionId: "zc_1", purgeDays: 30 }]);
    expect(verified.zc_1).toEqual({ at: HOY, error: null });
    expect(released).toEqual(["test:verify"]);
  });
});

describe("un listado parcial NUNCA se lee como borrado", () => {
  it("falla una página a mitad de un aula → no marca nada ni purga, en NINGUNA aula", async () => {
    pagesBy.u1 = { pages: [[meeting("a")], [meeting("b")]], failAt: 1 };
    const { runVerify } = await import("@/server/zoom/verify");
    await runVerify(ORG, {}, deps());

    expect(missing).toEqual([]);
    expect(purged).toEqual([]);
    expect(verified.zc_1!.error).toMatch(/Zoom 1/);
    // Lo que sí se vio se guarda: es información positiva (aparece = existe).
    expect(upserts.flatMap((u) => u.rows.map((x) => x.zoomMeetingUuid))).toEqual(["a", "c"]);
    expect(released).toEqual(["test:verify"]);
  });

  it("falla el último aula al terminar de paginar → tampoco marca nada", async () => {
    pagesBy.u2 = { pages: [[meeting("c")]], failAt: 1 };
    const { runVerify } = await import("@/server/zoom/verify");
    await runVerify(ORG, {}, deps());
    expect(missing).toEqual([]);
    expect(purged).toEqual([]);
  });

  it("falla una conexión de dos → la otra tampoco marca (la corrida entera es todo o nada)", async () => {
    conns.push({ id: "zc_2", name: "Zoom 2", syncedThrough: null });
    roomsBy.zc_2 = [{ id: "aula_3", name: "Zoom 3", zoomUserId: "u3", syncedThrough: null }];
    pagesBy.u3 = { pages: [], failAt: 0 };
    const { runVerify } = await import("@/server/zoom/verify");
    await runVerify(ORG, {}, deps());
    expect(missing).toEqual([]);
    expect(purged).toEqual([]);
    expect(verified.zc_1!.error).not.toBeNull();
    expect(verified.zc_2!.error).toMatch(/Zoom 3/);
  });

  it("credenciales inválidas → nada marcado, nada purgado, y la corrida no lanza", async () => {
    credsFail = true;
    const { runVerify } = await import("@/server/zoom/verify");
    await expect(runVerify(ORG, {}, deps())).resolves.toMatchObject({ ok: true });
    expect(calls).toEqual([]);
    expect(missing).toEqual([]);
    expect(purged).toEqual([]);
    expect(verified.zc_1!.error).toMatch(/credenciales/);
    expect(released).toEqual(["test:verify"]);
  });

  it("un error inesperado de la base al marcar no se escapa y libera el lease", async () => {
    const d = deps();
    d.store = { ...store, markMissing: async () => Promise.reject(new Error("db caída")) };
    const { runVerify } = await import("@/server/zoom/verify");
    await expect(runVerify(ORG, {}, d)).resolves.toMatchObject({ ok: true });
    expect(purged).toEqual([]);
    expect(released).toEqual(["test:verify"]);
  });
});

describe("arranque", () => {
  it("con el lease tomado (sincronización o verificación corriendo) → sync_en_curso sin tocar nada", async () => {
    leaseHeld = { owner: "otro" };
    const { startVerify } = await import("@/server/zoom/verify");
    const r = await startVerify(ORG, {}, deps());
    expect(r).toMatchObject({ ok: false, error: "sync_en_curso" });
    expect(calls).toEqual([]);
    expect(verified).toEqual({});
  });

  it("sin conexiones o sin aulas no hay corrida", async () => {
    const { startVerify } = await import("@/server/zoom/verify");
    roomsBy = {};
    expect(await startVerify(ORG, {}, deps())).toEqual({ ok: false, error: "sin_aulas" });
    conns = [];
    expect(await startVerify(ORG, {}, deps())).toEqual({ ok: false, error: "sin_conexiones" });
    expect(leaseHeld).toBeNull();
  });
});

describe("cuándo toca verificar (una vez por día)", () => {
  it("nunca verificada o hace más de un día → toca; hace menos → no", async () => {
    const { verifyDue } = await import("@/server/zoom/verify");
    expect(verifyDue(null, HOY)).toBe(true);
    expect(verifyDue(new Date(HOY.getTime() - 25 * 3_600_000), HOY)).toBe(true);
    expect(verifyDue(new Date(HOY.getTime() - 23 * 3_600_000), HOY)).toBe(false);
  });
});

describe("freno de borrado masivo", () => {
  it("umbrales puros: borrar 1–2 pasa; ≥ 50 % y ≥ 5 frena; todas con ≥ 3 frena", async () => {
    const { frenoDeBorradoMasivo, FRENO_MIN_FALTANTES, FRENO_PROPORCION, FRENO_TODAS_DESDE } = await import(
      "@/lib/recording-purge"
    );
    expect([FRENO_MIN_FALTANTES, FRENO_PROPORCION, FRENO_TODAS_DESDE]).toEqual([5, 0.5, 3]);
    // Borrado normal.
    expect(frenoDeBorradoMasivo({ known: 40, wouldFlag: 1 })).toBe(false);
    expect(frenoDeBorradoMasivo({ known: 40, wouldFlag: 2 })).toBe(false);
    expect(frenoDeBorradoMasivo({ known: 4, wouldFlag: 2 })).toBe(false);
    expect(frenoDeBorradoMasivo({ known: 2, wouldFlag: 2 })).toBe(false);
    expect(frenoDeBorradoMasivo({ known: 0, wouldFlag: 0 })).toBe(false);
    // Muchas, pero menos de la mitad.
    expect(frenoDeBorradoMasivo({ known: 40, wouldFlag: 19 })).toBe(false);
    // Masivo.
    expect(frenoDeBorradoMasivo({ known: 10, wouldFlag: 5 })).toBe(true);
    expect(frenoDeBorradoMasivo({ known: 40, wouldFlag: 30 })).toBe(true);
    // El aula devolvió cero.
    expect(frenoDeBorradoMasivo({ known: 3, wouldFlag: 3 })).toBe(true);
  });

  it("borrado normal (1 de 40) se marca y se purga", async () => {
    candidatesBy = { aula_1: { known: 40, wouldFlag: 1 }, aula_2: { known: 10, wouldFlag: 0 } };
    const { runVerify } = await import("@/server/zoom/verify");
    await runVerify(ORG, {}, deps());
    expect(missing.map((m) => m.roomId)).toEqual(["aula_1", "aula_2"]);
    expect(purged).toEqual([{ connectionId: "zc_1", purgeDays: 30 }]);
    expect(verified.zc_1!.error).toBeNull();
  });

  it("un aula que devuelve cero frena ESA aula, deja marcar las otras y bloquea la purga de la conexión", async () => {
    pagesBy.u1 = { pages: [] };
    candidatesBy = { aula_1: { known: 12, wouldFlag: 12 }, aula_2: { known: 10, wouldFlag: 1 } };
    const { runVerify } = await import("@/server/zoom/verify");
    await runVerify(ORG, {}, deps());
    expect(missing.map((m) => m.roomId)).toEqual(["aula_2"]);
    expect(purged).toEqual([]);
    expect(verified.zc_1!.error).toBe(
      "El aula Zoom 1 devolvió 0 de 12 grabaciones: no se marcó nada; revisá la conexión o el enlace del aula."
    );
  });

  it("un aula re-vinculada a otro usuario de Zoom (vienen otras, faltan todas las conocidas) frena", async () => {
    pagesBy.u1 = { pages: [[meeting("nueva-1"), meeting("nueva-2")]] };
    candidatesBy = { aula_1: { known: 8, wouldFlag: 8 } };
    const { runVerify } = await import("@/server/zoom/verify");
    await runVerify(ORG, {}, deps());
    expect(missing.map((m) => m.roomId)).toEqual(["aula_2"]);
    expect(purged).toEqual([]);
    expect(verified.zc_1!.error).toMatch(/Zoom 1 devolvió 0 de 8/);
  });

  it("el freno de una conexión no bloquea la purga de otra conexión sana", async () => {
    conns.push({ id: "zc_2", name: "Zoom 2", syncedThrough: null });
    roomsBy.zc_2 = [{ id: "aula_3", name: "Zoom 3", zoomUserId: "u3", syncedThrough: null }];
    pagesBy.u3 = { pages: [[meeting("d")]] };
    candidatesBy = { aula_1: { known: 6, wouldFlag: 6 }, aula_3: { known: 5, wouldFlag: 1 } };
    const { runVerify } = await import("@/server/zoom/verify");
    await runVerify(ORG, {}, deps());
    expect(purged).toEqual([{ connectionId: "zc_2", purgeDays: 30 }]);
    expect(verified.zc_2!.error).toBeNull();
  });
});

describe("grabaciones cortas (ZOOM_MIN_RECORDING_MIN)", () => {
  it("no se guardan, pero las ya guardadas se tocan como vistas: ni se marcan faltantes ni suman al freno", async () => {
    pagesBy = {
      u1: { pages: [[meeting("a"), { ...meeting("corta"), durationMin: 3 }]] },
      u2: { pages: [[{ ...meeting("solo-corta"), durationMin: 0 }]] },
    };
    const { runVerify } = await import("@/server/zoom/verify");
    const r = await runVerify(ORG, {}, { ...deps(), config: { ...deps().config, minRecordingMin: 15 } });
    expect(r).toMatchObject({ ok: true });
    expect(upserts.flatMap((u) => u.rows.map((x) => x.zoomMeetingUuid))).toEqual(["a"]);
    // Con la MISMA marca de inicio: `markMissing` y `missingCandidates` las ven como vistas.
    expect(touched).toEqual([
      { connectionId: "zc_1", uuids: ["corta"], seenAt: HOY },
      { connectionId: "zc_1", uuids: ["solo-corta"], seenAt: HOY },
    ]);
    expect(missing.map((m) => m.roomId)).toEqual(["aula_1", "aula_2"]);
  });
});
