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
 *     -Description "Vocero CRM: solo el buzón de cursos"
 *
 * Sin eso, una filtración del secret permite suplantar a cualquier persona de
 * la empresa.
 */

const GRAPH = "https://graph.microsoft.com/v1.0";
const TOKEN_ENDPOINT = (tenantId: string) =>
  `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

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
  to: string;
  subject: string;
  html: string;
  /** Copia oculta al buzón de la academia, para tener registro del envío. */
  bcc?: string;
};

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
    `${GRAPH}/users/${encodeURIComponent(config.sender)}/sendMail`,
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
          toRecipients: [{ emailAddress: { address: input.to } }],
          ...(input.bcc
            ? { bccRecipients: [{ emailAddress: { address: input.bcc } }] }
            : {}),
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
