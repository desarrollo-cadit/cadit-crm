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
  markSafeHtml: (h: string) => h,
}));
// 036 — El soporte y la coordinación elegidos en Configuración.
const equipo = vi.fn();
vi.mock("@/server/welcome-team", () => ({ equipoParaBienvenida: () => equipo() }));

function contexto(over: { termsEmailSentAt?: Date | null } = {}) {
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
    selectQueue.push([]); // 034 — las propias: ninguna
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

  /**
   * 034 (FR-020/FR-021) — El paquete de la especialización (licencias de la
   * madre) y las de sus módulos van JUNTOS, sin repetir el programa que esté
   * en los dos lados.
   */
  it("nombra el paquete propio Y las de los módulos, sin repetir", async () => {
    selectQueue.push([contexto()]);
    selectQueue.push([{ name: "AutoCAD" }, { name: "Revit" }]);
    selectQueue.push([{ name: "Revit" }]);
    sendMail.mockResolvedValue({ ok: true, data: "msg_1" });

    const { sendEnrollmentEmail } = await import("@/server/email/enrollment-emails");
    await sendEnrollmentEmail("org_1", "enr_madre", "terms");

    const vars = renderTemplate.mock.calls[0]?.[1] as { licencias: string };
    expect(vars.licencias).toBe("AutoCAD y Revit");
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

/**
 * 036 — La bienvenida va con copia al docente y al soporte técnico, nunca al
 * alumno, y con el asunto de siempre.
 */
describe("bienvenida: copia y asunto", () => {
  function contextoBienvenida() {
    const c = contexto();
    return {
      ...c,
      cohort: {
        ...c.cohort,
        id: "cv_1",
        name: null,
        isSpecialization: false,
        modality: null,
        daysOfWeek: null,
        whatsappGroupLink: "https://chat.whatsapp.com/abc",
      },
      course: { name: "REVIT Arquitectura", modality: "en_vivo" },
      teacherName: "Sandra Moros",
      teacherEmail: "sandra@example.com",
    };
  }

  it("copia al docente y al soporte, sin coordinación ni el alumno", async () => {
    selectQueue.push([contextoBienvenida()]);
    selectQueue.push([{ name: "Revit" }]); // cohort_software
    selectQueue.push([]); // licencias propias
    selectQueue.push([{ canceledAt: null }, { canceledAt: new Date() }]); // clases
    equipo.mockResolvedValue({
      soporte: [
        { name: "Julio", email: "julio@example.com" },
        { name: "Ana", email: "ana@x.com" },
      ],
      coordinacion: [{ name: "Natalie", email: "natalie@example.com" }],
    });
    sendMail.mockResolvedValue({ ok: true });

    const { sendEnrollmentEmail } = await import("@/server/email/enrollment-emails");
    const r = await sendEnrollmentEmail("org_1", "enr_1", "welcome");

    expect(r.ok).toBe(true);
    const enviado = sendMail.mock.calls[0]?.[0] as { cc?: string[]; subject: string; to: string };
    expect(enviado.to).toBe("ana@x.com");
    expect(enviado.cc).toEqual(["sandra@example.com", "julio@example.com"]);
    expect(enviado.subject).toBe("Te damos la bienvenida a REVIT Arquitectura");
  });

  /**
   * 2026-10-20 — El horario es texto libre en la hora de la academia. Hay
   * alumnos en Dominicana y en España: el correo dice de qué zona es.
   */
  it("el horario dice la zona de la academia", async () => {
    const c = contextoBienvenida();
    selectQueue.push([
      {
        ...c,
        cohort: { ...c.cohort, frequency: "martes y jueves de 18:30 a 20:30" },
        timezone: "America/Montevideo",
      },
    ]);
    selectQueue.push([]); // cohort_software
    selectQueue.push([]); // licencias propias
    selectQueue.push([]); // clases
    equipo.mockResolvedValue({ soporte: [], coordinacion: [] });
    sendMail.mockResolvedValue({ ok: true });

    const { sendEnrollmentEmail } = await import("@/server/email/enrollment-emails");
    const r = await sendEnrollmentEmail("org_1", "enr_1", "welcome");

    expect(r.ok).toBe(true);
    // La plantilla está simulada: se mira lo que recibió para dibujar.
    expect(JSON.stringify(renderTemplate.mock.calls)).toContain(
      "martes y jueves de 18:30 a 20:30 (hora de Uruguay)"
    );
  });

  it("sin enlace del grupo sigue respondiendo 422 sin mandar nada", async () => {
    const c = contextoBienvenida();
    selectQueue.push([{ ...c, cohort: { ...c.cohort, whatsappGroupLink: null } }]);
    const { sendEnrollmentEmail } = await import("@/server/email/enrollment-emails");
    const r = await sendEnrollmentEmail("org_1", "enr_1", "welcome");
    expect(r).toMatchObject({ ok: false, status: 422, code: "missing_group_link" });
    expect(sendMail).not.toHaveBeenCalled();
  });
});
