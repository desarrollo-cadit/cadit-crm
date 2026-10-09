import { beforeEach, describe, expect, it } from "vitest";
import {
  issueToken,
  listRecordingsFor,
  listUsersFor,
  logZoomRequest,
  readZoomLog,
  resetZoomMock,
  seedZoomMock,
  setZoomFail,
  takeZoomFail,
} from "@/server/dev/zoom-mock-state";

/**
 * 030 (api-grabaciones.md §Mock) — El estado del zoom-mock. Es lo que permite
 * que el arnés pruebe todo sin una cuenta real: si el mock no imita bien los
 * bordes de Zoom (rango > 31 días, paginación, usuario inexistente), el
 * cliente se prueba contra un Zoom que no existe.
 */

const rec = (uuid: string, start: string) => ({
  uuid,
  id: 9990000001,
  topic: `Clase ${uuid}`,
  start_time: start,
  duration: 120,
  share_url: `https://zoom.us/rec/share/${uuid}`,
});

beforeEach(() => {
  resetZoomMock();
  seedZoomMock({
    accounts: [
      {
        accountId: "acc-1",
        users: [
          {
            id: "u1",
            email: "zoom1@x.test",
            recordings: [
              rec("r1", "2026-09-01T21:30:00Z"),
              rec("r2", "2026-09-03T21:30:00Z"),
              rec("r3", "2026-09-10T21:30:00Z"),
            ],
          },
          { id: "u2", email: "zoom2@x.test", recordings: [] },
        ],
      },
      { accountId: "acc-2", users: [{ id: "u9", email: "otra@x.test", recordings: [] }] },
    ],
  });
});

describe("token", () => {
  it("token por cuenta", () => {
    expect(issueToken("acc-1", "secreto-bueno")).toEqual({ ok: true, token: "mock-acc-1" });
  });
  it("client_secret que empieza con bad → invalid_client", () => {
    expect(issueToken("acc-1", "bad-secret")).toEqual({ ok: false });
  });
});

describe("usuarios", () => {
  it("solo los de la cuenta del token, paginados", () => {
    const p1 = listUsersFor("mock-acc-1", { pageSize: 1 });
    expect(p1.status).toBe(200);
    expect(p1.body.users.map((u: { id: string }) => u.id)).toEqual(["u1"]);
    expect(p1.body.next_page_token).toBeTruthy();
    const p2 = listUsersFor("mock-acc-1", { pageSize: 1, nextPageToken: p1.body.next_page_token });
    expect(p2.body.users.map((u: { id: string }) => u.id)).toEqual(["u2"]);
    expect(p2.body.next_page_token).toBe("");
    expect(listUsersFor("mock-acc-2", {}).body.users.map((u: { id: string }) => u.id)).toEqual(["u9"]);
  });
  it("token desconocido → 401", () => {
    expect(listUsersFor("otro", {}).status).toBe(401);
  });
});

describe("grabaciones", () => {
  it("filtra por from/to inclusive y forma JSON de Zoom", () => {
    const r = listRecordingsFor("mock-acc-1", "u1", { from: "2026-09-01", to: "2026-09-03" });
    expect(r.status).toBe(200);
    expect(r.body.meetings.map((m: { uuid: string }) => m.uuid)).toEqual(["r1", "r2"]);
    expect(r.body.meetings[0]).toMatchObject({ host_id: "u1", host_email: "zoom1@x.test" });
  });

  it("rango > 31 días → 400 {code:300}", () => {
    const r = listRecordingsFor("mock-acc-1", "u1", { from: "2026-07-01", to: "2026-09-01" });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe(300);
  });

  it("usuario inexistente (o de otra cuenta) → 404 {code:1001}", () => {
    expect(listRecordingsFor("mock-acc-1", "nadie", { from: "2026-09-01", to: "2026-09-03" })).toMatchObject({
      status: 404,
      body: { code: 1001 },
    });
    expect(listRecordingsFor("mock-acc-2", "u1", { from: "2026-09-01", to: "2026-09-03" }).status).toBe(404);
  });

  it("pageSize forzado por el seed pagina con next_page_token", () => {
    seedZoomMock({
      pageSize: 2,
      accounts: [
        {
          accountId: "acc-1",
          users: [
            {
              id: "u1",
              email: "zoom1@x.test",
              recordings: [
                rec("a", "2026-09-01T10:00:00Z"),
                rec("b", "2026-09-02T10:00:00Z"),
                rec("c", "2026-09-03T10:00:00Z"),
              ],
            },
          ],
        },
      ],
    });
    const q = { from: "2026-09-01", to: "2026-09-05", pageSize: 300 };
    const p1 = listRecordingsFor("mock-acc-1", "u1", q);
    expect(p1.body.meetings).toHaveLength(2);
    expect(p1.body.next_page_token).toBeTruthy();
    const p2 = listRecordingsFor("mock-acc-1", "u1", { ...q, nextPageToken: p1.body.next_page_token });
    expect(p2.body.meetings).toHaveLength(1);
    expect(p2.body.next_page_token).toBe("");
  });

  it("seed reemplaza el estado", () => {
    seedZoomMock({ accounts: [] });
    expect(listUsersFor("mock-acc-1", {}).body.users).toEqual([]);
  });
});

describe("falla programada y log", () => {
  it("fail falla los próximos N pedidos y después se apaga", () => {
    setZoomFail({ status: 429, times: 2, retryAfterSec: 1 });
    expect(takeZoomFail()).toEqual({ status: 429, retryAfterSec: 1 });
    expect(takeZoomFail()).toEqual({ status: 429, retryAfterSec: 1 });
    expect(takeZoomFail()).toBeNull();
  });

  it("el log registra método, ruta y query sin headers de auth", () => {
    logZoomRequest({ method: "GET", path: "/v2/users", query: "status=active" });
    const log = readZoomLog();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ method: "GET", path: "/v2/users", query: "status=active" });
    expect(JSON.stringify(log).toLowerCase()).not.toContain("authorization");
  });

  it("reset vacía todo", () => {
    logZoomRequest({ method: "GET", path: "/v2/users", query: "" });
    setZoomFail({ status: 500, times: 3 });
    resetZoomMock();
    expect(readZoomLog()).toEqual([]);
    expect(takeZoomFail()).toBeNull();
  });
});
