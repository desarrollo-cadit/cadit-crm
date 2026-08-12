import { z } from "zod";
import { requireSession, UnauthorizedError, type SessionContext } from "@/lib/auth/session";

/** Respuesta de error estándar de la API interna (contrato api.md). */
export function apiError(
  status: number,
  code: string,
  message: string
): Response {
  return Response.json({ error: { code, message } }, { status });
}

/**
 * Envuelve un route handler autenticado: resuelve la sesión (401 si no hay),
 * captura errores no controlados (500 sin stack) y deja pasar Response.
 */
export function withAuth<Args extends unknown[]>(
  handler: (session: SessionContext, ...args: Args) => Promise<Response>
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    let session: SessionContext;
    try {
      session = await requireSession();
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        return apiError(401, "unauthorized", "No autenticado");
      }
      throw err;
    }
    try {
      return await handler(session, ...args);
    } catch (err) {
      // 005 (DV-002): violación de constraint única de Postgres → 409
      // explicable en vez del 500 genérico (FR-010/FR-011 piden mensaje claro,
      // US2 acceptance scenario 2: "explica cuál de los dos datos está
      // repetido" — se resuelve el nombre de la constraint a un mensaje
      // legible en vez de uno genérico).
      if (isUniqueViolation(err)) {
        const name = (err as { constraint_name?: unknown }).constraint_name;
        return apiError(
          409,
          "duplicate",
          describeUniqueViolation(typeof name === "string" ? name : "")
        );
      }
      console.error("[api] error no controlado:", err);
      return apiError(500, "internal", "Error interno");
    }
  };
}

/** true si el error es una unique_violation de Postgres (code 23505). */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "23505"
  );
}

const UNIQUE_VIOLATION_MESSAGES: Record<string, string> = {
  contact_org_email_uq: "Ya existe un contacto con ese email",
  contact_org_phone_uq: "Ya existe un contacto con ese celular",
  // wa_identity se deriva del celular normalizado en el alta manual (ventas/
  // enrollments), así que en la práctica esta constraint es la que salta por
  // celular duplicado — el mensaje habla en esos términos, no de jerga interna.
  contact_org_wa_identity_uq: "Ya existe un contacto con ese celular",
  enrollment_contact_cohort_uq: "Ese contacto ya está inscripto en esa camada",
  enrollment_contact_general_uq: "Ese contacto ya tiene un lead general abierto",
};

function describeUniqueViolation(constraintName: string): string {
  return (
    UNIQUE_VIOLATION_MESSAGES[constraintName] ?? "Ya existe un registro con ese dato"
  );
}

/**
 * 005 (DV-001): variante de `withAuth` que además exige acceso completo —
 * responde 403 para `session.role === "soporte"` (rol restringido, sin
 * acceso a datos financieros, FR-016).
 */
export function requireFullAccess<Args extends unknown[]>(
  handler: (session: SessionContext, ...args: Args) => Promise<Response>
): (...args: Args) => Promise<Response> {
  return withAuth(async (session, ...args: Args) => {
    if (session.role === "soporte") {
      return apiError(403, "forbidden", "Sin acceso a datos financieros");
    }
    return handler(session, ...args);
  });
}

/** Parsea query params con un esquema Zod; inválido → Response 422. */
export function parseQuery<S extends z.ZodTypeAny>(
  url: URL,
  schema: S
): { ok: true; data: z.infer<S> } | { ok: false; response: Response } {
  const parsed = schema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join(".") || "query"}: ${i.message}`)
      .join("; ");
    return {
      ok: false,
      response: apiError(422, "invalid_query", detail),
    };
  }
  return { ok: true, data: parsed.data };
}

/** Parsea el body JSON con un esquema Zod; inválido → Response 422. */
export async function parseBody<T>(
  req: Request,
  schema: z.ZodType<T>
): Promise<{ ok: true; data: T } | { ok: false; response: Response }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return {
      ok: false,
      response: apiError(422, "invalid_body", "El body debe ser JSON válido"),
    };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join(".") || "body"}: ${i.message}`)
      .join("; ");
    return {
      ok: false,
      response: apiError(422, "invalid_body", detail),
    };
  }
  return { ok: true, data: parsed.data };
}
