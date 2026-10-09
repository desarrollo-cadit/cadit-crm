import { describe, expect, it, vi } from "vitest";

/**
 * 030 US1 (contrato `GET /api/recordings`) — Las piezas puras del listado:
 * filtros, rango de fechas en la zona de la academia, cursor estable y el DTO
 * de cada fila. El código de acceso se descifra SOLO cuando no viaja embebido
 * en el enlace: si ya está en `playUrl`, mandarlo aparte es repetir un dato
 * sensible sin necesidad.
 */

vi.mock("@/lib/env", () => ({
  getEnv: () => ({ ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64"), ZOOM_SYNC_INTERVAL_MIN: 60 }),
}));

describe("query", () => {
  it("página 1 de 25, más recientes primero; tamaños 25/50/100; orden asc|desc", async () => {
    const { recordingsQuerySchema } = await import("@/server/zoom/recordings");
    expect(recordingsQuerySchema.parse({})).toMatchObject({ page: 1, pageSize: 25, sort: "desc" });
    expect(recordingsQuerySchema.parse({ page: "3", pageSize: "100", sort: "asc" })).toMatchObject({
      page: 3,
      pageSize: 100,
      sort: "asc",
    });
    expect(recordingsQuerySchema.safeParse({ pageSize: "30" }).success).toBe(false);
    expect(recordingsQuerySchema.safeParse({ page: "0" }).success).toBe(false);
    expect(recordingsQuerySchema.safeParse({ sort: "random" }).success).toBe(false);
  });

  it("state admite faltante; fechas YYYY-MM-DD; nada fuera del contrato", async () => {
    const { recordingsQuerySchema } = await import("@/server/zoom/recordings");
    expect(recordingsQuerySchema.safeParse({ state: "faltante" }).success).toBe(true);
    expect(recordingsQuerySchema.safeParse({ state: "inventado" }).success).toBe(false);
    expect(recordingsQuerySchema.safeParse({ from: "2026-10-01", to: "2026-10-31" }).success).toBe(true);
    expect(recordingsQuerySchema.safeParse({ from: "01/10/2026" }).success).toBe(false);
    expect(recordingsQuerySchema.safeParse({ otra: "x" }).success).toBe(false);
  });
});

describe("rango de fechas en la zona de la academia", () => {
  it("inicio del día `from` a fin del día `to`, inclusive (Montevideo, UTC−3)", async () => {
    const { dayRange } = await import("@/server/zoom/recordings");
    expect(dayRange("2026-10-01", "2026-10-02", "America/Montevideo")).toEqual({
      gte: new Date("2026-10-01T03:00:00Z"),
      lt: new Date("2026-10-03T03:00:00Z"),
    });
  });
  it("un lado solo, o ninguno", async () => {
    const { dayRange } = await import("@/server/zoom/recordings");
    expect(dayRange(undefined, "2026-10-02", "UTC")).toEqual({ gte: null, lt: new Date("2026-10-03T00:00:00Z") });
    expect(dayRange(undefined, undefined, "UTC")).toEqual({ gte: null, lt: null });
  });
});

describe("página", () => {
  it("desplazamiento y total de páginas; una página fuera de rango cae en la última", async () => {
    const { pageWindow } = await import("@/server/zoom/recordings");
    expect(pageWindow(0, 1, 25)).toEqual({ page: 1, offset: 0, totalPages: 1 });
    expect(pageWindow(26, 2, 25)).toEqual({ page: 2, offset: 25, totalPages: 2 });
    expect(pageWindow(26, 9, 25)).toEqual({ page: 2, offset: 25, totalPages: 2 });
    expect(pageWindow(100, 4, 50)).toEqual({ page: 2, offset: 50, totalPages: 2 });
  });
});

describe("RecordingRowDto", () => {
  async function fila(extra: Record<string, unknown> = {}) {
    const { sealPasscode } = await import("@/server/zoom/connections");
    return {
      id: "zr_1",
      zoomConnectionId: "zc_1",
      connectionName: "Zoom academia",
      connectionArchivedAt: null as Date | null,
      virtualRoomId: "aula_1",
      roomName: "Zoom 1",
      hostEmail: "z1@x",
      topic: "Revit",
      startTime: new Date("2026-10-01T21:34:00Z"),
      durationMin: 118,
      playUrl: "https://zoom.us/rec/share/A",
      passcodeEmbedded: false,
      ...sealPasscode("abc123"),
      autoDeleteDate: "2026-12-30",
      fileTypes: ["MP4", "TRANSCRIPT"],
      missingInZoomAt: null as Date | null,
      assignmentMode: "auto" as const,
      assignmentState: "pendiente" as const,
      classSessionId: null as string | null,
      candidateClassIds: [] as string[],
      conflictClassSessionId: null as string | null,
      assignedBy: null as string | null,
      assignedAt: null as Date | null,
      ...extra,
    };
  }

  it("forma exacta, con el código descifrado cuando no está embebido", async () => {
    const { toRecordingRowDto } = await import("@/server/zoom/recordings");
    const dto = toRecordingRowDto(await fila(), { classes: new Map(), users: new Map() });
    expect(dto).toEqual({
      id: "zr_1",
      connection: { id: "zc_1", name: "Zoom academia", archived: false },
      room: { id: "aula_1", name: "Zoom 1" },
      hostEmail: "z1@x",
      topic: "Revit",
      startTime: "2026-10-01T21:34:00.000Z",
      durationMin: 118,
      playUrl: "https://zoom.us/rec/share/A",
      passcode: "abc123",
      passcodeEmbedded: false,
      autoDeleteDate: "2026-12-30",
      missingInZoom: false,
      fileTypes: ["MP4", "TRANSCRIPT"],
      hasTranscript: true,
      assignment: {
        mode: "auto",
        state: "pendiente",
        classSession: null,
        candidates: [],
        conflictWith: null,
        assignedBy: null,
        assignedAt: null,
      },
    });
  });

  it("con el código embebido en el enlace, el código no viaja aparte", async () => {
    const { toRecordingRowDto } = await import("@/server/zoom/recordings");
    const dto = toRecordingRowDto(
      await fila({ passcodeEmbedded: true, playUrl: "https://zoom.us/rec/share/A?pwd=abc123" }),
      { classes: new Map(), users: new Map() }
    );
    expect(dto.passcode).toBeNull();
    expect(JSON.stringify(dto)).not.toMatch(/cipher|_iv|_tag|Cipher/);
  });

  it("conexión archivada, faltante en Zoom, aula borrada, clase y quién adjudicó (por nombre)", async () => {
    const { toRecordingRowDto } = await import("@/server/zoom/recordings");
    const classes = new Map([
      [
        "cls_1",
        { id: "cls_1", number: 3, date: "2026-10-01", cohortId: "coh_1", cohortName: "Revit A", startsAt: "2026-10-01T21:30:00.000Z" },
      ],
      [
        "cls_2",
        { id: "cls_2", number: 3, date: "2026-10-01", cohortId: "coh_2", cohortName: "Revit C", startsAt: "2026-10-01T21:30:00.000Z" },
      ],
    ]);
    const dto = toRecordingRowDto(
      await fila({
        connectionArchivedAt: new Date(),
        missingInZoomAt: new Date(),
        virtualRoomId: null,
        roomName: null,
        assignmentMode: "manual",
        assignmentState: "asignada",
        classSessionId: "cls_1",
        candidateClassIds: ["cls_1", "cls_2"],
        assignedBy: "usr_1",
        assignedAt: new Date("2026-10-02T10:00:00Z"),
      }),
      { classes, users: new Map([["usr_1", "Ana Coordinadora"]]) }
    );
    expect(dto.connection.archived).toBe(true);
    expect(dto.missingInZoom).toBe(true);
    expect(dto.room).toBeNull();
    expect(dto.assignment).toEqual({
      mode: "manual",
      state: "asignada",
      classSession: { id: "cls_1", number: 3, date: "2026-10-01", cohortId: "coh_1", cohortName: "Revit A" },
      candidates: [
        { id: "cls_1", number: 3, cohortName: "Revit A", startsAt: "2026-10-01T21:30:00.000Z" },
        { id: "cls_2", number: 3, cohortName: "Revit C", startsAt: "2026-10-01T21:30:00.000Z" },
      ],
      conflictWith: null,
      assignedBy: "Ana Coordinadora",
      assignedAt: "2026-10-02T10:00:00.000Z",
    });
  });
});

describe("estado de la sincronización", () => {
  it("toSyncStatusDto arma conexiones con su última corrida y el intervalo", async () => {
    const { toSyncStatusDto } = await import("@/server/zoom/recordings");
    const dto = toSyncStatusDto({
      running: { startedAt: new Date("2026-10-09T10:42:00Z") },
      connections: [
        {
          id: "zc_1",
          name: "Zoom academia",
          status: "ok",
          lastSyncAt: null,
          syncedThrough: "2026-10-08",
          lastError: null,
          archivedAt: null,
        },
      ],
      lastRuns: new Map([
        [
          "zc_1",
          {
            status: "corriendo",
            startedAt: new Date("2026-10-09T10:42:00Z"),
            finishedAt: null,
            newCount: 0,
            assignedCount: 0,
            ambiguousCount: 0,
            conflictCount: 0,
            error: null,
          },
        ],
      ]),
      periodicIntervalMin: 0,
    });
    expect(dto).toEqual({
      running: { startedAt: "2026-10-09T10:42:00.000Z" },
      connections: [
        {
          id: "zc_1",
          name: "Zoom academia",
          status: "ok",
          lastSyncAt: null,
          syncedThrough: "2026-10-08",
          lastError: null,
          lastRun: {
            status: "corriendo",
            startedAt: "2026-10-09T10:42:00.000Z",
            finishedAt: null,
            newCount: 0,
            assignedCount: 0,
            ambiguousCount: 0,
            conflictCount: 0,
            error: null,
          },
        },
      ],
      periodicIntervalMin: 0,
    });
  });
});

describe("transcripción", () => {
  it("TRANSCRIPT o CC la marcan; solo video o chat, no", async () => {
    const { hasTranscript } = await import("@/server/zoom/recordings");
    expect(hasTranscript(["MP4", "TRANSCRIPT"])).toBe(true);
    expect(hasTranscript(["CC"])).toBe(true);
    expect(hasTranscript(["MP4", "M4A", "CHAT", "TIMELINE"])).toBe(false);
    expect(hasTranscript([])).toBe(false);
  });
});
