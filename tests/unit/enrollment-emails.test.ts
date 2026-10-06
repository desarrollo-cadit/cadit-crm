import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 007 / 2026-10-05 — Los correos de una inscripción.
 *
 * Dos cosas nuevas que se prueban acá:
 *
 * - **Ya enviado → no se repite sin `force`, y se dice cuándo.** La respuesta
 *   trae `sentAt` para que la pantalla pueda decir "Ya se envió el …" y pedir
 *   confirmación antes de reenviar.
 * - **Términos de una especialización.** La inscripción madre no tiene
 *   licencia propia: las licencias son de los módulos (inscripciones hijas).
 *   El documento tiene que nombrar ESAS, no decir "a confirmar".
 */

const selectQueue: unknown[][] = [];
const updates: unknown[] = [];

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
  getDb: () => ({
    select: () => thenableChain(selectQueue.shift() ?? []),
    selectDistinct: () => thenableChain(selectQueue.shift() ?? []),
    update: () => ({
      set: (v: unknown) => ({
        where: () => {
          updates.push(v);
          return Promise.resolve([]);
        },
      }),
    }),
  }),
  schema: new Proxy(
    {},
    { get: (_t, table) => new Proxy({}, { get: (_t2, col) => `${String(table)}.${String(col)}` }) }
  ),
}));

const sendMail = vi.fn();
vi.mock("@/lib/m365/client", () => ({ sendMail: (...a: unknown[]) => sendMail(...a) }));
vi.mock("@/lib/env", () => ({
  getEnv: () => ({ APP_BASE_URL: "http://localhost:3000", M365_SENDER: "cursos@x.com" }),
}));
vi.mock("@/server/branding", () => ({
  getBranding: async () => ({ name: "CadIT", accent: "#001b5e" }),
}));
const renderTemplate = vi.fn((..._a: unknown[]) => "<p>hola</p>");
vi.mock("@/server/email/templates", () => ({
  renderTemplate: (...a: unknown[]) => renderTemplate(...a),
}));

function contexto(over: { softwareName?: string | null; termsEmailSentAt?: Date | null } = {}) {
  return {
    enrollment: { id: "enr_madre", termsEmailSentAt: over.termsEmailSentAt ?? null, welcomeEmailSentAt: null },
    contact: { id: "ct_1", firstName: "Ana", lastName: "Pérez", email: "ana@x.com" },
    cohort: {
      name: "EBIM 13",
      startDate: new Date("2026-09-01T12:00:00.000Z"),
      endDate: null,
      whatsappGroupLink: null,
      frequency: null,
      classroom: null,
    },
    course: { name: "Especialización BIM", modality: "en_vivo" },
    teacherName: null,
    softwareName: over.softwareName ?? null,
  };
}

beforeEach(() => {
  selectQueue.length = 0;
  updates.length = 0;
  sendMail.mockReset();
  renderTemplate.mockClear();
  vi.resetModules();
});

describe("ya enviado: no se repite y se dice cuándo", () => {
  it("sin force devuelve skipped con la fecha del envío anterior, sin mandar nada", async () => {
    const antes = new Date("2026-10-01T13:05:00.000Z");
    selectQueue.push([contexto({ termsEmailSentAt: antes })]);
    const { sendEnrollmentEmail } = await import("@/server/email/enrollment-emails");
    const r = await sendEnrollmentEmail("org_1", "enr_madre", "terms");
    expect(r).toEqual({ ok: true, sentAt: antes.toISOString(), skipped: true });
    expect(sendMail).not.toHaveBeenCalled();
  });
});

describe("términos de una especialización", () => {
  it("sin licencia propia, nombra las licencias de sus módulos", async () => {
    selectQueue.push([contexto()]);
    selectQueue.push([{ name: "Navisworks" }, { name: "Revit" }]);
    sendMail.mockResolvedValue({ ok: true, data: "msg_1" });

    const { sendEnrollmentEmail } = await import("@/server/email/enrollment-emails");
    const r = await sendEnrollmentEmail("org_1", "enr_madre", "terms");

    expect(r.ok).toBe(true);
    const vars = renderTemplate.mock.calls[0]?.[1] as { licencias: string };
    expect(vars.licencias).toBe("Navisworks y Revit");
    // La marca se escribe después de que Graph aceptó.
    expect(updates).toHaveLength(1);
  });

  it("con licencia propia, usa esa y no consulta los módulos", async () => {
    selectQueue.push([contexto({ softwareName: "AutoCAD" })]);
    selectQueue.push([{ name: "NO DEBERÍA LEERSE" }]);
    sendMail.mockResolvedValue({ ok: true, data: "msg_1" });

    const { sendEnrollmentEmail } = await import("@/server/email/enrollment-emails");
    await sendEnrollmentEmail("org_1", "enr_madre", "terms");

    const vars = renderTemplate.mock.calls[0]?.[1] as { licencias: string };
    expect(vars.licencias).toBe("AutoCAD");
  });

  it("sin licencias en ningún lado, lo declara en vez de inventar", async () => {
    selectQueue.push([contexto()]);
    selectQueue.push([]);
    sendMail.mockResolvedValue({ ok: true, data: "msg_1" });

    const { sendEnrollmentEmail } = await import("@/server/email/enrollment-emails");
    await sendEnrollmentEmail("org_1", "enr_madre", "terms");

    const vars = renderTemplate.mock.calls[0]?.[1] as { licencias: string };
    expect(vars.licencias).toBe("a confirmar");
  });
});
