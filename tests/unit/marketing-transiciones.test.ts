import { describe, expect, it } from "vitest";
import {
  clasificarResultado,
  puedeTransicionarCampana,
  puedeTransicionarDestinatario,
} from "@/lib/marketing/transitions";

/**
 * 045 (T054; FR-017, FR-019, FR-020; DV-002) — Las transiciones permitidas y
 * qué hacer con cada respuesta de Graph.
 */

describe("puedeTransicionarCampana", () => {
  it.each([
    ["borrador", "enviando", true],
    ["enviando", "enviada", true],
    ["enviando", "cancelada", true],
    ["borrador", "enviada", false],
    ["borrador", "cancelada", false],
    ["enviada", "enviando", false],
    ["enviada", "cancelada", false],
    ["cancelada", "enviando", false],
    ["cancelada", "borrador", false],
    ["enviando", "borrador", false],
  ] as const)("%s → %s: %s", (de, a, ok) => {
    expect(puedeTransicionarCampana(de, a)).toBe(ok);
  });
});

describe("puedeTransicionarDestinatario", () => {
  it.each([
    ["pendiente", "enviando", true],
    ["pendiente", "omitido", true],
    ["pendiente", "cancelado", true],
    ["enviando", "enviado", true],
    ["enviando", "fallido", true],
    ["enviando", "pendiente", true],
    ["pendiente", "enviado", false],
    ["enviado", "pendiente", false],
    ["enviado", "fallido", false],
    ["fallido", "pendiente", false],
    ["omitido", "enviando", false],
    ["cancelado", "enviando", false],
  ] as const)("%s → %s: %s", (de, a, ok) => {
    expect(puedeTransicionarDestinatario(de, a)).toBe(ok);
  });
});

describe("clasificarResultado", () => {
  it("202 → enviado", () => {
    expect(clasificarResultado({ ok: true })).toEqual({ estado: "enviado" });
  });

  it("throttled → vuelve a pendiente con la pausa del proveedor", () => {
    expect(
      clasificarResultado({ ok: false, code: "throttled", message: "429", retryAfterMs: 30_000 })
    ).toEqual({ estado: "pendiente", pausaMs: 30_000 });
  });

  it("mailbox_denied → se detiene la campaña, el destinatario vuelve a pendiente", () => {
    expect(clasificarResultado({ ok: false, code: "mailbox_denied", message: "403" })).toEqual({
      estado: "pendiente",
      detener: true,
      motivo: "403",
    });
  });

  it("cualquier otro error → fallido con el motivo", () => {
    expect(clasificarResultado({ ok: false, code: "send_failed", message: "Buzón lleno" })).toEqual({
      estado: "fallido",
      motivo: "Buzón lleno",
    });
    expect(clasificarResultado({ ok: false, code: "not_configured", message: "M365 no está configurado" })).toEqual({
      estado: "fallido",
      motivo: "M365 no está configurado",
    });
  });
});
