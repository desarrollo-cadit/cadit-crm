import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * 045 — Variables del ejecutor de campañas (data-model §10, SC-002).
 * `getEnv()` se memoiza: cada caso recarga el módulo con un entorno propio.
 */

const BASE = {
  APP_BASE_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://x:y@localhost:5432/z",
  BETTER_AUTH_SECRET: "un-secreto-de-prueba-largo",
  ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
  META_WEBHOOK_VERIFY_TOKEN: "verify-token",
};

async function cargar(extra: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries({ ...BASE, ...extra })) {
    vi.stubEnv(k, v as string);
  }
  const mod = await import("@/lib/env");
  return mod.getEnv();
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("MARKETING_SEND_PAUSE_MS / MARKETING_TICK_SEC", () => {
  it("valen 2000 y 60 por defecto", async () => {
    const env = await cargar({ MARKETING_SEND_PAUSE_MS: "", MARKETING_TICK_SEC: "" });
    expect(env.MARKETING_SEND_PAUSE_MS).toBe(2000);
    expect(env.MARKETING_TICK_SEC).toBe(60);
  });

  it("aceptan 0 (pausa nula en pruebas; tick 0 = solo al arrancar)", async () => {
    const env = await cargar({ MARKETING_SEND_PAUSE_MS: "0", MARKETING_TICK_SEC: "0" });
    expect(env.MARKETING_SEND_PAUSE_MS).toBe(0);
    expect(env.MARKETING_TICK_SEC).toBe(0);
  });

  it("rechazan un valor negativo", async () => {
    await expect(cargar({ MARKETING_SEND_PAUSE_MS: "-1" })).rejects.toThrow(
      /MARKETING_SEND_PAUSE_MS/
    );
    await expect(cargar({ MARKETING_TICK_SEC: "-5" })).rejects.toThrow(/MARKETING_TICK_SEC/);
  });

  it("rechazan un valor no numérico", async () => {
    await expect(cargar({ MARKETING_SEND_PAUSE_MS: "rapido" })).rejects.toThrow(
      /MARKETING_SEND_PAUSE_MS/
    );
    await expect(cargar({ MARKETING_TICK_SEC: "cada-minuto" })).rejects.toThrow(
      /MARKETING_TICK_SEC/
    );
  });
});
