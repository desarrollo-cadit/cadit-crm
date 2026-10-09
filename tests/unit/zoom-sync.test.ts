import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZoomError, type ZoomRecordingMeeting } from "@/lib/zoom/types";
import type { LeaseStore, RecordingUpsert, SyncDeps, SyncStore } from "@/server/zoom/sync";

/**
 * 030 US1 (DV-004, DV-012, DV-013) — La sincronización.
 *
 * Con almacenamiento y Zoom inyectados: lo que se fija es la DECISIÓN —qué
 * ventana se pide, qué se guarda, cuándo avanza `synced_through`, qué pasa
 * con un aula que falla— y que la corrida jamás lance hacia quien la disparó.
 */

vi.mock("@/lib/env", () => ({
  getEnv: () => ({ ENCRYPTION_KEY: Buffer.alloc(32, 5).toString("base64") }),
}));

const ORG = "org_1";
const HOY = new Date("2026-10-09T15:00:00Z");

type Conn = { id: string; name: string; syncedThrough: string | null };
type Room = { id: string; name: string; zoomUserId: string };

let conns: Conn[];
let roomsBy: Record<string, Room[]>;
let upserts: { rows: RecordingUpsert[]; seenAt: Date }[];
let missing: unknown[];
let runs: Map<string, Record<string, unknown>>;
let syncedThrough: Record<string, string>;
let lastSync: Record<string, Date>;
let pruned: unknown[];
let leaseHeld: { owner: string; startedAt: Date } | null;
let released: string[];
let calls: { userId: string; range: { from: string; to: string } }[];
let recordingsBy: Record<string, ZoomRecordingMeeting[][] | Error>;

const store: SyncStore = {
  async activeConnections(_org, connectionId) {
    return conns.filter((c) => !connectionId || c.id === connectionId);
  },
  async linkedActiveRooms(_org, connectionId) {
    return roomsBy[connectionId] ?? [];
  },
  async createRun(_org, run) {
    const id = `zsr_${runs.size + 1}`;
    runs.set(id, { ...run, status: "corriendo" });
    return id;
  },
  async upsertRecordings(_org, rows, seenAt) {
    upserts.push({ rows, seenAt });
    return rows.length;
  },
  async markMissing(_org, args) {
    missing.push(args);
  },
  async finishRun(_org, runId, result) {
    Object.assign(runs.get(runId)!, result);
  },
  async setSyncedThrough(_org, connectionId, day) {
    syncedThrough[connectionId] = day;
  },
  async touchLastSync(_org, connectionId, at) {
    lastSync[connectionId] = at;
  },
  async pruneRuns(_org, connectionId, keep) {
    pruned.push({ connectionId, keep });
  },
};

const lease: LeaseStore = {
  async acquire(_org, owner) {
    if (leaseHeld) return { ok: false, startedAt: leaseHeld.startedAt };
    leaseHeld = { owner, startedAt: HOY };
    return { ok: true, startedAt: HOY };
  },
  async renew() {},
  async release(_org, owner) {
    released.push(owner);
    if (leaseHeld?.owner === owner) leaseHeld = null;
  },
};

function meeting(uuid: string, extra: Partial<ZoomRecordingMeeting> = {}): ZoomRecordingMeeting {
  return {
    uuid,
    meetingId: "9990000001",
    hostId: "u1",
    hostEmail: "z1@x",
    topic: "Clase",
    startTime: new Date("2026-10-01T21:30:00Z"),
    durationMin: 120,
    totalSizeBytes: 1000,
    fileCount: 2,
    shareUrl: `https://zoom.us/rec/share/${uuid}`,
    playPasscode: null,
    password: null,
    autoDeleteDate: null,
    ...extra,
  };
}

const deps = (): SyncDeps => ({
  store,
  lease,
  zoom: {
    async *listUserRecordings(_creds, userId, range) {
      calls.push({ userId, range });
      const pages = recordingsBy[userId] ?? [];
      if (pages instanceof Error) throw pages;
      for (const p of pages) yield p;
    },
  },
  credentials: async (_org, connectionId) => ({
    connectionId,
    accountId: "acc",
    clientId: "cli",
    clientSecret: "secreto-largo",
  }),
  now: () => HOY,
  owner: "test:1",
  config: { backfillDays: 90, overlapDays: 3 },
});

beforeEach(() => {
  conns = [{ id: "zc_1", name: "Zoom academia", syncedThrough: null }];
  roomsBy = { zc_1: [{ id: "aula_1", name: "Zoom 1", zoomUserId: "u1" }, { id: "aula_2", name: "Zoom 2", zoomUserId: "u2" }] };
  upserts = [];
  missing = [];
  runs = new Map();
  syncedThrough = {};
  lastSync = {};
  pruned = [];
  leaseHeld = null;
  released = [];
  calls = [];
  recordingsBy = { u1: [[meeting("a")], [meeting("b")]], u2: [[meeting("c", { hostId: "u2" })]] };
});

describe("ventana de recuperación", () => {
  it("primera corrida: hoy − BACKFILL − OVERLAP … hoy (UTC, día)", async () => {
    const { syncWindow } = await import("@/server/zoom/sync");
    expect(syncWindow(null, HOY, { backfillDays: 90, overlapDays: 3 })).toEqual({
      from: "2026-07-08",
      to: "2026-10-09",
    });
  });
  it("con synced_through: synced_through − OVERLAP … hoy", async () => {
    const { syncWindow } = await import("@/server/zoom/sync");
    expect(syncWindow("2026-10-05", HOY, { backfillDays: 90, overlapDays: 3 })).toEqual({
      from: "2026-10-02",
      to: "2026-10-09",
    });
  });
});

describe("lease y arranque", () => {
  it("sin conexiones activas → sin_conexiones, sin tomar el lease", async () => {
    conns = [];
    const { startSync } = await import("@/server/zoom/sync");
    expect(await startSync(ORG, "manual", {}, deps())).toEqual({ ok: false, error: "sin_conexiones" });
    expect(leaseHeld).toBeNull();
  });

  it("con lease vigente → sync_en_curso con desde cuándo, sin crear corridas", async () => {
    leaseHeld = { owner: "otro", startedAt: new Date("2026-10-09T14:58:00Z") };
    const { startSync } = await import("@/server/zoom/sync");
    expect(await startSync(ORG, "manual", {}, deps())).toEqual({
      ok: false,
      error: "sync_en_curso",
      startedAt: new Date("2026-10-09T14:58:00Z"),
    });
    expect(runs.size).toBe(0);
  });

  it("toma el lease, crea una corrida 'corriendo' por conexión y al terminar lo libera", async () => {
    conns.push({ id: "zc_2", name: "Cuenta 2", syncedThrough: "2026-10-05" });
    const { runSync } = await import("@/server/zoom/sync");
    const r = await runSync(ORG, "manual", { userId: "usr_1" }, deps());
    expect(r.ok).toBe(true);
    expect([...runs.values()].map((x) => [x.connectionId, x.windowFrom, x.windowTo, x.triggeredBy])).toEqual([
      ["zc_1", "2026-07-08", "2026-10-09", "usr_1"],
      ["zc_2", "2026-10-02", "2026-10-09", "usr_1"],
    ]);
    expect(released).toEqual(["test:1"]);
    expect(leaseHeld).toBeNull();
  });

  it("connectionId acota a esa conexión", async () => {
    conns.push({ id: "zc_2", name: "Cuenta 2", syncedThrough: null });
    const { runSync } = await import("@/server/zoom/sync");
    await runSync(ORG, "manual", { connectionId: "zc_2" }, deps());
    expect([...runs.values()].map((x) => x.connectionId)).toEqual(["zc_2"]);
  });
});

describe("corrida", () => {
  it("consulta cada aula activa vinculada con la ventana y guarda por página", async () => {
    const { runSync } = await import("@/server/zoom/sync");
    await runSync(ORG, "manual", {}, deps());
    expect(calls).toEqual([
      { userId: "u1", range: { from: "2026-07-08", to: "2026-10-09" } },
      { userId: "u2", range: { from: "2026-07-08", to: "2026-10-09" } },
    ]);
    // una escritura por página, no una al final
    expect(upserts.map((u) => u.rows.map((r) => r.zoomMeetingUuid))).toEqual([["a"], ["b"], ["c"]]);
    expect(upserts[0]!.rows[0]).toMatchObject({
      zoomConnectionId: "zc_1",
      virtualRoomId: "aula_1",
      zoomMeetingId: "9990000001",
      hostZoomUserId: "u1",
      playUrl: "https://zoom.us/rec/share/a",
      passcodeEmbedded: false,
    });
    const run = runs.get("zsr_1")!;
    expect(run).toMatchObject({ status: "ok", fetchedCount: 3, newCount: 3, error: null });
    expect(syncedThrough.zc_1).toBe("2026-10-09");
    expect(lastSync.zc_1).toEqual(HOY);
    expect(pruned).toEqual([{ connectionId: "zc_1", keep: 200 }]);
  });

  it("play_url y passcode cifrado salen de buildPlayUrl (DV-008)", async () => {
    recordingsBy = {
      u1: [[meeting("p", { playPasscode: "abc123" }), meeting("q", { password: "999" })]],
      u2: [],
    };
    const { runSync } = await import("@/server/zoom/sync");
    const { openPasscode } = await import("@/server/zoom/connections");
    await runSync(ORG, "manual", {}, deps());
    const [p, q] = upserts[0]!.rows;
    expect(p).toMatchObject({ playUrl: "https://zoom.us/rec/share/p?pwd=abc123", passcodeEmbedded: true });
    expect(p!.passcodeCipher).not.toContain("abc123");
    expect(openPasscode(p!)).toBe("abc123");
    expect(q).toMatchObject({ playUrl: "https://zoom.us/rec/share/q", passcodeEmbedded: false });
    expect(openPasscode(q!)).toBe("999");
  });

  it("un aula que falla deja la corrida 'parcial', las demás se procesan y synced_through no avanza", async () => {
    recordingsBy.u1 = new ZoomError("usuario_inexistente", "El usuario de Zoom no existe en esa cuenta.");
    const { runSync } = await import("@/server/zoom/sync");
    await runSync(ORG, "manual", {}, deps());
    const run = runs.get("zsr_1")!;
    expect(run.status).toBe("parcial");
    expect(String(run.error)).toContain("Zoom 1");
    expect(String(run.error)).toContain("no existe");
    expect(upserts.flatMap((u) => u.rows.map((r) => r.zoomMeetingUuid))).toEqual(["c"]);
    expect(syncedThrough.zc_1).toBeUndefined();
  });

  it("si fallan todas → 'error'; el lease se libera igual", async () => {
    recordingsBy = { u1: new ZoomError("zoom_caido", "Zoom no respondió."), u2: new ZoomError("zoom_caido", "Zoom no respondió.") };
    const { runSync } = await import("@/server/zoom/sync");
    await runSync(ORG, "manual", {}, deps());
    expect(runs.get("zsr_1")!.status).toBe("error");
    expect(syncedThrough.zc_1).toBeUndefined();
    expect(released).toEqual(["test:1"]);
  });

  it("credenciales que no abren → corrida 'error' con mensaje propio", async () => {
    const d = deps();
    d.credentials = async () => {
      throw new Error("No se pudo leer el Client Secret guardado");
    };
    const { runSync } = await import("@/server/zoom/sync");
    await runSync(ORG, "manual", {}, d);
    expect(runs.get("zsr_1")).toMatchObject({ status: "error" });
    expect(calls).toEqual([]);
  });

  it("DV-013: marca faltantes SOLO en las aulas que terminaron bien, con la ventana y el inicio de la corrida", async () => {
    recordingsBy.u2 = new ZoomError("zoom_caido", "Zoom no respondió.");
    const { runSync } = await import("@/server/zoom/sync");
    await runSync(ORG, "manual", {}, deps());
    expect(missing).toEqual([
      {
        connectionId: "zc_1",
        roomId: "aula_1",
        from: new Date("2026-07-08T00:00:00Z"),
        toExclusive: new Date("2026-10-10T00:00:00Z"),
        seenBefore: HOY,
        at: HOY,
      },
    ]);
  });

  it("sin aulas vinculadas la corrida termina 'ok' sin llamar a Zoom (Q2)", async () => {
    roomsBy = {};
    const { runSync } = await import("@/server/zoom/sync");
    await runSync(ORG, "manual", {}, deps());
    expect(calls).toEqual([]);
    expect(runs.get("zsr_1")).toMatchObject({ status: "ok", fetchedCount: 0 });
  });

  it("ninguna excepción escapa de executeSync", async () => {
    const d = deps();
    d.store = {
      ...store,
      async finishRun() {
        throw new Error("la base se cayó");
      },
    };
    const { runSync } = await import("@/server/zoom/sync");
    await expect(runSync(ORG, "manual", {}, d)).resolves.toMatchObject({ ok: true });
    expect(released).toEqual(["test:1"]);
  });

  it("afterPage recibe cada página guardada (punto de extensión para adjudicar)", async () => {
    const pages: string[][] = [];
    const d = deps();
    d.afterPage = async (_org, rows) => {
      pages.push(rows.map((r) => r.zoomMeetingUuid));
    };
    const { runSync } = await import("@/server/zoom/sync");
    await runSync(ORG, "manual", {}, d);
    expect(pages).toEqual([["a"], ["b"], ["c"]]);
  });
});
