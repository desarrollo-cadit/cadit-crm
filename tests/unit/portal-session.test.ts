import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * 012 (T016, FR-018) — Una sesión de PORTAL no entra al panel.
 *
 * El riesgo que cubre: cuando entren los 340 alumnos (015) y los profesores
 * (014), "usuario autenticado" deja de significar "alguien del staff". Si el
 * gate del panel se quedara en "hay sesión", cada alumno tendría el CRM
 * entero.
 *
 * Lo que se verifica NO es que alguien se acuerde de chequear el rol: es que
 * la separación sea ESTRUCTURAL. Un usuario de portal tiene `user` y
 * `account_link` pero **no tiene fila en `member`**, y `requireSession()`
 * exige membresía. Sin membresía no hay `SessionContext`, y sin
 * `SessionContext` no hay `withAuth` ni `requireCapability`.
 *
 * Sin base: se simula la sesión de Better Auth y la consulta de membresía.
 */

const getSession = vi.fn();

vi.mock("@/lib/auth", () => ({
  getAuth: () => ({ api: { getSession } }),
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));

const resolveMembership = vi.fn();

vi.mock("@/server/auth/on-signup", () => ({
  resolveMembership: (...args: unknown[]) => resolveMembership(...args),
}));

/**
 * 012 (T024) — El caso "el staff sí pasa" atraviesa el borde entero, y ese
 * borde ahora abre la transacción del pedido. Sin este doble intentaría una
 * conexión real.
 */
vi.mock("@/lib/db", () => ({
  getRootDb: () => ({
    transaction: async (fn: (tx: unknown) => unknown) =>
      fn({ execute: async () => [] }),
  }),
  getDb: () => ({
    select: () => ({ from: () => ({ where: async () => [] }) }),
  }),
  schema: new Proxy({}, { get: () => ({}) }),
}));

/** La cuenta de un alumno: sesión válida de Better Auth, sin membresía. */
function sesionDeAlumno() {
  getSession.mockResolvedValue({ user: { id: "usr_alumno" } });
  resolveMembership.mockResolvedValue(null);
}

describe("una sesión de portal no satisface el gate del staff (FR-018)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("withAuth responde 401 y NO ejecuta el handler", async () => {
    sesionDeAlumno();

    const { withAuth } = await import("@/lib/api");
    const handler = vi.fn(async () => Response.json({ ok: true }));
    const res = await withAuth(handler)();

    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  /**
   * El corte ocurre ANTES de mirar capacidades: no es que el alumno tenga un
   * rol sin permisos, es que no llega a tener rol. Si esto devolviera 403 en
   * vez de 401 significaría que se le resolvió una sesión de staff, que es
   * exactamente lo que no puede pasar.
   */
  it("requireCapability responde 401, no 403, y NO ejecuta el handler", async () => {
    sesionDeAlumno();

    const { requireCapability } = await import("@/lib/api");
    const handler = vi.fn(async () => Response.json({ ok: true }));
    const res = await requireCapability("academico.ver", handler)();

    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  /**
   * La contracara: el staff SÍ pasa. Sin este caso, el test de arriba también
   * pasaría con un `withAuth` que rechaza a todo el mundo.
   */
  it("una cuenta de staff con membresía sí pasa", async () => {
    getSession.mockResolvedValue({ user: { id: "usr_staff" } });
    resolveMembership.mockResolvedValue({ organizationId: "org_1", role: "owner" });

    const { requireCapability } = await import("@/lib/api");
    const handler = vi.fn(async () => Response.json({ ok: true }));
    const res = await requireCapability("academico.ver", handler)();

    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
  });

  /**
   * Y al revés: el staff sin `account_link` no es portal. Las dos puertas se
   * cierran en los dos sentidos, o no sirve de nada.
   */
  it("sin vínculo de portal, resolvePortalSession devuelve null", async () => {
    getSession.mockResolvedValue({ user: { id: "usr_staff" } });

    vi.doMock("@/lib/db", () => ({
  // 012 (T024) — `withAuth` abre la transacción del pedido con
  // `getRootDb().transaction()` para declarar `app.current_org`. Sin este
  // doble, cualquier prueba que atraviese el borde de autenticación falla
  // antes de llegar al handler.
  getRootDb: () => ({
    transaction: async (fn: (tx: unknown) => unknown) =>
      fn({ execute: async () => [] }),
  }),
      getDb: () => ({
        select: () => ({ from: () => ({ where: async () => [] }) }),
      }),
      schema: { accountLink: {} },
    }));

    const { resolvePortalSession } = await import("@/lib/auth/portal");
    await expect(resolvePortalSession()).resolves.toBeNull();
  });

  it("sin sesión de Better Auth, resolvePortalSession devuelve null", async () => {
    getSession.mockResolvedValue(null);

    const { resolvePortalSession } = await import("@/lib/auth/portal");
    await expect(resolvePortalSession()).resolves.toBeNull();
  });
});
