import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { parseMetadata } from "@/server/branding";
import {
  equipoDeBienvenida,
  normalizarEquipoGuardado,
  type EquipoGuardado,
  type PersonaDeContacto,
} from "@/server/email/welcome-email";

/**
 * 036 — Quién es "Soporte técnico" y quién "Coordinación" en el correo de
 * bienvenida.
 *
 * Se elige UNA vez por organización, de entre el equipo (usuarios con fila en
 * `member`), y vive en `organization.metadata.equipoBienvenida` —el mismo
 * JSON donde ya vive la marca— en vez de una tabla nueva: son dos listas de
 * ids que se leen en el mismo momento que la marca, y una tabla con RLS para
 * eso sería maquinaria sin ganancia.
 *
 * Se guardan ids de `user`, no nombres ni correos: el nombre y el correo se
 * resuelven al mandar, así un cambio de correo no deja la bienvenida
 * apuntando a la dirección vieja, y quien deja el equipo desaparece solo.
 */

const LLAVE = "equipoBienvenida";

export type MiembroDelEquipo = { userId: string; name: string; email: string };

/** El equipo de la organización: lo que se puede elegir. */
export async function listarEquipo(organizationId: string): Promise<MiembroDelEquipo[]> {
  return getDb()
    .select({ userId: schema.member.userId, name: schema.user.name, email: schema.user.email })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
    .where(scoped(schema.member.organizationId, organizationId))
    .orderBy(schema.user.name);
}

export async function leerEquipoGuardado(organizationId: string): Promise<EquipoGuardado> {
  const rows = await getDb()
    .select({ metadata: schema.organization.metadata })
    .from(schema.organization)
    .where(eq(schema.organization.id, organizationId))
    .limit(1);
  return normalizarEquipoGuardado(parseMetadata(rows[0]?.metadata ?? null)[LLAVE]);
}

/**
 * Guarda la elección. Un id que no es del equipo se descarta acá y no en la
 * pantalla: la API no le cree al cliente qué personas existen.
 */
export async function guardarEquipo(
  organizationId: string,
  elegido: EquipoGuardado
): Promise<EquipoGuardado> {
  const equipo = new Set((await listarEquipo(organizationId)).map((m) => m.userId));
  const limpio = normalizarEquipoGuardado({
    soporte: elegido.soporte.filter((id) => equipo.has(id)),
    coordinacion: elegido.coordinacion.filter((id) => equipo.has(id)),
  });

  const db = getDb();
  const rows = await db
    .select({ metadata: schema.organization.metadata })
    .from(schema.organization)
    .where(eq(schema.organization.id, organizationId))
    .limit(1);
  const meta = parseMetadata(rows[0]?.metadata ?? null);
  meta[LLAVE] = limpio;
  await db
    .update(schema.organization)
    .set({ metadata: JSON.stringify(meta) })
    .where(eq(schema.organization.id, organizationId));
  return limpio;
}

/** Soporte y coordinación, ya resueltos a nombre y correo de hoy. */
export async function equipoParaBienvenida(
  organizationId: string
): Promise<{ soporte: PersonaDeContacto[]; coordinacion: PersonaDeContacto[] }> {
  const guardado = await leerEquipoGuardado(organizationId);
  if (guardado.soporte.length === 0 && guardado.coordinacion.length === 0) {
    return { soporte: [], coordinacion: [] };
  }
  return equipoDeBienvenida(guardado, await listarEquipo(organizationId));
}
