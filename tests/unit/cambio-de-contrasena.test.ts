import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * El cambio de contraseña: forzado en el primer ingreso y voluntario después.
 *
 * Hasta acá toda contraseña la elegía otra persona —la invitación al portal,
 * el alta del equipo, `reset-password`— y viajaba por correo o se dictaba por
 * teléfono. Lo que se prueba es que esa contraseña deje de servir en cuanto
 * la persona elige la suya, y que nadie quede atrapado en el camino.
 */

const getSession = vi.fn();
const changePassword = vi.fn();
const updates: { table: unknown; values: unknown }[] = [];

function recordingDb() {
  return {
    update: (table: unknown) => ({
      set: (values: unknown) => ({
        where: () => {
          updates.push({ table, values });
          return Promise.resolve([]);
        },
      }),
    }),
  };
}

vi.mock("@/lib/db", () => ({
  getRootDb: () => recordingDb(),
  getDb: () => recordingDb(),
  schema: new Proxy(
    {},
    {
      get: (_t, tableName) =>
        new Proxy({}, { get: (_t2, col) => `${String(tableName)}.${String(col)}` }),
    }
  ),
}));

vi.mock("@/lib/auth", () => ({
  getAuth: () => ({
    api: {
      getSession: (...a: unknown[]) => getSession(...a),
      changePassword: (...a: unknown[]) => changePassword(...a),
    },
  }),
}));

const RAIZ = process.cwd();
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");

/* ============================================================
 * La decisión de redirigir
 * ============================================================ */

describe("¿hay que mandar a la persona a elegir su contraseña?", () => {
  it("sí, cuando la contraseña vigente la eligió otra persona", async () => {
    const { forcedPasswordChangeRedirect, PASSWORD_CHANGE_PATH } = await import(
      "@/lib/auth/password-change"
    );
    expect(forcedPasswordChangeRedirect({ mustChangePassword: true })).toBe(
      PASSWORD_CHANGE_PATH
    );
    expect(PASSWORD_CHANGE_PATH).toBe("/cambiar-contrasena");
  });

  it("no, cuando ya la eligió ella, o el dato no vino", async () => {
    const { forcedPasswordChangeRedirect } = await import("@/lib/auth/password-change");
    expect(forcedPasswordChangeRedirect({ mustChangePassword: false })).toBeNull();
    expect(forcedPasswordChangeRedirect({})).toBeNull();
    expect(forcedPasswordChangeRedirect(null)).toBeNull();
    expect(forcedPasswordChangeRedirect(undefined)).toBeNull();
  });

  /**
   * Sin bucle por construcción: la pantalla de cambio vive en `(auth)`, que
   * no pasa por ninguno de los dos caparazones que redirigen. Si alguien la
   * mudara adentro de `(app)` o `(portal)`, la persona obligada a cambiarla
   * rebotaría contra su propia pantalla para siempre.
   */
  it("la pantalla de cambio vive fuera de los caparazones que redirigen", () => {
    expect(existsSync(path.join(RAIZ, "src/app/(auth)/cambiar-contrasena/page.tsx"))).toBe(true);
    for (const grupo of ["(app)", "(portal)"]) {
      expect(
        existsSync(path.join(RAIZ, "src/app", grupo, "cambiar-contrasena")),
        `${grupo} no puede alojar la pantalla de cambio`
      ).toBe(false);
    }
    expect(leer("src/app/(auth)/layout.tsx")).not.toContain("forcedPasswordChangeRedirect");
  });

  it("los dos caparazones preguntan, el del staff y el del portal", () => {
    for (const archivo of ["src/app/(app)/layout.tsx", "src/app/(portal)/layout.tsx"]) {
      expect(leer(archivo), archivo).toContain("forcedPasswordChangeRedirect(");
    }
  });

  /**
   * Después de cambiarla se entra por `/`, que es lo que ya hace el login:
   * la raíz decide si es el panel o el portal. Una segunda regla acá sería
   * otra forma de equivocarse de casa.
   */
  it("después del cambio se entra por la raíz, igual que tras el login", async () => {
    const { HOME_AFTER_PASSWORD_CHANGE } = await import("@/lib/auth/password-change");
    expect(HOME_AFTER_PASSWORD_CHANGE).toBe("/");
    expect(leer("src/app/(auth)/login/page.tsx")).toContain('router.push("/")');
  });
});

/* ============================================================
 * La validación del pedido
 * ============================================================ */

describe("lo que se acepta como contraseña nueva", () => {
  it("pide al menos 8 caracteres y como mucho 128", async () => {
    const { changePasswordSchema } = await import("@/lib/auth/password-change");
    expect(
      changePasswordSchema.safeParse({ currentPassword: "temporal1", newPassword: "corta" }).success
    ).toBe(false);
    expect(
      changePasswordSchema.safeParse({
        currentPassword: "temporal1",
        newPassword: "x".repeat(129),
      }).success
    ).toBe(false);
    expect(
      changePasswordSchema.safeParse({ currentPassword: "temporal1", newPassword: "mi-clave-propia" })
        .success
    ).toBe(true);
  });

  it("rechaza repetir la misma: no cambiaría nada", async () => {
    const { changePasswordSchema } = await import("@/lib/auth/password-change");
    const r = changePasswordSchema.safeParse({
      currentPassword: "la-misma-123",
      newPassword: "la-misma-123",
    });
    expect(r.success).toBe(false);
  });

  it("exige la actual", async () => {
    const { changePasswordSchema } = await import("@/lib/auth/password-change");
    expect(changePasswordSchema.safeParse({ newPassword: "mi-clave-propia" }).success).toBe(false);
  });
});

/* ============================================================
 * POST /api/account/password
 * ============================================================ */

function pedido(body: unknown): Request {
  return new Request("http://localhost:3000/api/account/password", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: "better-auth.session_token=abc" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const VALIDO = { currentPassword: "Temporal23456", newPassword: "mi-clave-propia" };

describe("POST /api/account/password", () => {
  beforeEach(() => {
    getSession.mockReset();
    changePassword.mockReset();
    updates.length = 0;
    vi.resetModules();
  });

  it("sin sesión responde 401 y no intenta nada", async () => {
    getSession.mockResolvedValue(null);
    const { POST } = await import("@/app/api/account/password/route");
    const res = await POST(pedido(VALIDO));
    expect(res.status).toBe(401);
    expect(changePassword).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
  });

  it("un cuerpo inválido responde 422", async () => {
    getSession.mockResolvedValue({ user: { id: "usr_1" }, session: {} });
    const { POST } = await import("@/app/api/account/password/route");
    expect((await POST(pedido("no es json"))).status).toBe(422);
    expect((await POST(pedido({ currentPassword: "x", newPassword: "corta" }))).status).toBe(422);
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("la misma contraseña responde 422", async () => {
    getSession.mockResolvedValue({ user: { id: "usr_1" }, session: {} });
    const { POST } = await import("@/app/api/account/password/route");
    const res = await POST(pedido({ currentPassword: "igual-1234", newPassword: "igual-1234" }));
    expect(res.status).toBe(422);
    expect(changePassword).not.toHaveBeenCalled();
  });

  /**
   * Una contraseña actual equivocada es un error de la persona, no del
   * servidor: 400 con un mensaje que dice qué revisar. Y la marca NO se
   * apaga — si se apagara, alcanzaría con fallar una vez para escaparse.
   */
  it("la actual equivocada responde 400 con un mensaje claro, y no apaga la marca", async () => {
    getSession.mockResolvedValue({ user: { id: "usr_1" }, session: {} });
    const { APIError } = await import("better-auth/api");
    changePassword.mockRejectedValue(
      new APIError("BAD_REQUEST", { code: "INVALID_PASSWORD", message: "Invalid password" })
    );
    const { POST } = await import("@/app/api/account/password/route");
    const res = await POST(pedido(VALIDO));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string; message: string } };
    expect(json.error.code).toBe("wrong_current_password");
    expect(json.error.message).toMatch(/contraseña actual/i);
    expect(updates).toEqual([]);
  });

  it("si la sesión venció entre medio responde 401, no 500", async () => {
    getSession.mockResolvedValue({ user: { id: "usr_1" }, session: {} });
    const { APIError } = await import("better-auth/api");
    changePassword.mockRejectedValue(
      new APIError("UNAUTHORIZED", { code: "UNAUTHORIZED", message: "Unauthorized" })
    );
    const { POST } = await import("@/app/api/account/password/route");
    expect((await POST(pedido(VALIDO))).status).toBe(401);
  });

  it("con todo en orden: cambia cerrando las otras sesiones, apaga la marca y entrega la sesión nueva", async () => {
    getSession.mockResolvedValue({ user: { id: "usr_1" }, session: {} });
    const respuesta = new Headers();
    respuesta.append("set-cookie", "better-auth.session_token=nueva; Path=/; HttpOnly");
    changePassword.mockResolvedValue({ headers: respuesta, response: { token: "nueva" } });

    const { POST } = await import("@/app/api/account/password/route");
    const res = await POST(pedido(VALIDO));

    expect(res.status).toBe(200);
    expect(changePassword).toHaveBeenCalledTimes(1);
    const arg = changePassword.mock.calls[0]![0] as {
      body: Record<string, unknown>;
      headers: Headers;
    };
    expect(arg.body).toEqual({
      currentPassword: VALIDO.currentPassword,
      newPassword: VALIDO.newPassword,
      revokeOtherSessions: true,
    });
    expect(arg.headers.get("cookie")).toContain("session_token");

    expect(updates).toEqual([
      { table: expect.anything(), values: { mustChangePassword: false } },
    ]);
    // Sin la cookie nueva, cerrar "las otras" sesiones incluiría la propia.
    expect(res.headers.get("set-cookie")).toContain("session_token=nueva");
  });

  it("la respuesta no lleva ninguna contraseña", async () => {
    getSession.mockResolvedValue({ user: { id: "usr_1" }, session: {} });
    changePassword.mockResolvedValue({ headers: new Headers(), response: { token: "t" } });
    const { POST } = await import("@/app/api/account/password/route");
    const texto = await (await POST(pedido(VALIDO))).text();
    expect(texto).not.toContain(VALIDO.currentPassword);
    expect(texto).not.toContain(VALIDO.newPassword);
  });

  /**
   * Cambiar la contraseña VERIFICA la actual: sin límite, una sesión robada
   * podría probar contraseñas contra esta puerta sin que la frene nada. Lleva
   * el mismo límite por IP que el login.
   */
  it("los intentos cuentan contra el mismo límite por IP que el login", async () => {
    const { authAttemptAllowed, AUTH_RATE_LIMIT, resetRateLimit } = await import(
      "@/lib/rate-limit"
    );
    resetRateLimit();
    const headers = new Headers({ "x-forwarded-for": "198.51.100.77" });
    const intento = () =>
      authAttemptAllowed(
        { path: "/change-password", internal: false, request: undefined, headers },
        1_000
      );
    for (let i = 0; i < AUTH_RATE_LIMIT.max; i++) expect(intento()).toBe(true);
    expect(intento()).toBe(false);
    resetRateLimit();
  });

  it("no usa ninguna de las tres puertas: sirve a cualquier cuenta con sesión", () => {
    const src = leer("src/app/api/account/password/route.ts");
    for (const puerta of ["requireCapability(", "requireTeacherPortal(", "requireStudentPortal("]) {
      expect(src).not.toContain(puerta);
    }
    expect(src).toContain("getSession(");
    expect(src).not.toMatch(/console\.\w+\([^)]*[Pp]assword/);
  });
});

/* ============================================================
 * Un solo lugar fija contraseñas ajenas
 * ============================================================ */

describe("toda contraseña elegida por otra persona enciende la marca", () => {
  /**
   * La marca se enciende en el MISMO paso que fija la contraseña. Para que un
   * camino nuevo no pueda olvidarla, nadie fuera del helper llama a
   * `signUpEmail` ni a `updatePassword`.
   */
  it("nadie fuera del helper llama a signUpEmail ni a updatePassword", () => {
    const HELPER = path.join("src", "server", "auth", "assigned-password.ts");
    const sospechosos: string[] = [];
    function recorrer(dir: string) {
      for (const e of readdirSync(dir)) {
        const full = path.join(dir, e);
        if (statSync(full).isDirectory()) {
          if (e === "node_modules" || e === "e2e") continue;
          recorrer(full);
        } else if (/\.(ts|tsx)$/.test(e)) {
          const rel = path.relative(RAIZ, full);
          if (rel === HELPER) continue;
          const src = readFileSync(full, "utf8");
          if (/\bsignUpEmail\(|\bupdatePassword\(/.test(src)) sospechosos.push(rel);
        }
      }
    }
    recorrer(path.join(RAIZ, "src"));
    recorrer(path.join(RAIZ, "scripts"));
    expect(sospechosos, sospechosos.join("\n")).toEqual([]);
  });

  it("el alta del equipo y reset-password pasan por el helper", () => {
    expect(leer("src/app/api/settings/team/route.ts")).toContain("signUpWithAssignedPassword(");
    expect(leer("scripts/reset-password.ts")).toContain("assignPassword(");
  });

  it("el helper enciende la marca al crear la cuenta", async () => {
    vi.resetModules();
    updates.length = 0;
    vi.doMock("@/lib/auth", () => ({
      getAuth: () => ({
        api: { signUpEmail: async () => ({ user: { id: "usr_nuevo" } }) },
      }),
      runInternalSignup: (fn: () => Promise<unknown>) => fn(),
    }));
    const { signUpWithAssignedPassword } = await import("@/server/auth/assigned-password");
    const r = await signUpWithAssignedPassword({
      name: "Ana",
      email: "ana@x.com",
      password: "asignada-123",
    });
    expect(r.userId).toBe("usr_nuevo");
    expect(updates).toEqual([{ table: expect.anything(), values: { mustChangePassword: true } }]);
    vi.doUnmock("@/lib/auth");
  });

  it("y al reemplazar la contraseña de una cuenta existente", async () => {
    vi.resetModules();
    updates.length = 0;
    const updatePassword = vi.fn();
    vi.doMock("@/lib/auth", () => ({
      getAuth: () => ({
        $context: Promise.resolve({
          password: { hash: async (p: string) => `hash(${p})` },
          internalAdapter: { updatePassword },
        }),
      }),
      runInternalSignup: (fn: () => Promise<unknown>) => fn(),
    }));
    const { assignPassword } = await import("@/server/auth/assigned-password");
    await assignPassword("usr_1", "asignada-123");
    expect(updatePassword).toHaveBeenCalledWith("usr_1", "hash(asignada-123)");
    expect(updates).toEqual([{ table: expect.anything(), values: { mustChangePassword: true } }]);
    vi.doUnmock("@/lib/auth");
  });
});

/* ============================================================
 * La migración
 * ============================================================ */

describe("0046 — la marca y su relleno", () => {
  const SQL = leer("drizzle/0046_cambio_de_contrasena.sql");
  const ejecutable = SQL.replace(/--.*$/gm, "");

  it("agrega la columna con default false y not null", () => {
    expect(ejecutable).toMatch(
      /add column "must_change_password" boolean default false not null/i
    );
  });

  /**
   * Decisión del dueño: solo las cuentas de portal PURAS. Alguien del staff
   * que además cursó tiene `account_link` y `member`; su contraseña la eligió
   * él, y obligarlo a cambiarla sería castigarlo por estudiar.
   */
  it("marca solo a quien tiene vínculo de portal y NO es del staff", () => {
    const update = /update "user"[\s\S]*?;/i.exec(ejecutable)?.[0] ?? "";
    expect(update).toMatch(/set "must_change_password" = true/i);
    expect(update).toMatch(/exists\s*\(\s*select 1 from "account_link"/i);
    expect(update).toMatch(/not exists\s*\(\s*select 1 from "member"/i);
  });

  /**
   * Re-ejecutable de verdad (constitución IV). Un `update` suelto volvería a
   * marcar a quien ya eligió su contraseña: por eso el relleno corre SOLO en
   * la pasada que crea la columna.
   */
  it("correrla dos veces no vuelve a marcar a nadie", () => {
    expect(ejecutable).toMatch(/if not exists\s*\(\s*select 1 from information_schema\.columns/i);
    const guardia = ejecutable.search(/if not exists/i);
    expect(guardia).toBeGreaterThan(-1);
    expect(ejecutable.search(/update "user"/i)).toBeGreaterThan(guardia);
  });

  it("migraciones, snapshots y journal siguen en sync", () => {
    const sqls = readdirSync(path.join(RAIZ, "drizzle")).filter((f) => /^\d{4}_.*\.sql$/.test(f));
    const snaps = readdirSync(path.join(RAIZ, "drizzle", "meta")).filter((f) =>
      /^\d{4}_snapshot\.json$/.test(f)
    );
    const journal = JSON.parse(leer("drizzle/meta/_journal.json")) as {
      entries: { tag: string }[];
    };
    expect(snaps.length).toBe(sqls.length);
    expect(journal.entries.length).toBe(sqls.length);
    // Ya no es la última (0047 vino después): lo que importa es que esté y
    // que cada entrada del journal tenga su archivo.
    expect(journal.entries.map((e) => e.tag)).toContain("0046_cambio_de_contrasena");
    expect(journal.entries.map((e) => `${e.tag}.sql`).sort()).toEqual([...sqls].sort());
  });
});
