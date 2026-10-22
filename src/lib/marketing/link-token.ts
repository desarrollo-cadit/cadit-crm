import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

/**
 * 045 (research R6/R7, DV-012) — Enlaces firmados de baja y de clic.
 *
 * Token = `<recipientId>.<base64url(HMAC-SHA256(k, propósito + recipientId))>`
 * con `k = HKDF-SHA256(ENCRYPTION_KEY, info = "cadit:marketing-links:v1")`.
 *
 * - Propio de cada destinatario e imposible de fabricar para otro (FR-012).
 * - Con PROPÓSITO: un token de clic no da de baja a nadie, y uno de baja no
 *   registra clics (FR-023).
 * - Sin estado: no hay columna ni índice por destinatario para guardarlo.
 *
 * Puro: recibe la clave. Quien la deriva del entorno es el servidor.
 */

const INFO = "cadit:marketing-links:v1";
const BAJA = "baja:v1:";
const CLIC = "clic:v1:";

/** Largo de una firma HMAC-SHA256 en base64url (32 bytes → 43 caracteres). */
const LARGO_FIRMA = 43;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

/** Clave de los enlaces, derivada de `ENCRYPTION_KEY` (32 bytes en base64). */
export function derivarClave(encryptionKey: string): Buffer {
  return Buffer.from(
    hkdfSync("sha256", Buffer.from(encryptionKey, "base64"), Buffer.alloc(0), INFO, 32)
  );
}

function firma(clave: Buffer, proposito: string, recipientId: string): string {
  return createHmac("sha256", clave).update(proposito + recipientId).digest("base64url");
}

function firmar(clave: Buffer, proposito: string, recipientId: string): string {
  return `${recipientId}.${firma(clave, proposito, recipientId)}`;
}

/**
 * El `recipientId` si la firma es válida para ese propósito; `null` en
 * cualquier otro caso, sin lanzar (un token roto es un enlace inválido, no un
 * error del servidor).
 */
function verificar(clave: Buffer, proposito: string, token: string): string | null {
  if (typeof token !== "string" || token.length === 0 || token.length > 200) return null;
  const punto = token.lastIndexOf(".");
  if (punto <= 0) return null;
  const recipientId = token.slice(0, punto);
  const recibida = token.slice(punto + 1);
  if (recibida.length !== LARGO_FIRMA || !BASE64URL.test(recibida)) return null;
  const esperada = Buffer.from(firma(clave, proposito, recipientId));
  const dada = Buffer.from(recibida);
  if (dada.length !== esperada.length) return null;
  return timingSafeEqual(dada, esperada) ? recipientId : null;
}

export const firmarBaja = (clave: Buffer, recipientId: string) => firmar(clave, BAJA, recipientId);
export const verificarBaja = (clave: Buffer, token: string) => verificar(clave, BAJA, token);
export const firmarClic = (clave: Buffer, recipientId: string) => firmar(clave, CLIC, recipientId);
export const verificarClic = (clave: Buffer, token: string) => verificar(clave, CLIC, token);
