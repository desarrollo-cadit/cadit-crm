import { asc, eq, gte, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { withOrganizationScope } from "@/lib/db/with-tenant";
import { getEnv } from "@/lib/env";
import { HORIZONTE_REINTENTO_MS, reintentoDeEventoQueToca } from "@/lib/billing-notices";
import { armarAvisoInteresado, destinatariosDeInteresados, type InteresadoNuevo } from "@/lib/lead-notices";
import { claveDeAviso, puedeReclamar, sujetoDeRegistro, type SujetoDeAviso } from "@/lib/staff-notices";
import { getAreaConfig, listSellers } from "@/server/areas/config";
import { organizationTimezone } from "@/server/finanzas-periodo";
import {
  ACTOR_AVISOS,
  cerrarAviso,
  mandarAviso,
  reclamarAviso,
  type Envio,
  type ResultadoAviso,
} from "@/server/staff-notices";

/**
 * Avisos de nuevos interesados: el envío. Nacen ENCOLADOS en la transacción
 * del formulario público (`lead-notices-queue.ts`) y salen acá, después del
 * commit, con el mismo motor que 039/041 (`src/server/staff-notices.ts`):
 * reclamo compare-and-swap en una transacción corta, correo FUERA de toda
 * transacción, resultado registrado solo si el reclamo sigue siendo el mismo.
 * Nunca lanza. La periódica (`runInternalNoticesForOrg`) recupera los que
 * quedaron en el camino.
 *
 * Destinatarios: el área "Nuevos interesados" de Ajustes › Áreas (To = casilla;
 * CC = copias ∪ vendedores elegidos activos). Apagada o sin casilla → se omite
 * (`area_sin_configurar`), sin ruido.
 */

type SujetoInteresado = Extract<SujetoDeAviso, { kind: "interesado_nuevo" }>;

async function leerRegistro(organizationId: string, sujeto: SujetoInteresado) {
  const rows = await getDb()
    .select({
      id: schema.staffNotice.id,
      status: schema.staffNotice.status,
      attempts: schema.staffNotice.attempts,
      claimedAt: schema.staffNotice.claimedAt,
      payload: schema.staffNotice.payload,
    })
    .from(schema.staffNotice)
    .where(
      scoped(schema.staffNotice.organizationId, organizationId, eq(schema.staffNotice.dedupKey, claveDeAviso(sujeto)))
    )
    .limit(1);
  return rows[0] ?? null;
}

/** El payload congelado, si tiene la forma mínima para armar el correo. */
function interesadoDe(payload: unknown): InteresadoNuevo | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Partial<InteresadoNuevo>;
  if (typeof p.contactId !== "string" || typeof p.nombre !== "string" || typeof p.recibidoEn !== "string") return null;
  if (!p.interes || typeof p.interes !== "object" || typeof p.origen !== "string") return null;
  return p as InteresadoNuevo;
}

async function prepararEnvio(
  organizationId: string,
  sujeto: SujetoInteresado,
  now: Date
): Promise<Envio | ResultadoAviso> {
  return withOrganizationScope(organizationId, ACTOR_AVISOS, async () => {
    const previo = await leerRegistro(organizationId, sujeto);
    // Solo existe ENCOLADO: sin fila, no hubo formulario.
    if (!previo) return "no_corresponde";
    if (!puedeReclamar(previo, now, { reintentarOmitido: false })) return "no_corresponde";
    const id = await reclamarAviso(organizationId, sujeto, previo, now);
    if (!id) return "no_corresponde";

    const omitir = async (detail: string): Promise<ResultadoAviso> => {
      await cerrarAviso(organizationId, id, now, { status: "skipped", detail });
      return "skipped";
    };

    const datos = interesadoDe(previo.payload);
    if (!datos) return omitir("sin_datos");

    const [area, sellers, timeZone] = await Promise.all([
      getAreaConfig(organizationId, "interesados"),
      listSellers(organizationId),
      organizationTimezone(organizationId),
    ]);
    const destinatarios = destinatariosDeInteresados(area, sellers);
    if (!destinatarios) return omitir("area_sin_configurar");

    const correo = armarAvisoInteresado(datos, { baseUrl: getEnv().APP_BASE_URL, timeZone });
    await getDb()
      .update(schema.staffNotice)
      .set({ recipients: destinatarios, subject: correo.subject, updatedAt: now })
      .where(scoped(schema.staffNotice.organizationId, organizationId, eq(schema.staffNotice.id, id)));
    return { id, claimedAt: now, destinatarios, ...correo };
  });
}

/**
 * Manda UN aviso de interesado, si corresponde. Nunca lanza: devuelve en qué
 * quedó (`no_corresponde` si ya salió, no existe o lo tomó otro proceso).
 */
export async function enviarAvisoDeInteresado(
  organizationId: string,
  sujeto: SujetoInteresado,
  now = new Date()
): Promise<ResultadoAviso> {
  const etiqueta = claveDeAviso(sujeto);
  let envio: Envio | ResultadoAviso;
  try {
    envio = await prepararEnvio(organizationId, sujeto, now);
  } catch (err) {
    console.error(`[avisos] ${etiqueta}: no se pudo preparar (${err instanceof Error ? err.name : "error"})`);
    return "no_corresponde";
  }
  if (typeof envio === "string") return envio;
  return mandarAviso(organizationId, envio, etiqueta);
}

/** Los avisos de interesados encolados o fallidos de la última semana. */
export async function avisosDeInteresadosPendientes(
  organizationId: string,
  now = new Date()
): Promise<SujetoInteresado[]> {
  return withOrganizationScope(organizationId, ACTOR_AVISOS, async () => {
    const filas = await getDb()
      .select({
        kind: schema.staffNotice.kind,
        status: schema.staffNotice.status,
        attempts: schema.staffNotice.attempts,
        claimedAt: schema.staffNotice.claimedAt,
        createdAt: schema.staffNotice.createdAt,
        dedupKey: schema.staffNotice.dedupKey,
        cohortId: schema.staffNotice.cohortId,
        enrollmentId: schema.staffNotice.enrollmentId,
        paymentId: schema.staffNotice.paymentId,
        periodKey: schema.staffNotice.periodKey,
        contactId: schema.staffNotice.contactId,
      })
      .from(schema.staffNotice)
      .where(
        scoped(
          schema.staffNotice.organizationId,
          organizationId,
          eq(schema.staffNotice.kind, "interesado_nuevo"),
          inArray(schema.staffNotice.status, ["pending", "failed"]),
          gte(schema.staffNotice.createdAt, new Date(now.getTime() - HORIZONTE_REINTENTO_MS))
        )
      )
      .orderBy(asc(schema.staffNotice.createdAt));

    const out: SujetoInteresado[] = [];
    for (const f of filas) {
      if (!reintentoDeEventoQueToca(f, now)) continue;
      const sujeto = sujetoDeRegistro(f);
      if (sujeto?.kind === "interesado_nuevo") out.push(sujeto);
    }
    return out;
  });
}

export async function runLeadNoticesForOrg(organizationId: string, now = new Date()): Promise<number> {
  const pendientes = await avisosDeInteresadosPendientes(organizationId, now);
  // Uno por uno, cada uno en sus alcances cortos: un fallo no frena al siguiente.
  for (const s of pendientes) await enviarAvisoDeInteresado(organizationId, s, now);
  return pendientes.length;
}
