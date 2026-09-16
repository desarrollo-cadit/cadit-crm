import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  AUTH_RATE_LIMIT,
  authAttemptAllowed,
  checkRateLimit,
  resetRateLimit,
} from "@/lib/rate-limit";

/**
 * Bug del arnés (ciclo 012/028) — invitar al portal consumía el balde de
 * fuerza bruta de login. `grantPortalAccess` crea la cuenta con
 * `auth.api.signUpEmail` desde el servidor, sin headers, así que todas las
 * invitaciones caían en la misma IP "local" y la undécima fallaba con
 * `signup_failed`. Coordinación no podía invitar una cohorte de 16.
 *
 * El discriminador es `ctx.request`: el handler HTTP de Better Auth SIEMPRE
 * lo pasa (better-call `router.processRequest`), y una llamada `auth.api.*`
 * hecha desde el servidor no lo tiene. Un cliente externo no puede quitarlo:
 * todo lo que llega por HTTP pasa por el handler.
 */
describe("rate limit de login/registro: el alta interna no gasta el balde público", () => {
  beforeEach(() => resetRateLimit());

  const httpSinIp = () => new Request("http://localhost:3000/api/auth/sign-up/email");

  it("16 altas internas seguidas pasan todas (una cohorte entera)", () => {
    for (let i = 0; i < 16; i++) {
      expect(
        authAttemptAllowed({ path: "/sign-up/email", internal: true, request: undefined }),
        `alta interna número ${i + 1}`
      ).toBe(true);
    }
  });

  it("y no le comen el presupuesto a un pedido HTTP real sin x-forwarded-for", () => {
    for (let i = 0; i < 16; i++) {
      authAttemptAllowed({ path: "/sign-up/email", internal: true, request: undefined });
    }
    const t0 = 1_000_000;
    for (let i = 0; i < AUTH_RATE_LIMIT.max; i++) {
      expect(
        authAttemptAllowed(
          { path: "/sign-up/email", internal: false, request: httpSinIp() },
          t0 + i
        )
      ).toBe(true);
    }
    expect(
      authAttemptAllowed({ path: "/sign-up/email", internal: false, request: httpSinIp() }, t0 + 50)
    ).toBe(false);
  });

  it("el login HTTP sigue limitado por IP", () => {
    const req = () =>
      new Request("http://localhost:3000/api/auth/sign-in/email", {
        headers: { "x-forwarded-for": "9.9.9.9, 10.0.0.1" },
      });
    const t0 = 1_000_000;
    for (let i = 0; i < AUTH_RATE_LIMIT.max; i++) {
      authAttemptAllowed(
        { path: "/sign-in/email", internal: false, request: req(), headers: req().headers },
        t0 + i
      );
    }
    expect(
      authAttemptAllowed(
        { path: "/sign-in/email", internal: false, request: req(), headers: req().headers },
        t0 + 50
      )
    ).toBe(false);
  });

  /**
   * La marca interna sola NO alcanza: si algún día el contexto de alta
   * interna quedara activo alrededor de un pedido HTTP, ese pedido igual trae
   * `request` y sigue pagando el límite.
   */
  it("un pedido con request sigue limitado aunque la marca interna esté puesta", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < AUTH_RATE_LIMIT.max; i++) {
      authAttemptAllowed({ path: "/sign-up/email", internal: true, request: httpSinIp() }, t0 + i);
    }
    expect(
      authAttemptAllowed({ path: "/sign-up/email", internal: true, request: httpSinIp() }, t0 + 50)
    ).toBe(false);
  });

  it("una llamada interna SIN la marca de alta (p. ej. un sign-in) sigue limitada", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < AUTH_RATE_LIMIT.max; i++) {
      authAttemptAllowed({ path: "/sign-in/email", internal: false, request: undefined }, t0 + i);
    }
    expect(
      authAttemptAllowed({ path: "/sign-in/email", internal: false, request: undefined }, t0 + 50)
    ).toBe(false);
  });

  it("las rutas fuera de login/registro no se cuentan", () => {
    for (let i = 0; i < 30; i++) {
      expect(
        authAttemptAllowed({ path: "/get-session", internal: false, request: httpSinIp() })
      ).toBe(true);
    }
  });

  it("el hook de Better Auth decide con ctx.request y la marca de alta interna", () => {
    const src = readFileSync(path.join(process.cwd(), "src", "lib", "auth", "index.ts"), "utf8");
    expect(src).toMatch(/authAttemptAllowed\(/);
    expect(src).toMatch(/request:\s*ctx\.request/);
    expect(src).toMatch(/internal:\s*isInternalSignup\(\)/);
  });
});

describe("rate limit por IP (FR-062: 10 / 10 min → 429)", () => {
  beforeEach(() => resetRateLimit());

  it("permite hasta el máximo y bloquea el siguiente", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < AUTH_RATE_LIMIT.max; i++) {
      expect(
        checkRateLimit("login:1.2.3.4", AUTH_RATE_LIMIT, t0 + i).allowed
      ).toBe(true);
    }
    expect(
      checkRateLimit("login:1.2.3.4", AUTH_RATE_LIMIT, t0 + 100).allowed
    ).toBe(false);
  });

  it("la ventana desliza: pasados 10 minutos vuelve a permitir", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < AUTH_RATE_LIMIT.max; i++) {
      checkRateLimit("k", AUTH_RATE_LIMIT, t0 + i);
    }
    expect(checkRateLimit("k", AUTH_RATE_LIMIT, t0 + 1000).allowed).toBe(false);
    expect(
      checkRateLimit("k", AUTH_RATE_LIMIT, t0 + AUTH_RATE_LIMIT.windowMs + 500)
        .allowed
    ).toBe(true);
  });

  it("claves distintas (IPs) no se afectan entre sí", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < AUTH_RATE_LIMIT.max; i++) {
      checkRateLimit("login:1.1.1.1", AUTH_RATE_LIMIT, t0 + i);
    }
    expect(
      checkRateLimit("login:1.1.1.1", AUTH_RATE_LIMIT, t0 + 100).allowed
    ).toBe(false);
    expect(
      checkRateLimit("login:2.2.2.2", AUTH_RATE_LIMIT, t0 + 100).allowed
    ).toBe(true);
  });
});
