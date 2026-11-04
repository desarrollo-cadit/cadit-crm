/**
 * 0092 — Lo que la pantalla de tokens del MCP necesita y no toca la base ni
 * `node:crypto` (por eso no vive en `mcp-token.ts`: un componente de cliente no
 * puede importar ese módulo).
 */

export type TokenDeLista = {
  id: string;
  name: string;
  last4: string;
  userName: string;
  userEmail: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export type EstadoDeToken = "vigente" | "revocado";

export function estadoDeToken(t: Pick<TokenDeLista, "revokedAt">): EstadoDeToken {
  return t.revokedAt ? "revocado" : "vigente";
}

/**
 * El comando para pegar en una terminal. El origen se normaliza (sin barra
 * final) y el valor va entre comillas dobles: es un secreto y no tiene que
 * romperse por un carácter raro del shell.
 */
export function comandoDeConexion(origin: string, token: string): string {
  const base = origin.trim().replace(/\/+$/, "");
  return `claude mcp add --transport http cadit ${base}/api/mcp --header "Authorization: Bearer ${token}"`;
}

/** Vigentes primero, y dentro de cada grupo el más nuevo arriba. */
export function ordenarTokens<T extends Pick<TokenDeLista, "revokedAt" | "createdAt">>(
  tokens: readonly T[]
): T[] {
  return [...tokens].sort((a, b) => {
    const ra = a.revokedAt ? 1 : 0;
    const rb = b.revokedAt ? 1 : 0;
    if (ra !== rb) return ra - rb;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

/** «Nunca» si no se usó: un token sin uso es una señal útil para quien limpia. */
export function textoDeUltimoUso(iso: string | null, formato: (iso: string) => string): string {
  return iso ? formato(iso) : "Nunca";
}
