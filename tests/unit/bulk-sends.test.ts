import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 2026-10-05 — Envío masivo por cohorte (términos ATC, bienvenida, acceso al
 * portal). Lo que se prueba acá es lo que hace seguro apretar el botón:
 *
 * - a quién le llega y a quién NO, y por qué (partición pura);
 * - que se manda de a uno, con pausa, y que un fallo no corta la corrida;
 * - que reanudar manda solo lo pendiente;
 * - que no corren dos corridas a la vez para la misma cohorte y tipo;
 * - que el acceso al portal NUNCA reinvita a quien ya tiene cuenta: reinvitar
 *   genera una contraseña nueva y lo deja afuera de lo que ya usa.
 */

vi.mock("@/lib/db", () => ({
  getRootDb: () => ({ transaction: async (fn: (tx: unknown) => unknown) => fn({ execute: async () => [] }) }),
  getDb: () => ({}),
  schema: new Proxy(
    {},
    { get: (_t, table) => new Proxy({}, { get: (_t2, col) => `${String(table)}.${String(col)}` }) }
  ),
}));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ BULK_SEND_PAUSE_MS: 0 }) }));

type Candidate = import("@/server/bulk-sends").BulkCandidate;

// La primera importación arrastra el grafo entero (correo, accesos, roster):
// se paga una vez acá y no dentro del primer caso, que si no vence el plazo.
beforeAll(async () => {
  await import("@/server/bulk-sends");
}, 60_000);

const AYER = new Date("2026-10-04T15:00:00.000Z");

function alumno(id: string, over: Partial<Candidate> = {}): Candidate {
  return {
    enrollmentId: id,
    hasEmail: true,
    termsEmailSentAt: null,
    welcomeEmailSentAt: null,
    portalLink: null,
    withdrawn: false,
    ...over,
  };
}

describe("partitionRecipients — quién lo recibe y quién no", () => {
  it("términos: saltea a quien ya tiene la marca y separa a quien no tiene correo", async () => {
    const { partitionRecipients } = await import("@/server/bulk-sends");
    const p = partitionRecipients("terms", [
      alumno("enr_1"),
      alumno("enr_2", { termsEmailSentAt: AYER }),
      alumno("enr_3", { hasEmail: false }),
      alumno("enr_4", { welcomeEmailSentAt: AYER }),
    ]);
    expect(p).toEqual({
      toSend: ["enr_1", "enr_4"],
      alreadySent: ["enr_2"],
      hasAccess: [],
      withoutEmail: ["enr_3"],
      withdrawn: [],
    });
  });

  it("bienvenida: mira SU marca, no la de términos", async () => {
    const { partitionRecipients } = await import("@/server/bulk-sends");
    const p = partitionRecipients("welcome", [
      alumno("enr_1", { termsEmailSentAt: AYER }),
      alumno("enr_2", { welcomeEmailSentAt: AYER }),
    ]);
    expect(p.toSend).toEqual(["enr_1"]);
    expect(p.alreadySent).toEqual(["enr_2"]);
  });

  /**
   * El corazón de la salvaguarda: quien ya tiene vínculo de portal —activo o
   * suspendido, con marca de correo o sin ella (los vínculos anteriores a la
   * marca no la tienen)— NO entra en la corrida.
   */
  it("acceso al portal: quien ya tiene vínculo no se reinvita nunca", async () => {
    const { partitionRecipients } = await import("@/server/bulk-sends");
    const p = partitionRecipients("portal_access", [
      alumno("enr_1"),
      alumno("enr_2", { portalLink: { suspended: false } }),
      alumno("enr_3", { portalLink: { suspended: true } }),
      alumno("enr_4", { hasEmail: false }),
      alumno("enr_5", { hasEmail: false, portalLink: { suspended: false } }),
    ]);
    expect(p).toEqual({
      toSend: ["enr_1"],
      alreadySent: [],
      hasAccess: ["enr_2", "enr_3", "enr_5"],
      withoutEmail: ["enr_4"],
      withdrawn: [],
    });
  });

  /**
   * Dar de baja a un alumno con historial ARCHIVA su contacto, pero su
   * inscripción sigue en la cohorte (y en el roster). Un envío masivo no le
   * puede mandar la bienvenida al grupo ni un acceso al portal a quien se fue.
   */
  it("nunca le escribe a un alumno dado de baja, en ninguno de los tres correos", async () => {
    const { partitionRecipients } = await import("@/server/bulk-sends");
    for (const kind of ["terms", "welcome", "portal_access"] as const) {
      const p = partitionRecipients(kind, [
        alumno("enr_1"),
        alumno("enr_2", { withdrawn: true }),
        alumno("enr_3", { withdrawn: true, hasEmail: false }),
      ]);
      expect(p.toSend, kind).toEqual(["enr_1"]);
      expect(p.withdrawn, kind).toEqual(["enr_2", "enr_3"]);
      expect(p.withoutEmail, kind).toEqual([]);
    }
  });

  /**
   * El detalle de la corrida es lo que el equipo lee después: a un alumno dado
   * de baja no se le escribió, y la corrida no puede decir de él otra cosa
   * —antes caía en "ya tiene acceso al portal", incluso en la bienvenida—.
   */
  it("las filas de la corrida no registran a los dados de baja", async () => {
    const { partitionRecipients, recipientRows } = await import("@/server/bulk-sends");
    for (const kind of ["terms", "welcome", "portal_access"] as const) {
      const candidatos = [
        alumno("enr_1"),
        alumno("enr_2", { withdrawn: true, portalLink: { suspended: false } }),
        alumno("enr_3", { termsEmailSentAt: AYER, welcomeEmailSentAt: AYER, portalLink: { suspended: false } }),
      ];
      const filas = recipientRows(candidatos, partitionRecipients(kind, candidatos));
      expect(filas.map((f) => f.enrollmentId), kind).toEqual(["enr_1", "enr_3"]);
      expect(filas[0]?.outcome, kind).toBe("pending");
      expect(filas[1]?.outcome, kind).toBe(
        kind === "portal_access" ? "skipped_has_access" : "skipped_already_sent"
      );
    }
  });

  it("candidatesFromRoster toma los datos del roster de la cohorte, sin otra regla", async () => {
    const { candidatesFromRoster } = await import("@/server/bulk-sends");
    const c = candidatesFromRoster([
      {
        id: "enr_1",
        contact: { id: "ct_1", name: "Ana Pérez", phone: null, email: "ana@x.com", archived: true },
        checklist: {
          licenseAssigned: false,
          licenseSoftwareId: null,
          termsEmailSentAt: AYER.toISOString(),
          softwareInstalledAt: null,
          hadOwnLicense: false,
          academiaOnlineAccessAt: null,
        },
        welcomeEmailSentAt: null,
        portalAccess: {
          granted: true,
          suspended: false,
          blockedReason: null,
          emailSentAt: null,
        },
      },
    ]);
    expect(c).toEqual([
      {
        enrollmentId: "enr_1",
        hasEmail: true,
        termsEmailSentAt: AYER,
        welcomeEmailSentAt: null,
        portalLink: { suspended: false },
        withdrawn: true,
      },
    ]);
  });
});

describe("outcomeOfEmail / outcomeOfAccess — qué quedó registrado", () => {
  it("correo aceptado → enviado, y cuenta como intento (hay pausa después)", async () => {
    const { outcomeOfEmail } = await import("@/server/bulk-sends");
    expect(outcomeOfEmail({ ok: true, sentAt: AYER.toISOString() })).toEqual({
      outcome: "sent",
      message: null,
      attempted: true,
    });
  });

  it("la marca apareció entre la vista previa y el envío → salteado, sin reenviar", async () => {
    const { outcomeOfEmail } = await import("@/server/bulk-sends");
    const r = outcomeOfEmail({ ok: true, sentAt: AYER.toISOString(), skipped: true });
    expect(r.outcome).toBe("skipped_already_sent");
    expect(r.attempted).toBe(false);
  });

  it("falta el enlace del grupo → fallo con el motivo de la regla individual", async () => {
    const { outcomeOfEmail } = await import("@/server/bulk-sends");
    const r = outcomeOfEmail({
      ok: false,
      status: 422,
      code: "missing_group_link",
      message: "La cohorte no tiene enlace del grupo de WhatsApp.",
    });
    expect(r).toEqual({
      outcome: "failed",
      message: "La cohorte no tiene enlace del grupo de WhatsApp.",
      attempted: false,
    });
  });

  it("Graph rechazó → fallo, y SÍ cuenta como intento", async () => {
    const { outcomeOfEmail } = await import("@/server/bulk-sends");
    const r = outcomeOfEmail({ ok: false, status: 502, code: "m365_error", message: "Graph caído" });
    expect(r.outcome).toBe("failed");
    expect(r.attempted).toBe(true);
  });

  it("acceso: vínculo existente → 'ya tiene acceso', no se tocó la contraseña", async () => {
    const { outcomeOfAccess } = await import("@/server/bulk-sends");
    const r = outcomeOfAccess({
      ok: true,
      data: {
        skipped: true,
        link: {
          id: "alk_1",
          userId: "usr_1",
          kind: "alumno",
          contactId: "ct_1",
          teacherId: null,
          suspendedAt: null,
          invitationEmailSentAt: null,
        },
        emailSentAt: null,
      },
    });
    expect(r.outcome).toBe("skipped_has_access");
    expect(r.attempted).toBe(false);
  });

  it("acceso creado pero el correo no salió → fallo que dice que la cuenta existe", async () => {
    const { outcomeOfAccess } = await import("@/server/bulk-sends");
    const r = outcomeOfAccess({
      ok: true,
      data: {
        link: {
          id: "alk_1",
          userId: "usr_1",
          kind: "alumno",
          contactId: "ct_1",
          teacherId: null,
          suspendedAt: null,
          invitationEmailSentAt: null,
        },
        existingAccount: false,
        temporaryPassword: "Secreta123",
        emailSentAt: null,
        emailError: "M365 no está configurado",
      },
    });
    expect(r.outcome).toBe("failed");
    expect(r.message).toContain("M365 no está configurado");
    expect(r.message).toContain("acceso");
    // La contraseña temporal NO viaja al registro de la corrida.
    expect(r.message).not.toContain("Secreta123");
    expect(r.attempted).toBe(true);
  });
});

describe("processRecipients — de a uno, con pausa, sin cortarse", () => {
  const pendientes = [
    { id: "r1", enrollmentId: "enr_1" },
    { id: "r2", enrollmentId: "enr_2" },
    { id: "r3", enrollmentId: "enr_3" },
  ];

  it("manda en orden, uno por vez, y registra cada resultado apenas vuelve", async () => {
    const { processRecipients } = await import("@/server/bulk-sends");
    const eventos: string[] = [];
    let enVuelo = 0;
    let maxEnVuelo = 0;
    await processRecipients(pendientes, {
      send: async (enrollmentId) => {
        enVuelo++;
        maxEnVuelo = Math.max(maxEnVuelo, enVuelo);
        eventos.push(`send:${enrollmentId}`);
        await Promise.resolve();
        enVuelo--;
        return { outcome: "sent", message: null, attempted: true };
      },
      record: async (id, o) => {
        eventos.push(`record:${id}:${o.outcome}`);
      },
      pause: async () => {
        eventos.push("pause");
      },
    });
    expect(maxEnVuelo).toBe(1);
    expect(eventos).toEqual([
      "send:enr_1",
      "record:r1:sent",
      "pause",
      "send:enr_2",
      "record:r2:sent",
      "pause",
      "send:enr_3",
      "record:r3:sent",
    ]);
  });

  it("no hace pausa después de lo que ni llegó al proveedor", async () => {
    const { processRecipients } = await import("@/server/bulk-sends");
    const pause = vi.fn(async () => {});
    await processRecipients(pendientes, {
      send: async () => ({ outcome: "failed", message: "sin correo", attempted: false }),
      record: async () => {},
      pause,
    });
    expect(pause).not.toHaveBeenCalled();
  });

  it("si uno revienta, se registra como fallo y la corrida sigue", async () => {
    const { processRecipients } = await import("@/server/bulk-sends");
    const registros: [string, string][] = [];
    await processRecipients(pendientes, {
      send: async (enrollmentId) => {
        if (enrollmentId === "enr_2") throw new Error("boom");
        return { outcome: "sent", message: null, attempted: true };
      },
      record: async (id, o) => {
        registros.push([id, o.outcome]);
      },
      pause: async () => {},
    });
    expect(registros).toEqual([
      ["r1", "sent"],
      ["r2", "failed"],
      ["r3", "sent"],
    ]);
  });

  it("si registrar falla, igual sigue con el próximo", async () => {
    const { processRecipients } = await import("@/server/bulk-sends");
    const send = vi.fn(async () => ({ outcome: "sent" as const, message: null, attempted: true }));
    await processRecipients(pendientes, {
      send,
      record: async (id) => {
        if (id === "r1") throw new Error("db");
      },
      pause: async () => {},
    });
    expect(send).toHaveBeenCalledTimes(3);
  });
});

describe("el candado — una corrida por cohorte y tipo", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("la segunda corrida simultánea para la misma cohorte y tipo no arranca", async () => {
    const { tryAcquireRunLock, releaseRunLock } = await import("@/server/bulk-sends");
    expect(tryAcquireRunLock("org_1", "coh_1", "terms")).toBe(true);
    expect(tryAcquireRunLock("org_1", "coh_1", "terms")).toBe(false);
    // Otro tipo u otra cohorte no se bloquean entre sí.
    expect(tryAcquireRunLock("org_1", "coh_1", "welcome")).toBe(true);
    expect(tryAcquireRunLock("org_1", "coh_2", "terms")).toBe(true);
    releaseRunLock("org_1", "coh_1", "terms");
    expect(tryAcquireRunLock("org_1", "coh_1", "terms")).toBe(true);
    releaseRunLock("org_1", "coh_1", "terms");
    releaseRunLock("org_1", "coh_1", "welcome");
    releaseRunLock("org_1", "coh_2", "terms");
  });

  it("una corrida sin terminar y sin proceso vivo se informa como interrumpida", async () => {
    const { runStatus, markRunActive, markRunInactive } = await import("@/server/bulk-sends");
    expect(runStatus({ id: "bsr_1", finishedAt: null })).toBe("interrumpida");
    markRunActive("bsr_1");
    expect(runStatus({ id: "bsr_1", finishedAt: null })).toBe("en_curso");
    markRunInactive("bsr_1");
    expect(runStatus({ id: "bsr_1", finishedAt: new Date() })).toBe("terminada");
  });
});
