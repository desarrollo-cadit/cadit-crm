import { headers } from "next/headers";
import { and, eq, isNull } from "drizzle-orm";
import { getAuth } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import type { AccountLinkKind } from "@/lib/db/schema";

/**
 * 012 (T015, FR-018) — La sesión de PORTAL: alumnos y profesores.
 *
 * Está deliberadamente separada de `requireSession()` (staff) y no comparte
 * una línea con ella. La tentación era agregarle un campo a `SessionContext` y
 * ahorrarse un archivo; el problema es que entonces las dos audiencias pasan
 * por el mismo camino, y basta un `if` mal puesto para que un alumno entre al
 * panel. Dos puertas distintas no se confunden por descuido.
 *
 * La separación no depende de que nadie se equivoque: un usuario de portal
 * **no tiene fila en `member`**, y `requireSession()` exige membresía. Así que
 * una sesión de portal falla `withAuth` por CONSTRUCCIÓN, no por disciplina.
 * Eso es lo que fija `tests/unit/portal-session.test.ts`.
 */

export type PortalLink = {
  kind: AccountLinkKind;
  contactId: string | null;
  teacherId: string | null;
};

export type PortalSession = {
  userId: string;
  organizationId: string;
  /**
   * Una persona puede ser alumno Y profesor (un egresado que después da
   * clases). Por eso son varios y no uno: elegir por ella acá sería adivinar.
   */
  links: PortalLink[];
};

/**
 * Sesión de portal, o `null` si esta cuenta no es alumno ni profesor.
 *
 * Devuelve `null` en vez de lanzar porque el portal responde distinto según la
 * página —y porque "no sos del portal" no siempre es un error: puede ser
 * alguien del staff mirando su propia cuenta.
 *
 * Los vínculos SUSPENDIDOS (DV-007) no cuentan. Si todos lo están, la cuenta
 * existe pero no entra: la fila se conserva para que la persona pueda volver a
 * inscribirse sin perder lo que cursó.
 */
export async function resolvePortalSession(): Promise<PortalSession | null> {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const rows = await getDb()
    .select({
      organizationId: schema.accountLink.organizationId,
      kind: schema.accountLink.kind,
      contactId: schema.accountLink.contactId,
      teacherId: schema.accountLink.teacherId,
    })
    .from(schema.accountLink)
    .where(
      and(
        eq(schema.accountLink.userId, session.user.id),
        isNull(schema.accountLink.suspendedAt)
      )
    );

  const first = rows[0];
  if (!first) return null;

  return {
    userId: session.user.id,
    organizationId: first.organizationId,
    links: rows.map((r) => ({
      kind: r.kind,
      contactId: r.contactId,
      teacherId: r.teacherId,
    })),
  };
}

/** ¿Esta sesión de portal es alumno? Devuelve su `contactId`. */
export function studentContactId(portal: PortalSession): string | null {
  return portal.links.find((l) => l.kind === "alumno")?.contactId ?? null;
}

/** ¿Esta sesión de portal es profesor? Devuelve su `teacherId`. */
export function portalTeacherId(portal: PortalSession): string | null {
  return portal.links.find((l) => l.kind === "profesor")?.teacherId ?? null;
}
