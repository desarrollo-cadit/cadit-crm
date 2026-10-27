import { z } from "zod";
import { getEnv } from "@/lib/env";
import {
  ZoomError,
  type ZoomCredentials,
  type ZoomPastInstance,
  type ZoomPastMeeting,
  type ZoomParticipantSegment,
  type ZoomRecordingMeeting,
  type ZoomUser,
} from "./types";

/**
 * 030 — Adaptador de Zoom (constitución 1.6.0, principio II).
 *
 * El ÚNICO módulo que sabe qué es un token de Zoom, una URL de su API o la
 * forma de su JSON. Es de SOLO LECTURA: lista usuarios y grabaciones en la
 * nube, y no tiene —ni debe tener— ningún método que escriba en Zoom
 * (`tests/unit/zoom-adapter-guard.test.ts`).
 *
 * Las bases se cambian por entorno (`ZOOM_API_BASE_URL`, `ZOOM_OAUTH_BASE_URL`)
 * para hablarle al zoom-mock en local, igual que M365 y Meta: el adaptador
 * real habla HTTP con un servidor falso y el dominio no tiene ningún `if (mock)`.
 *
 * SEGURIDAD (principio I): ningún `ZoomError.message` lleva el secreto, el
 * token, el header de autorización ni el cuerpo crudo de Zoom. Los mensajes
 * se escriben acá, en castellano, y son los que ve la pantalla.
 */

const DEFAULT_API = "https://api.zoom.us/v2";
const DEFAULT_OAUTH = "https://zoom.us";

const trimSlash = (url: string) => url.replace(/\/+$/, "");
const apiBase = () => trimSlash(getEnv().ZOOM_API_BASE_URL ?? DEFAULT_API);
const oauthBase = () => trimSlash(getEnv().ZOOM_OAUTH_BASE_URL ?? DEFAULT_OAUTH);

/**
 * A dónde habla el adaptador AHORA. `mock` es verdadero solo si LAS DOS bases
 * apuntan al zoom-mock de la app (`/api/dev/zoom-mock`): el arnés E2E se niega
 * a correr la sección de grabaciones si no, para no mandarle credenciales de
 * mentira a zoom.us. Las bases no son secretas.
 */
export function zoomBases(): { api: string; oauth: string; mock: boolean } {
  const api = apiBase();
  const oauth = oauthBase();
  const esMock = (u: string) => /\/api\/dev\/zoom-mock(\/|$)/.test(u);
  return { api, oauth, mock: esMock(api) && esMock(oauth) };
}

/** Pedidos en serie por conexión, con este espaciado mínimo (≤ 5 req/s). */
const MIN_SPACING_MS = 200;
/** Intentos totales ante 429 / 5xx / red antes de rendirse. */
const MAX_ATTEMPTS = 3;
const TIMEOUT_MS = 20_000;
/** Zoom rechaza rangos de más de un mes: se parte en tramos de 30 días. */
const CHUNK_DAYS = 30;
const DAY_MS = 86_400_000;

/* ============================================================
 * Dependencias inyectables (tests)
 * ============================================================ */

type Deps = {
  fetch: typeof fetch;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  random: () => number;
};

const defaultDeps = (): Deps => ({
  fetch: (...args) => fetch(...args),
  now: () => Date.now(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  random: () => Math.random(),
});

// En globalThis: Next recarga módulos en dev y el caché de tokens tiene que
// sobrevivir a eso (si no, cada recarga pide un token nuevo).
type ClientState = {
  deps: Deps;
  tokens: Map<string, { value: string; expiresAt: number }>;
  chains: Map<string, Promise<void>>;
  lastRequestAt: Map<string, number>;
};
const globalForZoom = globalThis as unknown as { __zoomClient?: ClientState };

function state(): ClientState {
  if (!globalForZoom.__zoomClient) {
    globalForZoom.__zoomClient = {
      deps: defaultDeps(),
      tokens: new Map(),
      chains: new Map(),
      lastRequestAt: new Map(),
    };
  }
  return globalForZoom.__zoomClient;
}

/** Solo para tests: inyecta `fetch`, reloj y espera. */
export function configureZoomClient(deps: Partial<Deps>): void {
  state().deps = { ...state().deps, ...deps };
}

/** Solo para tests: vuelve al estado inicial (sin tokens, deps reales). */
export function resetZoomClient(): void {
  globalForZoom.__zoomClient = undefined;
}

/* ============================================================
 * Token Server-to-Server
 * ============================================================ */

const tokenSchema = z
  .object({ access_token: z.string().min(1), expires_in: z.number().positive() })
  .passthrough();

/** Token S2S, cacheado por conexión hasta `expires_in − 60 s`. */
export async function getAccessToken(creds: ZoomCredentials): Promise<string> {
  const st = state();
  const cached = st.tokens.get(creds.connectionId);
  if (cached && cached.expiresAt - 60_000 > st.deps.now()) return cached.value;

  const url =
    `${oauthBase()}/oauth/token?grant_type=account_credentials` +
    `&account_id=${encodeURIComponent(creds.accountId)}`;
  const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64");

  let res: Response;
  try {
    res = await withTimeout((signal) =>
      st.deps.fetch(url, {
        method: "POST",
        headers: { authorization: `Basic ${basic}` },
        signal,
      })
    );
  } catch {
    throw new ZoomError("zoom_caido", "No se pudo contactar a Zoom para autenticar la conexión.");
  }

  if (res.status === 400 || res.status === 401) {
    throw new ZoomError(
      "credenciales_invalidas",
      "Zoom rechazó las credenciales. Revisá el Account ID, el Client ID y el Client Secret de la app."
    );
  }
  if (res.status === 403) {
    throw new ZoomError("sin_permiso", "La app de Zoom no tiene permiso para autenticarse (¿está activada?).");
  }
  if (!res.ok) {
    throw new ZoomError("zoom_caido", `Zoom no respondió al pedir el token (HTTP ${res.status}).`);
  }

  const parsed = tokenSchema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) {
    throw new ZoomError("respuesta_invalida", "Zoom respondió el token con un formato inesperado.");
  }
  st.tokens.set(creds.connectionId, {
    value: parsed.data.access_token,
    expiresAt: st.deps.now() + parsed.data.expires_in * 1000,
  });
  return parsed.data.access_token;
}

/** Invalida el token cacheado (al editar credenciales o ante un 401). */
export function forgetToken(connectionId: string): void {
  state().tokens.delete(connectionId);
}

/* ============================================================
 * Pedido con reintentos
 * ============================================================ */

async function withTimeout(run: (signal: AbortSignal) => Promise<Response>): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  // Un temporizador colgado no debe mantener vivo el proceso.
  (timer as { unref?: () => void }).unref?.();
  try {
    return await run(ctrl.signal);
  } finally {
    clearTimeout(timer);
  }
}

/** Corre `fn` cuando terminó el pedido anterior de la MISMA conexión. */
async function serial<T>(connectionId: string, fn: () => Promise<T>): Promise<T> {
  const st = state();
  const prev = st.chains.get(connectionId) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((r) => (release = r));
  st.chains.set(connectionId, prev.then(() => mine));
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}

async function spaced(connectionId: string): Promise<void> {
  const st = state();
  const last = st.lastRequestAt.get(connectionId);
  if (last !== undefined) {
    const wait = last + MIN_SPACING_MS - st.deps.now();
    if (wait > 0) await st.deps.sleep(wait);
  }
  st.lastRequestAt.set(connectionId, st.deps.now());
}

function backoffMs(n: number): number {
  return Math.min(2 ** n * 1000, 30_000) + Math.floor(state().deps.random() * 250);
}

async function request<S extends z.ZodTypeAny>(
  creds: ZoomCredentials,
  path: string,
  query: Record<string, string>,
  schema: S,
  permisos: ZoomPermisos = "grabaciones"
): Promise<z.infer<S>> {
  return serial(creds.connectionId, async () => {
    const st = state();
    const url = `${apiBase()}${path}?${new URLSearchParams(query).toString()}`;
    let retried401 = false;
    let transientFailures = 0;

    for (;;) {
      const token = await getAccessToken(creds);
      await spaced(creds.connectionId);

      let res: Response | null = null;
      try {
        res = await withTimeout((signal) =>
          st.deps.fetch(url, { headers: { authorization: `Bearer ${token}` }, signal })
        );
      } catch {
        res = null; // red caída o timeout: se trata como 5xx
      }

      if (res && res.ok) {
        const parsed = schema.safeParse(await res.json().catch(() => undefined));
        if (!parsed.success) {
          throw new ZoomError("respuesta_invalida", "Zoom respondió con un formato inesperado.");
        }
        return parsed.data;
      }

      if (res?.status === 401) {
        forgetToken(creds.connectionId);
        if (retried401) {
          throw new ZoomError(
            "credenciales_invalidas",
            "Zoom rechazó el acceso de la conexión. Revisá las credenciales y los permisos de la app."
          );
        }
        retried401 = true;
        continue;
      }

      if (!res || res.status === 429 || res.status >= 500) {
        transientFailures++;
        if (transientFailures >= MAX_ATTEMPTS) {
          throw res?.status === 429
            ? new ZoomError("limite_de_tasa", "Zoom limitó la cantidad de pedidos. Probá de nuevo en unos minutos.")
            : new ZoomError("zoom_caido", "Zoom no respondió después de varios intentos.");
        }
        const retryAfter = Number(res?.headers.get("retry-after"));
        const wait =
          res?.status === 429 && Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : backoffMs(transientFailures - 1);
        await st.deps.sleep(wait);
        continue;
      }

      // Solo el `code` NUMÉRICO del cuerpo: el texto de Zoom no viaja jamás.
      const zoomCode = await errorCodeOf(res);

      if (res.status === 403 || (res.status === 400 && SIN_PERMISO_400.has(zoomCode ?? -1))) {
        throw new ZoomError("sin_permiso", mensajeSinPermiso(permisos));
      }
      if (res.status === 404 && zoomCode === 3001) {
        // "Meeting does not exist / has not ended": todavía en curso o Zoom
        // no terminó de procesar el reporte. Se reintenta más tarde.
        throw new ZoomError(
          "no_terminada",
          "Zoom todavía no tiene el reporte de esa reunión (sigue en curso o se está procesando)."
        );
      }
      if (res.status === 400 && zoomCode === 12702) {
        throw new ZoomError(
          "fuera_de_plazo",
          "Zoom ya no guarda el reporte de esa reunión (tiene más de un año)."
        );
      }
      if (res.status === 404) {
        throw new ZoomError("usuario_inexistente", "El usuario de Zoom no existe en esa cuenta.");
      }
      throw new ZoomError("respuesta_invalida", `Zoom rechazó el pedido (HTTP ${res.status}).`);
    }
  });
}

/**
 * Códigos de Zoom que, con HTTP 400, significan "esta app no puede": 4711 es
 * el token sin el scope pedido (apps granulares) y 200 "sin permiso / solo
 * cuentas pagas". [U] 4711 con 400 lo documenta el foro, no la referencia.
 */
const SIN_PERMISO_400 = new Set([4711, 200]);

async function errorCodeOf(res: Response): Promise<number | null> {
  const body: unknown = await res.json().catch(() => null);
  if (body && typeof body === "object" && "code" in body) {
    const n = Number((body as { code: unknown }).code);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Qué permisos necesita cada familia de pedidos (para el mensaje del 403). */
export type ZoomPermisos = "grabaciones" | "reportes";

/**
 * Scopes a agregar en el Marketplace, por familia. Los granulares van
 * primero; entre paréntesis el equivalente clásico.
 *
 * `report:read:user:admin` (reporte de reuniones de un usuario, "Get meeting
 * reports"): confirmado en la tabla oficial de scopes granulares el
 * 2026-10-27. El nombre supuesto antes (`report:read:list_meetings:admin`) no
 * existe en el selector de la app.
 */
export const SCOPES_POR_FAMILIA: Record<ZoomPermisos, string[]> = {
  grabaciones: [
    "cloud_recording:read:list_user_recordings:admin",
    "user:read:list_users:admin",
  ],
  reportes: [
    "report:read:list_meeting_participants:admin",
    "report:read:user:admin",
    "meeting:read:list_past_instances:admin",
  ],
};

function mensajeSinPermiso(permisos: ZoomPermisos): string {
  if (permisos === "reportes") {
    return (
      "La app de Zoom de esta cuenta no puede leer los reportes de reuniones. " +
      "Requiere plan Pro o superior y estos permisos en el Marketplace: " +
      `${SCOPES_POR_FAMILIA.reportes.join(", ")} (en apps clásicas: report:read:admin y meeting:read:admin).`
    );
  }
  return (
    "La app de Zoom no tiene los permisos necesarios. Agregá en el Marketplace: " +
    `${SCOPES_POR_FAMILIA.grabaciones.join(", ")} (en apps clásicas: recording:read:admin y user:read:admin).`
  );
}

/* ============================================================
 * Usuarios
 * ============================================================ */

const usersSchema = z
  .object({
    users: z.array(
      z
        .object({
          id: z.string(),
          email: z.string(),
          first_name: z.string().nullish(),
          last_name: z.string().nullish(),
          display_name: z.string().nullish(),
          type: z.number(),
          status: z.string().nullish(),
          pmi: z.union([z.number(), z.string()]).nullish(),
        })
        .passthrough()
    ),
    next_page_token: z.string().nullish(),
  })
  .passthrough();

/** "Probar conexión": todos los usuarios activos de la cuenta, paginando. */
export async function listUsers(creds: ZoomCredentials): Promise<ZoomUser[]> {
  const out: ZoomUser[] = [];
  let next = "";
  do {
    const page = await request(
      creds,
      "/users",
      { status: "active", page_size: "300", ...(next ? { next_page_token: next } : {}) },
      usersSchema
    );
    for (const u of page.users) {
      const nombre = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
      out.push({
        id: u.id,
        email: u.email,
        displayName: u.display_name || nombre || u.email,
        type: u.type,
        status: u.status ?? "active",
        pmi: u.pmi !== null && u.pmi !== undefined && String(u.pmi) !== "" ? String(u.pmi) : null,
      });
    }
    next = page.next_page_token ?? "";
  } while (next);
  return out;
}

/* ============================================================
 * Grabaciones
 * ============================================================ */

const meetingsSchema = z
  .object({
    meetings: z.array(
      z
        .object({
          uuid: z.string(),
          id: z.union([z.number(), z.string()]),
          host_id: z.string(),
          host_email: z.string().nullish(),
          topic: z.string().nullish(),
          start_time: z.string(),
          duration: z.number().nullish(),
          total_size: z.number().nullish(),
          recording_count: z.number().nullish(),
          share_url: z.string().nullish(),
          recording_play_passcode: z.string().nullish(),
          password: z.string().nullish(),
          auto_delete_date: z.string().nullish(),
          recording_files: z
            .array(z.object({ file_type: z.string().nullish() }).passthrough())
            .nullish(),
        })
        .passthrough()
    ),
    next_page_token: z.string().nullish(),
  })
  .passthrough();

/** Solo el TIPO de cada archivo: ni URL de descarga ni tamaño por archivo. */
function fileTypesOf(files: { file_type?: string | null }[] | null | undefined): string[] {
  const tipos = new Set<string>();
  for (const f of files ?? []) {
    const t = f.file_type?.trim().toUpperCase();
    if (t) tipos.add(t);
  }
  return [...tipos].sort();
}

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const dayMs = (d: string) => Date.parse(`${d}T00:00:00Z`);

/**
 * Parte [from, to] (inclusive) en tramos contiguos de ≤ 30 días: Zoom rechaza
 * rangos de más de un mes. Pura; la verificación diaria pide 180 días y el
 * adaptador los parte acá.
 */
export function recordingRangeChunks(from: string, to: string): { from: string; to: string }[] {
  const out: { from: string; to: string }[] = [];
  const end = dayMs(to);
  for (let start = dayMs(from); start <= end; start += CHUNK_DAYS * DAY_MS) {
    out.push({ from: isoDay(start), to: isoDay(Math.min(start + (CHUNK_DAYS - 1) * DAY_MS, end)) });
  }
  return out;
}

/**
 * Grabaciones en la nube de un usuario en [from, to] (YYYY-MM-DD, UTC).
 * Devuelve un iterador POR PÁGINA para que el llamador persista de a poco,
 * sin transacciones largas ni toda la cuenta en memoria.
 */
export async function* listUserRecordings(
  creds: ZoomCredentials,
  zoomUserId: string,
  range: { from: string; to: string }
): AsyncGenerator<ZoomRecordingMeeting[]> {
  for (const tramo of recordingRangeChunks(range.from, range.to)) {
    let next = "";
    do {
      const page = await request(
        creds,
        `/users/${encodeURIComponent(zoomUserId)}/recordings`,
        {
          from: tramo.from,
          to: tramo.to,
          page_size: "300",
          trash: "false",
          ...(next ? { next_page_token: next } : {}),
        },
        meetingsSchema
      );
      yield page.meetings.map((m) => ({
        uuid: m.uuid,
        meetingId: String(m.id),
        hostId: m.host_id,
        hostEmail: m.host_email ?? null,
        topic: m.topic ?? null,
        startTime: new Date(m.start_time),
        durationMin: m.duration ?? null,
        totalSizeBytes: m.total_size ?? null,
        fileCount: m.recording_count ?? null,
        shareUrl: m.share_url || null,
        playPasscode: m.recording_play_passcode || null,
        password: m.password || null,
        autoDeleteDate: m.auto_delete_date ?? null,
        fileTypes: fileTypesOf(m.recording_files),
      }));
      next = page.next_page_token ?? "";
    } while (next);
  }
}

/* ============================================================
 * Reportes de reuniones pasadas (constitución 1.9.0)
 *
 * SOLO LECTURA, para PROPONER la asistencia de una clase. Del reporte de
 * participantes se toma lo mínimo (nombre, correo si viene, ids de Zoom,
 * entrada/salida); IP, ubicación, dispositivo y versión se descartan acá y no
 * llegan ni a la memoria del dominio.
 * ============================================================ */

/**
 * Un UUID de instancia que empieza con `/` o contiene `//` va codificado DOS
 * veces (lo pide Zoom); el resto, una.
 */
export function encodeMeetingUuid(uuid: string): string {
  const once = encodeURIComponent(uuid);
  return uuid.startsWith("/") || uuid.includes("//") ? encodeURIComponent(once) : once;
}

const participantsSchema = z
  .object({
    participants: z.array(
      z
        .object({
          id: z.string().nullish(),
          participant_user_id: z.string().nullish(),
          registrant_id: z.string().nullish(),
          name: z.string().nullish(),
          user_email: z.string().nullish(),
          join_time: z.string(),
          leave_time: z.string().nullish(),
          duration: z.number().nullish(),
          status: z.string().nullish(),
          bo_mtg_id: z.string().nullish(),
        })
        // Sin passthrough: lo que no se declara (IP, ubicación…) se descarta.
        .strip()
    ),
    next_page_token: z.string().nullish(),
  })
  .passthrough();

/**
 * Participantes de UNA instancia (por UUID, nunca por número: en un aula PMI
 * el número se repite entre grupos). Un tramo por conexión: quien se cae y
 * vuelve aparece varias veces.
 */
export async function listMeetingParticipants(
  creds: ZoomCredentials,
  meetingUuid: string
): Promise<ZoomParticipantSegment[]> {
  const out: ZoomParticipantSegment[] = [];
  let next = "";
  do {
    const page = await request(
      creds,
      `/report/meetings/${encodeMeetingUuid(meetingUuid)}/participants`,
      {
        page_size: "300",
        include_fields: "registrant_id",
        ...(next ? { next_page_token: next } : {}),
      },
      participantsSchema,
      "reportes"
    );
    for (const p of page.participants) {
      const name = (p.name ?? "").trim() || "Sin nombre";
      const join = new Date(p.join_time);
      const durationSec = Math.max(0, Math.round(p.duration ?? 0));
      const leave = p.leave_time ? new Date(p.leave_time) : new Date(join.getTime() + durationSec * 1000);
      const email = (p.user_email ?? "").trim().toLowerCase();
      out.push({
        participantId: (p.id ?? "").trim() || `anon:${name}`,
        participantUserId: (p.participant_user_id ?? "").trim() || null,
        registrantId: (p.registrant_id ?? "").trim() || null,
        name,
        email: email || null,
        joinTime: join,
        leaveTime: leave,
        durationSec,
        breakout: Boolean((p.bo_mtg_id ?? "").trim()),
        waitingRoom: p.status === "in_waiting_room",
      });
    }
    next = page.next_page_token ?? "";
  } while (next);
  return out;
}

const pastMeetingsSchema = z
  .object({
    meetings: z.array(
      z
        .object({
          // [U] La referencia no garantiza `uuid` en este reporte: si falta,
          // el servidor cae a `/past_meetings/{id}/instances`.
          uuid: z.string().nullish(),
          id: z.union([z.number(), z.string()]),
          topic: z.string().nullish(),
          start_time: z.string(),
          end_time: z.string().nullish(),
          duration: z.number().nullish(),
        })
        .passthrough()
    ),
    next_page_token: z.string().nullish(),
  })
  .passthrough();

/**
 * Reuniones YA TERMINADAS que hospedó un usuario de Zoom en [from, to]
 * (YYYY-MM-DD). Zoom: rango ≤ 1 mes, dentro de los últimos 6 meses, y solo
 * reuniones con ≥ 2 participantes.
 */
export async function listUserPastMeetings(
  creds: ZoomCredentials,
  zoomUserId: string,
  range: { from: string; to: string }
): Promise<ZoomPastMeeting[]> {
  const out: ZoomPastMeeting[] = [];
  let next = "";
  do {
    const page = await request(
      creds,
      `/report/users/${encodeURIComponent(zoomUserId)}/meetings`,
      {
        from: range.from,
        to: range.to,
        page_size: "300",
        type: "past",
        ...(next ? { next_page_token: next } : {}),
      },
      pastMeetingsSchema,
      "reportes"
    );
    for (const m of page.meetings) {
      out.push({
        uuid: m.uuid || null,
        meetingId: String(m.id),
        topic: m.topic ?? null,
        startTime: new Date(m.start_time),
        endTime: m.end_time ? new Date(m.end_time) : null,
        durationMin: m.duration ?? null,
      });
    }
    next = page.next_page_token ?? "";
  } while (next);
  return out;
}

const instancesSchema = z
  .object({
    meetings: z.array(z.object({ uuid: z.string(), start_time: z.string() }).passthrough()).nullish(),
  })
  .passthrough();

/** Instancias terminadas de un número de reunión (≤ 15 meses). */
export async function listPastInstances(
  creds: ZoomCredentials,
  meetingId: string
): Promise<ZoomPastInstance[]> {
  const page = await request(
    creds,
    `/past_meetings/${encodeURIComponent(meetingId)}/instances`,
    {},
    instancesSchema,
    "reportes"
  );
  return (page.meetings ?? []).map((m) => ({ uuid: m.uuid, startTime: new Date(m.start_time) }));
}
