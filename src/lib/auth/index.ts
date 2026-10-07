import { AsyncLocalStorage } from "node:async_hooks";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { getDb, schema } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { authAttemptAllowed } from "@/lib/rate-limit";
import {
  onUserCreated,
  resolveActiveOrganizationId,
} from "@/server/auth/on-signup";
import { isPublicSignupAllowed } from "@/server/auth/registration";
import { recordPortalSignIn } from "@/server/activity-log";

/**
 * Contexto interno del proceso: permite que el alta de cuentas de equipo
 * (owner → API) atraviese el gate de registro cerrado. No es alcanzable
 * desde fuera: solo envuelve llamadas server-side.
 */
const globalForSignup = globalThis as unknown as {
  __voceroInternalSignup?: AsyncLocalStorage<boolean>;
};

// En globalThis: los módulos pueden evaluarse más de una vez (una por ruta en
// dev) y todas las copias deben compartir el mismo contexto.
function internalSignupContext(): AsyncLocalStorage<boolean> {
  if (!globalForSignup.__voceroInternalSignup) {
    globalForSignup.__voceroInternalSignup = new AsyncLocalStorage<boolean>();
  }
  return globalForSignup.__voceroInternalSignup;
}

export function runInternalSignup<T>(fn: () => Promise<T>): Promise<T> {
  return internalSignupContext().run(true, fn);
}

function isInternalSignup(): boolean {
  return internalSignupContext().getStore() === true;
}

function createAuth() {
  const env = getEnv();
  return betterAuth({
    baseURL: env.APP_BASE_URL,
    secret: env.BETTER_AUTH_SECRET,
    /**
     * Better Auth valida el header `Origin` contra `baseURL` y responde 403
     * si no coinciden. En desarrollo eso muerde por una razón tonta: si el
     * 3000 está ocupado, Next arranca en 3001 y el login deja de funcionar
     * con un "Invalid origin" que no dice nada sobre puertos. Se habilita
     * localhost en cualquier puerto SOLO fuera de producción.
     *
     * En producción la lista queda vacía a propósito: el único origen válido
     * es `APP_BASE_URL`, que es justamente la protección que hace que un
     * sitio ajeno no pueda postear al login de esta instancia.
     */
    trustedOrigins: (request?: Request) => {
      if (env.NODE_ENV === "production") return [];
      const origin = request?.headers.get("origin");
      if (!origin) return [];
      // Solo localhost/127.0.0.1 en cualquier puerto; nada más entra.
      return /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin) ? [origin] : [];
    },
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        organization: schema.organization,
        member: schema.member,
        invitation: schema.invitation,
      },
    }),
    user: {
      additionalFields: {
        /**
         * La contraseña vigente la eligió otra persona (ver
         * `src/server/auth/assigned-password.ts`). Se declara para que viaje
         * en `getSession()` y los caparazones puedan redirigir sin otra
         * consulta.
         *
         * `input: false` no es un detalle: sin eso, cualquiera podría
         * registrarse o editarse a sí mismo mandando el campo en el cuerpo y
         * decidir si lo obligan o no a cambiar la contraseña.
         */
        mustChangePassword: {
          type: "boolean",
          required: false,
          defaultValue: false,
          input: false,
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      minPasswordLength: 8,
    },
    plugins: [organization({ creatorRole: "owner" })],
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        // Rate limit por IP en login/registro (FR-062): 10 / 10 min → 429.
        // El alta interna (invitaciones, equipo) no gasta el balde público:
        // ver `authAttemptAllowed` para por qué el discriminador no se puede
        // falsificar desde afuera.
        const allowed = authAttemptAllowed({
          path: ctx.path,
          request: ctx.request,
          headers: ctx.headers,
          internal: isInternalSignup(),
        });
        if (!allowed) {
          throw new APIError("TOO_MANY_REQUESTS", {
            message: "Hubo varios intentos seguidos y, por seguridad, pausamos el ingreso unos minutos.",
          });
        }
        // Registro público cerrado tras la primera organización (FR-060).
        if (ctx.path === "/sign-up/email") {
          if (!isInternalSignup() && !(await isPublicSignupAllowed())) {
            throw new APIError("FORBIDDEN", {
              message:
                "El registro está cerrado: esta instancia ya tiene su organización",
            });
          }
        }
      }),
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await onUserCreated(user.id, user.name);
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            const organizationId = await resolveActiveOrganizationId(
              session.userId
            );
            return {
              data: { ...session, activeOrganizationId: organizationId },
            };
          },
          /**
           * 2026-10-07 — Cada ingreso al portal queda en `activity_log` (la
           * pestaña «Administración» del legajo). `recordPortalSignIn` decide
           * si es un login de verdad (por la ruta), si la cuenta es de portal,
           * y NUNCA lanza: la bitácora no puede dejar a nadie afuera.
           *
           * El alta interna (invitar al portal) también crea una sesión, con
           * la IP de quien invita: por eso se saltea explícitamente.
           */
          after: async (session, context) => {
            if (isInternalSignup()) return;
            await recordPortalSignIn(session, context?.path);
          },
        },
      },
    },
  });
}

type Auth = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as unknown as { __voceroAuth?: Auth };

export function getAuth(): Auth {
  if (!globalForAuth.__voceroAuth) globalForAuth.__voceroAuth = createAuth();
  return globalForAuth.__voceroAuth;
}
