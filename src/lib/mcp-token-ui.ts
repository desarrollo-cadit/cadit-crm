/**
 * 0092/0095 — Lo que la pantalla de tokens del MCP necesita y no toca la base ni
 * `node:crypto` (por eso no vive en `mcp-token.ts`: un componente de cliente no
 * puede importar ese módulo).
 */

export type TokenDeLista = {
  id: string;
  name: string;
  last4: string;
  /** 0095 — `null` = token de persona; con valor, el perfil (rol) que usa. */
  roleId: string | null;
  roleName: string | null;
  userName: string;
  userEmail: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

/** Un rol al que quien mira puede ligarle un token (el servidor ya filtró la escalada). */
export type RolParaToken = { id: string; name: string };

/** «Persona» si el token usa el rol de quien lo emitió; si no, el nombre del rol. */
export function etiquetaDePerfil(t: Pick<TokenDeLista, "roleName">): string {
  return t.roleName ?? "Persona";
}

export type EstadoDeToken = "vigente" | "revocado";

export function estadoDeToken(t: Pick<TokenDeLista, "revokedAt">): EstadoDeToken {
  return t.revokedAt ? "revocado" : "vigente";
}

/**
 * El nombre del servidor en Claude Code: `cadit` para un token de persona y
 * `cadit-<perfil>` para uno de rol, así varios perfiles conviven sin pisarse.
 */
export function nombreDeServidor(perfil?: string | null): string {
  const slug = (perfil ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug ? `cadit-${slug}` : "cadit";
}

/**
 * El comando para pegar en una terminal. El origen se normaliza (sin barra
 * final) y el valor va entre comillas dobles: es un secreto y no tiene que
 * romperse por un carácter raro del shell.
 */
export function comandoDeConexion(origin: string, token: string, perfil?: string | null): string {
  const base = origin.trim().replace(/\/+$/, "");
  return `claude mcp add --transport http ${nombreDeServidor(perfil)} ${base}/api/mcp --header "Authorization: Bearer ${token}"`;
}

/**
 * Lo que se carga en claude.ai (Configuración → Conectores → Agregar conector
 * personalizado): la URL, autenticación «Sin inicio de sesión» y UN encabezado
 * de solicitud. Un conector por perfil.
 */
export function datosDeConectorClaudeAi(
  origin: string,
  token: string
): { url: string; encabezado: string; valor: string } {
  const base = origin.trim().replace(/\/+$/, "");
  return { url: `${base}/api/mcp`, encabezado: "Authorization", valor: `Bearer ${token}` };
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
