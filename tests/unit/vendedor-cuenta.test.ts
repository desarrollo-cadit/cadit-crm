import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getRootDb: () => ({}),
  getDb: () => ({}),
  schema: new Proxy(
    {},
    {
      get: (_t, tableName) =>
        new Proxy({}, { get: (_t2, col) => `${String(tableName)}.${String(col)}` }),
    }
  ),
}));

/**
 * 040 (US3) — Darle cuenta del panel a un vendedor. La decisión de si se
 * puede es pura; el alta en sí la hace `addTeamMember` (DV-006).
 */
describe("puedeRecibirCuenta — qué vendedor puede recibir una cuenta", () => {
  const base = { email: "valeria@academia.uy", userId: null, archivedAt: null };

  it("activo, con correo y sin cuenta: sí", async () => {
    const { puedeRecibirCuenta } = await import("@/server/sellers");
    expect(puedeRecibirCuenta(base)).toBeNull();
  });

  it("sin correo: 422, el correo es el usuario", async () => {
    const { puedeRecibirCuenta } = await import("@/server/sellers");
    expect(puedeRecibirCuenta({ ...base, email: null })).toMatchObject({
      status: 422,
      code: "sin_correo",
    });
  });

  it("ya tiene cuenta: 409", async () => {
    const { puedeRecibirCuenta } = await import("@/server/sellers");
    expect(puedeRecibirCuenta({ ...base, userId: "usr_1" })).toMatchObject({
      status: 409,
      code: "ya_tiene_cuenta",
    });
  });

  it("archivado: 422", async () => {
    const { puedeRecibirCuenta } = await import("@/server/sellers");
    expect(puedeRecibirCuenta({ ...base, archivedAt: new Date() })).toMatchObject({
      status: 422,
      code: "archivado",
    });
  });
});

describe("POST /api/sellers/[id]/account — la puerta", () => {
  const src = readFileSync(
    path.join(process.cwd(), "src/app/api/sellers/[id]/account/route.ts"),
    "utf8"
  );

  it("exige `accesos.gestionar` (crea una cuenta) y además `inscripciones.editar` (escribe el vendedor)", () => {
    expect(src).toMatch(/requireCapability\(\s*"accesos\.gestionar"/);
    expect(src).toContain('"inscripciones.editar"');
  });

  it("da el rol `ventas` y pasa por `addTeamMember` (sin un segundo camino de alta)", () => {
    const server = readFileSync(path.join(process.cwd(), "src/server/sellers.ts"), "utf8");
    expect(server).toContain("addTeamMember(");
    expect(server).toContain('roleKey: "ventas"');
    expect(server).not.toContain("signUpWithAssignedPassword");
  });
});
