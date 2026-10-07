import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb, getRootDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { withOrganizationScope } from "@/lib/db/with-tenant";
import { esInicioDeSesion, type ActivityKind } from "@/lib/activity-kinds";

/**
 * 2026-10-07 — El registro de actividad: anotar lo que una persona hizo y
 * leerlo después desde el legajo.
 *
 * `recordActivity` es la pieza para reusar: escribe con `getDb()`, así que
 * corre dentro de la transacción del pedido (y de su RLS) si hay una, y el
 * llamador decide el alcance. Lo que NO tiene pedido —el login— entra por
 * `recordPortalSignIn`, que abre su propio `withOrganizationScope`.
 */

export type ActivityInput = {
  organizationId: string;
  kind: ActivityKind;
  contactId?: string | null;
  userId?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
};

/** Los textos que vienen del navegador se recortan: una cabecera no es un documento. */
const recortar = (s: string | null | undefined, max: number) =>
  s ? s.slice(0, max) : null;

export async function recordActivity(input: ActivityInput): Promise<string> {
  const id = newId("activityLog");
  await getDb()
    .insert(schema.activityLog)
    .values({
      id,
      organizationId: input.organizationId,
      contactId: input.contactId ?? null,
      userId: input.userId ?? null,
      kind: input.kind,
      metadata: input.metadata ?? {},
      ipAddress: recortar(input.ipAddress, 64),
      userAgent: recortar(input.userAgent, 512),
    });
  return id;
}

/**
 * Un ingreso al portal, desde `databaseHooks.session.create.after`.
 *
 * - Solo si la sesión nació de un LOGIN (`esInicioDeSesion`): el alta de la
 *   cuenta la hace el staff, y anotarla le atribuiría al alumno su IP.
 * - Solo cuentas con `account_link` vigente: el staff no tiene vínculo y no
 *   se registra (fuera del alcance de este cambio).
 * - `account_link` está fuera de RLS a propósito (es la tabla que dice de
 *   quién es la cuenta), así que se lee antes de declarar organización. La
 *   escritura, en cambio, va DENTRO de `withOrganizationScope`.
 *
 * **NUNCA lanza.** Corre dentro del login: un fallo acá dejaría a la persona
 * afuera por un problema de bitácora. Se loguea el motivo, sin la IP ni el
 * user agent ni nada de la sesión.
 */
export async function recordPortalSignIn(
  session: { userId: string; ipAddress?: string | null; userAgent?: string | null },
  path: string | null | undefined
): Promise<void> {
  if (!esInicioDeSesion(path)) return;
  try {
    const links = await getRootDb()
      .select({
        organizationId: schema.accountLink.organizationId,
        kind: schema.accountLink.kind,
        contactId: schema.accountLink.contactId,
        teacherId: schema.accountLink.teacherId,
      })
      .from(schema.accountLink)
      .where(
        and(
          eq(schema.accountLink.userId, session.userId),
          isNull(schema.accountLink.suspendedAt)
        )
      );
    if (links.length === 0) return;

    const porOrganizacion = new Map<string, typeof links>();
    for (const l of links) {
      porOrganizacion.set(l.organizationId, [...(porOrganizacion.get(l.organizationId) ?? []), l]);
    }

    for (const [organizationId, propios] of porOrganizacion) {
      await withOrganizationScope(organizationId, session.userId, async () => {
        // Una persona alumno Y profesor entra una vez, pero es dos audiencias:
        // cada legajo (o ficha) tiene que ver su propio ingreso.
        for (const l of propios) {
          await recordActivity({
            organizationId,
            kind: "portal.sign_in",
            contactId: l.contactId,
            userId: session.userId,
            metadata:
              l.kind === "profesor"
                ? { audience: l.kind, teacherId: l.teacherId }
                : { audience: l.kind },
            ipAddress: session.ipAddress,
            userAgent: session.userAgent,
          });
        }
      });
    }
  } catch (err) {
    console.error(
      "[activity-log] no se pudo registrar el ingreso al portal:",
      err instanceof Error ? err.message : "error desconocido"
    );
  }
}

export type ActivityEntry = {
  id: string;
  kind: string;
  createdAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown>;
};

/** Lo último de esta persona, del más nuevo al más viejo. */
export async function listContactActivity(
  organizationId: string,
  contactId: string,
  limit = 50
): Promise<ActivityEntry[]> {
  const rows = await getDb()
    .select({
      id: schema.activityLog.id,
      kind: schema.activityLog.kind,
      createdAt: schema.activityLog.createdAt,
      ipAddress: schema.activityLog.ipAddress,
      userAgent: schema.activityLog.userAgent,
      metadata: schema.activityLog.metadata,
    })
    .from(schema.activityLog)
    .where(
      scoped(
        schema.activityLog.organizationId,
        organizationId,
        eq(schema.activityLog.contactId, contactId)
      )
    )
    .orderBy(desc(schema.activityLog.createdAt))
    .limit(limit);
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}
