import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import {
  sanitizeCapabilities,
  SYSTEM_ROLES,
  type Capability,
} from "@/lib/capabilities";

/**
 * 012 (T019/T020) — Los roles de staff, que ahora se editan desde la pantalla.
 *
 * El reparto de la fase: las CAPACIDADES son lista cerrada en código (el
 * compilador las verifica) y los ROLES viven en la base porque son lo que la
 * dueña quiere cambiar sin esperar un deploy.
 *
 * Crear-roles — Además de editar los sembrados, la dueña crea los suyos
 * ("Coordinación académica": cursada sí, plata y conversaciones no), los
 * renombra y borra los que ya no usa.
 */

export type RoleDto = {
  id: string;
  key: string;
  name: string;
  capabilities: Capability[];
  system: boolean;
  /** Cuántas cuentas tienen este rol hoy. Lo que vuelve real un cambio. */
  memberCount: number;
  /** `true` si es el rol de quien está mirando la pantalla. */
  isOwnRole: boolean;
};

export type RolesResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: 403 | 404 | 409 | 422; code: string; message: string };

type RoleRow = typeof schema.role.$inferSelect;

/**
 * El nombre es lo que se elige en la pantalla de Equipo: dos letras como
 * mínimo para que diga algo, 60 como máximo para que entre en el selector.
 */
export const roleNameSchema = z.string().trim().min(2).max(60);

/** Comparación de nombres: sin espacios de más y sin mirar mayúsculas. */
function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("es");
}

function toDto(row: RoleRow, viewerRoleKey: string, memberCount: number): RoleDto {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    capabilities: sanitizeCapabilities(row.capabilities),
    system: row.system,
    memberCount,
    isOwnRole: row.key === viewerRoleKey,
  };
}

function invalidName(): RolesResult<never> {
  return {
    ok: false,
    status: 422,
    code: "invalid_name",
    message: "El nombre del rol tiene que tener entre 2 y 60 caracteres.",
  };
}

function duplicateName(name: string): RolesResult<never> {
  return {
    ok: false,
    status: 409,
    code: "duplicate_name",
    message: `Ya hay un rol que se llama «${name}». Elegí otro nombre para no confundirlos al asignarlos.`,
  };
}

/**
 * Crear-roles — Nadie reparte una llave que no tiene.
 *
 * `configuracion.editar` abre la pantalla de roles, pero no todas las demás
 * puertas. Sin esta regla, quien configura sin ver la plata podría crearse un
 * rol con `cobranza.editar` y pedir que se lo asignen —o asignárselo él mismo
 * si además gestiona accesos—. Se devuelve 403: es exactamente "no tenés
 * permiso para dar eso".
 */
export function escalationError(
  granted: readonly Capability[],
  viewerCapabilities: readonly Capability[]
): RolesResult<never> | null {
  const propias = new Set(viewerCapabilities);
  const ajenas = granted.filter((c) => !propias.has(c));
  if (ajenas.length === 0) return null;
  return {
    ok: false,
    status: 403,
    code: "escalation",
    message: `No podés otorgar capacidades que tu rol no tiene: ${ajenas.join(", ")}.`,
  };
}

async function findRole(organizationId: string, roleId: string): Promise<RoleRow | undefined> {
  const rows = await getDb()
    .select()
    .from(schema.role)
    .where(scoped(schema.role.organizationId, organizationId, eq(schema.role.id, roleId)))
    .limit(1);
  return rows[0];
}

async function orgRoles(organizationId: string): Promise<RoleRow[]> {
  return getDb()
    .select()
    .from(schema.role)
    .where(scoped(schema.role.organizationId, organizationId));
}

async function countMembers(organizationId: string, roleKey: string): Promise<number> {
  const members = await getDb()
    .select({ role: schema.member.role })
    .from(schema.member)
    .where(scoped(schema.member.organizationId, organizationId, eq(schema.member.role, roleKey)));
  // Se filtra también acá: el `where` ya lo hace, pero contar filas ajenas por
  // un filtro olvidado le diría a la pantalla que un rol está en uso sin estarlo.
  return members.filter((m) => m.role === roleKey).length;
}

/**
 * Roles de la organización.
 *
 * Si todavía no se sembraron (migración 0024 sin correr), devuelve los de
 * código marcados como no persistidos: la pantalla muestra lo que rige de
 * verdad en vez de una lista vacía que haría pensar que nadie puede nada.
 *
 * Crear-roles — Primero los de sistema (en el orden de su llave, como
 * siempre) y después los creados, por nombre: la llave de un rol creado es un
 * id (`rol_…`) y ordenar por ella los mezclaría al azar con los sembrados.
 */
export async function listRoles(
  organizationId: string,
  viewerRoleKey: string
): Promise<RoleDto[]> {
  const db = getDb();

  const rows = await db
    .select()
    .from(schema.role)
    .where(scoped(schema.role.organizationId, organizationId))
    .orderBy(asc(schema.role.key));

  const members = await db
    .select({ role: schema.member.role })
    .from(schema.member)
    .where(scoped(schema.member.organizationId, organizationId));

  const countByKey = new Map<string, number>();
  for (const m of members) countByKey.set(m.role, (countByKey.get(m.role) ?? 0) + 1);

  if (rows.length === 0) {
    return SYSTEM_ROLES.map((r) => ({
      id: `sin-sembrar:${r.key}`,
      key: r.key,
      name: r.name,
      capabilities: [...r.capabilities],
      system: true,
      memberCount: countByKey.get(r.key) ?? 0,
      isOwnRole: r.key === viewerRoleKey,
    }));
  }

  const sistema = rows.filter((r) => r.system);
  const creados = rows
    .filter((r) => !r.system)
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  return [...sistema, ...creados].map((r) =>
    toDto(r, viewerRoleKey, countByKey.get(r.key) ?? 0)
  );
}

/**
 * Crear-roles — Alta de un rol propio de la organización.
 *
 * **La llave es un id generado (`rol_…`), nunca derivada del nombre.** Las
 * sesiones resuelven capacidades por llave, y si la fila falta cae al
 * respaldo en código (`ROLE_CAPABILITIES`): un rol que se llamara "Soporte"
 * con llave `soporte` heredaría ese respaldo. Una llave con prefijo no choca
 * con ninguna sembrada ni de respaldo, hoy ni mañana.
 *
 * No se crea nada en una organización sin roles sembrados: ahí `listRoles`
 * muestra los de código, y una sola fila nueva los taparía a todos.
 */
export async function createRole(
  organizationId: string,
  viewerRoleKey: string,
  viewerCapabilities: readonly Capability[],
  input: { name: unknown; capabilities: unknown }
): Promise<RolesResult<RoleDto>> {
  const name = roleNameSchema.safeParse(input.name);
  if (!name.success) return invalidName();

  const capabilities = sanitizeCapabilities(input.capabilities);
  const escalada = escalationError(capabilities, viewerCapabilities);
  if (escalada) return escalada;

  const existentes = await orgRoles(organizationId);
  if (!existentes.some((r) => r.system)) {
    return {
      ok: false,
      status: 409,
      code: "not_seeded",
      message:
        "Los roles de esta organización todavía no están guardados en la base. Corré las migraciones antes de crear uno nuevo.",
    };
  }

  const buscado = normalizeName(name.data);
  if (existentes.some((r) => normalizeName(r.name) === buscado)) {
    return duplicateName(name.data);
  }

  const id = newId("role");
  const now = new Date();
  const inserted = await getDb()
    .insert(schema.role)
    .values({
      id,
      organizationId,
      key: id,
      name: name.data,
      capabilities,
      system: false,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  const row = inserted[0];
  if (!row) {
    return { ok: false, status: 409, code: "not_created", message: "No se pudo crear el rol" };
  }
  return { ok: true, data: toDto(row, viewerRoleKey, 0) };
}

/**
 * Crear-roles — Cambia el nombre visible de un rol, también de los de
 * sistema: el código decide por la LLAVE, que no se toca, así que renombrar
 * "Soporte" a "Atención" no cambia ningún permiso.
 */
export async function renameRole(
  organizationId: string,
  roleId: string,
  viewerRoleKey: string,
  rawName: unknown
): Promise<RolesResult<RoleDto>> {
  const name = roleNameSchema.safeParse(rawName);
  if (!name.success) return invalidName();

  const role = await findRole(organizationId, roleId);
  if (!role) {
    return { ok: false, status: 404, code: "not_found", message: "Rol no encontrado" };
  }

  const buscado = normalizeName(name.data);
  const otros = await orgRoles(organizationId);
  if (otros.some((r) => r.id !== role.id && normalizeName(r.name) === buscado)) {
    return duplicateName(name.data);
  }

  const updated = await getDb()
    .update(schema.role)
    .set({ name: name.data, updatedAt: new Date() })
    .where(scoped(schema.role.organizationId, organizationId, eq(schema.role.id, roleId)))
    .returning();

  const row = updated[0];
  if (!row) {
    return { ok: false, status: 409, code: "not_updated", message: "No se pudo guardar el rol" };
  }
  return { ok: true, data: toDto(row, viewerRoleKey, await countMembers(organizationId, row.key)) };
}

/**
 * Crear-roles — Borra un rol creado por la organización.
 *
 * **Con cuentas asignadas, no.** La cuenta guarda la LLAVE del rol; sin la
 * fila, la sesión cae al respaldo en código, que para una llave desconocida
 * es "ninguna capacidad". Borrarlo dejaría a esas personas sin poder entrar a
 * nada, sin aviso. Primero se les asigna otro rol.
 *
 * Los de sistema no se borran nunca: son el punto de partida que la siembra
 * vuelve a crear, y `direccion` es el rol del alta inicial.
 */
export async function deleteRole(
  organizationId: string,
  roleId: string
): Promise<RolesResult<{ id: string }>> {
  const role = await findRole(organizationId, roleId);
  if (!role) {
    return { ok: false, status: 404, code: "not_found", message: "Rol no encontrado" };
  }

  if (role.system) {
    return {
      ok: false,
      status: 409,
      code: "system_role",
      message: `«${role.name}» es un rol de sistema y no se puede borrar. Podés cambiarle el nombre o las capacidades.`,
    };
  }

  const enUso = await countMembers(organizationId, role.key);
  if (enUso > 0) {
    return {
      ok: false,
      status: 409,
      code: "role_in_use",
      message:
        enUso === 1
          ? `No se puede borrar «${role.name}»: 1 cuenta lo tiene asignado. Asignale otro rol desde Equipo y volvé a intentar.`
          : `No se puede borrar «${role.name}»: ${enUso} cuentas lo tienen asignado. Asignales otro rol desde Equipo y volvé a intentar.`,
    };
  }

  await getDb()
    .delete(schema.role)
    .where(scoped(schema.role.organizationId, organizationId, eq(schema.role.id, roleId)))
    .returning();

  return { ok: true, data: { id: role.id } };
}

/**
 * 012 (T020) — Cambia las capacidades de un rol.
 *
 * **El guardarraíl que justifica esta función.** Sin él, la dueña puede
 * quitarle `configuracion.editar` a su propio rol y quedar encerrada afuera:
 * la pantalla de roles exige esa misma capacidad, así que el error se vuelve
 * irreversible desde la interfaz. Recuperarlo pediría entrar a la base a mano.
 *
 * Por eso se rechaza SOLO ese caso —quitarte a vos mismo la llave de la
 * puerta— y no cualquier otro cambio: recortar a otro rol es una decisión
 * legítima y reversible.
 *
 * Crear-roles — Y no se puede AGREGAR una capacidad que quien edita no tiene
 * (`escalationError`). Lo que el rol ya tenía puede quedarse.
 */
export async function updateRoleCapabilities(
  organizationId: string,
  roleId: string,
  viewerRoleKey: string,
  viewerCapabilities: readonly Capability[],
  rawCapabilities: unknown
): Promise<RolesResult<RoleDto>> {
  const db = getDb();

  const role = await findRole(organizationId, roleId);
  if (!role) {
    return { ok: false, status: 404, code: "not_found", message: "Rol no encontrado" };
  }

  // La base guarda jsonb, que es texto sin tipo: lo que no está en la lista
  // cerrada no entra, venga de donde venga (DV-003).
  const capabilities = sanitizeCapabilities(rawCapabilities);

  const previas = new Set(sanitizeCapabilities(role.capabilities));
  const escalada = escalationError(
    capabilities.filter((c) => !previas.has(c)),
    viewerCapabilities
  );
  if (escalada) return escalada;

  if (
    role.key === viewerRoleKey &&
    !capabilities.includes("configuracion.editar")
  ) {
    return {
      ok: false,
      status: 422,
      code: "self_lockout",
      message:
        "No podés quitarle «Configurar la instancia» a tu propio rol: es la capacidad que da acceso a esta pantalla, y perderla te dejaría sin forma de volver.",
    };
  }

  const updated = await db
    .update(schema.role)
    .set({ capabilities, updatedAt: new Date() })
    .where(scoped(schema.role.organizationId, organizationId, eq(schema.role.id, roleId)))
    .returning();

  const row = updated[0];
  if (!row) {
    return { ok: false, status: 409, code: "not_updated", message: "No se pudo guardar el rol" };
  }

  return { ok: true, data: toDto(row, viewerRoleKey, await countMembers(organizationId, row.key)) };
}
