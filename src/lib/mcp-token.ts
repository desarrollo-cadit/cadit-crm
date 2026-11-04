import { createHash, randomBytes } from "node:crypto";

/**
 * 0092 — El token del MCP remoto, en lo que no toca la base.
 *
 * Un token es 32 bytes al azar con un prefijo que dice qué es (`cadit_mcp_`):
 * el prefijo no agrega seguridad, sirve para que un escáner de secretos lo
 * reconozca y para que alguien que lo pegó por error sepa qué revocar.
 *
 * Se guarda SOLO el hash SHA-256. Un hash rápido alcanza porque la entrada ya
 * tiene 256 bits de entropía: no hay diccionario que probar, que es la razón
 * por la que a una contraseña sí se le pone un hash lento.
 */

export const PREFIJO_DE_TOKEN = "cadit_mcp_";

export type TokenNuevo = {
  /** El valor en claro: se muestra UNA vez y no se guarda. */
  token: string;
  hash: string;
  last4: string;
};

export function hashDeToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function nuevoToken(): TokenNuevo {
  const token = `${PREFIJO_DE_TOKEN}${randomBytes(32).toString("base64url")}`;
  return { token, hash: hashDeToken(token), last4: token.slice(-4) };
}

/**
 * 0095 — Quién actuó, para `app.current_actor`: el id del TOKEN. Un token de rol
 * identifica a un perfil y no a una persona, así que el registro dice qué token
 * fue. Mismo estilo `x:y` que las etiquetas `system:*`.
 */
export function actorDeToken(tokenId: string): string {
  return `mcp:${tokenId}`;
}

/** ¿Tiene la forma de un token nuestro? Descarta basura sin ir a la base. */
export function pareceTokenMcp(valor: string): boolean {
  return /^cadit_mcp_[A-Za-z0-9_-]{43}$/.test(valor);
}

/** El token de `Authorization: Bearer <token>`, o `null` si falta o está mal formado. */
export function tokenDeBearer(header: string | null): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(header.trim());
  const valor = m?.[1];
  return valor && pareceTokenMcp(valor) ? valor : null;
}
