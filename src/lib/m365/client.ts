import { getEnv } from "@/lib/env";

/**
 * 007 — Adaptador de Microsoft Graph para correo transaccional.
 *
 * Constitución 1.3.0, principio II: M365 es la tercera dependencia de runtime
 * permitida, y como las otras dos vive detrás de un adaptador dedicado para
 * no acoplar el dominio a ella. Nada fuera de este módulo sabe qué es un
 * token de Entra ID ni cómo se arma un `sendMail`.
 *
 * SEGURIDAD (principio I): el permiso de APLICACIÓN `Mail.Send` habilita
 * enviar como CUALQUIER buzón del tenant. El buzón emisor DEBE acotarse con
 * una ApplicationAccessPolicy en Exchange Online:
 *
 *   New-ApplicationAccessPolicy -AppId <client-id> `
 *     -PolicyScopeGroupId <grupo-con-el-buzon> -AccessRight RestrictAccess `
 *     -Description "CadIT CRM: solo el buzón de cursos"
 *
 * Sin eso, una filtración del secret permite suplantar a cualquier persona de
 * la empresa.
 */

/**
 * 029 — Las bases se pueden cambiar por entorno (`M365_GRAPH_BASE_URL`,
 * `M365_LOGIN_BASE_URL`) para hablarle al m365-mock en local, igual que
 * `META_GRAPH_BASE_URL` con el wa-mock: el adaptador real habla HTTP con un
 * servidor falso y el dominio no tiene ningún `if (mock)`.
 */
const DEFAULT_GRAPH = "https://graph.microsoft.com/v1.0";
const DEFAULT_LOGIN = "https://login.microsoftonline.com";

const trimSlash = (url: string) => url.replace(/\/+$/, "");
const graphBase = () => trimSlash(getEnv().M365_GRAPH_BASE_URL ?? DEFAULT_GRAPH);
const TOKEN_ENDPOINT = (tenantId: string) =>
  `${trimSlash(getEnv().M365_LOGIN_BASE_URL ?? DEFAULT_LOGIN)}/${tenantId}/oauth2/v2.0/token`;

/** Token de aplicación cacheado en proceso: dura ~1h y se pide una vez. */
let cachedToken: { value: string; expiresAt: number } | null = null;

export type M365Config = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  sender: string;
};

/** `null` si M365 no está configurado: el llamador decide qué hacer. */
export function getM365Config(): M365Config | null {
  const env = getEnv();
  if (
    !env.M365_TENANT_ID ||
    !env.M365_CLIENT_ID ||
    !env.M365_CLIENT_SECRET ||
    !env.M365_SENDER
  ) {
    return null;
  }
  return {
    tenantId: env.M365_TENANT_ID,
    clientId: env.M365_CLIENT_ID,
    clientSecret: env.M365_CLIENT_SECRET,
    sender: env.M365_SENDER,
  };
}

async function getAccessToken(config: M365Config): Promise<string> {
  // 60 s de margen: un token que vence en el vuelo da un 401 imposible de leer.
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const res = await fetch(TOKEN_ENDPOINT(config.tenantId), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });

  if (!res.ok) {
    // El cuerpo trae `error_description` con el motivo real (permiso sin
    // consentir, secret vencido). No se loguea el secret, obviamente.
    const body = (await res.json().catch(() => null)) as
      | { error_description?: string }
      | null;
    throw new Error(
      `M365: no se pudo obtener el token (${res.status}). ${body?.error_description ?? ""}`.trim()
    );
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

export type SendMailInput = {
  /** Uno o varios destinatarios (029: la casilla del área). */
  to: string | string[];
  /** 029 — Copias visibles (la gerencia, el vendedor). */
  cc?: string[];
  /** Copia oculta al buzón de la academia, para tener registro del envío. */
  bcc?: string;
  /** 029 — A quién va la respuesta: el cliente, si dejó un correo válido. */
  replyTo?: string;
  subject: string;
  html: string;
};

const recipients = (addresses: string[]) =>
  addresses.map((address) => ({ emailAddress: { address } }));

export type SendMailResult =
  | { ok: true }
  | { ok: false; code: "not_configured" | "send_failed"; message: string };

/**
 * Envía un correo HTML como el buzón configurado.
 *
 * `saveToSentItems: true` deja copia en Elementos enviados del buzón: si un
 * alumno dice "no me llegó", el equipo lo verifica desde Outlook sin depender
 * de logs de la aplicación.
 */
export async function sendMail(input: SendMailInput): Promise<SendMailResult> {
  const config = getM365Config();
  if (!config) {
    return {
      ok: false,
      code: "not_configured",
      message: "M365 no está configurado en esta instancia",
    };
  }

  let token: string;
  try {
    token = await getAccessToken(config);
  } catch (e) {
    return {
      ok: false,
      code: "send_failed",
      message: e instanceof Error ? e.message : "Error de autenticación con M365",
    };
  }

  const res = await fetch(
    `${graphBase()}/users/${encodeURIComponent(config.sender)}/sendMail`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject: input.subject,
          body: { contentType: "HTML", content: input.html },
          toRecipients: recipients(Array.isArray(input.to) ? input.to : [input.to]),
          ...(input.cc && input.cc.length > 0 ? { ccRecipients: recipients(input.cc) } : {}),
          ...(input.bcc ? { bccRecipients: recipients([input.bcc]) } : {}),
          ...(input.replyTo ? { replyTo: recipients([input.replyTo]) } : {}),
        },
        saveToSentItems: true,
      }),
    }
  ).catch(() => null);

  // Graph responde 202 Accepted sin cuerpo cuando acepta el envío.
  if (res?.status === 202) return { ok: true };

  const body = (await res?.json().catch(() => null)) as
    | { error?: { message?: string } }
    | null;
  return {
    ok: false,
    code: "send_failed",
    message:
      body?.error?.message ??
      `M365 rechazó el envío${res ? ` (${res.status})` : " (sin respuesta)"}`,
  };
}

/** Solo para tests: limpia el token cacheado entre casos. */
export function resetM365TokenCache() {
  cachedToken = null;
}
