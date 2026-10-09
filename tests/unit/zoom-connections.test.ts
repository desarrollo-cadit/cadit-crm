import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ConnectionRow,
  ConnectionStore,
  ZoomConnectionDeps,
} from "@/server/zoom/connections";
import { ZoomError } from "@/lib/zoom/types";

/**
 * 030 US4 (api-grabaciones.md §Conexiones) — Conexiones de Zoom y vínculo
 * aula ↔ usuario de Zoom.
 *
 * El módulo recibe su almacenamiento por parámetro (`ConnectionStore`): acá
 * se usa uno en memoria que respeta las mismas reglas que la base (unicidad
 * por organización, aulas archivadas). Lo que se prueba es la decisión —qué
 * se rechaza, qué cambia de estado, qué nunca sale— y no drizzle.
 */

vi.mock("@/lib/env", () => ({
  getEnv: () => ({ ENCRYPTION_KEY: Buffer.alloc(32, 3).toString("base64") }),
}));

type Room = {
  id: string;
  organizationId: string;
  name: string;
  archivedAt: Date | null;
  zoomConnectionId: string | null;
  zoomUserId: string | null;
  zoomUserEmail: string | null;
  url: string;
  accountEmail: string | null;
  zoomUserPmi: string | null;
  zoomSyncedThrough: string | null;
};

let connections: ConnectionRow[] = [];
let rooms: Room[] = [];
let seq = 0;

const store: ConnectionStore = {
  async list(org) {
    return connections.filter((c) => c.organizationId === org);
  },
  async get(org, id) {
    return connections.find((c) => c.organizationId === org && c.id === id) ?? null;
  },
  async exists(org, field, value, excludeId) {
    return connections.some(
      (c) => c.organizationId === org && c[field] === value && c.id !== excludeId
    );
  },
  async insert(row) {
    const full = {
      lastError: null,
      lastTestedAt: null,
      lastSyncAt: null,
      syncedThrough: null,
      archivedAt: null,
      createdBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      status: "sin_probar" as const,
      ...row,
    } as ConnectionRow;
    connections.push(full);
    return full;
  },
  async update(org, id, patch) {
    const c = connections.find((x) => x.organizationId === org && x.id === id);
    if (!c) return null;
    Object.assign(c, patch);
    return c;
  },
  async linkedRooms(org) {
    return rooms
      .filter((r) => r.organizationId === org && r.zoomConnectionId)
      .map((r) => ({
        id: r.id,
        name: r.name,
        zoomConnectionId: r.zoomConnectionId!,
        zoomUserId: r.zoomUserId!,
        zoomUserEmail: r.zoomUserEmail,
        zoomUserPmi: r.zoomUserPmi,
        url: r.url,
        archived: r.archivedAt !== null,
      }));
  },
  async getRoom(org, roomId) {
    const r = rooms.find((x) => x.organizationId === org && x.id === roomId);
    return r
      ? {
          id: r.id,
          name: r.name,
          archivedAt: r.archivedAt,
          zoomConnectionId: r.zoomConnectionId,
          zoomUserId: r.zoomUserId,
        }
      : null;
  },
  async roomUsing(org, connectionId, zoomUserId, excludeRoomId) {
    const r = rooms.find(
      (x) =>
        x.organizationId === org &&
        x.zoomConnectionId === connectionId &&
        x.zoomUserId === zoomUserId &&
        x.archivedAt === null &&
        x.id !== excludeRoomId
    );
    return r ? { id: r.id, name: r.name } : null;
  },
  async setRoomLink(org, roomId, link) {
    const r = rooms.find((x) => x.organizationId === org && x.id === roomId)!;
    r.zoomConnectionId = link?.connectionId ?? null;
    r.zoomUserId = link?.zoomUserId ?? null;
    r.zoomUserEmail = link ? (link.zoomUserEmail ?? null) : null;
    r.zoomUserPmi = link ? (link.zoomUserPmi ?? null) : null;
    if (link?.zoomUserEmail) r.accountEmail = link.zoomUserEmail;
    if (!link || link.resetSync) r.zoomSyncedThrough = null;
  },
  async refreshRoomUsers(org, connectionId, users) {
    for (const r of rooms) {
      if (r.organizationId !== org || r.zoomConnectionId !== connectionId) continue;
      const u = users.find((x) => x.id === r.zoomUserId);
      if (u) {
        r.zoomUserEmail = u.email;
        r.zoomUserPmi = u.pmi;
      }
    }
  },
  async setRoomUrl(org, roomId, url, pmi) {
    const r = rooms.find((x) => x.organizationId === org && x.id === roomId)!;
    r.url = url;
    r.zoomUserPmi = pmi;
  },
};

const listUsers = vi.fn();
const forgetToken = vi.fn();
const deps: ZoomConnectionDeps = {
  store,
  zoom: { listUsers, forgetToken },
  newId: () => `zc_${++seq}`,
};

const SECRETO = "secreto-de-prueba-5678";
const ORG = "org_1";

function aula(id: string, name: string, extra: Partial<Room> = {}): Room {
  const r: Room = {
    id,
    organizationId: ORG,
    name,
    archivedAt: null,
    zoomConnectionId: null,
    zoomUserId: null,
    zoomUserEmail: null,
    url: "https://zoom.us/j/1000000001",
    accountEmail: null,
    zoomUserPmi: null,
    zoomSyncedThrough: null,
    ...extra,
  };
  rooms.push(r);
  return r;
}

async function mod() {
  return import("@/server/zoom/connections");
}

beforeEach(() => {
  connections = [];
  rooms = [];
  seq = 0;
  listUsers.mockReset();
  forgetToken.mockReset();
});

describe("esquemas de entrada", () => {
  it("POST: todos requeridos, trim, secreto 8..256, sin campos extra", async () => {
    const { createConnectionSchema } = await mod();
    const ok = createConnectionSchema.safeParse({
      name: "  Zoom academia ",
      accountId: " acc-1 ",
      clientId: "cli",
      clientSecret: SECRETO,
    });
    expect(ok.success && ok.data.name).toBe("Zoom academia");
    expect(ok.success && ok.data.accountId).toBe("acc-1");
    expect(createConnectionSchema.safeParse({ name: "x", accountId: "a", clientId: "c" }).success).toBe(false);
    expect(
      createConnectionSchema.safeParse({ name: "x", accountId: "a", clientId: "c", clientSecret: "corto" }).success
    ).toBe(false);
    expect(
      createConnectionSchema.safeParse({
        name: "x",
        accountId: "a",
        clientId: "c",
        clientSecret: SECRETO,
        extra: 1,
      }).success
    ).toBe(false);
  });

  it("PATCH: secreto vacío o ausente es válido (conservar); uno corto no", async () => {
    const { updateConnectionSchema } = await mod();
    expect(updateConnectionSchema.safeParse({ name: "Otra" }).success).toBe(true);
    expect(updateConnectionSchema.safeParse({ clientSecret: "" }).success).toBe(true);
    expect(updateConnectionSchema.safeParse({ clientSecret: "corto" }).success).toBe(false);
    expect(updateConnectionSchema.safeParse({ archived: true }).success).toBe(true);
    expect(updateConnectionSchema.safeParse({ foo: 1 }).success).toBe(false);
  });
});

describe("alta y edición", () => {
  const input = { name: "Zoom academia", accountId: "acc-1", clientId: "cli-1", clientSecret: SECRETO };

  it("crea cifrado, sin_probar, y el DTO solo trae los últimos 4", async () => {
    const { createConnection } = await mod();
    const r = await createConnection(ORG, input, "usr_1", deps);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.clientSecretLast4).toBe("5678");
    expect(r.data.status).toBe("sin_probar");
    expect(JSON.stringify(r.data)).not.toContain(SECRETO);
    expect(connections[0]!.clientSecretCipher).not.toContain(SECRETO);
  });

  it("cuenta repetida → cuenta_duplicada; nombre repetido → nombre_duplicado", async () => {
    const { createConnection } = await mod();
    await createConnection(ORG, input, null, deps);
    expect(await createConnection(ORG, { ...input, name: "Otra" }, null, deps)).toMatchObject({
      ok: false,
      code: "cuenta_duplicada",
    });
    expect(await createConnection(ORG, { ...input, accountId: "acc-2" }, null, deps)).toMatchObject({
      ok: false,
      code: "nombre_duplicado",
    });
    // otra organización: no choca
    expect((await createConnection("org_2", input, null, deps)).ok).toBe(true);
  });

  it("PATCH con secreto vacío conserva el anterior y NO resetea el estado", async () => {
    const { createConnection, updateConnection, openClientSecret } = await mod();
    const c = await createConnection(ORG, input, null, deps);
    if (!c.ok) throw new Error();
    connections[0]!.status = "ok";
    const r = await updateConnection(ORG, c.data.id, { name: "Renombrada", clientSecret: "" }, deps);
    expect(r).toMatchObject({ ok: true, data: { name: "Renombrada", status: "ok" } });
    expect(openClientSecret(connections[0]!)).toBe(SECRETO);
    expect(forgetToken).not.toHaveBeenCalled();
  });

  it("cambiar credenciales → sin_probar + forgetToken", async () => {
    const { createConnection, updateConnection, openClientSecret } = await mod();
    const c = await createConnection(ORG, input, null, deps);
    if (!c.ok) throw new Error();
    connections[0]!.status = "error";
    const r = await updateConnection(ORG, c.data.id, { clientSecret: "nuevo-secreto-9999" }, deps);
    expect(r).toMatchObject({ ok: true, data: { status: "sin_probar", clientSecretLast4: "9999" } });
    expect(openClientSecret(connections[0]!)).toBe("nuevo-secreto-9999");
    expect(forgetToken).toHaveBeenCalledWith(c.data.id);

    forgetToken.mockReset();
    await updateConnection(ORG, c.data.id, { clientId: "cli-2" }, deps);
    expect(forgetToken).toHaveBeenCalledWith(c.data.id);
  });

  it("archivar y desarchivar", async () => {
    const { createConnection, updateConnection } = await mod();
    const c = await createConnection(ORG, input, null, deps);
    if (!c.ok) throw new Error();
    expect(await updateConnection(ORG, c.data.id, { archived: true }, deps)).toMatchObject({
      ok: true,
      data: { archived: true },
    });
    expect(await updateConnection(ORG, c.data.id, { archived: false }, deps)).toMatchObject({
      ok: true,
      data: { archived: false },
    });
  });

  it("PATCH de una conexión de otra organización → no_existe", async () => {
    const { createConnection, updateConnection } = await mod();
    const c = await createConnection("org_2", input, null, deps);
    if (!c.ok) throw new Error();
    expect(await updateConnection(ORG, c.data.id, { name: "x" }, deps)).toMatchObject({
      ok: false,
      code: "no_existe",
    });
  });

  it("PATCH a una cuenta que ya usa otra conexión → cuenta_duplicada", async () => {
    const { createConnection, updateConnection } = await mod();
    await createConnection(ORG, input, null, deps);
    const b = await createConnection(ORG, { ...input, name: "B", accountId: "acc-2" }, null, deps);
    if (!b.ok) throw new Error();
    expect(await updateConnection(ORG, b.data.id, { accountId: "acc-1" }, deps)).toMatchObject({
      ok: false,
      code: "cuenta_duplicada",
    });
  });
});

describe("Probar la conexión", () => {
  it("con éxito: usuarios, status ok, y refresca el correo de las aulas vinculadas", async () => {
    const { createConnection, testConnection } = await mod();
    const c = await createConnection(
      ORG,
      { name: "Z", accountId: "acc-1", clientId: "cli", clientSecret: SECRETO },
      null,
      deps
    );
    if (!c.ok) throw new Error();
    const room = aula("aula_1", "Zoom 1", {
      zoomConnectionId: c.data.id,
      zoomUserId: "u1",
      zoomUserEmail: "viejo@x",
    });
    listUsers.mockResolvedValue([
      { id: "u1", email: "nuevo@x", displayName: "Zoom 1", type: 2, status: "active", pmi: "5550001111" },
    ]);
    const r = await testConnection(ORG, c.data.id, deps);
    expect(r).toEqual({
      ok: true,
      data: { ok: true, users: [{ id: "u1", email: "nuevo@x", displayName: "Zoom 1", pmi: "5550001111" }] },
    });
    expect(listUsers).toHaveBeenCalledWith({
      connectionId: c.data.id,
      accountId: "acc-1",
      clientId: "cli",
      clientSecret: SECRETO,
    });
    expect(connections[0]).toMatchObject({ status: "ok", lastError: null });
    expect(connections[0]!.lastTestedAt).toBeInstanceOf(Date);
    expect(room.zoomUserEmail).toBe("nuevo@x");
    expect(room.zoomUserPmi).toBe("5550001111");
  });

  it("credenciales inválidas: resultado legible, status error y last_error con código propio", async () => {
    const { createConnection, testConnection } = await mod();
    const c = await createConnection(
      ORG,
      { name: "Z", accountId: "acc-1", clientId: "cli", clientSecret: SECRETO },
      null,
      deps
    );
    if (!c.ok) throw new Error();
    listUsers.mockRejectedValue(new ZoomError("credenciales_invalidas", "Zoom rechazó las credenciales."));
    const r = await testConnection(ORG, c.data.id, deps);
    expect(r).toEqual({
      ok: true,
      data: { ok: false, error: "credenciales_invalidas", message: "Zoom rechazó las credenciales." },
    });
    expect(connections[0]!.status).toBe("error");
    expect(connections[0]!.lastError).toMatch(/^credenciales_invalidas: /);
    expect(JSON.stringify(r)).not.toContain(SECRETO);
  });

  it("un error inesperado no se filtra crudo", async () => {
    const { createConnection, testConnection } = await mod();
    const c = await createConnection(
      ORG,
      { name: "Z", accountId: "acc-1", clientId: "cli", clientSecret: SECRETO },
      null,
      deps
    );
    if (!c.ok) throw new Error();
    listUsers.mockRejectedValue(new Error(`boom ${SECRETO}`));
    const r = await testConnection(ORG, c.data.id, deps);
    expect(r.ok && r.data.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain(SECRETO);
    expect(connections[0]!.lastError ?? "").not.toContain(SECRETO);
  });

  it("conexión inexistente → no_existe", async () => {
    const { testConnection } = await mod();
    expect(await testConnection(ORG, "zc_nada", deps)).toMatchObject({ ok: false, code: "no_existe" });
  });
});

describe("vincular aulas", () => {
  async function conexion(org = ORG, accountId = "acc-1", name = "Z") {
    const { createConnection } = await mod();
    const c = await createConnection(org, { name, accountId, clientId: "cli", clientSecret: SECRETO }, null, deps);
    if (!c.ok) throw new Error();
    return c.data.id;
  }

  it("vincula y desvincula", async () => {
    const { linkRoom } = await mod();
    const zc = await conexion();
    const room = aula("aula_1", "Zoom 1");
    expect(await linkRoom(ORG, "aula_1", { connectionId: zc, zoomUserId: "u1", zoomUserEmail: "z1@x" }, deps)).toEqual({
      ok: true,
      data: null,
    });
    expect(room).toMatchObject({ zoomConnectionId: zc, zoomUserId: "u1", zoomUserEmail: "z1@x" });
    expect(await linkRoom(ORG, "aula_1", null, deps)).toEqual({ ok: true, data: null });
    expect(room).toMatchObject({ zoomConnectionId: null, zoomUserId: null, zoomUserEmail: null });
  });

  it("al vincular, el correo de la cuenta del aula pasa a ser el del usuario de Zoom y se guarda su PMI", async () => {
    const { linkRoom } = await mod();
    const zc = await conexion();
    const room = aula("aula_1", "Zoom 1", { accountEmail: "viejo@academia.uy" });
    await linkRoom(ORG, "aula_1", { connectionId: zc, zoomUserId: "u1", zoomUserEmail: "zoom1@academia.uy", zoomUserPmi: "5550001111" }, deps);
    expect(room).toMatchObject({ accountEmail: "zoom1@academia.uy", zoomUserPmi: "5550001111", name: "Zoom 1" });
    // el enlace del aula NO se toca solo
    expect(room.url).toBe("https://zoom.us/j/1000000001");
  });

  it("R-12: cambiar el usuario vinculado vacía la marca del aula; re-vincular el mismo no", async () => {
    const { linkRoom } = await mod();
    const zc = await conexion();
    const room = aula("aula_1", "Zoom 1", { zoomConnectionId: zc, zoomUserId: "u1", zoomSyncedThrough: "2026-10-08" });
    await linkRoom(ORG, "aula_1", { connectionId: zc, zoomUserId: "u1" }, deps);
    expect(room.zoomSyncedThrough).toBe("2026-10-08");
    await linkRoom(ORG, "aula_1", { connectionId: zc, zoomUserId: "u2" }, deps);
    expect(room.zoomSyncedThrough).toBeNull();
  });

  it("usuario ya usado por otra aula activa de esa conexión → usuario_ya_vinculado con roomName", async () => {
    const { linkRoom } = await mod();
    const zc = await conexion();
    aula("aula_1", "Zoom 1", { zoomConnectionId: zc, zoomUserId: "u1" });
    aula("aula_2", "Zoom 2");
    expect(await linkRoom(ORG, "aula_2", { connectionId: zc, zoomUserId: "u1" }, deps)).toMatchObject({
      ok: false,
      code: "usuario_ya_vinculado",
      roomName: "Zoom 1",
    });
    // re-vincular la misma aula al mismo usuario no es conflicto
    expect((await linkRoom(ORG, "aula_1", { connectionId: zc, zoomUserId: "u1" }, deps)).ok).toBe(true);
  });

  it("una aula ARCHIVADA no bloquea el usuario", async () => {
    const { linkRoom } = await mod();
    const zc = await conexion();
    aula("aula_vieja", "Zoom viejo", { zoomConnectionId: zc, zoomUserId: "u1", archivedAt: new Date() });
    aula("aula_2", "Zoom 2");
    expect((await linkRoom(ORG, "aula_2", { connectionId: zc, zoomUserId: "u1" }, deps)).ok).toBe(true);
  });

  it("rechaza conexión archivada, conexión de otra organización, aula archivada o ajena", async () => {
    const { linkRoom, updateConnection } = await mod();
    const zc = await conexion();
    const ajena = await conexion("org_2");
    aula("aula_1", "Zoom 1");
    aula("aula_arch", "Archivada", { archivedAt: new Date() });
    rooms.push({ ...rooms[0]!, id: "aula_ajena", organizationId: "org_2" });

    expect(await linkRoom(ORG, "aula_1", { connectionId: ajena, zoomUserId: "u1" }, deps)).toMatchObject({
      ok: false,
      code: "no_existe",
    });
    expect(await linkRoom(ORG, "aula_ajena", { connectionId: zc, zoomUserId: "u1" }, deps)).toMatchObject({
      ok: false,
      code: "no_existe",
    });
    expect(await linkRoom(ORG, "aula_arch", { connectionId: zc, zoomUserId: "u1" }, deps)).toMatchObject({
      ok: false,
      code: "aula_archivada",
    });
    await updateConnection(ORG, zc, { archived: true }, deps);
    expect(await linkRoom(ORG, "aula_1", { connectionId: zc, zoomUserId: "u1" }, deps)).toMatchObject({
      ok: false,
      code: "conexion_archivada",
    });
  });

  it("las dos topologías pasan por el mismo código", async () => {
    const { linkRoom, listConnections } = await mod();
    // 1 conexión × 5 usuarios
    const una = await conexion(ORG, "acc-org", "Organización");
    for (let i = 1; i <= 5; i++) {
      aula(`aula_${i}`, `Zoom ${i}`);
      expect((await linkRoom(ORG, `aula_${i}`, { connectionId: una, zoomUserId: `u${i}` }, deps)).ok).toBe(true);
    }
    // 5 conexiones × 1 usuario (el mismo id de usuario en cuentas distintas no choca)
    for (let i = 1; i <= 5; i++) {
      const zc = await conexion(ORG, `acc-${i}`, `Cuenta ${i}`);
      aula(`aula_s${i}`, `Suelta ${i}`);
      expect((await linkRoom(ORG, `aula_s${i}`, { connectionId: zc, zoomUserId: "u1" }, deps)).ok).toBe(true);
    }
    const lista = await listConnections(ORG, deps);
    expect(lista.find((c) => c.name === "Organización")!.rooms).toHaveLength(5);
    expect(lista.filter((c) => c.name.startsWith("Cuenta")).every((c) => c.rooms.length === 1)).toBe(true);
  });
});

describe("el enlace del aula y la sala personal (PMI)", () => {
  async function vinculada(extra: Partial<Room> = {}) {
    const { createConnection } = await mod();
    const c = await createConnection(ORG, { name: "Z", accountId: "acc-1", clientId: "cli", clientSecret: SECRETO }, null, deps);
    if (!c.ok) throw new Error();
    const room = aula("aula_1", "Zoom 1", { zoomConnectionId: c.data.id, zoomUserId: "u1", ...extra });
    return { zc: c.data.id, room };
  }

  it("el DTO avisa cuando el enlace del aula NO es la sala personal, con el enlace sugerido", async () => {
    const { listConnections } = await mod();
    await vinculada({ zoomUserPmi: "5550001111" });
    const [c] = await listConnections(ORG, deps);
    expect(c!.rooms[0]).toMatchObject({
      roomUrl: "https://zoom.us/j/1000000001",
      zoomUserPmi: "5550001111",
      pmiMismatch: true,
      suggestedUrl: "https://zoom.us/j/5550001111",
    });
  });

  it("sin aviso si coinciden (aunque el enlace tenga pwd) o si Zoom no informó el PMI", async () => {
    const { listConnections } = await mod();
    const { room } = await vinculada({ zoomUserPmi: "5550001111", url: "https://us02web.zoom.us/j/5550001111?pwd=abc" });
    expect((await listConnections(ORG, deps))[0]!.rooms[0]).toMatchObject({ pmiMismatch: false, suggestedUrl: null });
    room.zoomUserPmi = null;
    expect((await listConnections(ORG, deps))[0]!.rooms[0]).toMatchObject({ pmiMismatch: false, suggestedUrl: null });
  });

  it("'Actualizar enlace': consulta a Zoom, pone el enlace de la sala personal y no toca el nombre", async () => {
    const { adoptZoomPmiForRoom } = await mod();
    const { room } = await vinculada({ zoomUserPmi: "1234" });
    listUsers.mockResolvedValue([
      { id: "u1", email: "z1@x", displayName: "Z1", type: 2, status: "active", pmi: "5550001111" },
    ]);
    expect(await adoptZoomPmiForRoom(ORG, "aula_1", deps)).toEqual({
      ok: true,
      data: { url: "https://zoom.us/j/5550001111" },
    });
    expect(room).toMatchObject({ url: "https://zoom.us/j/5550001111", zoomUserPmi: "5550001111", name: "Zoom 1" });
  });

  it("'Actualizar enlace' rechaza: aula sin vincular, usuario sin PMI, y un fallo de Zoom con mensaje propio", async () => {
    const { adoptZoomPmiForRoom } = await mod();
    const { room } = await vinculada();
    aula("aula_suelta", "Suelta");
    expect(await adoptZoomPmiForRoom(ORG, "aula_suelta", deps)).toMatchObject({ ok: false, code: "no_vinculada" });
    expect(await adoptZoomPmiForRoom(ORG, "aula_nada", deps)).toMatchObject({ ok: false, code: "no_existe" });

    listUsers.mockResolvedValue([{ id: "u1", email: "z1@x", displayName: "Z1", type: 2, status: "active", pmi: null }]);
    expect(await adoptZoomPmiForRoom(ORG, "aula_1", deps)).toMatchObject({ ok: false, code: "sin_pmi" });

    listUsers.mockRejectedValue(new ZoomError("zoom_caido", "Zoom no respondió después de varios intentos."));
    expect(await adoptZoomPmiForRoom(ORG, "aula_1", deps)).toEqual({
      ok: false,
      code: "zoom_error",
      message: "Zoom no respondió después de varios intentos.",
    });
    expect(room.url).toBe("https://zoom.us/j/1000000001");
  });
});
