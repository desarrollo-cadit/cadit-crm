import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import {
  capabilitiesFor,
  sanitizeCapabilities,
  SYSTEM_ROLES,
  type Capability,
} from "@/lib/capabilities";
import { escalationError, type RolesResult } from "@/server/roles";

/**
 * Crear-roles — Asignar roles a las cuentas del equipo.
 *
 * Vive aparte de `roles.ts` porque responde a OTRA capacidad: los roles se
 * definen con `configuracion.editar` y se reparten con `accesos.gestionar`.
 * Quien reparte no necesita ver la matriz de capacidades de cada rol; necesita
 * saber cuáles puede dar.
 *
 * Las tres reglas:
 * - **sin escalada**: no se da un rol con capacidades que quien lo da no tiene,
 *   ni se toca a alguien que tiene más que quien actúa;
 * - **no a uno mismo**: tu propio rol lo cambia otra persona;
 * - **siempre alguien a cargo**: queda al menos una cuenta con
 *   `configuracion.editar` y `accesos.gestionar`, la que arregla todo lo demás.
 */

/** Lo que el invariante exige que alguien conserve. */
const A_CARGO: readonly Capability[] = ["configuracion.editar", "accesos.gestionar"];

type CandidateRole = { id: string; key: string; name: string; capabilities: Capability[] };

export type AssignableRoleDto = {
  id: string;
  key: string;
  name: string;
  /** `false` si el rol tiene alguna capacidad que quien mira no tiene. */
  assignable: boolean;
};

/**
 * Los roles de la organización, con lo que cada uno otorga DE VERDAD.
 *
 * Sin roles sembrados se ofrecen los de código, igual que `listRoles`: la
 * pantalla tiene que mostrar algo que se pueda elegir.
 */
async function candidateRoles(organizationId: string): Promise<CandidateRole[]> {
  const rows = await getDb()
    .select()
    .from(schema.role)
    .where(scoped(schema.role.organizationId, organizationId));
  if (rows.length === 0) {
    return SYSTEM_ROLES.map((r) => ({
      id: `sin-sembrar:${r.key}`,
      key: r.key,
      name: r.name,
      capabilities: [...r.capabilities],
    }));
  }
  return rows.map((r) => ({
    id: r.id,
    key: r.key,
    name: r.name,
    capabilities: sanitizeCapabilities(r.capabilities),
  }));
}

/**
 * Lo que puede una cuenta con esta llave: la fila si existe, el respaldo en
 * código si no. Es la misma resolución que hace la sesión (`resolveMembership`
 * + `sessionCapabilities`), para que la regla mire lo que la cuenta puede hoy.
 */
function capabilitiesOfKey(roles: CandidateRole[], key: string): readonly Capability[] {
  return roles.find((r) => r.key === key)?.capabilities ?? capabilitiesFor(key);
}

function exceeds(granted: readonly Capability[], viewer: readonly Capability[]): boolean {
  const propias = new Set(viewer);
  return granted.some((c) => !propias.has(c));
}

/** Los roles para el selector de Equipo, sin la matriz de capacidades. */
export async function assignableRoles(
  organizationId: string,
  viewerCapabilities: readonly Capability[]
): Promise<AssignableRoleDto[]> {
  const roles = await candidateRoles(organizationId);
  return roles.map((r) => ({
    id: r.id,
    key: r.key,
    name: r.name,
    assignable: !exceeds(r.capabilities, viewerCapabilities),
  }));
}

/**
 * El rol de una cuenta nueva: tiene que existir en ESTA organización (si no,
 * la llave cae al respaldo de código) y no puede exceder a quien da el alta.
 */
export async function resolveRoleForNewMember(
  organizationId: string,
  viewerCapabilities: readonly Capability[],
  roleKey: string
): Promise<RolesResult<CandidateRole>> {
  const roles = await candidateRoles(organizationId);
  const target = roles.find((r) => r.key === roleKey);
  if (!target) {
    return {
      ok: false,
      status: 422,
      code: "invalid_role",
      message: "Ese rol no existe en la organización",
    };
  }
  const escalada = escalationError(target.capabilities, viewerCapabilities);
  if (escalada) return escalada;
  return { ok: true, data: target };
}

/** Cambia el rol de una cuenta del equipo, con las tres reglas de arriba. */
export async function changeMemberRole(
  organizationId: string,
  actor: { userId: string; capabilities: readonly Capability[] },
  memberId: string,
  roleId: string
): Promise<RolesResult<{ id: string; role: string }>> {
  const db = getDb();

  const found = await db
    .select()
    .from(schema.member)
    .where(scoped(schema.member.organizationId, organizationId, eq(schema.member.id, memberId)))
    .limit(1);
  const member = found[0];
  if (!member) {
    return { ok: false, status: 404, code: "not_found", message: "Cuenta no encontrada" };
  }

  if (member.userId === actor.userId) {
    return {
      ok: false,
      status: 422,
      code: "self_change",
      message: "No podés cambiar tu propio rol: pedíselo a otra persona que gestione accesos.",
    };
  }

  const roles = await candidateRoles(organizationId);
  const target = roles.find((r) => r.id === roleId);
  if (!target) {
    return { ok: false, status: 404, code: "not_found", message: "Rol no encontrado" };
  }

  const escalada = escalationError(target.capabilities, actor.capabilities);
  if (escalada) return escalada;

  if (exceeds(capabilitiesOfKey(roles, member.role), actor.capabilities)) {
    return {
      ok: false,
      status: 403,
      code: "escalation",
      message:
        "No podés cambiarle el rol a una cuenta que puede hacer cosas que tu rol no puede.",
    };
  }

  const members = await db
    .select({ id: schema.member.id, role: schema.member.role })
    .from(schema.member)
    .where(scoped(schema.member.organizationId, organizationId));
  const quedaAlguien = members.some((m) => {
    const key = m.id === member.id ? target.key : m.role;
    const caps = capabilitiesOfKey(roles, key);
    return A_CARGO.every((c) => caps.includes(c));
  });
  if (!quedaAlguien) {
    return {
      ok: false,
      status: 409,
      code: "last_admin",
      message:
        "Con este cambio nadie podría configurar la instancia y gestionar accesos a la vez. Asigná primero ese rol a otra cuenta.",
    };
  }

  const updated = await db
    .update(schema.member)
    .set({ role: target.key })
    .where(scoped(schema.member.organizationId, organizationId, eq(schema.member.id, memberId)))
    .returning();
  if (!updated[0]) {
    return { ok: false, status: 409, code: "not_updated", message: "No se pudo cambiar el rol" };
  }
  return { ok: true, data: { id: member.id, role: target.key } };
}

/* ============================================================
 * 030 (addendum) — Un profesor que también es del equipo
 * ============================================================ */

/**
 * Qué hacer cuando el correo del alta ya tiene usuario.
 *
 * - `adjuntar`: es PROFESOR de esta organización y todavía no es del equipo.
 *   Se le agrega `member` al MISMO usuario: una persona, una contraseña.
 * - `es_alumno`: se rechaza. El panel no es para alumnos, y una cuenta de
 *   alumno con `member` mezclaría dos audiencias que se separan a propósito.
 *   Gana aunque también sea profesor: ante la duda, no se abre el panel.
 * - `ya_es_equipo` / `otra_cuenta`: lo de siempre.
 */
export type ExistingAccountDecision = "adjuntar" | "es_alumno" | "ya_es_equipo" | "otra_cuenta";

export function decideExistingAccount(input: {
  kinds: readonly string[];
  isMember: boolean;
}): ExistingAccountDecision {
  if (input.kinds.includes("alumno")) return "es_alumno";
  if (input.isMember) return "ya_es_equipo";
  return input.kinds.includes("profesor") ? "adjuntar" : "otra_cuenta";
}

export type AddTeamMemberInput = {
  name: string;
  email: string;
  /** Solo para una cuenta NUEVA: a un profesor no se le cambia la suya. */
  password?: string;
  roleKey: string;
};

type AddTeamMemberDeps = {
  signUp: (input: { name: string; email: string; password: string }) => Promise<{ userId: string }>;
};

/**
 * Alta de una cuenta de equipo, o vínculo de un profesor existente al equipo.
 *
 * La regla de escalada se aplica ANTES de mirar el correo: adjuntar un
 * profesor con un rol que quien da el alta no tiene sería la misma escalada
 * por otra puerta. Al adjuntar no se toca la contraseña ni
 * `mustChangePassword`: la persona entra como ya entraba.
 */
export async function addTeamMember(
  organizationId: string,
  viewerCapabilities: readonly Capability[],
  input: AddTeamMemberInput,
  deps: AddTeamMemberDeps
): Promise<RolesResult<{ attached: boolean }>> {
  const target = await resolveRoleForNewMember(organizationId, viewerCapabilities, input.roleKey);
  if (!target.ok) return target;

  const db = getDb();
  const [existente] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(sql`lower(${schema.user.email}) = ${input.email.trim().toLowerCase()}`)
    .limit(1);

  if (existente) {
    // `account_link` y `member` quedan fuera de RLS a propósito (responden
    // "¿de quién es esto?"): el filtro por organización va explícito.
    const links = await db
      .select({ kind: schema.accountLink.kind })
      .from(schema.accountLink)
      .where(
        and(
          eq(schema.accountLink.organizationId, organizationId),
          eq(schema.accountLink.userId, existente.id)
        )
      );
    const miembro = await db
      .select({ id: schema.member.id })
      .from(schema.member)
      .where(scoped(schema.member.organizationId, organizationId, eq(schema.member.userId, existente.id)))
      .limit(1);

    switch (decideExistingAccount({ kinds: links.map((l) => l.kind), isMember: miembro.length > 0 })) {
      case "es_alumno":
        return {
          ok: false,
          status: 409,
          code: "es_alumno",
          message:
            "Ese correo es de un alumno del portal: no puede ser parte del equipo con la misma cuenta. Usá otro correo.",
        };
      case "ya_es_equipo":
        return { ok: false, status: 409, code: "ya_es_equipo", message: "Esa persona ya es parte del equipo." };
      case "otra_cuenta":
        return { ok: false, status: 409, code: "duplicate", message: "Ya existe una cuenta con ese correo" };
      case "adjuntar":
        await db
          .insert(schema.member)
          .values({ id: newId("member"), organizationId, userId: existente.id, role: target.data.key })
          .onConflictDoNothing();
        return { ok: true, data: { attached: true } };
    }
  }

  if (!input.password || input.password.length < 8) {
    return {
      ok: false,
      status: 422,
      code: "password_required",
      message: "Poné una contraseña temporal de al menos 8 caracteres.",
    };
  }

  let userId: string;
  try {
    ({ userId } = await deps.signUp({ name: input.name, email: input.email, password: input.password }));
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo crear la cuenta";
    if (/exist/i.test(message)) {
      return { ok: false, status: 409, code: "duplicate", message: "Ya existe una cuenta con ese correo" };
    }
    return { ok: false, status: 422, code: "invalid", message };
  }

  await db
    .insert(schema.member)
    .values({ id: newId("member"), organizationId, userId, role: target.data.key })
    .onConflictDoNothing();
  return { ok: true, data: { attached: false } };
}

/**
 * Quitar del equipo: borra SOLO la fila de `member`.
 *
 * El usuario no se borra —puede ser profesor y seguir entrando al portal con
 * su misma contraseña— y su `account_link` no se toca. Las mismas reglas que
 * cambiar el rol: no a uno mismo, no a alguien que puede más, y siempre queda
 * alguien a cargo.
 */
export async function removeMember(
  organizationId: string,
  actor: { userId: string; capabilities: readonly Capability[] },
  memberId: string
): Promise<RolesResult<{ id: string }>> {
  const db = getDb();
  const [member] = await db
    .select()
    .from(schema.member)
    .where(scoped(schema.member.organizationId, organizationId, eq(schema.member.id, memberId)))
    .limit(1);
  if (!member) return { ok: false, status: 404, code: "not_found", message: "Cuenta no encontrada" };

  if (member.userId === actor.userId) {
    return {
      ok: false,
      status: 422,
      code: "self_change",
      message: "No podés quitarte del equipo: pedíselo a otra persona que gestione accesos.",
    };
  }

  const roles = await candidateRoles(organizationId);
  if (exceeds(capabilitiesOfKey(roles, member.role), actor.capabilities)) {
    return {
      ok: false,
      status: 403,
      code: "escalation",
      message: "No podés quitar del equipo a una cuenta que puede hacer cosas que tu rol no puede.",
    };
  }

  const members = await db
    .select({ id: schema.member.id, role: schema.member.role })
    .from(schema.member)
    .where(scoped(schema.member.organizationId, organizationId));
  const quedaAlguien = members.some(
    (m) => m.id !== member.id && A_CARGO.every((c) => capabilitiesOfKey(roles, m.role).includes(c))
  );
  if (!quedaAlguien) {
    return {
      ok: false,
      status: 409,
      code: "last_admin",
      message:
        "Si quitás esta cuenta, nadie podría configurar la instancia y gestionar accesos a la vez. Asigná primero ese rol a otra cuenta.",
    };
  }

  await db
    .delete(schema.member)
    .where(scoped(schema.member.organizationId, organizationId, eq(schema.member.id, memberId)))
    .returning({ id: schema.member.id });
  return { ok: true, data: { id: member.id } };
}
