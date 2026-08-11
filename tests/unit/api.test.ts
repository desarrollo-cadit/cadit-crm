import { describe, expect, it, vi } from "vitest";

/**
 * 005 (DV-001/DV-002): `requireFullAccess` bloquea el rol `soporte` con 403,
 * y el catch de `withAuth` mapea `code: "23505"` (unique_violation de
 * Postgres) a 409 `duplicate` en vez del 500 genérico.
 */

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

describe("requireFullAccess (DV-001)", () => {
  it("responde 403 forbidden para role: 'soporte'", async () => {
    const { requireSession } = await import("@/lib/auth/session");
    vi.mocked(requireSession).mockResolvedValue({
      userId: "usr_1",
      organizationId: "org_1",
      role: "soporte",
    });

    const { requireFullAccess } = await import("@/lib/api");
    const handler = requireFullAccess(async () => Response.json({ ok: true }));

    const res = await handler();
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("forbidden");
  });

  it.each(["member", "owner", "ventas", "coordinacion"])(
    "deja pasar cualquier otro rol (%s)",
    async (role) => {
      const { requireSession } = await import("@/lib/auth/session");
      vi.mocked(requireSession).mockResolvedValue({
        userId: "usr_1",
        organizationId: "org_1",
        role,
      });

      const { requireFullAccess } = await import("@/lib/api");
      const handler = requireFullAccess(async () =>
        Response.json({ ok: true })
      );

      const res = await handler();
      expect(res.status).toBe(200);
    }
  );
});
