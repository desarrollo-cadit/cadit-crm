import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SendMailResult } from "@/lib/m365/client";

/**
 * 045 (T058; FR-013, FR-016, FR-017, FR-020; SC-004; US3-1…US3-5) — El
 * ejecutor de campañas, contra un doble en memoria de la base y de Graph.
 *
 * Lo que fija: a lo sumo un correo por dirección, el reclamo atómico ANTES de
 * Graph, nunca reenviar lo interrumpido, pausar ante el límite, detenerse sin
 * permiso, respetar la baja y la cancelación que llegan a mitad.
 */

vi.mock("@/lib/db", () => ({ getDb: () => ({}), getRootDb: () => ({}), schema: {} }));

type Fila = {
  id: string;
  contactId: string | null;
  email: string;
  firstName: string;
  lastName: string | null;
  vars: Record<string, string>;
  position: number;
  status: string;
  reason: string | null;
  sentAt: Date | null;
};

function base(n: number, status = "pendiente"): Fila[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `r${i}`,
    contactId: `ct_${i}`,
    email: `p${i}@x.test`,
    firstName: `P${i}`,
    lastName: null,
    vars: {},
    position: i,
    status,
    reason: null,
    sentAt: null,
  }));
}

async function crearPuerto(opts: {
  filas: Fila[];
  lease?: boolean;
  respuestas?: SendMailResult[];
  bajas?: string[];
  cancelarDespuesDe?: number;
}) {
  const estado = {
    status: "enviando" as string,
    leaseTomado: false,
    leaseSoltado: false,
    pausedUntil: null as Date | null,
    lastError: null as string | null,
    finishedAt: null as Date | null,
    renovaciones: 0,
  };
  const enviados: string[] = [];
  const reclamos: string[] = [];
  const respuestas = [...(opts.respuestas ?? [])];
  let reloj = Date.parse("2026-10-22T12:00:00Z");
  const dormidas: number[] = [];

  const puerto = {
    pausaMs: 0,
    ahora: () => new Date(reloj),
    dormir: async (ms: number) => {
      dormidas.push(ms);
      reloj += ms;
    },
    tomarLease: async () => {
      if (opts.lease === false) return false;
      estado.leaseTomado = true;
      return true;
    },
    renovarLease: async () => {
      estado.renovaciones++;
    },
    soltarLease: async () => {
      estado.leaseSoltado = true;
    },
    marcarInterrumpidos: async () => {
      let n = 0;
      for (const f of opts.filas) {
        if (f.status === "enviando") {
          f.status = "fallido";
          f.reason = "interrumpido";
          n++;
        }
      }
      return n;
    },
    datosDeEnvio: async () => ({ campaignId: "mkc_1" }),
    pendientes: async () =>
      opts.filas.filter((f) => f.status === "pendiente").sort((a, b) => a.position - b.position).map((f) => ({ ...f })),
    estado: async () => ({ status: estado.status, pausedUntil: estado.pausedUntil }),
    bajaActiva: async (d: { contactId: string | null; email: string }) =>
      (opts.bajas ?? []).some((b) => b === d.email || b === d.contactId),
    reclamar: async (id: string) => {
      const f = opts.filas.find((x) => x.id === id)!;
      if (f.status !== "pendiente") return false;
      f.status = "enviando";
      reclamos.push(id);
      return true;
    },
    registrar: async (id: string, cambio: { status: string; reason?: string | null; sentAt?: Date | null }) => {
      const f = opts.filas.find((x) => x.id === id)!;
      f.status = cambio.status;
      f.reason = cambio.reason ?? null;
      f.sentAt = cambio.sentAt ?? null;
    },
    pausar: async (hasta: Date) => {
      estado.pausedUntil = hasta;
    },
    detener: async (error: string) => {
      estado.lastError = error;
      estado.leaseSoltado = true;
    },
    limpiarError: async () => {
      estado.lastError = null;
    },
    cerrarSiTermino: async () => {
      if (opts.filas.some((f) => f.status === "pendiente" || f.status === "enviando")) return false;
      estado.status = "enviada";
      estado.finishedAt = new Date(reloj);
      estado.leaseSoltado = true;
      return true;
    },
    enviar: async (_d: unknown, r: { email: string }) => {
      enviados.push(r.email);
      if (opts.cancelarDespuesDe !== undefined && enviados.length === opts.cancelarDespuesDe) {
        estado.status = "cancelada";
      }
      return respuestas.shift() ?? ({ ok: true } as SendMailResult);
    },
  };
  return { puerto, estado, enviados, reclamos, dormidas };
}

beforeEach(() => {
  vi.resetModules();
});

describe("runCampaign", () => {
  it("sin lease libre sale sin enviar", async () => {
    const filas = base(2);
    const { puerto, enviados } = await crearPuerto({ filas, lease: false });
    const { runCampaign } = await import("@/server/marketing/runner");
    await runCampaign("org_1", "mkc_1", puerto);
    expect(enviados).toEqual([]);
  });

  it("al tomar el lease, lo que quedó `enviando` pasa a fallido/interrumpido y NO se reenvía", async () => {
    const filas = base(3);
    filas[1]!.status = "enviando";
    const { puerto, enviados } = await crearPuerto({ filas });
    const { runCampaign } = await import("@/server/marketing/runner");
    await runCampaign("org_1", "mkc_1", puerto);
    expect(filas[1]).toMatchObject({ status: "fallido", reason: "interrumpido" });
    expect(enviados).toEqual(["p0@x.test", "p2@x.test"]);
  });

  it("reclama ANTES de llamar a Graph y marca `enviado` con la fecha", async () => {
    const filas = base(2);
    const { puerto, reclamos, enviados } = await crearPuerto({ filas });
    const { runCampaign } = await import("@/server/marketing/runner");
    await runCampaign("org_1", "mkc_1", puerto);
    expect(reclamos).toEqual(["r0", "r1"]);
    expect(enviados).toHaveLength(2);
    expect(filas.every((f) => f.status === "enviado" && f.sentAt instanceof Date)).toBe(true);
  });

  it("sin pendientes cierra: enviada, fecha de fin y lease suelto", async () => {
    const filas = base(1);
    const { puerto, estado } = await crearPuerto({ filas });
    const { runCampaign } = await import("@/server/marketing/runner");
    await runCampaign("org_1", "mkc_1", puerto);
    expect(estado.status).toBe("enviada");
    expect(estado.finishedAt).toBeInstanceOf(Date);
    expect(estado.leaseSoltado).toBe(true);
  });

  it("si el reclamo no devuelve fila, se saltea", async () => {
    const filas = base(2);
    const { puerto, enviados } = await crearPuerto({ filas });
    const original = puerto.reclamar;
    puerto.reclamar = async (id: string) => (id === "r0" ? false : original(id));
    const { runCampaign } = await import("@/server/marketing/runner");
    await runCampaign("org_1", "mkc_1", puerto);
    expect(enviados).toEqual(["p1@x.test"]);
  });

  it("`throttled` → vuelve a pendiente, guarda la pausa, espera y lo reintenta una vez", async () => {
    const filas = base(2);
    const { puerto, estado, enviados, dormidas } = await crearPuerto({
      filas,
      respuestas: [{ ok: false, code: "throttled", message: "429", retryAfterMs: 5000 }],
    });
    const { runCampaign } = await import("@/server/marketing/runner");
    await runCampaign("org_1", "mkc_1", puerto);
    expect(estado.pausedUntil).toBeInstanceOf(Date);
    expect(dormidas).toContain(5000);
    // p0 se reintentó después de la pausa; nadie recibió dos correos aceptados.
    expect(enviados).toEqual(["p0@x.test", "p1@x.test", "p0@x.test"]);
    expect(filas.map((f) => f.status)).toEqual(["enviado", "enviado"]);
    expect(estado.status).toBe("enviada");
  });

  it("`mailbox_denied` → pendiente, `last_error`, suelta el lease y sale", async () => {
    const filas = base(3);
    const { puerto, estado, enviados } = await crearPuerto({
      filas,
      respuestas: [{ ok: true }, { ok: false, code: "mailbox_denied", message: "Acceso denegado" }],
    });
    const { runCampaign } = await import("@/server/marketing/runner");
    await runCampaign("org_1", "mkc_1", puerto);
    expect(enviados).toEqual(["p0@x.test", "p1@x.test"]);
    expect(filas.map((f) => f.status)).toEqual(["enviado", "pendiente", "pendiente"]);
    expect(estado.lastError).toBe("Acceso denegado");
    expect(estado.leaseSoltado).toBe(true);
    expect(estado.status).toBe("enviando");
  });

  it("otro error → fallido con el motivo, y el resto sigue", async () => {
    const filas = base(3);
    const { puerto, enviados } = await crearPuerto({
      filas,
      respuestas: [{ ok: true }, { ok: false, code: "send_failed", message: "Buzón lleno" }],
    });
    const { runCampaign } = await import("@/server/marketing/runner");
    await runCampaign("org_1", "mkc_1", puerto);
    expect(enviados).toHaveLength(3);
    expect(filas[1]).toMatchObject({ status: "fallido", reason: "Buzón lleno" });
    expect(filas[2]!.status).toBe("enviado");
  });

  it("una baja activa al llegar el turno (por contacto o por correo) → omitido/baja, sin enviar", async () => {
    const filas = base(3);
    const { puerto, enviados } = await crearPuerto({ filas, bajas: ["ct_0", "p2@x.test"] });
    const { runCampaign } = await import("@/server/marketing/runner");
    await runCampaign("org_1", "mkc_1", puerto);
    expect(enviados).toEqual(["p1@x.test"]);
    expect(filas[0]).toMatchObject({ status: "omitido", reason: "baja" });
    expect(filas[2]).toMatchObject({ status: "omitido", reason: "baja" });
  });

  it("una cancelación leída antes del siguiente envío corta el bucle", async () => {
    const filas = base(4);
    const { puerto, enviados, estado } = await crearPuerto({ filas, cancelarDespuesDe: 2 });
    const { runCampaign } = await import("@/server/marketing/runner");
    await runCampaign("org_1", "mkc_1", puerto);
    expect(enviados).toHaveLength(2);
    expect(estado.status).toBe("cancelada");
    expect(estado.finishedAt).toBeNull();
  });

  it("respeta `paused_until` antes de enviar", async () => {
    const filas = base(1);
    const { puerto, estado, dormidas } = await crearPuerto({ filas });
    estado.pausedUntil = new Date(Date.parse("2026-10-22T12:00:10Z"));
    const { runCampaign } = await import("@/server/marketing/runner");
    await runCampaign("org_1", "mkc_1", puerto);
    expect(dormidas[0]).toBe(10_000);
  });

  it("nunca dos correos aceptados a la misma dirección", async () => {
    const filas = base(5);
    const { puerto, enviados } = await crearPuerto({ filas });
    const { runCampaign } = await import("@/server/marketing/runner");
    await runCampaign("org_1", "mkc_1", puerto);
    await runCampaign("org_1", "mkc_1", puerto);
    expect(new Set(enviados).size).toBe(enviados.length);
  });
});
