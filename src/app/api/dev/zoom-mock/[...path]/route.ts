import { mockGuard } from "@/lib/dev-guard";
import {
  issueToken,
  listRecordingsFor,
  listUsersFor,
  logZoomRequest,
  participantsReportFor,
  pastInstancesFor,
  pastMeetingsReportFor,
  takeZoomFail,
} from "@/server/dev/zoom-mock-state";

/**
 * 030 (DV-011) — Imitación del OAuth y de la API REST v2 de Zoom.
 *
 * El adaptador real (`src/lib/zoom`) apunta acá cuando
 * `ZOOM_OAUTH_BASE_URL = <app>/api/dev/zoom-mock` y
 * `ZOOM_API_BASE_URL = <app>/api/dev/zoom-mock/v2`. No llama a Zoom: imita
 * sus respuestas, incluidos los bordes (rango > 31 días, usuario inexistente,
 * paginación, credenciales `bad…`, fallas programadas).
 *
 * - `POST oauth/token?grant_type=account_credentials&account_id=X`
 * - `GET v2/users`
 * - `GET v2/users/{id}/recordings`
 * - `GET v2/report/users/{id}/meetings` (asistencia, 1.9.0)
 * - `GET v2/past_meetings/{id}/instances`
 * - `GET v2/report/meetings/{uuid}/participants`
 */
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ path: string[] }> };

function bearer(req: Request): string {
  const h = req.headers.get("authorization") ?? "";
  return h.startsWith("Bearer ") ? h.slice(7) : "";
}

/** El secreto llega en Basic auth; se lee SOLO para decidir si es "bad…". */
function basicSecret(req: Request): string {
  const h = req.headers.get("authorization") ?? "";
  if (!h.startsWith("Basic ")) return "";
  const decoded = Buffer.from(h.slice(6), "base64").toString("utf8");
  const i = decoded.indexOf(":");
  return i >= 0 ? decoded.slice(i + 1) : "";
}

export async function POST(req: Request, { params }: Params) {
  const guard = mockGuard();
  if (guard) return guard;
  const { path } = await params;
  const url = new URL(req.url);

  if (path.length === 2 && path[0] === "oauth" && path[1] === "token") {
    logZoomRequest({ method: "POST", path: "/oauth/token", query: url.searchParams.toString() });
    const accountId = url.searchParams.get("account_id") ?? "";
    if (url.searchParams.get("grant_type") !== "account_credentials" || !accountId) {
      return Response.json({ reason: "Invalid request", error: "invalid_request" }, { status: 400 });
    }
    const issued = issueToken(accountId, basicSecret(req));
    if (!issued.ok) {
      return Response.json(
        { reason: "Invalid client_id or client_secret", error: "invalid_client" },
        { status: 400 }
      );
    }
    return Response.json({
      access_token: issued.token,
      token_type: "bearer",
      expires_in: 3600,
      scope:
        "cloud_recording:read:list_user_recordings:admin user:read:list_users:admin report:read:list_meeting_participants:admin report:read:list_meetings:admin meeting:read:list_past_instances:admin",
    });
  }

  return Response.json({ code: 404, message: "mock: ruta desconocida" }, { status: 404 });
}

export async function GET(req: Request, { params }: Params) {
  const guard = mockGuard();
  if (guard) return guard;
  const { path } = await params;
  const url = new URL(req.url);
  const q = url.searchParams;
  logZoomRequest({ method: "GET", path: `/${path.join("/")}`, query: q.toString() });

  if (path[0] !== "v2") {
    return Response.json({ code: 404, message: "mock: ruta desconocida" }, { status: 404 });
  }

  const fail = takeZoomFail();
  if (fail) {
    return Response.json(
      { code: fail.status, message: "mock: falla programada" },
      {
        status: fail.status,
        headers: fail.retryAfterSec !== undefined ? { "retry-after": String(fail.retryAfterSec) } : {},
      }
    );
  }

  const token = bearer(req);
  const pageSize = Number(q.get("page_size")) || undefined;
  const nextPageToken = q.get("next_page_token") || undefined;

  let result;
  if (path.length === 2 && path[1] === "users") {
    result = listUsersFor(token, { pageSize, nextPageToken });
  } else if (path.length === 4 && path[1] === "users" && path[3] === "recordings") {
    result = listRecordingsFor(token, decodeURIComponent(path[2]!), {
      from: q.get("from") ?? "",
      to: q.get("to") ?? "",
      pageSize,
      nextPageToken,
    });
  } else if (path.length === 5 && path[1] === "report" && path[2] === "users" && path[4] === "meetings") {
    result = pastMeetingsReportFor(token, decodeURIComponent(path[3]!), {
      from: q.get("from") ?? "",
      to: q.get("to") ?? "",
      pageSize,
      nextPageToken,
    });
  } else if (path.length === 4 && path[1] === "past_meetings" && path[3] === "instances") {
    result = pastInstancesFor(token, decodeURIComponent(path[2]!));
  } else if (path.length === 5 && path[1] === "report" && path[2] === "meetings" && path[4] === "participants") {
    result = participantsReportFor(token, decodificarUuid(path[3]!), { pageSize, nextPageToken });
  } else {
    return Response.json({ code: 404, message: "mock: ruta desconocida" }, { status: 404 });
  }
  return Response.json(result.body, { status: result.status });
}

/**
 * El adaptador codifica DOS veces los UUID con `/` o `//` (como pide Zoom).
 * Un UUID es base64 (sin `%`), así que se decodifica hasta que no quede nada.
 */
function decodificarUuid(segmento: string): string {
  let out = segmento;
  for (let i = 0; i < 3 && /%[0-9A-Fa-f]{2}/.test(out); i++) out = decodeURIComponent(out);
  return out;
}
