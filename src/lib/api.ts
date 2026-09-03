import { z } from "zod";
import {
  FINANCIAL_CAPABILITIES,
  sessionCapabilities,
  type Capability,
} from "@/lib/capabilities";
import { requireSession, UnauthorizedError, type SessionContext } from "@/lib/auth/session";
import { withOrganizationScope, withTenantTransaction } from "@/lib/db/with-tenant";

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
    const session = await resolveOr401();
    if (session instanceof Response) return session;
    return runScoped(session, () => handler(session, ...args));
  };
}

/** Sesión, o la Response 401 ya armada. */
async function resolveOr401(): Promise<SessionContext | Response> {
  try {
    return await requireSession();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return apiError(401, "unauthorized", "No autenticado");
    }
    throw err;
  }
}

/**
 * 012 (T024) — Corre el handler dentro de la transacción del pedido y traduce
 * los errores de Postgres.
 *
 * Todo pedido autenticado declara su organización (`SET LOCAL app.current_org`)
 * antes de tocar nada. Es lo que hace que las políticas RLS de la migración
 * 0025 filtren de verdad.
 *
 * **Efecto secundario que conviene tener presente**: si el handler LANZA, la
 * transacción revierte y las escrituras previas del MISMO pedido se deshacen.
 * Antes quedaban a medias. El comportamiento nuevo es mejor —un pedido fallido
 * no deja registros huérfanos— pero es distinto. Devolver una Response de
 * error NO revierte: eso es una decisión del handler, no una falla.
 */
async function runScoped(
  session: SessionContext,
  run: () => Promise<Response>
): Promise<Response> {
  try {
    return await withTenantTransaction(session, run);
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
}

/**
 * 012 (T028) — Envuelve una superficie SIN sesión que igual opera sobre los
 * datos de una organización: el catálogo público, los formularios, el webhook
 * de Meta, `/api/bot/*`.
 *
 * Antes de RLS estas puertas no necesitaban decir de quién eran los datos que
 * tocaban. Ahora sí: sin `app.current_org` declarada no ven ninguna fila y no
 * pueden escribir ninguna — en silencio, que es lo peor de todo.
 *
 * `resolveOrg` es de cada puerta porque cada una averigua la organización de
 * una manera distinta: la instancia única, el token del webhook, la API key.
 * Devolver `null` significa "no puedo determinarla" y corta con la Response
 * que la puerta considere correcta.
 */
export function withOrganization<Args extends unknown[]>(
  actor: string,
  resolveOrg: (...args: Args) => Promise<string | null>,
  onUnresolved: () => Response,
  handler: (organizationId: string, ...args: Args) => Promise<Response>
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    const organizationId = await resolveOrg(...args);
    if (!organizationId) return onUnresolved();
    try {
      return await withOrganizationScope(organizationId, actor, () =>
        handler(organizationId, ...args)
      );
    } catch (err) {
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
  enrollment_contact_cohort_uq: "Ese contacto ya está inscripto en esa cohorte",
  enrollment_contact_general_uq: "Ese contacto ya tiene un lead general abierto",
  // 006 — el server ya sufija el slug para evitarlo; esto cubre la carrera de
  // dos altas simultáneas con el mismo nombre.
  course_org_slug_uq: "Ya existe un curso con esa dirección web (slug)",
  course_category_org_slug_uq: "Ya existe una categoría con esa dirección web (slug)",
};

function describeUniqueViolation(constraintName: string): string {
  return (
    UNIQUE_VIOLATION_MESSAGES[constraintName] ?? "Ya existe un registro con ese dato"
  );
}

/**
 * El texto del 403, según la capacidad que faltó.
 *
 * 012 (T007) — Las 9 rutas financieras venían de `requireFullAccess`, que
 * respondía "Sin acceso a datos financieros". Migrarlas a `requireCapability`
 * a secas les habría cambiado ese texto por el genérico, y el mensaje que lee
 * el usuario TAMBIÉN es comportamiento: la fase 2 no lo toca.
 *
 * Que el texto se derive de la capacidad —en vez de pasarse por parámetro en
 * cada ruta— evita que la próxima ruta financiera nazca con el mensaje
 * equivocado por olvido.
 */
function forbiddenMessage(capability: Capability): string {
  return FINANCIAL_CAPABILITIES.includes(capability)
    ? "Sin acceso a datos financieros"
    : "Sin permiso para esta acción";
}

/**
 * 012 (T003) — Variante de `withAuth` que exige una CAPACIDAD nombrada.
 *
 * El corte ocurre antes de llamar al handler, así que la ruta no llega a
 * consultar la base: un 403 devuelto después de leer ya expuso el dato al
 * proceso (FR-014).
 *
 * 012 (T006-T009) — Es el ÚNICO envoltorio de autorización de las rutas de
 * dominio: `requireFullAccess` desapareció cuando sus 9 rutas se migraron a
 * `inscripciones.editar`, `cobranza.ver` y `cobranza.editar`. Dejar el helper
 * viejo vivo era invitar a que una ruta nueva lo usara y volviera a esconder
 * el permiso detrás de un nombre que no dice qué protege.
 */
export function requireCapability<Args extends unknown[]>(
  capability: Capability,
  handler: (session: SessionContext, ...args: Args) => Promise<Response>
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    const session = await resolveOr401();
    if (session instanceof Response) return session;

    /**
     * 012 (T019) — Desde la fase 4 la respuesta la da la BASE cuando el rol
     * está sembrado, y el mapeo de código solo cuando no lo está.
     *
     * 012 (T024) — El corte va ANTES de abrir la transacción, no adentro.
     * Es el mismo principio de FR-014 que ya regía —un 403 devuelto después
     * de leer ya expuso el dato al proceso— llevado un paso más atrás: a quien
     * no tiene permiso ni se le abre una transacción ni se le gastan dos
     * `set_config` contra la base.
     */
    if (!sessionCapabilities(session).includes(capability)) {
      return apiError(403, "forbidden", forbiddenMessage(capability));
    }

    return runScoped(session, () => handler(session, ...args));
  };
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
