import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isValidSignature,
  isValidWebhookToken,
  safeEqual,
  warnIfWebhookSignatureDisabled,
} from "@/server/inbox/webhook";

describe("capa 1: token en la ruta (FR-041/FR-083)", () => {
  it("segmento correcto → válido", () => {
    expect(isValidWebhookToken("token-abc", "token-abc")).toBe(true);
  });

  it("segmento incorrecto → inválido (la ruta responde 404)", () => {
    expect(isValidWebhookToken("token-xyz", "token-abc")).toBe(false);
  });

  it("verify token vacío jamás valida", () => {
    expect(isValidWebhookToken("", "")).toBe(false);
  });
});

describe("capa 2: firma x-hub-signature-256 (FR-042)", () => {
  const secret = "app-secret-de-prueba";
  const body = JSON.stringify({ object: "whatsapp_business_account" });

  function sign(payload: string, key: string): string {
    return `sha256=${createHmac("sha256", key).update(payload, "utf8").digest("hex")}`;
  }

  it("firma válida → pasa", () => {
    expect(isValidSignature(body, sign(body, secret), secret)).toBe(true);
  });

  it("firma inválida → rechaza (la ruta responde 401)", () => {
    expect(isValidSignature(body, sign(body, "otro-secreto"), secret)).toBe(
      false
    );
  });

  it("firma de otro body → rechaza", () => {
    expect(isValidSignature("{}", sign(body, secret), secret)).toBe(false);
  });

  it("header ausente con secreto configurado → rechaza", () => {
    expect(isValidSignature(body, null, secret)).toBe(false);
  });

  it("sin secreto configurado la capa está desactivada → pasa", () => {
    expect(isValidSignature(body, null, undefined)).toBe(true);
    expect(isValidSignature(body, "sha256=basura", undefined)).toBe(true);
  });
});

describe("aviso de arranque cuando la capa 2 está desactivada", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("sin secreto configurado avisa UNA vez (no por pedido)", () => {
    vi.stubEnv("META_APP_SECRET", "");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    warnIfWebhookSignatureDisabled();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain("META_APP_SECRET");
  });

  it("con secreto configurado no dice nada", () => {
    vi.stubEnv("META_APP_SECRET", "un-secreto");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    warnIfWebhookSignatureDisabled();

    expect(warn).not.toHaveBeenCalled();
  });
});

describe("safeEqual", () => {
  it("longitudes distintas no lanzan", () => {
    expect(safeEqual("a", "aa")).toBe(false);
  });
});
