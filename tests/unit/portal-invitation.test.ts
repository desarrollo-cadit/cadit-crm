import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 012 (T017b, T017c, T017d) — La invitación al portal, y sobre todo lo que NO
 * hace.
 *
 * El contexto que da sentido a este archivo: hay 340 alumnos reales cargados y
 * el dueño pidió expresamente que NO les llegue nada todavía. Un correo no se
 * puede desenviar. Así que lo que se prueba acá no es solo que invitar
 * funcione — es que sea imposible invitar a todos de un saque, y que desplegar
 * la fase no le mande nada a nadie.
 */

const selectQueue: unknown[][] = [];

function thenableChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "innerJoin", "leftJoin", "where", "groupBy", "orderBy", "limit"]) {
    chain[m] = () => chain;
  }
  (chain as { then: unknown }).then = (resolve: (v: unknown) => void) =>
    Promise.resolve(rows).then(resolve);
  return chain;
}

vi.mock("@/lib/db", () => ({
  // 012 (T024) — `withAuth` abre la transacción del pedido con
  // `getRootDb().transaction()` para declarar `app.current_org`. Sin este
  // doble, cualquier prueba que atraviese el borde de autenticación falla
  // antes de llegar al handler.
  getRootDb: () => ({
    transaction: async (fn: (tx: unknown) => unknown) =>
      fn({ execute: async () => [] }),
  }),
  getDb: () => ({
    select: () => thenableChain(selectQueue.shift() ?? []),
    insert: () => ({
      values: () => ({ returning: () => Promise.resolve([{ id: "alk_1" }]) }),
    }),
    update: () => ({ set: () => ({ where: () => Promise.resolve([]) }) }),
  }),
  schema: new Proxy(
    {},
    {
      get: (_t, tableName) =>
        new Proxy({}, { get: (_t2, col) => `${String(tableName)}.${String(col)}` }),
    }
  ),
}));

const sendMail = vi.fn();
vi.mock("@/lib/m365/client", () => ({ sendMail: (...a: unknown[]) => sendMail(...a) }));

// El armado del correo lee el entorno y renderiza una plantilla; ninguna de
// las dos cosas es lo que estos casos observan.
vi.mock("@/lib/env", () => ({
  getEnv: () => ({ APP_BASE_URL: "http://localhost:3000", M365_SENDER: "cursos@x.com" }),
}));
vi.mock("@/server/email/templates", () => ({ renderTemplate: () => "<p>hola</p>" }));

vi.mock("@/lib/auth", () => ({
  getAuth: () => ({
    // Devuelve un usuario de verdad: sin esto, `created.user.id` lanza y el
    // alta termina en `signup_failed` antes de llegar a mandar el correo —
    // que es justamente lo que varios de estos casos quieren observar.
    api: { signUpEmail: async () => ({ user: { id: "usr_nuevo" } }) },
    $context: Promise.resolve({}),
  }),
  runInternalSignup: (fn: () => Promise<unknown>) => fn(),
}));

vi.mock("@/server/auth/on-signup", () => ({ resolveMembership: vi.fn() }));

const CONTACTO_SIN_CORREO = {
  id: "ct_1",
  firstName: "Ana",
  lastName: "Pérez",
  email: null,
};

describe("T017d — el alumno sin correo no falla en silencio", () => {
  beforeEach(() => {
    selectQueue.length = 0;
    sendMail.mockReset();
    vi.resetModules();
  });

  /**
   * De los 340 importados, 6 no tienen correo. La invitación viaja por correo
   * y no hay otro camino (DV-004), así que sin correo no hay acceso posible —
   * pero eso se DICE, con el motivo y con qué hacer al respecto.
   */
  it("responde 422 con el motivo y no intenta mandar nada", async () => {
    selectQueue.push([{ enrollment: { id: "enr_1" }, contact: CONTACTO_SIN_CORREO }]);

    const { grantPortalAccess } = await import("@/server/access");
    const r = await grantPortalAccess("org_1", "enr_1");

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(422);
    expect(r.code).toBe("no_email");
    expect(r.message).toContain("correo");
    expect(sendMail).not.toHaveBeenCalled();
  });

  /**
   * El mismo motivo llega a la pantalla ANTES de que nadie apriete nada: la
   * lista muestra por qué no se puede, en vez de ofrecer un botón que va a
   * devolver error.
   */
  it("el estado del acceso trae el motivo para la pantalla", async () => {
    selectQueue.push([{ enrollment: { id: "enr_1" }, contact: CONTACTO_SIN_CORREO }]);
    selectQueue.push([]); // sin account_link

    const { portalAccessState } = await import("@/server/access");
    const r = await portalAccessState("org_1", "enr_1");

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.link).toBeNull();
    expect(r.data.email).toBeNull();
    expect(r.data.blockedReason).toContain("correo");
  });

  it("con correo cargado no hay motivo de bloqueo", async () => {
    selectQueue.push([
      { enrollment: { id: "enr_1" }, contact: { ...CONTACTO_SIN_CORREO, email: "ana@x.com" } },
    ]);
    selectQueue.push([]);

    const { portalAccessState } = await import("@/server/access");
    const r = await portalAccessState("org_1", "enr_1");

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.blockedReason).toBeNull();
  });
});

/**
 * 014 (T010, DV-006) — Invitar a un profesor.
 *
 * Reusa la maquinaria de 012 cambiando solo de dónde sale el correo y el
 * `kind`. Lo que se prueba acá es el caso que hoy es el 100%.
 */
describe("014 — invitar a un profesor SIN correo", () => {
  beforeEach(() => {
    selectQueue.length = 0;
    sendMail.mockReset();
    vi.resetModules();
  });

  /**
   * **Los 7 profesores reales están así hoy**: `teacher.email` vacío. La
   * invitación tiene que decir QUÉ FALTA, no romperse — mismo criterio que
   * T017d de 012 con los 6 alumnos sin correo.
   */
  it("responde 422 con el motivo y no intenta mandar nada", async () => {
    selectQueue.push([{ id: "tch_1", name: "Ovidio Santos", email: null }]);

    const { grantTeacherPortalAccess } = await import("@/server/access");
    const r = await grantTeacherPortalAccess("org_1", "tch_1");

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(422);
    expect(r.code).toBe("no_email");
    expect(r.message).toContain("correo");
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("un profesor inexistente responde 404", async () => {
    selectQueue.push([]);

    const { grantTeacherPortalAccess } = await import("@/server/access");
    const r = await grantTeacherPortalAccess("org_1", "tch_fantasma");

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(404);
    expect(sendMail).not.toHaveBeenCalled();
  });
});

/**
 * 014 (fase 4) — **Un fallo del correo no se lleva puesta la contraseña.**
 *
 * El agujero que cubre, encontrado verificando la fase 4 contra la base real:
 * la invitación crea la cuenta, la vincula y RECIÉN DESPUÉS manda el correo.
 * Cuando el correo fallaba, la ruta devolvía 502 y la contraseña temporal se
 * perdía con la respuesta — pero la cuenta ya estaba creada, porque devolver
 * una `Response` de error no revierte la transacción (regla de 012).
 *
 * Reintentar no destrababa nada: la segunda vez entraba por el camino de "ya
 * existe", generaba OTRA contraseña y volvía a fallar en el mismo lugar. La
 * persona quedaba con cuenta y sin ninguna forma de entrar.
 *
 * Perder una credencial recién generada porque un tercero falló está mal con
 * M365 configurado y sin configurar: una caída de Graph de 30 segundos produce
 * exactamente el mismo agujero.
 */
describe("el correo caído no deja a nadie sin llave", () => {
  beforeEach(() => {
    selectQueue.length = 0;
    sendMail.mockReset();
    vi.resetModules();
  });

  it("devuelve la contraseña igual, con el motivo de por qué no salió", async () => {
    selectQueue.push([{ id: "tch_1", name: "Ovidio Santos", email: "ovidio@x.com" }]);
    selectQueue.push([]); // no hay usuario con ese correo todavía
    selectQueue.push([]); // no hay vínculo previo
    sendMail.mockResolvedValue({
      ok: false,
      code: "m365_not_configured",
      message: "M365 no está configurado",
    });

    const { grantTeacherPortalAccess } = await import("@/server/access");
    const r = await grantTeacherPortalAccess("org_1", "tch_1");

    // Lo que importa: NO es un error. El acceso existe y viaja la llave.
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.temporaryPassword).toBeTruthy();
    expect(r.data.emailSentAt).toBeNull();
    expect(r.data.emailError).toContain("M365");
  });

  it("cuando el correo SÍ sale, no hay motivo de error", async () => {
    selectQueue.push([{ id: "tch_1", name: "Ovidio Santos", email: "ovidio@x.com" }]);
    selectQueue.push([]);
    selectQueue.push([]);
    sendMail.mockResolvedValue({ ok: true, data: "msg_1" });

    const { grantTeacherPortalAccess } = await import("@/server/access");
    const r = await grantTeacherPortalAccess("org_1", "tch_1");

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.emailError).toBeNull();
    expect(r.data.emailSentAt).toBeTruthy();
  });

  /**
   * La pantalla no puede decir "ya se lo mandamos" cuando no se mandó: es
   * mentir sobre lo único que la persona necesita para entrar. Los dos
   * lugares que invitan tienen que mirar `emailError`.
   */
  it("las dos pantallas que invitan miran `emailError`", () => {
    for (const archivo of [
      "src/components/academic/academic-client.tsx",
      "src/components/cohorts/roster-client.tsx",
    ]) {
      const src = readFileSync(path.join(process.cwd(), archivo), "utf8");
      expect(src, `${archivo} ignora emailError`).toContain("emailError");
    }
  });
});

describe("T017c — vincular no manda correo", () => {
  beforeEach(() => {
    selectQueue.length = 0;
    sendMail.mockReset();
    vi.resetModules();
  });

  /**
   * La migración de cierre (T029) crea vínculos si corresponde. Si crear un
   * vínculo enviara un correo, desplegar la fase le escribiría a 340 personas.
   * Por eso `createAccountLink` y `grantPortalAccess` son cosas distintas.
   */
  it("createAccountLink no llama a sendMail", async () => {
    selectQueue.push([{ id: "enr_1" }]); // el contacto tiene inscripción
    selectQueue.push([]); // no hay vínculo previo

    const { createAccountLink } = await import("@/server/access");
    const r = await createAccountLink("org_1", {
      userId: "usr_1",
      kind: "alumno",
      contactId: "ct_1",
    });

    expect(r.ok).toBe(true);
    expect(sendMail).not.toHaveBeenCalled();
  });
});

/**
 * 012 (T017b) — **NO existe el envío masivo, y este test lo mantiene así.**
 *
 * No es una comprobación de estilo: es la única barrera que queda entre los
 * 340 alumnos y un correo que nadie quiso mandar. Si alguien agrega un
 * "invitar a toda la cohorte" con la mejor intención, esto falla y lo obliga a
 * hablarlo antes.
 */
describe("T017b — no se puede invitar a todos", () => {
  it("el módulo de accesos no exporta ninguna invitación masiva", async () => {
    const mod = await import("@/server/access");
    const masivos = Object.keys(mod).filter((k) =>
      /(bulk|masiv|todos|todas|all|every|cohort)/i.test(k)
    );
    expect(masivos, `exports sospechosos: ${masivos.join(", ")}`).toEqual([]);
  });

  it("la ruta de acceso invita de a UNA inscripción", () => {
    const file = path.join(
      process.cwd(),
      "src/app/api/enrollments/[id]/access/route.ts"
    );
    const src = readFileSync(file, "utf8");
    // El identificador viene de la ruta, no de una lista en el body.
    expect(src).toContain("ctx.params");
    expect(src).not.toMatch(/enrollmentIds|contactIds|cohortId/);
  });
});
