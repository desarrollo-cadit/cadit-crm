import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 007 — CORS de `/api/public/*`. El sitio comercial vive en otro dominio, así
 * que sin estas cabeceras el navegador cancela la llamada en el preflight.
 * No es una medida de seguridad: solo decide qué front puede llamar. Lo que
 * protege el formulario es el límite por IP.
 */

const env = { PUBLIC_CORS_ORIGINS: "*" };
vi.mock("@/lib/env", () => ({ getEnv: () => env }));

describe("resolveAllowedOrigin", () => {
  beforeEach(() => {
    env.PUBLIC_CORS_ORIGINS = "*";
  });

  it("con `*` habilita cualquier origen, incluso sin cabecera Origin", async () => {
    const { resolveAllowedOrigin } = await import("@/lib/cors");
    expect(resolveAllowedOrigin("https://cadit.com.uy")).toBe("*");
    expect(resolveAllowedOrigin(null)).toBe("*");
  });

  it("con lista explícita devuelve el origen solo si está incluido", async () => {
    env.PUBLIC_CORS_ORIGINS = "https://cadit.com.uy, https://www.cadit.com.uy";
    const { resolveAllowedOrigin } = await import("@/lib/cors");
    expect(resolveAllowedOrigin("https://cadit.com.uy")).toBe("https://cadit.com.uy");
    expect(resolveAllowedOrigin("https://www.cadit.com.uy")).toBe("https://www.cadit.com.uy");
    expect(resolveAllowedOrigin("https://otro-sitio.com")).toBeNull();
    expect(resolveAllowedOrigin(null)).toBeNull();
  });

  it("responde el preflight con 204 y las cabeceras", async () => {
    const { corsPreflight } = await import("@/lib/cors");
    const res = corsPreflight(
      new Request("https://crm.test/api/public/courses", {
        method: "OPTIONS",
        headers: { origin: "https://cadit.com.uy" },
      })
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    expect(res.headers.get("Access-Control-Allow-Headers")).toContain("content-type");
  });

  /**
   * Con lista de orígenes la respuesta depende de quién llama: sin `Vary` un
   * caché intermedio le serviría a un origen la cabecera de otro.
   */
  it("agrega Vary: Origin cuando la lista no es `*`", async () => {
    env.PUBLIC_CORS_ORIGINS = "https://cadit.com.uy";
    const { corsHeaders } = await import("@/lib/cors");
    const headers = corsHeaders(
      new Request("https://crm.test/x", { headers: { origin: "https://cadit.com.uy" } })
    );
    expect(headers["Vary"]).toBe("Origin");
  });
});
