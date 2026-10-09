import { and, asc, eq, isNotNull, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import {
  forgetToken as zoomForgetToken,
  listUsers as zoomListUsers,
  ZoomError,
  type ZoomCredentials,
  type ZoomErrorCode,
  type ZoomUser,
} from "@/lib/zoom";

/**
 * 030 US4 — Conexiones de Zoom y vínculo aula ↔ usuario de Zoom.
 *
 * Una CONEXIÓN es una app Server-to-Server OAuth de una cuenta de Zoom: Account
 * ID, Client ID y Client Secret. Cubre uno o muchos usuarios, así que el mismo
 * código sirve si las cinco cuentas de la academia son una organización de
 * Zoom (1 conexión × 5 usuarios) o cinco cuentas sueltas (5 × 1) — DV-002.
 *
 * SEGURIDAD (principio I): el Client Secret se guarda cifrado (AES-256-GCM) y
 * de este módulo solo sale `clientSecretLast4`. El DTO no tiene ningún campo
 * por el que el secreto o el cifrado pudieran viajar
 * (`tests/unit/zoom-secretos.test.ts`).
 *
 * Los resultados son tipados (`ConnResult`) y sin códigos HTTP: quien elige el
 * status es la ruta.
 */

export type ConnectionRow = typeof schema.zoomConnection.$inferSelect;
type NewConnectionRow = typeof schema.zoomConnection.$inferInsert;

/* ============================================================
 * Cifrado de credenciales y del código de acceso
 * ============================================================ */

export function sealClientSecret(plain: string): {
  cipher: string;
  iv: string;
  tag: string;
  last4: string;
} {
  return { ...encryptSecret(plain), last4: plain.slice(-4) };
}

/** Lanza un error PROPIO si el cifrado no abre: nunca repite el texto cifrado. */
export function openClientSecret(
  row: Pick<ConnectionRow, "clientSecretCipher" | "clientSecretIv" | "clientSecretTag">
): string {
  try {
    return decryptSecret({
      cipher: row.clientSecretCipher,
      iv: row.clientSecretIv,
      tag: row.clientSecretTag,
    });
  } catch {
    throw new Error(
      "No se pudo leer el Client Secret guardado de la conexión de Zoom. Volvé a cargarlo."
    );
  }
}

export type SealedPasscode = {
  passcodeCipher: string | null;
  passcodeIv: string | null;
  passcodeTag: string | null;
};

/**
 * DV-008 — El código de acceso de una grabación no es una credencial de
 * integración, pero abre contenido de clase a quien lo tenga: va cifrado igual.
 */
export function sealPasscode(plain: string | null): SealedPasscode {
  if (!plain) return { passcodeCipher: null, passcodeIv: null, passcodeTag: null };
  const e = encryptSecret(plain);
  return { passcodeCipher: e.cipher, passcodeIv: e.iv, passcodeTag: e.tag };
}

export function openPasscode(row: SealedPasscode): string | null {
  if (!row.passcodeCipher || !row.passcodeIv || !row.passcodeTag) return null;
  try {
    return decryptSecret({ cipher: row.passcodeCipher, iv: row.passcodeIv, tag: row.passcodeTag });
  } catch {
    return null;
  }
}

/* ============================================================
 * DTO
 * ============================================================ */

export type ConnectionRoomDto = {
  id: string;
  name: string;
  zoomUserId: string;
  zoomUserEmail: string | null;
};

export type ZoomConnectionDto = {
  id: string;
  name: string;
  accountId: string;
  clientId: string;
  /** JAMÁS el secreto ni el cifrado. */
  clientSecretLast4: string;
  status: "sin_probar" | "ok" | "error";
  lastError: string | null;
  lastTestedAt: string | null;
  archived: boolean;
  rooms: ConnectionRoomDto[];
};

/** La forma del `GET /api/settings/zoom/connections`: lo único que sale. */
export function toConnectionDto(row: ConnectionRow, rooms: ConnectionRoomDto[]): ZoomConnectionDto {
  return {
    id: row.id,
    name: row.name,
    accountId: row.accountId,
    clientId: row.clientId,
    clientSecretLast4: row.clientSecretLast4,
    status: row.status,
    lastError: row.lastError,
    lastTestedAt: row.lastTestedAt?.toISOString() ?? null,
    archived: row.archivedAt !== null,
    rooms,
  };
}

/* ============================================================
 * Almacenamiento (inyectable: los tests usan uno en memoria)
 * ============================================================ */

export type LinkedRoom = ConnectionRoomDto & { zoomConnectionId: string; archived: boolean };

export interface ConnectionStore {
  list(orgId: string): Promise<ConnectionRow[]>;
  get(orgId: string, id: string): Promise<ConnectionRow | null>;
  exists(orgId: string, field: "accountId" | "name", value: string, excludeId?: string): Promise<boolean>;
  insert(row: NewConnectionRow): Promise<ConnectionRow>;
  update(orgId: string, id: string, patch: Partial<NewConnectionRow>): Promise<ConnectionRow | null>;
  /** Aulas con vínculo a Zoom, archivadas incluidas. */
  linkedRooms(orgId: string): Promise<LinkedRoom[]>;
  getRoom(orgId: string, roomId: string): Promise<{ id: string; name: string; archivedAt: Date | null } | null>;
  /** Otra aula ACTIVA que ya usa ese usuario de esa conexión. */
  roomUsing(
    orgId: string,
    connectionId: string,
    zoomUserId: string,
    excludeRoomId: string
  ): Promise<{ id: string; name: string } | null>;
  setRoomLink(
    orgId: string,
    roomId: string,
    link: { connectionId: string; zoomUserId: string; zoomUserEmail?: string | null } | null
  ): Promise<void>;
  refreshRoomEmails(orgId: string, connectionId: string, users: { id: string; email: string }[]): Promise<void>;
}

const dbStore: ConnectionStore = {
  async list(orgId) {
    return getDb()
      .select()
      .from(schema.zoomConnection)
      .where(scoped(schema.zoomConnection.organizationId, orgId))
      .orderBy(asc(schema.zoomConnection.name));
  },
  async get(orgId, id) {
    const [row] = await getDb()
      .select()
      .from(schema.zoomConnection)
      .where(scoped(schema.zoomConnection.organizationId, orgId, eq(schema.zoomConnection.id, id)))
      .limit(1);
    return row ?? null;
  },
  async exists(orgId, field, value, excludeId) {
    const col = field === "accountId" ? schema.zoomConnection.accountId : schema.zoomConnection.name;
    const rows = await getDb()
      .select({ id: schema.zoomConnection.id })
      .from(schema.zoomConnection)
      .where(
        scoped(
          schema.zoomConnection.organizationId,
          orgId,
          eq(col, value),
          excludeId ? ne(schema.zoomConnection.id, excludeId) : undefined
        )
      )
      .limit(1);
    return rows.length > 0;
  },
  async insert(row) {
    const [created] = await getDb().insert(schema.zoomConnection).values(row).returning();
    return created!;
  },
  async update(orgId, id, patch) {
    const [row] = await getDb()
      .update(schema.zoomConnection)
      .set({ ...patch, updatedAt: new Date() })
      .where(scoped(schema.zoomConnection.organizationId, orgId, eq(schema.zoomConnection.id, id)))
      .returning();
    return row ?? null;
  },
  async linkedRooms(orgId) {
    const rows = await getDb()
      .select({
        id: schema.virtualRoom.id,
        name: schema.virtualRoom.name,
        zoomConnectionId: schema.virtualRoom.zoomConnectionId,
        zoomUserId: schema.virtualRoom.zoomUserId,
        zoomUserEmail: schema.virtualRoom.zoomUserEmail,
        archivedAt: schema.virtualRoom.archivedAt,
      })
      .from(schema.virtualRoom)
      .where(scoped(schema.virtualRoom.organizationId, orgId, isNotNull(schema.virtualRoom.zoomConnectionId)))
      .orderBy(asc(schema.virtualRoom.name));
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      zoomConnectionId: r.zoomConnectionId!,
      zoomUserId: r.zoomUserId!,
      zoomUserEmail: r.zoomUserEmail,
      archived: r.archivedAt !== null,
    }));
  },
  async getRoom(orgId, roomId) {
    const [row] = await getDb()
      .select({ id: schema.virtualRoom.id, name: schema.virtualRoom.name, archivedAt: schema.virtualRoom.archivedAt })
      .from(schema.virtualRoom)
      .where(scoped(schema.virtualRoom.organizationId, orgId, eq(schema.virtualRoom.id, roomId)))
      .limit(1);
    return row ?? null;
  },
  async roomUsing(orgId, connectionId, zoomUserId, excludeRoomId) {
    const [row] = await getDb()
      .select({ id: schema.virtualRoom.id, name: schema.virtualRoom.name })
      .from(schema.virtualRoom)
      .where(
        scoped(
          schema.virtualRoom.organizationId,
          orgId,
          and(
            eq(schema.virtualRoom.zoomConnectionId, connectionId),
            eq(schema.virtualRoom.zoomUserId, zoomUserId),
            isNull(schema.virtualRoom.archivedAt),
            ne(schema.virtualRoom.id, excludeRoomId)
          )
        )
      )
      .limit(1);
    return row ?? null;
  },
  async setRoomLink(orgId, roomId, link) {
    await getDb()
      .update(schema.virtualRoom)
      .set({
        zoomConnectionId: link?.connectionId ?? null,
        zoomUserId: link?.zoomUserId ?? null,
        zoomUserEmail: link ? (link.zoomUserEmail ?? null) : null,
        updatedAt: new Date(),
      })
      .where(scoped(schema.virtualRoom.organizationId, orgId, eq(schema.virtualRoom.id, roomId)));
  },
  async refreshRoomEmails(orgId, connectionId, users) {
    for (const u of users) {
      await getDb()
        .update(schema.virtualRoom)
        .set({ zoomUserEmail: u.email, updatedAt: new Date() })
        .where(
          scoped(
            schema.virtualRoom.organizationId,
            orgId,
            and(eq(schema.virtualRoom.zoomConnectionId, connectionId), eq(schema.virtualRoom.zoomUserId, u.id))
          )
        );
    }
  },
};

export type ZoomConnectionDeps = {
  store: ConnectionStore;
  zoom: {
    listUsers: (creds: ZoomCredentials) => Promise<ZoomUser[]>;
    forgetToken: (connectionId: string) => void;
  };
  newId: () => string;
};

const defaultDeps: ZoomConnectionDeps = {
  store: dbStore,
  zoom: { listUsers: zoomListUsers, forgetToken: zoomForgetToken },
  newId: () => newId("zoomConnection"),
};

/* ============================================================
 * Entrada (Zod)
 * ============================================================ */

const secretSchema = z
  .string()
  .trim()
  .min(8, "El Client Secret tiene que tener al menos 8 caracteres.")
  .max(256, "El Client Secret es demasiado largo.");

export const createConnectionSchema = z
  .object({
    name: z.string().trim().min(1, "Poné un nombre para la conexión.").max(80),
    accountId: z.string().trim().min(1, "Falta el Account ID.").max(128),
    clientId: z.string().trim().min(1, "Falta el Client ID.").max(128),
    clientSecret: secretSchema,
  })
  .strict();

export const updateConnectionSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    accountId: z.string().trim().min(1).max(128).optional(),
    clientId: z.string().trim().min(1).max(128).optional(),
    /** Vacío o ausente = conservar el anterior. */
    clientSecret: z.union([z.literal(""), secretSchema]).optional(),
    archived: z.boolean().optional(),
  })
  .strict();

export type CreateConnectionInput = z.infer<typeof createConnectionSchema>;
export type UpdateConnectionInput = z.infer<typeof updateConnectionSchema>;

export type ConnErrorCode =
  | "no_existe"
  | "cuenta_duplicada"
  | "nombre_duplicado"
  | "conexion_archivada"
  | "aula_archivada"
  | "usuario_ya_vinculado";

export type ConnResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: ConnErrorCode; message: string; roomName?: string };

const fail = (code: ConnErrorCode, message: string, roomName?: string): ConnResult<never> =>
  roomName !== undefined ? { ok: false, code, message, roomName } : { ok: false, code, message };

/* ============================================================
 * Operaciones
 * ============================================================ */

async function roomsByConnection(orgId: string, store: ConnectionStore) {
  const map = new Map<string, ConnectionRoomDto[]>();
  for (const r of await store.linkedRooms(orgId)) {
    if (r.archived) continue;
    const lista = map.get(r.zoomConnectionId) ?? [];
    lista.push({ id: r.id, name: r.name, zoomUserId: r.zoomUserId, zoomUserEmail: r.zoomUserEmail });
    map.set(r.zoomConnectionId, lista);
  }
  return map;
}

export async function listConnections(
  orgId: string,
  deps: ZoomConnectionDeps = defaultDeps
): Promise<ZoomConnectionDto[]> {
  const rows = await deps.store.list(orgId);
  const rooms = await roomsByConnection(orgId, deps.store);
  return rows.map((r) => toConnectionDto(r, rooms.get(r.id) ?? []));
}

async function dtoOf(orgId: string, row: ConnectionRow, deps: ZoomConnectionDeps) {
  const rooms = await roomsByConnection(orgId, deps.store);
  return toConnectionDto(row, rooms.get(row.id) ?? []);
}

export async function createConnection(
  orgId: string,
  input: CreateConnectionInput,
  userId: string | null,
  deps: ZoomConnectionDeps = defaultDeps
): Promise<ConnResult<ZoomConnectionDto>> {
  if (await deps.store.exists(orgId, "accountId", input.accountId)) {
    return fail("cuenta_duplicada", "Esa cuenta de Zoom (Account ID) ya está conectada.");
  }
  if (await deps.store.exists(orgId, "name", input.name)) {
    return fail("nombre_duplicado", `Ya hay una conexión llamada "${input.name}".`);
  }
  const sealed = sealClientSecret(input.clientSecret);
  const row = await deps.store.insert({
    id: deps.newId(),
    organizationId: orgId,
    name: input.name,
    accountId: input.accountId,
    clientId: input.clientId,
    clientSecretCipher: sealed.cipher,
    clientSecretIv: sealed.iv,
    clientSecretTag: sealed.tag,
    clientSecretLast4: sealed.last4,
    status: "sin_probar",
    createdBy: userId,
  });
  return { ok: true, data: await dtoOf(orgId, row, deps) };
}

export async function updateConnection(
  orgId: string,
  id: string,
  input: UpdateConnectionInput,
  deps: ZoomConnectionDeps = defaultDeps
): Promise<ConnResult<ZoomConnectionDto>> {
  const actual = await deps.store.get(orgId, id);
  if (!actual) return fail("no_existe", "Conexión no encontrada.");

  if (input.accountId !== undefined && input.accountId !== actual.accountId) {
    if (await deps.store.exists(orgId, "accountId", input.accountId, id)) {
      return fail("cuenta_duplicada", "Esa cuenta de Zoom (Account ID) ya está conectada.");
    }
  }
  if (input.name !== undefined && input.name !== actual.name) {
    if (await deps.store.exists(orgId, "name", input.name, id)) {
      return fail("nombre_duplicado", `Ya hay una conexión llamada "${input.name}".`);
    }
  }

  const secretoNuevo = input.clientSecret ? sealClientSecret(input.clientSecret) : null;
  // Cambiar CUALQUIER credencial invalida la prueba anterior y el token cacheado.
  const credencialesCambiaron =
    secretoNuevo !== null ||
    (input.accountId !== undefined && input.accountId !== actual.accountId) ||
    (input.clientId !== undefined && input.clientId !== actual.clientId);

  const row = await deps.store.update(orgId, id, {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.accountId !== undefined ? { accountId: input.accountId } : {}),
    ...(input.clientId !== undefined ? { clientId: input.clientId } : {}),
    ...(secretoNuevo
      ? {
          clientSecretCipher: secretoNuevo.cipher,
          clientSecretIv: secretoNuevo.iv,
          clientSecretTag: secretoNuevo.tag,
          clientSecretLast4: secretoNuevo.last4,
        }
      : {}),
    ...(credencialesCambiaron ? { status: "sin_probar" as const, lastError: null } : {}),
    ...(input.archived !== undefined ? { archivedAt: input.archived ? new Date() : null } : {}),
  });
  if (!row) return fail("no_existe", "Conexión no encontrada.");
  if (credencialesCambiaron) deps.zoom.forgetToken(id);
  return { ok: true, data: await dtoOf(orgId, row, deps) };
}

/** Las credenciales descifradas de una conexión, para el adaptador. */
export function credentialsOf(row: ConnectionRow): ZoomCredentials {
  return {
    connectionId: row.id,
    accountId: row.accountId,
    clientId: row.clientId,
    clientSecret: openClientSecret(row),
  };
}

export async function loadZoomCredentials(orgId: string, connectionId: string): Promise<ZoomCredentials> {
  const row = await dbStore.get(orgId, connectionId);
  if (!row) throw new Error("Conexión de Zoom no encontrada.");
  return credentialsOf(row);
}

export type TestOutcome =
  | { ok: true; users: { id: string; email: string; displayName: string }[] }
  | { ok: false; error: ZoomErrorCode; message: string };

/**
 * "Probar": lista los usuarios de la cuenta. El fallo de Zoom NO es un fallo
 * del CRM —es el resultado de la prueba— y se devuelve con un mensaje propio,
 * nunca con la respuesta cruda.
 */
export async function testConnection(
  orgId: string,
  id: string,
  deps: ZoomConnectionDeps = defaultDeps
): Promise<ConnResult<TestOutcome>> {
  const row = await deps.store.get(orgId, id);
  if (!row) return fail("no_existe", "Conexión no encontrada.");

  let outcome: TestOutcome;
  try {
    const users = await deps.zoom.listUsers(credentialsOf(row));
    outcome = {
      ok: true,
      users: users.map((u) => ({ id: u.id, email: u.email, displayName: u.displayName })),
    };
  } catch (err) {
    outcome =
      err instanceof ZoomError
        ? { ok: false, error: err.code, message: err.message }
        : {
            ok: false,
            error: "credenciales_invalidas",
            message: "No se pudo probar la conexión. Revisá las credenciales y volvé a intentar.",
          };
  }

  const ahora = new Date();
  if (outcome.ok) {
    await deps.store.update(orgId, id, { status: "ok", lastError: null, lastTestedAt: ahora });
    await deps.store.refreshRoomEmails(orgId, id, outcome.users);
  } else {
    await deps.store.update(orgId, id, {
      status: "error",
      lastError: `${outcome.error}: ${outcome.message}`,
      lastTestedAt: ahora,
    });
  }
  return { ok: true, data: outcome };
}

export const linkRoomSchema = z.union([
  z
    .object({
      connectionId: z.string().min(1),
      zoomUserId: z.string().trim().min(1),
      zoomUserEmail: z.string().trim().max(254).optional(),
    })
    .strict(),
  z.object({ connectionId: z.null() }).strict(),
]);

/** Vincula (o con `null` desvincula) un aula a un usuario de una conexión. */
export async function linkRoom(
  orgId: string,
  roomId: string,
  link: { connectionId: string; zoomUserId: string; zoomUserEmail?: string | null } | null,
  deps: ZoomConnectionDeps = defaultDeps
): Promise<ConnResult<null>> {
  const room = await deps.store.getRoom(orgId, roomId);
  if (!room) return fail("no_existe", "Aula no encontrada.");

  if (link === null) {
    await deps.store.setRoomLink(orgId, roomId, null);
    return { ok: true, data: null };
  }

  if (room.archivedAt) return fail("aula_archivada", "El aula está dada de baja: reactivala antes de vincularla.");
  const conn = await deps.store.get(orgId, link.connectionId);
  if (!conn) return fail("no_existe", "Conexión no encontrada.");
  if (conn.archivedAt) return fail("conexion_archivada", "La conexión está archivada: no se puede vincular.");

  const otra = await deps.store.roomUsing(orgId, link.connectionId, link.zoomUserId, roomId);
  if (otra) {
    return fail(
      "usuario_ya_vinculado",
      `Ese usuario de Zoom ya hospeda el aula "${otra.name}".`,
      otra.name
    );
  }
  await deps.store.setRoomLink(orgId, roomId, link);
  return { ok: true, data: null };
}
