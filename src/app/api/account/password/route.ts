import { apiError, parseBody } from "@/lib/api";
import { getAuth } from "@/lib/auth";
import { changePasswordSchema } from "@/lib/auth/password-change";
import { clearAssignedPasswordMark } from "@/server/auth/assigned-password";

export const dynamic = "force-dynamic";

/**
 * Cambiar la contraseña propia: la forzada del primer ingreso y la voluntaria.
 *
 * **No usa ninguna de las tres puertas, y es a propósito.** Cambiar tu propia
 * contraseña no es una capacidad del staff ni algo del portal: lo necesita
 * cualquier cuenta, de cualquier audiencia. `requireCapability` dejaría
 * afuera a alumnos y profesores (no tienen fila en `member`), y las puertas
 * del portal dejarían afuera al staff. Lo que sí se exige es una sesión de
 * Better Auth, y lo único que se toca es la cuenta DE ESA sesión: no hay un
 * `userId` en el cuerpo que se pueda cambiar por otro.
 *
 * Tampoco abre la transacción con `app.current_org`: no lee ni escribe
 * ninguna tabla de dominio, solo `user` y `account`, que no llevan RLS.
 */
export async function POST(req: Request): Promise<Response> {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return apiError(401, "unauthorized", "Tu sesión expiró. Volvé a iniciar sesión.");
  }

  const body = await parseBody(req, changePasswordSchema);
  if (!body.ok) return body.response;

  let headers: Headers;
  try {
    /**
     * `revokeOtherSessions`: cualquier sesión abierta con la contraseña vieja
     * —la del correo, que pudo leer otra persona— se cierra. Better Auth
     * borra TODAS y crea una nueva para este pedido; `returnHeaders` es lo
     * que permite entregarle esa cookie al navegador. Sin ella, la persona
     * quedaría afuera justo después de elegir su contraseña.
     */
    const result = await auth.api.changePassword({
      body: {
        currentPassword: body.data.currentPassword,
        newPassword: body.data.newPassword,
        revokeOtherSessions: true,
      },
      headers: req.headers,
      returnHeaders: true,
    });
    headers = result.headers;
  } catch (err) {
    return translateError(err);
  }

  await clearAssignedPasswordMark(session.user.id);

  const res = Response.json({ ok: true });
  for (const cookie of headers.getSetCookie()) res.headers.append("set-cookie", cookie);
  return res;
}

/**
 * Los errores de Better Auth llegan en inglés y con su propio código. Se
 * traducen los que dependen de la persona; el resto es un 500 que no repite
 * nada del pedido (ni la contraseña ni si la cuenta tiene otra cosa).
 */
function translateError(err: unknown): Response {
  const { status, code } = authErrorShape(err);
  if (code === "INVALID_PASSWORD") {
    return apiError(
      400,
      "wrong_current_password",
      "La contraseña actual no coincide. Revisala y volvé a intentarlo."
    );
  }
  if (status === "UNAUTHORIZED") {
    return apiError(401, "unauthorized", "Tu sesión expiró. Volvé a iniciar sesión.");
  }
  if (status === "TOO_MANY_REQUESTS") {
    return apiError(
      429,
      "too_many_attempts",
      "Hubo varios intentos seguidos y, por seguridad, pausamos el cambio unos minutos."
    );
  }
  console.error("[cambio-de-contraseña] Better Auth rechazó el cambio:", code ?? status ?? "desconocido");
  return apiError(500, "internal", "Algo falló de nuestro lado. Volvé a intentarlo en unos minutos.");
}

/**
 * Lectura por forma y no `instanceof`: la clase de error de Better Auth vive
 * en un paquete interno (`@better-auth/core`) que puede quedar duplicado en
 * `node_modules`, y entonces un `instanceof` falla sin avisar.
 */
function authErrorShape(err: unknown): { status: string | null; code: string | null } {
  if (typeof err !== "object" || err === null) return { status: null, code: null };
  const status = (err as { status?: unknown }).status;
  const code = (err as { body?: { code?: unknown } }).body?.code;
  return {
    status: typeof status === "string" ? status : null,
    code: typeof code === "string" ? code : null,
  };
}
