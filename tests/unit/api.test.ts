import { describe, expect, it, vi } from "vitest";

/**
 * 005 (DV-001/DV-002): el corte financiero bloquea el rol `soporte` con 403,
 * y el catch de `withAuth` mapea `code: "23505"` (unique_violation de
 * Postgres) a 409 `duplicate` en vez del 500 genérico.
 *
 * 012 (T007): el corte ya no vive en `requireFullAccess` —que se eliminó al
 * migrar sus 9 rutas— sino en `requireCapability("cobranza.ver")`.
 */

/**
 * 012 (T024) — `withAuth` abre la transacción del pedido con
 * `getRootDb().transaction()` para declarar `app.current_org`. Sin este doble
 * el borde de autenticación intentaría abrir una conexión real.
 *
 * El `execute` devuelve `[]` porque lo único que corre ahí adentro son los dos
 * `set_config`; los handlers de este archivo son dobles que no tocan la base.
 */
vi.mock("@/lib/db", () => ({
  getRootDb: () => ({
    transaction: async (fn: (tx: unknown) => unknown) =>
      fn({ execute: async () => [] }),
  }),
  getDb: () => ({}),
  schema: new Proxy({}, { get: () => ({}) }),
}));

vi.mock("@/lib/auth/session", () => {
  class UnauthorizedError extends Error {}
  return {
    UnauthorizedError,
    requireSession: vi.fn(),
  };
});

describe("withAuth: mapeo de errores (DV-002)", () => {
  it("un handler que lanza { code: '23505' } responde 409 duplicate", async () => {
    const { requireSession } = await import("@/lib/auth/session");
    vi.mocked(requireSession).mockResolvedValue({
      userId: "usr_1",
      organizationId: "org_1",
      role: "member",
    });

    const { withAuth } = await import("@/lib/api");
    const handler = withAuth(async () => {
      const err = new Error("duplicate key value") as Error & { code: string };
      err.code = "23505";
      throw err;
    });

    const res = await handler();
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("duplicate");
  });

  it("resuelve el nombre de la constraint a un mensaje específico (US2, cuál dato está repetido)", async () => {
    const { requireSession } = await import("@/lib/auth/session");
    vi.mocked(requireSession).mockResolvedValue({
      userId: "usr_1",
      organizationId: "org_1",
      role: "member",
    });

    const { withAuth } = await import("@/lib/api");
    const handler = withAuth(async () => {
      const err = new Error("duplicate key value") as Error & {
        code: string;
        constraint_name: string;
      };
      err.code = "23505";
      err.constraint_name = "contact_org_email_uq";
      throw err;
    });

    const res = await handler();
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toBe("Ya existe un contacto con ese email");
  });

  it("una constraint 23505 sin nombre reconocido cae al mensaje genérico", async () => {
    const { requireSession } = await import("@/lib/auth/session");
    vi.mocked(requireSession).mockResolvedValue({
      userId: "usr_1",
      organizationId: "org_1",
      role: "member",
    });

    const { withAuth } = await import("@/lib/api");
    const handler = withAuth(async () => {
      const err = new Error("duplicate key value") as Error & { code: string };
      err.code = "23505";
      throw err;
    });

    const res = await handler();
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toBe("Ya existe un registro con ese dato");
  });

  it("un handler que lanza un error genérico sigue respondiendo 500 internal", async () => {
    const { requireSession } = await import("@/lib/auth/session");
    vi.mocked(requireSession).mockResolvedValue({
      userId: "usr_1",
      organizationId: "org_1",
      role: "member",
    });

    const { withAuth } = await import("@/lib/api");
    const handler = withAuth(async () => {
      throw new Error("algo inesperado");
    });

    const res = await handler();
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("internal");
  });
});

/**
 * 012 (T007) — Este bloque probaba `requireFullAccess`, que dejó de existir
 * cuando sus 9 rutas se migraron a capacidades nombradas. Sigue probando lo
 * mismo —el corte financiero— pero contra el envoltorio que quedó, porque lo
 * que importa no era el helper sino que soporte no vea plata.
 */
describe("corte financiero: requireCapability('cobranza.ver') (DV-001)", () => {
  it("responde 403 forbidden para role: 'soporte'", async () => {
    const { requireSession } = await import("@/lib/auth/session");
    vi.mocked(requireSession).mockResolvedValue({
      userId: "usr_1",
      organizationId: "org_1",
      role: "soporte",
    });

    const { requireCapability } = await import("@/lib/api");
    const handler = requireCapability("cobranza.ver", async () =>
      Response.json({ ok: true })
    );

    const res = await handler();
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("forbidden");
  });

  /**
   * 012 (T007) — El texto es el MISMO que devolvía `requireFullAccess`.
   *
   * Migrar las rutas financieras a `requireCapability` a secas les habría
   * cambiado el mensaje por el genérico "Sin permiso para esta acción", y la
   * fase 2 no cambia lo que ve el usuario. Este caso lo fija: si alguien
   * borra `forbiddenMessage`, el test lo dice.
   */
  it.each([
    ["cobranza.ver", "Sin acceso a datos financieros"],
    ["cobranza.editar", "Sin acceso a datos financieros"],
    ["inscripciones.editar", "Sin acceso a datos financieros"],
    ["inscripciones.ver", "Sin permiso para esta acción"],
    ["academico.editar", "Sin permiso para esta acción"],
  ] as const)("el 403 de %s dice «%s»", async (capability, message) => {
    const { requireSession } = await import("@/lib/auth/session");
    vi.mocked(requireSession).mockResolvedValue({
      userId: "usr_1",
      organizationId: "org_1",
      role: "rol_que_nadie_mapeo",
    });

    const { requireCapability } = await import("@/lib/api");
    const handler = requireCapability(capability, async () =>
      Response.json({ ok: true })
    );

    const res = await handler();
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toBe(message);
  });

  /**
   * 012 (T003) — CAMBIO DE CONTRATO, deliberado.
   *
   * Antes la regla era "bloquear a `soporte` y dejar pasar a cualquier otro":
   * fallaba ABIERTO, así que un rol nuevo que nadie hubiera mapeado nacía con
   * acceso completo a los datos financieros.
   *
   * Ahora se exige la capacidad `cobranza.ver`, y un rol desconocido no tiene
   * ninguna (FR-008: fallar cerrado). `ventas` y `coordinacion` salen de esta
   * lista porque NO existen en la base —los roles reales son `owner`,
   * `member` y `soporte`—, así que ninguna cuenta real cambia de permisos.
   *
   * El caso contrario, un rol desconocido recibiendo 403, se cubre abajo.
   */
  it.each(["member", "owner"])(
    "deja pasar a los roles con acceso completo (%s)",
    async (role) => {
      const { requireSession } = await import("@/lib/auth/session");
      vi.mocked(requireSession).mockResolvedValue({
        userId: "usr_1",
        organizationId: "org_1",
        role,
      });

      const { requireCapability } = await import("@/lib/api");
      const handler = requireCapability("cobranza.ver", async () =>
        Response.json({ ok: true })
      );

      const res = await handler();
      expect(res.status).toBe(200);
    }
  );

  /**
   * 012 (FR-008) — La contracara del cambio: un rol que nadie mapeó no accede
   * a datos financieros. Si mañana alguien agrega un rol en la base y se
   * olvida de darle capacidades, la consecuencia es que no puede entrar
   * —visible al instante— en vez de poder todo, que no se nota hasta tarde.
   */
  it("un rol desconocido recibe 403 (falla cerrado)", async () => {
    const { requireSession } = await import("@/lib/auth/session");
    vi.mocked(requireSession).mockResolvedValue({
      userId: "usr_1",
      organizationId: "org_1",
      role: "rol_que_nadie_mapeo",
    });

    const { requireCapability } = await import("@/lib/api");
    const handler = requireCapability("cobranza.ver", async () =>
      Response.json({ ok: true })
    );

    const res = await handler();
    expect(res.status).toBe(403);
  });
});
