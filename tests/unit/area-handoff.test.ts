import { describe, expect, it, vi } from "vitest";
import type { AreaConfigDto } from "@/lib/areas";
import type { DeriveAreaAction } from "@/server/ai/actions";
import { SendError } from "@/server/inbox/send";

vi.mock("@/lib/m365/client", () => ({ sendMail: vi.fn(async () => ({ ok: true })) }));

// R4 — el cierre corre en un SAVEPOINT cuando hay transacción del turno.
const executed: string[] = [];
let inTx = false;
vi.mock("@/lib/db/tenant-context", () => ({
  currentTenantTx: () => (inTx ? {} : undefined),
  onAfterCommit: (fn: () => void) => fn(),
}));
vi.mock("@/lib/db", () => ({
  getDb: () => ({
    execute: async (q: { queryChunks?: { value?: string[] }[] }) => {
      executed.push(
        (q.queryChunks ?? []).map((c) => (c.value ?? []).join("")).join("").trim()
      );
      return [];
    },
  }),
  schema: {},
}));

import {
  buildClosingText,
  deliverAreaClosing,
  emailOutcome,
  isCaseOpen,
  newCaseRef,
  planDerivation,
} from "@/server/areas/handoff";
import { sendHandoffEmail } from "@/server/areas/email";
import { sendMail } from "@/lib/m365/client";

/**
 * 029 — `deriveToArea()` y lo que lo rodea (data-model "Transiciones de
 * estado", research DV-005, riesgo R4).
 *
 * Las decisiones son funciones puras (`planDerivation`, `emailOutcome`,
 * `buildClosingText`) para poder probarlas sin base; `deriveToArea` solo
 * persiste lo que ellas deciden. El camino completo contra Postgres lo cubre
 * la sección E2E `agente-por-areas`.
 */

const ventas: AreaConfigDto = {
  area: "ventas",
  enabled: true,
  mailbox: "comercial@academia.test",
  ccEmails: [],
  ccSellerIds: [],
  contactText: "Te va a contactar el equipo comercial.",
  officeHours: { days: [0, 1, 2, 3, 4], from: "09:00", to: "18:00" },
  updatedAt: null,
};

const action = (over: Partial<DeriveAreaAction> = {}): DeriveAreaAction => ({
  action: "derive_area",
  topic: "ventas",
  area: "ventas",
  summary: "5 licencias de AutoCAD",
  collected: { name: "Laura", product: "AutoCAD", quantity: "5", email: "laura@sur.test" },
  missing: [],
  ...over,
});

const NOW = new Date("2026-10-08T15:00:00Z"); // jueves 12:00 en Montevideo

describe("isCaseOpen — ventana de 7 días", () => {
  it("actividad hace 6 días → abierto", () => {
    expect(isCaseOpen(new Date(NOW.getTime() - 6 * 86_400_000), NOW)).toBe(true);
  });
  it("día 8 → vencido (caso nuevo)", () => {
    expect(isCaseOpen(new Date(NOW.getTime() - 8 * 86_400_000), NOW)).toBe(false);
  });
});

describe("planDerivation", () => {
  it("sin caso abierto → apertura, correo pendiente", () => {
    const p = planDerivation({ open: null, action: action(), config: ventas, isTest: false });
    expect(p).toMatchObject({ kind: "apertura", emailStatus: "pendiente" });
    expect(p.collected).toEqual(action().collected);
  });

  it("caso abierto con un campo nuevo → seguimiento con el delta", () => {
    const p = planDerivation({
      open: { collected: { name: "Laura", product: "AutoCAD", quantity: "5" }, missing: ["email"] },
      action: action({ collected: { name: "Laura", product: "AutoCAD", quantity: "7" } , missing: ["email"] }),
      config: ventas,
      isTest: false,
    });
    expect(p.kind).toBe("seguimiento");
    expect(p.delta).toEqual({ quantity: "7" });
    expect(p.collected.quantity).toBe("7");
  });

  it("caso abierto y faltantes que se achican → seguimiento", () => {
    const p = planDerivation({
      open: { collected: { product: "AutoCAD" }, missing: ["email", "quantity"] },
      action: action({ collected: { product: "AutoCAD" }, missing: ["quantity"] }),
      config: ventas,
      isTest: false,
    });
    expect(p.kind).toBe("seguimiento");
  });

  it("sin datos nuevos (solo el resumen parafraseado) → ya abierto, sin correo", () => {
    const p = planDerivation({
      open: { collected: action().collected, missing: [] },
      action: action({ summary: "Quiere cinco licencias de AutoCAD" }),
      config: ventas,
      isTest: false,
    });
    expect(p).toMatchObject({ kind: "already_open", emailStatus: null });
  });

  it("un campo que el modelo omite no borra lo que ya estaba", () => {
    const p = planDerivation({
      open: { collected: { name: "Laura", company: "Sur" }, missing: [] },
      action: action({ collected: { name: "Laura", quantity: "3" } }),
      config: ventas,
      isTest: false,
    });
    expect(p.collected).toEqual({ name: "Laura", company: "Sur", quantity: "3" });
  });

  it("área apagada → sin_configurar", () => {
    const p = planDerivation({
      open: null,
      action: action(),
      config: { ...ventas, enabled: false },
      isTest: false,
    });
    expect(p.emailStatus).toBe("sin_configurar");
  });

  it("área sin casilla → sin_configurar", () => {
    const p = planDerivation({
      open: null,
      action: action(),
      config: { ...ventas, mailbox: null },
      isTest: false,
    });
    expect(p.emailStatus).toBe("sin_configurar");
  });

  it("conversación del Laboratorio (is_test) → simulado, aunque el área esté lista", () => {
    const p = planDerivation({ open: null, action: action(), config: ventas, isTest: true });
    expect(p.emailStatus).toBe("simulado");
  });
});

describe("newCaseRef", () => {
  it("AH- + 6 caracteres legibles", () => {
    for (let i = 0; i < 20; i++) expect(newCaseRef()).toMatch(/^AH-[A-Z2-9]{6}$/);
  });
});

describe("emailOutcome — después de Graph", () => {
  it("202 → enviado con sent_at", () => {
    expect(emailOutcome({ ok: true }, NOW)).toEqual({ status: "enviado", sentAt: NOW, error: null });
  });
  it("rechazo → fallido con el motivo", () => {
    expect(
      emailOutcome({ ok: false, code: "send_failed", message: "mock: fallo forzado" }, NOW)
    ).toEqual({ status: "fallido", sentAt: null, error: "mock: fallo forzado" });
  });
  it("sin M365 → fallido «M365 no configurado»", () => {
    expect(
      emailOutcome({ ok: false, code: "not_configured", message: "x" }, NOW).error
    ).toBe("M365 no configurado");
  });
});

describe("buildClosingText", () => {
  it("usa el texto configurado del área", () => {
    expect(buildClosingText(ventas, NOW, "America/Montevideo")).toBe(
      "Te va a contactar el equipo comercial."
    );
  });

  it("sin texto configurado, uno genérico que nombra el área", () => {
    expect(buildClosingText({ ...ventas, contactText: null }, NOW, "America/Montevideo")).toMatch(
      /Ventas/
    );
  });

  it("fuera de horario agrega la línea del horario (días desde el lunes, zona de la organización)", () => {
    const sabado = new Date("2026-10-10T15:00:00Z");
    const text = buildClosingText(ventas, sabado, "America/Montevideo");
    expect(text).toContain("Te va a contactar el equipo comercial.");
    expect(text).toContain("de lunes a viernes de 9:00 a 18:00 (hora de Montevideo)");
  });

  it("área sin configurar: no promete un correo que no salió", () => {
    const text = buildClosingText({ ...ventas, enabled: false }, NOW, "America/Montevideo");
    expect(text).toContain("Ventas");
    expect(text).not.toContain("le pasé");
    expect(text).not.toContain("Te va a contactar el equipo comercial.");
  });

  it("en horario no agrega nada", () => {
    expect(buildClosingText(ventas, NOW, "America/Montevideo")).not.toContain("lunes a viernes");
  });

  it("el jueves a las 20:00 de Montevideo está fuera de horario", () => {
    const tarde = new Date("2026-10-08T23:00:00Z");
    expect(buildClosingText(ventas, tarde, "America/Montevideo")).toContain("lunes a viernes");
  });
});

describe("deliverAreaClosing — el cierre nunca revierte el caso (R4)", () => {
  it("un error de WhatsApp que no es window_closed se traga", async () => {
    const onWindowClosed = vi.fn();
    await expect(
      deliverAreaClosing(async () => {
        throw new SendError("meta_unavailable", "Meta caído");
      }, onWindowClosed)
    ).resolves.toBeUndefined();
    expect(onWindowClosed).not.toHaveBeenCalled();
  });

  it("window_closed se trata como hoy (handoff por ventana)", async () => {
    const onWindowClosed = vi.fn(async () => undefined);
    await deliverAreaClosing(async () => {
      throw new SendError("window_closed", "cerrada");
    }, onWindowClosed);
    expect(onWindowClosed).toHaveBeenCalledOnce();
  });

  it("dentro del turno, un fallo vuelve al SAVEPOINT: el caso no se pierde con la transacción", async () => {
    inTx = true;
    executed.length = 0;
    try {
      await deliverAreaClosing(async () => {
        throw new Error("duplicate key value violates unique constraint");
      }, vi.fn());
    } finally {
      inTx = false;
    }
    expect(executed).toEqual(["savepoint area_closing", "rollback to savepoint area_closing"]);
  });

  it("dentro del turno, una entrega normal libera el SAVEPOINT", async () => {
    inTx = true;
    executed.length = 0;
    try {
      await deliverAreaClosing(async () => undefined, vi.fn());
    } finally {
      inTx = false;
    }
    expect(executed).toEqual(["savepoint area_closing", "release savepoint area_closing"]);
  });

  it("entrega normal", async () => {
    const send = vi.fn(async () => undefined);
    await deliverAreaClosing(send, vi.fn());
    expect(send).toHaveBeenCalledOnce();
  });
});

describe("sendHandoffEmail", () => {
  it("To, CC y Reply-To del caso; jamás Bcc", async () => {
    await sendHandoffEmail({
      recipients: { to: ["comercial@x.test"], cc: ["g@x.test"], replyTo: "c@x.test" },
      subject: "S",
      html: "<p>x</p>",
    });
    expect(sendMail).toHaveBeenCalledWith({
      to: ["comercial@x.test"],
      cc: ["g@x.test"],
      replyTo: "c@x.test",
      subject: "S",
      html: "<p>x</p>",
    });
  });
});
