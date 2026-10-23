import { and, asc, eq, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { getDb, getRootDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { withOrganizationScope } from "@/lib/db/with-tenant";
import { getEnv } from "@/lib/env";
import type { SendMailResult } from "@/lib/m365/client";
import { CampaignBodySchema } from "@/lib/marketing/body";
import { clasificarResultado } from "@/lib/marketing/transitions";
import { getBranding } from "@/server/branding";
import { processRecipients } from "@/server/bulk-sends";
import { shouldStartScheduler } from "@/server/zoom/scheduler";
import { urlPublicaDeImagen } from "./images";
import { bajaActiva } from "./unsubscribe";
import { enviarADestinatario, type DatosDeEnvio, type DestinatarioDeEnvio } from "./send";

/**
 * 045 (DV-001, DV-002, DV-003; FR-013, FR-016, FR-017, FR-020; SC-002,
 * SC-004) — El ejecutor de campañas.
 *
 * - **Un solo proceso por campaña**: lease en la base (`lease_until`), como
 *   la sincronización de Zoom.
 * - **A lo sumo una vez**: cada destinatario se reclama (`pendiente →
 *   enviando`) ANTES de llamar a Graph. Lo que quedó `enviando` de una
 *   corrida anterior se marca `fallido / interrumpido` y no se reenvía (P-03:
 *   se prefiere perder un envío a duplicarlo).
 * - **De a uno**, con pausa (`MARKETING_SEND_PAUSE_MS`), con el mismo bucle
 *   que el envío por grupo (`processRecipients`).
 * - Antes de cada destinatario relee la campaña (cancelada → corta), respeta
 *   la pausa del proveedor, renueva el lease y consulta la baja activa.
 * - Los destinatarios salen SOLO de `marketing_campaign_recipient`, la foto
 *   congelada al confirmar: el ejecutor no evalúa audiencias.
 *
 * La base se toca a través de un PUERTO (`PuertoDeEnvio`): el real abre su
 * `withOrganizationScope` por paso (RLS; ninguna transacción abierta durante
 * la llamada a Graph) y los tests usan uno en memoria.
 */

export type FilaDestinatario = DestinatarioDeEnvio & { contactId: string | null; position: number };

export type PuertoDeEnvio = {
  pausaMs: number;
  ahora: () => Date;
  dormir: (ms: number) => Promise<void>;
  tomarLease: () => Promise<boolean>;
  renovarLease: () => Promise<void>;
  soltarLease: () => Promise<void>;
  marcarInterrumpidos: () => Promise<number>;
  /** Lo congelado al confirmar; `null` = no se puede enviar (se suelta el lease). */
  datosDeEnvio: () => Promise<unknown>;
  pendientes: () => Promise<FilaDestinatario[]>;
  estado: () => Promise<{ status: string; pausedUntil: Date | null } | null>;
  bajaActiva: (d: { contactId: string | null; email: string }) => Promise<boolean>;
  reclamar: (recipientId: string) => Promise<boolean>;
  registrar: (
    recipientId: string,
    cambio: { status: string; reason?: string | null; sentAt?: Date | null }
  ) => Promise<void>;
  pausar: (hasta: Date) => Promise<void>;
  detener: (error: string) => Promise<void>;
  limpiarError: () => Promise<void>;
  cerrarSiTermino: () => Promise<boolean>;
  enviar: (datos: unknown, r: FilaDestinatario) => Promise<SendMailResult>;
};

type Paso =
  | { tipo: "enviado"; attempted: true }
  | { tipo: "fallido"; motivo: string; attempted: boolean }
  | { tipo: "limite"; pausaMs: number; attempted: true }
  | { tipo: "detener"; motivo: string; attempted: false }
  | { tipo: "omitido"; attempted: false }
  | { tipo: "saltear"; attempted: false };

/** Mientras se espera una pausa larga, se renueva el lease cada tanto. */
const TRAMO_DE_ESPERA_MS = 60_000;
/** Corte de seguridad: cada ronda vuelve a leer los pendientes (los del límite). */
const MAX_RONDAS = 50;
const FALLO_INESPERADO = "Falló de forma inesperada; revisá el registro del servidor.";

export async function runCampaign(
  organizationId: string,
  campaignId: string,
  puerto: PuertoDeEnvio = puertoReal(organizationId, campaignId)
): Promise<void> {
  const p = puerto;
  if (!(await p.tomarLease())) return;
  let cerrada = false;
  try {
    await p.marcarInterrumpidos();
    const datos = await p.datosDeEnvio();
    if (!datos) return;

    let detenida = false;
    let primerEnvio = true;

    const dormirConLease = async (ms: number) => {
      let resto = ms;
      while (resto > 0) {
        const tramo = Math.min(resto, TRAMO_DE_ESPERA_MS);
        await p.dormir(tramo);
        resto -= tramo;
        if (resto > 0) await p.renovarLease();
      }
    };

    const paso = async (r: FilaDestinatario): Promise<Paso> => {
      const e = await p.estado();
      if (!e || e.status !== "enviando") {
        detenida = true; // cancelada (o borrada): no se manda nada más
        return { tipo: "saltear", attempted: false };
      }
      const ahora = p.ahora().getTime();
      if (e.pausedUntil && e.pausedUntil.getTime() > ahora) {
        await dormirConLease(e.pausedUntil.getTime() - ahora);
      }
      await p.renovarLease();
      if (await p.bajaActiva({ contactId: r.contactId, email: r.email })) {
        return { tipo: "omitido", attempted: false };
      }
      if (!(await p.reclamar(r.id))) return { tipo: "saltear", attempted: false };

      const c = clasificarResultado(await p.enviar(datos, r));
      if (c.estado === "enviado") return { tipo: "enviado", attempted: true };
      if (c.estado === "fallido") return { tipo: "fallido", motivo: c.motivo, attempted: true };
      if ("detener" in c) {
        detenida = true;
        return { tipo: "detener", motivo: c.motivo, attempted: false };
      }
      return { tipo: "limite", pausaMs: c.pausaMs, attempted: true };
    };

    const registrar = async (id: string, o: Paso) => {
      switch (o.tipo) {
        case "enviado":
          await p.registrar(id, { status: "enviado", sentAt: p.ahora() });
          if (primerEnvio) {
            primerEnvio = false;
            await p.limpiarError();
          }
          return;
        case "fallido":
          await p.registrar(id, { status: "fallido", reason: o.motivo });
          return;
        case "limite":
          // Graph NO lo aceptó: vuelve a la cola, sin riesgo de duplicar.
          await p.registrar(id, { status: "pendiente" });
          await p.pausar(new Date(p.ahora().getTime() + o.pausaMs));
          return;
        case "detener":
          await p.registrar(id, { status: "pendiente" });
          await p.detener(o.motivo);
          return;
        case "omitido":
          await p.registrar(id, { status: "omitido", reason: "baja" });
          return;
        case "saltear":
          return;
      }
    };

    for (let ronda = 0; ronda < MAX_RONDAS && !detenida; ronda++) {
      const pendientes = await p.pendientes();
      if (pendientes.length === 0) break;
      await processRecipients<FilaDestinatario, Paso>(pendientes, {
        send: paso,
        record: registrar,
        pause: () => p.dormir(p.pausaMs),
        alFallar: () => ({ tipo: "fallido", motivo: FALLO_INESPERADO, attempted: true }),
        cortar: () => detenida,
      });
    }

    if (!detenida) cerrada = await p.cerrarSiTermino();
  } catch (err) {
    console.error("[marketing] la corrida se cortó:", err instanceof Error ? err.message : "error");
  } finally {
    if (!cerrada) await p.soltarLease().catch(() => undefined);
  }
}

/* ============================================================
 * El puerto real (base + Graph)
 * ============================================================ */

export function puertoReal(orgId: string, campaignId: string): PuertoDeEnvio {
  const actor = "system:marketing";
  const en = <T>(fn: () => Promise<T>) => withOrganizationScope(orgId, actor, fn);
  const c = schema.marketingCampaign;
  const r = schema.marketingCampaignRecipient;
  const deLaCampana = scoped(c.organizationId, orgId, eq(c.id, campaignId));
  const leaseNuevo = sql`now() + interval '2 minutes'`;

  return {
    pausaMs: getEnv().MARKETING_SEND_PAUSE_MS,
    ahora: () => new Date(),
    dormir: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    tomarLease: () =>
      en(async () => {
        const filas = await getDb()
          .update(c)
          .set({ leaseUntil: leaseNuevo })
          .where(
            scoped(
              c.organizationId,
              orgId,
              eq(c.id, campaignId),
              eq(c.status, "enviando"),
              or(isNull(c.leaseUntil), lt(c.leaseUntil, sql`now()`))
            )
          )
          .returning({ id: c.id });
        return filas.length > 0;
      }),
    renovarLease: () =>
      en(async () => {
        await getDb().update(c).set({ leaseUntil: leaseNuevo }).where(deLaCampana);
      }),
    soltarLease: () =>
      en(async () => {
        await getDb().update(c).set({ leaseUntil: null }).where(deLaCampana);
      }),
    marcarInterrumpidos: () =>
      en(async () => {
        const filas = await getDb()
          .update(r)
          .set({ status: "fallido", reason: "interrumpido" })
          .where(scoped(r.organizationId, orgId, eq(r.campaignId, campaignId), eq(r.status, "enviando")))
          .returning({ id: r.id });
        return filas.length;
      }),
    datosDeEnvio: () => en(() => cargarDatosDeEnvio(orgId, campaignId)),
    pendientes: () =>
      en(async () => {
        const filas = await getDb()
          .select({
            id: r.id,
            contactId: r.contactId,
            email: r.email,
            firstName: r.firstName,
            lastName: r.lastName,
            vars: r.vars,
            position: r.position,
          })
          .from(schema.marketingCampaignRecipient)
          .where(scoped(r.organizationId, orgId, eq(r.campaignId, campaignId), eq(r.status, "pendiente")))
          .orderBy(asc(r.position));
        return filas.map((f) => ({ ...f, vars: f.vars ?? {} }));
      }),
    estado: () =>
      en(async () => {
        const [fila] = await getDb()
          .select({ status: c.status, pausedUntil: c.pausedUntil })
          .from(c)
          .where(deLaCampana)
          .limit(1);
        return fila ?? null;
      }),
    bajaActiva: (d) => en(() => bajaActiva(orgId, d)),
    reclamar: (recipientId) =>
      en(async () => {
        const filas = await getDb()
          .update(r)
          .set({ status: "enviando", attemptedAt: new Date() })
          .where(scoped(r.organizationId, orgId, eq(r.id, recipientId), eq(r.status, "pendiente")))
          .returning({ id: r.id });
        return filas.length > 0;
      }),
    registrar: (recipientId, cambio) =>
      en(async () => {
        await getDb()
          .update(r)
          .set({
            status: cambio.status as "pendiente" | "enviado" | "fallido" | "omitido",
            reason: cambio.reason ?? null,
            ...(cambio.sentAt ? { sentAt: cambio.sentAt } : {}),
          })
          .where(scoped(r.organizationId, orgId, eq(r.id, recipientId)));
      }),
    pausar: (hasta) =>
      en(async () => {
        await getDb().update(c).set({ pausedUntil: hasta, updatedAt: new Date() }).where(deLaCampana);
      }),
    detener: (error) =>
      en(async () => {
        await getDb().update(c).set({ lastError: error, leaseUntil: null, updatedAt: new Date() }).where(deLaCampana);
      }),
    limpiarError: () =>
      en(async () => {
        await getDb().update(c).set({ lastError: null }).where(deLaCampana);
      }),
    cerrarSiTermino: () =>
      en(async () => {
        const [quedan] = await getDb()
          .select({ id: r.id })
          .from(schema.marketingCampaignRecipient)
          .where(
            scoped(
              r.organizationId,
              orgId,
              eq(r.campaignId, campaignId),
              inArray(r.status, ["pendiente", "enviando"])
            )
          )
          .limit(1);
        if (quedan) return false;
        const filas = await getDb()
          .update(c)
          .set({ status: "enviada", finishedAt: new Date(), leaseUntil: null, updatedAt: new Date() })
          .where(and(deLaCampana, eq(c.status, "enviando")))
          .returning({ id: c.id });
        return filas.length > 0;
      }),
    enviar: (datos, fila) => enviarADestinatario(datos as DatosDeEnvio, fila),
  };
}

/** Lo congelado al confirmar + imágenes, enlaces y marca. */
async function cargarDatosDeEnvio(orgId: string, campaignId: string): Promise<DatosDeEnvio | null> {
  const c = schema.marketingCampaign;
  const [fila] = await getDb()
    .select({
      subject: c.subject,
      body: c.body,
      senderEmail: c.senderEmail,
      senderName: c.senderName,
      footer: c.footer,
    })
    .from(c)
    .where(scoped(c.organizationId, orgId, eq(c.id, campaignId)))
    .limit(1);
  const body = CampaignBodySchema.safeParse(fila?.body);
  if (!fila || !body.success || !fila.senderEmail || !fila.footer) return null;

  const img = schema.marketingImage;
  const imagenes = await getDb()
    .select({ id: img.id, publicToken: img.publicToken })
    .from(img)
    .where(scoped(img.organizationId, orgId, eq(img.campaignId, campaignId)));
  const l = schema.marketingCampaignLink;
  const enlaces = await getDb()
    .select({ id: l.id, url: l.url })
    .from(l)
    .where(scoped(l.organizationId, orgId, eq(l.campaignId, campaignId)));
  const branding = await getBranding(orgId);

  return {
    campaignId,
    subject: fila.subject,
    body: body.data,
    senderEmail: fila.senderEmail,
    senderName: fila.senderName ?? branding.name,
    footer: fila.footer,
    academyName: branding.name,
    accent: branding.accent,
    imageUrls: Object.fromEntries(imagenes.map((i) => [i.id, urlPublicaDeImagen(i.publicToken)])),
    linkIds: Object.fromEntries(enlaces.map((e) => [e.url, e.id])),
  };
}

/* ============================================================
 * Retomar al arrancar y en la periódica (DV-003)
 * ============================================================ */

export type MarketingSchedulerDeps = {
  env: Record<string, string | undefined>;
  /** Segundos entre pasadas; 0 = solo al arrancar. */
  tickSec: number;
  /** `enviando` con lease vencido o suelto y sin pausa vigente. */
  aRetomar: () => Promise<{ organizationId: string; campaignId: string }[]>;
  run: (organizationId: string, campaignId: string) => Promise<void>;
  log: (m: string) => void;
};

// En globalThis: en desarrollo Next reevalúa los módulos.
const globalForMarketing = globalThis as unknown as {
  __caditMarketing?: ReturnType<typeof setInterval> | null;
};

async function retomar(deps: MarketingSchedulerDeps): Promise<void> {
  let lista: { organizationId: string; campaignId: string }[];
  try {
    lista = await deps.aRetomar();
  } catch (err) {
    deps.log(`[marketing] no se pudo leer qué retomar (${err instanceof Error ? err.name : "error"})`);
    return;
  }
  for (const x of lista) {
    // Cada corrida sigue sola: una campaña puede tardar minutos.
    void deps.run(x.organizationId, x.campaignId).catch((err) =>
      deps.log(`[marketing] ${x.campaignId} falló (${err instanceof Error ? err.name : "error"})`)
    );
  }
}

export function startMarketingScheduler(deps: MarketingSchedulerDeps): boolean {
  if (!(deps.tickSec > 0)) return false;
  if (globalForMarketing.__caditMarketing) return false;
  let ocupado = false;
  const interval = setInterval(() => {
    if (ocupado) return;
    ocupado = true;
    void retomar(deps).finally(() => {
      ocupado = false;
    });
  }, deps.tickSec * 1000);
  interval.unref?.();
  globalForMarketing.__caditMarketing = interval;
  deps.log(`[marketing] periódica encendida: cada ${deps.tickSec} s`);
  return true;
}

export function stopMarketingScheduler(): void {
  const i = globalForMarketing.__caditMarketing;
  if (i) clearInterval(i);
  globalForMarketing.__caditMarketing = null;
}

/**
 * Al arrancar: retoma toda campaña que quedó `enviando` (un reinicio a mitad)
 * y enciende la periódica. Nunca en tests ni en `next build`; nada de esto
 * puede tumbar el arranque.
 */
export async function startMarketingOnBoot(
  deps: MarketingSchedulerDeps = defaultMarketingSchedulerDeps()
): Promise<boolean> {
  if (!shouldStartScheduler(deps.env)) return false;
  await retomar(deps);
  startMarketingScheduler(deps);
  return true;
}

export function defaultMarketingSchedulerDeps(): MarketingSchedulerDeps {
  return {
    env: process.env,
    tickSec: getEnv().MARKETING_TICK_SEC,
    aRetomar: async () => {
      // `organization` no tiene RLS; cada organización se mira en su alcance.
      const orgs = await getRootDb().select({ id: schema.organization.id }).from(schema.organization);
      const out: { organizationId: string; campaignId: string }[] = [];
      for (const { id: orgId } of orgs) {
        const c = schema.marketingCampaign;
        const filas = await withOrganizationScope(orgId, "system:marketing", () =>
          getDb()
            .select({ id: c.id })
            .from(c)
            .where(
              scoped(
                c.organizationId,
                orgId,
                eq(c.status, "enviando"),
                or(isNull(c.leaseUntil), lt(c.leaseUntil, sql`now()`)),
                or(isNull(c.pausedUntil), lte(c.pausedUntil, sql`now()`))
              )
            )
        );
        out.push(...filas.map((f) => ({ organizationId: orgId, campaignId: f.id })));
      }
      return out;
    },
    run: (orgId, campaignId) => runCampaign(orgId, campaignId),
    log: (m) => console.log(m),
  };
}

