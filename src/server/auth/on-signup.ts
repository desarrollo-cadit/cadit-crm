import { and, count, eq, sql } from "drizzle-orm";
import { SYSTEM_ROLES } from "@/lib/capabilities";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";

/** Etapas sembradas del pipeline (US2). */
const SEED_STAGES: { name: string; kind: "open" | "won" | "lost" }[] = [
  { name: "Nuevo", kind: "open" },
  { name: "En conversación", kind: "open" },
  { name: "Interesado", kind: "open" },
  { name: "Cliente", kind: "won" },
  { name: "Perdido", kind: "lost" },
];

/**
 * Primer registro de la instancia: crea la organización, deja al usuario como
 * propietario y siembra pipeline + perfil del agente.
 *
 * Solo actúa si NO existe ninguna organización (las cuentas de equipo las crea
 * el propietario y reciben su membresía explícita). Un advisory lock evita que
 * dos registros simultáneos en instancia vacía creen dos organizaciones.
 */
export async function onUserCreated(userId: string, userName: string) {
  const db = getDb();
  await db.transaction(async (tx) => {
    // Lock transaccional de "primer arranque" (clave arbitraria fija):
    // dos registros simultáneos en instancia vacía → solo uno crea la org.
    await tx.execute(sql`select pg_advisory_xact_lock(874201)`);
    const [orgs] = await tx
      .select({ n: count() })
      .from(schema.organization);
    if ((orgs?.n ?? 0) > 0) return;

    const orgId = newId("organization");
    await tx.insert(schema.organization).values({
      id: orgId,
      name: userName ? `Negocio de ${userName}` : "Mi negocio",
      slug: "principal",
    });
    /**
     * 012 (T028) — Declarar la organización recién creada, o RLS rechaza todo
     * lo que viene abajo.
     *
     * `pipeline_stage` y `agent_profile` tienen política `tenant_isolation`
     * con `with check`: sin `app.current_org` fijada, el INSERT se rechaza y
     * —al estar todo en una transacción— revierte también la organización y
     * la membresía. El síntoma es brutal y desconcertante: el registro
     * "funciona" (el usuario queda creado por Better Auth, en su propia
     * transacción) pero la instancia se queda sin organización y nadie puede
     * entrar nunca más.
     *
     * Va acá y no en un envoltorio de afuera porque la organización no existe
     * hasta esta línea: es el único lugar del sistema que declara un alcance
     * que acaba de nacer.
     */
    await tx.execute(sql`select set_config('app.current_org', ${orgId}, true)`);
    await tx.execute(sql`select set_config('app.current_actor', ${userId}, true)`);
    /**
     * 012 (T029) — La primera cuenta nace como `direccion`, no como `owner`.
     *
     * `owner` dejó de existir como llave de rol cuando la migración 0028
     * renombró las cuentas. Seguir creándola así dejaría a cada instalación
     * nueva con un rol SIN MAPEAR: por el respaldo en código funcionaría
     * igual —con todas las capacidades— pero la pantalla de roles mostraría
     * la llave cruda y editar `direccion` no afectaría a nadie. Dos verdades
     * distintas sobre la misma cuenta.
     */
    await tx.insert(schema.member).values({
      id: newId("member"),
      organizationId: orgId,
      userId,
      role: "direccion",
    });
    await tx.insert(schema.pipelineStage).values(
      SEED_STAGES.map((s, i) => ({
        id: newId("stage"),
        organizationId: orgId,
        name: s.name,
        position: i,
        kind: s.kind,
      }))
    );
    await tx.insert(schema.agentProfile).values({
      id: newId("agentProfile"),
      organizationId: orgId,
    });
    /**
     * 012 (T018/T020) — Los roles de sistema, también en el primer arranque.
     *
     * La migración que los siembra solo alcanza a las organizaciones que
     * EXISTÍAN cuando corrió. Una instalación nueva crea su organización
     * después, así que sin esto nacería sin una sola fila en `role`: la
     * pantalla de roles no tendría nada que editar y todo quedaría colgando
     * del respaldo en código para siempre.
     *
     * Se siembra desde `SYSTEM_ROLES` y no repitiendo las listas acá: una
     * segunda copia de "qué puede cada rol" es una copia que se desactualiza.
     */
    await tx.insert(schema.role).values(
      SYSTEM_ROLES.map((r) => ({
        id: newId("role"),
        organizationId: orgId,
        key: r.key,
        name: r.name,
        capabilities: [...r.capabilities],
        system: true,
      }))
    );
  });
}

/** Organización activa de un usuario (su primera membresía). */
export async function resolveActiveOrganizationId(
  userId: string
): Promise<string | null> {
  return (await resolveMembership(userId))?.organizationId ?? null;
}

/**
 * 012 (T019) — Membresía + las capacidades del rol, en UNA consulta.
 *
 * El `leftJoin` a `role` es lo que mueve el mapeo de código a base. Va acá y
 * no dentro de `requireCapability` por dos razones medidas:
 *
 * 1. La sesión ya consulta `member` en cada pedido autenticado. Resolver el
 *    rol en la misma consulta cuesta un join, no un viaje más a la base.
 * 2. `requireCapability` envuelve las 62 rutas. Meterle una consulta propia lo
 *    volvía asíncrono contra la base en cada llamada y rompía todo test que
 *    mockea el driver con una cola de resultados.
 *
 * `capabilities` viene `null` cuando la organización no tiene ese rol sembrado
 * —por ejemplo `owner` y `member`, que hasta T029 no existen como fila—. Ese
 * null es el que activa el respaldo en código; no es un caso de error.
 */
export async function resolveMembership(
  userId: string
): Promise<{
  organizationId: string;
  role: string;
  capabilities: unknown | null;
} | null> {
  const db = getDb();
  const rows = await db
    .select({
      organizationId: schema.member.organizationId,
      role: schema.member.role,
      capabilities: schema.role.capabilities,
    })
    .from(schema.member)
    .leftJoin(
      schema.role,
      and(
        eq(schema.role.organizationId, schema.member.organizationId),
        eq(schema.role.key, schema.member.role)
      )
    )
    .where(eq(schema.member.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}
