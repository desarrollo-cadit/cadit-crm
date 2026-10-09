/**
 * 030 (DV-011) — Estado en memoria del zoom-mock (solo dev/test). Mismo patrón
 * que `m365-mock-state.ts`: vive en `globalThis` porque Next recarga módulos
 * en dev, y una instancia es un proceso.
 *
 * Imita los bordes de Zoom que el adaptador tiene que saber manejar: rango de
 * más de un mes (400, code 300), usuario inexistente (404, code 1001),
 * paginación con `next_page_token`, credenciales malas (`bad…`) y fallas
 * programadas (401/429/500). No valida nada más: lo que se prueba es lo que
 * el CRM manda, no a Zoom.
 */

export type ZoomMockRecording = {
  uuid: string;
  id: number | string;
  topic?: string | null;
  start_time: string;
  duration?: number | null;
  total_size?: number | null;
  recording_count?: number | null;
  share_url?: string | null;
  recording_play_passcode?: string | null;
  password?: string | null;
  auto_delete_date?: string | null;
};

export type ZoomMockUser = {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  recordings?: ZoomMockRecording[];
};

export type ZoomMockSeed = {
  accounts: { accountId: string; users: ZoomMockUser[] }[];
  /** Fuerza el tamaño de página (para probar la paginación con pocos datos). */
  pageSize?: number;
};

export type ZoomMockFail = { status: 401 | 429 | 500; times: number; retryAfterSec?: number };

export type ZoomMockLogEntry = { method: string; path: string; query: string; at: string };

type ZoomMockState = {
  seed: ZoomMockSeed;
  fail: ZoomMockFail | null;
  log: ZoomMockLogEntry[];
};

const vacio = (): ZoomMockState => ({ seed: { accounts: [] }, fail: null, log: [] });

const globalForMock = globalThis as unknown as { __zoomMockState?: ZoomMockState };

function state(): ZoomMockState {
  if (!globalForMock.__zoomMockState) globalForMock.__zoomMockState = vacio();
  return globalForMock.__zoomMockState;
}

/** Reemplaza cuentas, usuarios y grabaciones. Conserva el log. */
export function seedZoomMock(seed: ZoomMockSeed): void {
  state().seed = seed;
}

/** Vacía todo: estado, falla programada y log. */
export function resetZoomMock(): void {
  globalForMock.__zoomMockState = vacio();
}

export function setZoomFail(fail: ZoomMockFail): void {
  state().fail = fail.times > 0 ? { ...fail } : null;
}

/** Consume una falla programada, o `null` si no hay. */
export function takeZoomFail(): { status: number; retryAfterSec?: number } | null {
  const st = state();
  if (!st.fail) return null;
  const { status, retryAfterSec } = st.fail;
  st.fail.times--;
  if (st.fail.times <= 0) st.fail = null;
  return retryAfterSec !== undefined ? { status, retryAfterSec } : { status };
}

/** Anota un pedido. Nunca headers: la autorización no se guarda en ningún lado. */
export function logZoomRequest(entry: { method: string; path: string; query: string }): void {
  state().log.push({ method: entry.method, path: entry.path, query: entry.query, at: new Date().toISOString() });
}

export function readZoomLog(): ZoomMockLogEntry[] {
  return state().log;
}

/** `POST /oauth/token`: un secreto que empieza con `bad` se rechaza. */
export function issueToken(accountId: string, clientSecret: string): { ok: true; token: string } | { ok: false } {
  if (clientSecret.startsWith("bad")) return { ok: false };
  return { ok: true, token: `mock-${accountId}` };
}

function accountOf(token: string) {
  if (!token.startsWith("mock-")) return null;
  const accountId = token.slice("mock-".length);
  return state().seed.accounts.find((a) => a.accountId === accountId) ?? { accountId, users: [] };
}

/** Pagina por desplazamiento; el token de página es el índice siguiente. */
function paginate<T>(items: T[], size: number, nextPageToken?: string) {
  const start = nextPageToken ? Number(nextPageToken.replace(/^p/, "")) || 0 : 0;
  const page = items.slice(start, start + size);
  const next = start + size < items.length ? `p${start + size}` : "";
  return { page, next };
}

/**
 * El cuerpo es JSON libre, como el de Zoom: el mock solo lo arma y la ruta lo
 * serializa; quien lo lee (el adaptador) lo valida con Zod.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockResult = { status: number; body: Record<string, any> };

const unauthorized = (): MockResult => ({
  status: 401,
  body: { code: 124, message: "Invalid access token." },
});

export function listUsersFor(
  token: string,
  opts: { pageSize?: number; nextPageToken?: string }
): MockResult {
  const account = accountOf(token);
  if (!account) return unauthorized();
  const size = state().seed.pageSize ?? opts.pageSize ?? 30;
  const { page, next } = paginate(account.users, size, opts.nextPageToken);
  return {
    status: 200,
    body: {
      page_size: size,
      total_records: account.users.length,
      next_page_token: next,
      users: page.map((u) => ({
        id: u.id,
        email: u.email,
        first_name: u.first_name ?? "",
        last_name: u.last_name ?? "",
        type: 2,
        status: "active",
      })),
    },
  };
}

const DAY_MS = 86_400_000;

export function listRecordingsFor(
  token: string,
  userId: string,
  opts: { from: string; to: string; pageSize?: number; nextPageToken?: string }
): MockResult {
  const account = accountOf(token);
  if (!account) return unauthorized();
  const user = account.users.find((u) => u.id === userId);
  if (!user) return { status: 404, body: { code: 1001, message: "User does not exist." } };

  const from = Date.parse(`${opts.from}T00:00:00Z`);
  const to = Date.parse(`${opts.to}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) {
    return { status: 400, body: { code: 300, message: "Invalid date range." } };
  }
  if ((to - from) / DAY_MS + 1 > 31) {
    return { status: 400, body: { code: 300, message: "The date range can not exceed one month." } };
  }

  // En el orden del seed: el adaptador no puede depender del orden de Zoom.
  const enRango = (user.recordings ?? []).filter((r) => {
    const day = Date.parse(`${r.start_time.slice(0, 10)}T00:00:00Z`);
    return day >= from && day <= to;
  });

  const size = state().seed.pageSize ?? opts.pageSize ?? 30;
  const { page, next } = paginate(enRango, size, opts.nextPageToken);
  return {
    status: 200,
    body: {
      from: opts.from,
      to: opts.to,
      page_size: size,
      total_records: enRango.length,
      next_page_token: next,
      meetings: page.map((r) => ({
        uuid: r.uuid,
        id: r.id,
        host_id: user.id,
        host_email: user.email,
        topic: r.topic ?? null,
        start_time: r.start_time,
        duration: r.duration ?? null,
        total_size: r.total_size ?? null,
        recording_count: r.recording_count ?? null,
        share_url: r.share_url ?? null,
        recording_play_passcode: r.recording_play_passcode ?? null,
        password: r.password ?? null,
        auto_delete_date: r.auto_delete_date ?? null,
        recording_files: [],
      })),
    },
  };
}
