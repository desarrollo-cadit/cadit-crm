import { createHmac, hkdfSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  derivarClave,
  firmarBaja,
  firmarClic,
  verificarBaja,
  verificarClic,
} from "@/lib/marketing/link-token";

/**
 * 045 (T009, research R6/R7, DV-012) — Enlaces firmados de baja y de clic.
 *
 * El token es `<recipientId>.<base64url(HMAC-SHA256(k, propósito + id))>` con
 * `k = HKDF-SHA256(ENCRYPTION_KEY, info = "cadit:marketing-links:v1")`. Propio
 * de cada destinatario, imposible de fabricar para otro (FR-012), y con
 * propósito: un token de clic no da de baja a nadie (FR-023).
 */

const KEY = Buffer.alloc(32, 7).toString("base64");
const OTRA_KEY = Buffer.alloc(32, 9).toString("base64");

describe("derivarClave", () => {
  it("es HKDF-SHA256 con el `info` de los enlaces de marketing", () => {
    const esperada = Buffer.from(
      hkdfSync("sha256", Buffer.from(KEY, "base64"), Buffer.alloc(0), "cadit:marketing-links:v1", 32)
    );
    expect(Buffer.compare(derivarClave(KEY), esperada)).toBe(0);
  });

  it("es determinística y depende de la clave", () => {
    expect(Buffer.compare(derivarClave(KEY), derivarClave(KEY))).toBe(0);
    expect(Buffer.compare(derivarClave(KEY), derivarClave(OTRA_KEY))).not.toBe(0);
  });
});

describe("firmarBaja / verificarBaja", () => {
  const k = derivarClave(KEY);

  it("produce `<id>.<base64url(HMAC(k, 'baja:v1:' + id))>`", () => {
    const firma = createHmac("sha256", k).update("baja:v1:mkr_abc").digest("base64url");
    expect(firmarBaja(k, "mkr_abc")).toBe(`mkr_abc.${firma}`);
  });

  it("verifica y devuelve el id del destinatario", () => {
    expect(verificarBaja(k, firmarBaja(k, "mkr_abc"))).toBe("mkr_abc");
  });

  it("un carácter alterado no verifica", () => {
    const token = firmarBaja(k, "mkr_abc");
    const ultimo = token.at(-1)!;
    const alterado = token.slice(0, -1) + (ultimo === "A" ? "B" : "A");
    expect(verificarBaja(k, alterado)).toBeNull();
    // Alterar el id también invalida la firma.
    expect(verificarBaja(k, token.replace("mkr_abc", "mkr_abd"))).toBeNull();
  });

  it("la firma de otro destinatario no sirve para este", () => {
    const [, firmaAjena] = firmarBaja(k, "mkr_otro").split(".");
    expect(verificarBaja(k, `mkr_abc.${firmaAjena}`)).toBeNull();
  });

  it("con otra clave no verifica", () => {
    expect(verificarBaja(derivarClave(OTRA_KEY), firmarBaja(k, "mkr_abc"))).toBeNull();
  });

  it.each([
    ["vacío", ""],
    ["sin punto", "mkr_abc"],
    ["solo el punto", "."],
    ["sin firma", "mkr_abc."],
    ["sin id", ".abc"],
    ["firma de largo distinto", "mkr_abc.cortita"],
    ["firma con caracteres inválidos", "mkr_abc.!!!!"],
  ])("token %s → null sin lanzar", (_caso, token) => {
    expect(() => verificarBaja(k, token)).not.toThrow();
    expect(verificarBaja(k, token)).toBeNull();
  });
});

describe("propósito: clic ≠ baja", () => {
  const k = derivarClave(KEY);

  it("un token de clic verifica como clic", () => {
    expect(verificarClic(k, firmarClic(k, "mkr_abc"))).toBe("mkr_abc");
  });

  it("un token de clic NO verifica como baja", () => {
    expect(verificarBaja(k, firmarClic(k, "mkr_abc"))).toBeNull();
  });

  it("un token de baja NO verifica como clic", () => {
    expect(verificarClic(k, firmarBaja(k, "mkr_abc"))).toBeNull();
  });
});
