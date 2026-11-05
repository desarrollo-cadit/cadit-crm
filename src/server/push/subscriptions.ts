import { eq, inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { enviarPush, type PushResult, type PushTarget } from "@/lib/push";
import type { PushPayload } from "@/lib/push/payload";

/**
 * 0097 — Altas, bajas y envío de Web Push del portal.
 *
 * Corre dentro del alcance de la organización (RLS): lo llaman las rutas del
 * portal (`requireStudentPortal`) y los disparadores con `withOrganizationScope`.
 */

export type SuscripcionEntrada = {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
};

/** Idempotente por `endpoint`: reintentar, o entrar con otra cuenta, reasigna la fila. */
export async function registrarSuscripcion(
  ctx: { organizationId: string; userId: string; contactId: string | null },
  input: SuscripcionEntrada
): Promise<void> {
  const keys = encryptSecret(JSON.stringify({ p256dh: input.p256dh, auth: input.auth }));
  const userAgent = input.userAgent?.slice(0, 300) ?? null;
  await getDb()
    .insert(schema.pushSubscription)
    .values({
      id: newId("pushSubscription"),
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      contactId: ctx.contactId,
      endpoint: input.endpoint,
      keysCipher: keys.cipher,
      keysIv: keys.iv,
      keysTag: keys.tag,
      userAgent,
    })
    .onConflictDoUpdate({
      target: schema.pushSubscription.endpoint,
      set: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        contactId: ctx.contactId,
        keysCipher: keys.cipher,
        keysIv: keys.iv,
        keysTag: keys.tag,
        userAgent,
        lastSeenAt: new Date(),
        disabledAt: null,
      },
    });
}

export async function quitarSuscripcion(
  ctx: { organizationId: string; userId: string },
  endpoint: string
): Promise<void> {
  await getDb()
    .delete(schema.pushSubscription)
    .where(
      scoped(
        schema.pushSubscription.organizationId,
        ctx.organizationId,
        eq(schema.pushSubscription.userId, ctx.userId),
        eq(schema.pushSubscription.endpoint, endpoint)
      )
    );
}

/* ============================================================
 * Envío en tres pasos: cargar (con DB) → mandar (SIN DB) → registrar (con DB)
 * ============================================================ */

export type Destino = PushTarget & { id: string };
export type ResultadoDeEnvio = { id: string; endpoint: string; ok: boolean; gone: boolean; error?: string };
type Enviar = (target: PushTarget, payload: PushPayload) => Promise<PushResult>;

/** Dispositivos activos de una cuenta, con las claves ya descifradas. Corre en un alcance. */
export async function cargarDestinos(ctx: {
  organizationId: string;
  userId: string;
}): Promise<Destino[]> {
  const filas = await getDb()
    .select()
    .from(schema.pushSubscription)
    .where(
      scoped(
        schema.pushSubscription.organizationId,
        ctx.organizationId,
        eq(schema.pushSubscription.userId, ctx.userId),
        isNull(schema.pushSubscription.disabledAt)
      )
    );
  const destinos: Destino[] = [];
  for (const fila of filas) {
    try {
      const claves = JSON.parse(
        decryptSecret({ cipher: fila.keysCipher, iv: fila.keysIv, tag: fila.keysTag })
      ) as { p256dh: string; auth: string };
      destinos.push({ id: fila.id, endpoint: fila.endpoint, p256dh: claves.p256dh, auth: claves.auth });
    } catch {
      // claves ilegibles: se saltea ese dispositivo, no el resto
    }
  }
  return destinos;
}

/** Habla con el servicio de push. NO toca la base: se puede llamar fuera de toda transacción. */
export async function enviarADestinos(
  destinos: readonly Destino[],
  payload: PushPayload,
  enviar: Enviar = enviarPush
): Promise<ResultadoDeEnvio[]> {
  const out: ResultadoDeEnvio[] = [];
  for (const d of destinos) {
    const r = await enviar({ endpoint: d.endpoint, p256dh: d.p256dh, auth: d.auth }, payload);
    out.push(
      r.ok
        ? { id: d.id, endpoint: d.endpoint, ok: true, gone: false }
        : { id: d.id, endpoint: d.endpoint, ok: false, gone: r.gone, error: r.error }
    );
  }
  return out;
}

/** Deja el rastro del envío: `last_seen_at` si salió, `disabled_at` si el servicio dio la suscripción por muerta. */
export async function registrarResultados(
  organizationId: string,
  resultados: readonly ResultadoDeEnvio[]
): Promise<void> {
  const vivos = resultados.filter((r) => r.ok).map((r) => r.id);
  const muertos = resultados.filter((r) => r.gone).map((r) => r.id);
  if (vivos.length > 0) {
    await getDb()
      .update(schema.pushSubscription)
      .set({ lastSeenAt: new Date() })
      .where(scoped(schema.pushSubscription.organizationId, organizationId, inArray(schema.pushSubscription.id, vivos)));
  }
  if (muertos.length > 0) {
    await getDb()
      .update(schema.pushSubscription)
      .set({ disabledAt: new Date() })
      .where(scoped(schema.pushSubscription.organizationId, organizationId, inArray(schema.pushSubscription.id, muertos)));
  }
}

/**
 * Manda a TODOS los dispositivos activos de una cuenta, todo en el alcance en
 * curso (la ruta de prueba de desarrollo). Nunca lanza: un fallo de push no
 * puede deshacer la acción de negocio que lo disparó. Los disparadores reales
 * NO usan esto: usan los tres pasos para no abrir HTTP dentro de una transacción.
 */
export async function enviarAUsuario(
  ctx: { organizationId: string; userId: string },
  payload: PushPayload,
  enviar: Enviar = enviarPush
): Promise<ResultadoDeEnvio[]> {
  try {
    const destinos = await cargarDestinos(ctx);
    const resultados = await enviarADestinos(destinos, payload, enviar);
    await registrarResultados(ctx.organizationId, resultados);
    return resultados;
  } catch (err) {
    console.error("[push] envío falló:", err instanceof Error ? err.name : "error");
    return [];
  }
}
