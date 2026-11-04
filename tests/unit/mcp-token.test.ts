import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  PREFIJO_DE_TOKEN,
  hashDeToken,
  nuevoToken,
  pareceTokenMcp,
  tokenDeBearer,
} from "@/lib/mcp-token";

/**
 * 0092 — El token del MCP remoto, en lo puro: forma, hash y lectura del
 * encabezado. Sin base.
 */

describe("nuevoToken", () => {
  it("lleva el prefijo y 32 bytes al azar (43 caracteres en base64url)", () => {
    const { token } = nuevoToken();
    expect(token.startsWith(PREFIJO_DE_TOKEN)).toBe(true);
    expect(token).toHaveLength(PREFIJO_DE_TOKEN.length + 43);
    expect(pareceTokenMcp(token)).toBe(true);
  });

  it("no repite: dos emisiones dan valores y hashes distintos", () => {
    const a = nuevoToken();
    const b = nuevoToken();
    expect(a.token).not.toBe(b.token);
    expect(a.hash).not.toBe(b.hash);
  });

  it("el hash es el SHA-256 del valor, y no contiene el valor", () => {
    const { token, hash, last4 } = nuevoToken();
    expect(hash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(hashDeToken(token)).toBe(hash);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
    expect(last4).toBe(token.slice(-4));
  });
});

describe("pareceTokenMcp", () => {
  it("descarta lo que no tiene nuestra forma, sin ir a la base", () => {
    expect(pareceTokenMcp("")).toBe(false);
    expect(pareceTokenMcp("cadit_mcp_corto")).toBe(false);
    expect(pareceTokenMcp(`otro_${"a".repeat(43)}`)).toBe(false);
    expect(pareceTokenMcp(`${PREFIJO_DE_TOKEN}${"a".repeat(44)}`)).toBe(false);
    expect(pareceTokenMcp(`${PREFIJO_DE_TOKEN}${"a".repeat(42)}!`)).toBe(false);
  });
});

describe("tokenDeBearer", () => {
  const { token } = nuevoToken();

  it("saca el token de `Authorization: Bearer`", () => {
    expect(tokenDeBearer(`Bearer ${token}`)).toBe(token);
    expect(tokenDeBearer(`bearer   ${token}  `)).toBe(token);
  });

  it("sin encabezado, con otro esquema o con un valor que no es nuestro → null", () => {
    expect(tokenDeBearer(null)).toBeNull();
    expect(tokenDeBearer("")).toBeNull();
    expect(tokenDeBearer(`Basic ${token}`)).toBeNull();
    expect(tokenDeBearer("Bearer abc")).toBeNull();
    expect(tokenDeBearer(`Bearer ${token} extra`)).toBeNull();
  });
});
