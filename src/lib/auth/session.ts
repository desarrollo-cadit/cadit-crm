import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { sanitizeCapabilities, type Capability } from "@/lib/capabilities";
import { resolveMembership } from "@/server/auth/on-signup";

export type SessionContext = {
  userId: string;
  organizationId: string;
  role: string;
  /**
   * 012 (T019) — Capacidades del rol SEGÚN LA BASE.
   *
   * Opcional a propósito: `undefined` significa "esta organización no tiene
   * ese rol sembrado", y entonces manda el mapeo de código
   * (`capabilitiesFor`). Ese respaldo es lo que hace que la fase 4 se pueda
   * desplegar sin migrar las cuentas: `owner` y `member` todavía no existen
   * como fila en `role` y siguen funcionando igual que siempre.
   */
  capabilities?: readonly Capability[];
};

export class UnauthorizedError extends Error {
  constructor(message = "No autenticado") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/**
 * Sesión + organización activa para route handlers y server components.
 * Lanza UnauthorizedError si no hay sesión u organización.
 */
export async function requireSession(): Promise<SessionContext> {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new UnauthorizedError();
  // La sesión puede crearse antes de que la membresía exista (registro
  // inicial) — la membresía en BD es la fuente de verdad de org + rol.
  const membership = await resolveMembership(session.user.id);
  if (!membership) {
    throw new UnauthorizedError("Sesión sin organización activa");
  }
  return {
    userId: session.user.id,
    organizationId: membership.organizationId,
    role: membership.role,
    // `sanitizeCapabilities` no es paranoia: `capabilities` es jsonb, texto
    // sin tipo. Si alguien borra una capacidad del código, la que quedó
    // huérfana en la fila no puede volver a otorgarse (DV-003).
    capabilities:
      membership.capabilities == null
        ? undefined
        : sanitizeCapabilities(membership.capabilities),
  };
}

/** Igual que requireSession pero devuelve null en vez de lanzar. */
export async function getSessionOrNull(): Promise<SessionContext | null> {
  try {
    return await requireSession();
  } catch {
    return null;
  }
}
