import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Constitución 1.9.0 — Los métodos de SOLO LECTURA de reportes de reuniones
 * pasadas, con `fetch` inyectado: nunca sale a la red. Se fija la forma del
 * pedido (doble codificación del UUID, paginación, `include_fields`), lo que
 * se descarta del JSON (IP, ubicación, dispositivo) y el mapeo de errores a
 * códigos propios.
 */

const env: Record<string, string | undefined> = {};
vi.mock("@/lib/env", () => ({ getEnv: () => ({ ...env }) }));

const creds = { connectionId: "zc_1", accountId: "acc-1", clientId: "cli-1", clientSecret: "S3CR3T" };

type Call = { url: string };
let calls: Call[] = [];
let apiQueue: (() => Response)[] = [];

const fakeFetch = vi.fn(async (url: string) => {
  calls.push({ url });
  if (url.includes("/oauth/token")) {
    return Response.json({ access_token: "T", token_type: "bearer", expires_in: 3600 });
  }
  const next = apiQueue.shift();
  return next ? next() : Response.json({});
});

async function client() {
  const mod = await import("@/lib/zoom/client");
  mod.resetZoomClient();
  let clock = 1_000_000;
  mod.configureZoomClient({
    fetch: fakeFetch as unknown as typeof fetch,
    now: () => clock,
    sleep: async (ms: number) => {
      clock += ms;
    },
    random: () => 0,
  });
  return mod;
}

const apiCalls = () => calls.filter((c) => !c.url.includes("/oauth/token"));

beforeEach(() => {
  calls = [];
  apiQueue = [];
  fakeFetch.mockClear();
  for (const k of Object.keys(env)) delete env[k];
});

describe("encodeMeetingUuid", () => {
  it("codifica una vez un UUID común y DOS veces si empieza con / o tiene //", async () => {
    const { encodeMeetingUuid } = await client();
    expect(encodeMeetingUuid("aDYlohsHRtCd4ii1uC2+hA==")).toBe("aDYlohsHRtCd4ii1uC2%2BhA%3D%3D");
    expect(encodeMeetingUuid("/ajXp112QmuoKj4854875==")).toBe("%252FajXp112QmuoKj4854875%253D%253D");
    expect(encodeMeetingUuid("ab//cd==")).toBe("ab%252F%252Fcd%253D%253D");
  });
});

describe("listMeetingParticipants", () => {
  it("pide el reporte de la INSTANCIA con page_size=300 e include_fields=registrant_id, todas las páginas", async () => {
    apiQueue.push(() =>
      Response.json({
        next_page_token: "p2",
        participants: [
          {
            id: "pA",
            user_id: "16778240",
            participant_user_id: "",
            name: "Ana Pérez",
            user_email: "ANA@Example.com ",
            join_time: "2026-10-20T21:01:00Z",
            leave_time: "2026-10-20T22:30:00Z",
            duration: 5340,
            registrant_id: "",
            status: "in_meeting",
            ip_address: "200.1.2.3",
            location: "Montevideo",
            device: "iPhone",
            pc_name: "ANA-PC",
            version: "5.17",
            bo_mtg_id: "",
          },
        ],
      })
    );
    apiQueue.push(() =>
      Response.json({
        next_page_token: "",
        participants: [
          {
            id: "",
            name: "iPhone de Juan",
            join_time: "2026-10-20T21:10:00Z",
            leave_time: "2026-10-20T21:20:00Z",
            duration: 600,
            status: "in_waiting_room",
            bo_mtg_id: "bo-1",
          },
        ],
      })
    );
    const { listMeetingParticipants } = await client();
    const out = await listMeetingParticipants(creds, "/abc==");

    const urls = apiCalls().map((c) => c.url);
    expect(urls[0]).toBe(
      "https://api.zoom.us/v2/report/meetings/%252Fabc%253D%253D/participants?page_size=300&include_fields=registrant_id"
    );
    expect(urls[1]).toContain("next_page_token=p2");
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      participantId: "pA",
      participantUserId: null,
      registrantId: null,
      name: "Ana Pérez",
      email: "ana@example.com",
      joinTime: new Date("2026-10-20T21:01:00Z"),
      leaveTime: new Date("2026-10-20T22:30:00Z"),
      durationSec: 5340,
      breakout: false,
      waitingRoom: false,
    });
    // Sin id: llave estable a partir del nombre; sala de espera y grupo marcados.
    expect(out[1]).toMatchObject({
      participantId: "anon:iPhone de Juan",
      email: null,
      waitingRoom: true,
      breakout: true,
    });
    // Lo que NO se guarda no viaja ni siquiera en memoria.
    const json = JSON.stringify(out);
    for (const p of ["200.1.2.3", "Montevideo", "ANA-PC", "5.17", "device"]) {
      expect(json).not.toContain(p);
    }
  });

  it("sin leave_time usa join + duration", async () => {
    apiQueue.push(() =>
      Response.json({
        participants: [{ id: "x", name: "Sin salida", join_time: "2026-10-20T21:00:00Z", duration: 120 }],
      })
    );
    const { listMeetingParticipants } = await client();
    const [p] = await listMeetingParticipants(creds, "u1");
    expect(p!.leaveTime.toISOString()).toBe("2026-10-20T21:02:00.000Z");
  });
});

describe("listUserPastMeetings / listPastInstances", () => {
  it("reporte de reuniones del usuario: type=past, rango del día, uuid opcional [U]", async () => {
    apiQueue.push(() =>
      Response.json({
        next_page_token: "",
        meetings: [
          { uuid: "u-1", id: 5551234567, topic: "Sala A", start_time: "2026-10-20T21:00:00Z", end_time: "2026-10-20T22:31:00Z", duration: 91, participants_count: 12 },
          { id: "5551234567", start_time: "2026-10-20T23:00:00Z", duration: 30 },
        ],
      })
    );
    const { listUserPastMeetings } = await client();
    const out = await listUserPastMeetings(creds, "zu_1", { from: "2026-10-20", to: "2026-10-20" });
    expect(apiCalls()[0]!.url).toBe(
      "https://api.zoom.us/v2/report/users/zu_1/meetings?from=2026-10-20&to=2026-10-20&page_size=300&type=past"
    );
    expect(out).toEqual([
      { uuid: "u-1", meetingId: "5551234567", topic: "Sala A", startTime: new Date("2026-10-20T21:00:00Z"), endTime: new Date("2026-10-20T22:31:00Z"), durationMin: 91 },
      { uuid: null, meetingId: "5551234567", topic: null, startTime: new Date("2026-10-20T23:00:00Z"), endTime: null, durationMin: 30 },
    ]);
  });

  it("instancias de un número de reunión", async () => {
    apiQueue.push(() =>
      Response.json({ meetings: [{ uuid: "i-1", start_time: "2026-10-20T21:00:00Z" }] })
    );
    const { listPastInstances } = await client();
    const out = await listPastInstances(creds, "5551234567");
    expect(apiCalls()[0]!.url).toBe("https://api.zoom.us/v2/past_meetings/5551234567/instances?");
    expect(out).toEqual([{ uuid: "i-1", startTime: new Date("2026-10-20T21:00:00Z") }]);
  });
});

describe("errores de los reportes → códigos propios, sin reintento", () => {
  it.each([
    [404, { code: 3001, message: "Meeting does not exist" }, "no_terminada"],
    [400, { code: 12702, message: "Can not access a meeting a year ago." }, "fuera_de_plazo"],
    [403, { code: 200, message: "No permission." }, "sin_permiso"],
    [400, { code: 4711, message: "Invalid access token, does not contain scopes" }, "sin_permiso"],
  ])("%i %o → %s", async (status, body, code) => {
    apiQueue.push(() => Response.json(body, { status }));
    const { listMeetingParticipants } = await client();
    await expect(listMeetingParticipants(creds, "u1")).rejects.toMatchObject({ code });
    expect(apiCalls()).toHaveLength(1);
  });

  it("sin permiso: el mensaje NOMBRA los scopes que hay que agregar y no repite a Zoom", async () => {
    apiQueue.push(() => Response.json({ code: 4711, message: "eco crudo de zoom" }, { status: 400 }));
    const { listMeetingParticipants } = await client();
    const err = (await listMeetingParticipants(creds, "u1").catch((e: unknown) => e)) as Error;
    expect(err.message).toContain("report:read:list_meeting_participants:admin");
    expect(err.message).toContain("Pro");
    expect(err.message).not.toContain("eco crudo");
  });

  it("las grabaciones conservan su propio mensaje de permisos", async () => {
    apiQueue.push(() => new Response("{}", { status: 403 }));
    const { listUsers } = await client();
    const err = (await listUsers(creds).catch((e: unknown) => e)) as Error;
    expect(err.message).toContain("user:read:list_users:admin");
  });
});
