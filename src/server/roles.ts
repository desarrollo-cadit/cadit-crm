import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
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
  | { ok: false; status: 404 | 409 | 422; code: string; message: string };

/**
 * Roles de la organización.
 *
 * Si todavía no se sembraron (migración 0024 sin correr), devuelve los de
 * código marcados como no persistidos: la pantalla muestra lo que rige de
 * verdad en vez de una lista vacía que haría pensar que nadie puede nada.
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

  return rows.map((r) => ({
    id: r.id,
    key: r.key,
    name: r.name,
    capabilities: sanitizeCapabilities(r.capabilities),
    system: r.system,
    memberCount: countByKey.get(r.key) ?? 0,
    isOwnRole: r.key === viewerRoleKey,
  }));
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
 */
export async function updateRoleCapabilities(
  organizationId: string,
  roleId: string,
  viewerRoleKey: string,
  rawCapabilities: unknown
): Promise<RolesResult<RoleDto>> {
  const db = getDb();

  const rows = await db
    .select()
    .from(schema.role)
    .where(scoped(schema.role.organizationId, organizationId, eq(schema.role.id, roleId)))
    .limit(1);

  const role = rows[0];
  if (!role) {
    return { ok: false, status: 404, code: "not_found", message: "Rol no encontrado" };
  }

  // La base guarda jsonb, que es texto sin tipo: lo que no está en la lista
  // cerrada no entra, venga de donde venga (DV-003).
  const capabilities = sanitizeCapabilities(rawCapabilities);

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

  const members = await db
    .select({ role: schema.member.role })
    .from(schema.member)
    .where(scoped(schema.member.organizationId, organizationId));

  return {
    ok: true,
    data: {
      id: row.id,
      key: row.key,
      name: row.name,
      capabilities: sanitizeCapabilities(row.capabilities),
      system: row.system,
      memberCount: members.filter((m) => m.role === row.key).length,
      isOwnRole: row.key === viewerRoleKey,
    },
  };
}
