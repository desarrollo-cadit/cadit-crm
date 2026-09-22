import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/**
 * Autenticación en dos capas del webhook (contrato webhook.md / DV-VC-02).
 * Este módulo es puro (sin BD) para poder testearse unitariamente.
 */

/** Comparación timing-safe de strings de longitud arbitraria. */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHmac("sha256", "cmp").update(a).digest();
  const hb = createHmac("sha256", "cmp").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** Capa 1: el segmento de la ruta debe coincidir con el verify token. */
export function isValidWebhookToken(
  segment: string,
  verifyToken: string
): boolean {
  return verifyToken.length > 0 && safeEqual(segment, verifyToken);
}

/**
 * Capa 2 (opcional): firma HMAC-SHA256 de Meta sobre el body CRUDO.
 * Devuelve true si no hay secreto configurado (capa desactivada).
 */
export function isValidSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string | undefined
): boolean {
  if (!appSecret) return true;
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret)
    .update(rawBody, "utf8")
    .digest("hex");
  return safeEqual(signatureHeader.slice("sha256=".length), expected);
}

/**
 * Aviso de arranque: la capa 2 acepta todo cuando no hay META_APP_SECRET.
 *
 * Que sea opcional es una decisión operativa del dueño —hay despliegues que
 * no lo configuran— y no se toca. Lo que sí se corrige es que fuera SILENCIOSA:
 * una sola línea al arrancar. Por pedido sería una inundación de logs.
 *
 * Lee `process.env` en vez de `getEnv()` a propósito: el arranque no puede
 * reventar por validar el entorno entero solo para emitir un aviso.
 */
export function warnIfWebhookSignatureDisabled(): void {
  if (process.env.META_APP_SECRET) return;
  console.warn(
    "[boot] META_APP_SECRET sin configurar: el webhook de WhatsApp acepta " +
      "cualquier firma (capa 2 desactivada). Configúralo para que solo Meta " +
      "pueda escribir en /api/webhooks/wa/*."
  );
}

/* ---------- Esquema del payload de Meta (subconjunto soportado) ---------- */

/**
 * El payload de Meta es un superconjunto EN MOVIMIENTO. Por eso cada objeto es
 * `passthrough`: se valida SOLO lo que este código consume y todo lo demás
 * viaja intacto. Un esquema estricto dejaría de ingerir el día que Meta agregue
 * un campo, que es exactamente el fallo que no se puede permitir acá.
 */

/**
 * Arreglo tolerante: valida ítem por ítem y descarta solo el roto.
 *
 * Meta manda LOTES: si un mensaje viene malformado, los otros nueve tienen que
 * entrar igual. Lo tolerante son los ÍTEMS: `entry`, `changes` y los arrays de
 * mensajes, estados y contactos pasan todos por acá, y se descarta solo el que
 * viene roto.
 *
 * Que sean ARREGLOS, en cambio, es estricto: un `{ entry: "no soy un arreglo" }`
 * se lleva el payload entero. Esa es la diferencia entre perder un mensaje y
 * perder el lote.
 */
function looseArray<T extends z.ZodTypeAny>(item: T, label: string) {
  return z.array(z.unknown()).transform((items) =>
    items.flatMap((raw) => {
      const parsed = item.safeParse(raw);
      if (parsed.success) return [parsed.data as z.infer<T>];
      console.warn(`[webhook] ${label} con forma inesperada: descartado`);
      return [];
    })
  );
}

/** Payload de un adjunto en un mensaje del webhook (008). */
const mediaSchema = z
  .object({
    id: z.string().optional(),
    mime_type: z.string().optional(),
    sha256: z.string().optional(),
    caption: z.string().optional(),
    /** Solo documentos. */
    filename: z.string().optional(),
    /** Solo audio: true si es nota de voz. */
    voice: z.boolean().optional(),
  })
  .passthrough();

const locationSchema = z
  .object({
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    name: z.string().optional(),
    address: z.string().optional(),
  })
  .passthrough();

const messageSchema = z
  .object({
    /** Teléfono del remitente. OPCIONAL desde la migración de Meta a BSUID (003). */
    from: z.string().optional(),
    /** Business-Scoped User ID del remitente cuando no hay teléfono (003). */
    from_user_id: z.string().optional(),
    /** Destinatario — presente en echoes de coexistence (008): el wa_id del lead. */
    to: z.string().optional(),
    // Los tres que la ingesta consume SIEMPRE: sin ellos el mensaje no se puede
    // registrar, así que un ítem que no los traiga se descarta (no el lote).
    id: z.string(),
    timestamp: z.string(),
    type: z.string(),
    text: z.object({ body: z.string() }).passthrough().optional(),
    image: mediaSchema.optional(),
    video: mediaSchema.optional(),
    audio: mediaSchema.optional(),
    document: mediaSchema.optional(),
    sticker: mediaSchema.optional(),
    location: locationSchema.optional(),
    contacts: z.array(z.unknown()).optional(),
  })
  .passthrough();

const statusSchema = z
  .object({
    id: z.string(),
    status: z.string(),
    timestamp: z.string(),
    recipient_id: z.string().optional(),
    errors: z
      .array(
        z
          .object({
            code: z.number().optional(),
            title: z.string().optional(),
            message: z.string().optional(),
          })
          .passthrough()
      )
      .optional(),
  })
  .passthrough();

const contactSchema = z
  .object({
    profile: z.object({ name: z.string().optional() }).passthrough().optional(),
    wa_id: z.string().optional(),
    user_id: z.string().optional(),
  })
  .passthrough();

const valueSchema = z
  .object({
    messaging_product: z.string().optional(),
    metadata: z
      .object({
        display_phone_number: z.string().optional(),
        phone_number_id: z.string().optional(),
      })
      .passthrough()
      .optional(),
    contacts: looseArray(contactSchema, "contacto").optional(),
    messages: looseArray(messageSchema, "mensaje").optional(),
    /** Echoes de coexistence (008): mensajes enviados desde la app del teléfono. */
    message_echoes: looseArray(messageSchema, "echo").optional(),
    statuses: looseArray(statusSchema, "status").optional(),
    // message_template_status_update
    event: z.string().optional(),
    message_template_name: z.string().optional(),
    message_template_language: z.string().optional(),
    message_template_id: z.union([z.string(), z.number()]).optional(),
    reason: z.string().nullable().optional(),
  })
  .passthrough();

const changeSchema = z
  .object({ field: z.string().optional(), value: valueSchema.optional() })
  .passthrough();

const entrySchema = z
  .object({
    id: z.string().optional(),
    changes: looseArray(changeSchema, "cambio").optional(),
  })
  .passthrough();

const payloadSchema = z
  .object({
    object: z.string().optional(),
    entry: looseArray(entrySchema, "entry").optional(),
  })
  .passthrough();

/**
 * Los tipos se DERIVAN del esquema: no hay una copia a mano que pueda quedar
 * desincronizada con lo que se valida en runtime.
 */
export type WebhookMediaPayload = z.infer<typeof mediaSchema>;
export type WebhookLocation = z.infer<typeof locationSchema>;
export type WebhookMessage = z.infer<typeof messageSchema>;
export type WebhookStatus = z.infer<typeof statusSchema>;
export type WebhookValue = z.infer<typeof valueSchema>;
export type WebhookChange = z.infer<typeof changeSchema>;
export type WebhookPayload = z.infer<typeof payloadSchema>;

/**
 * Valida el body crudo del webhook. Devuelve null si el body no es JSON o si
 * el sobre no se entiende — nunca lanza: quien llama responde 200 igual.
 */
export function parseWebhookPayload(rawBody: string): WebhookPayload | null {
  let raw: unknown;
  try {
    raw = JSON.parse(rawBody);
  } catch {
    console.warn("[webhook] body ilegible (no es JSON): descartado");
    return null;
  }
  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) {
    const detalle = parsed.error.issues
      .map((i) => `${i.path.join(".") || "body"}: ${i.message}`)
      .join("; ");
    console.warn(`[webhook] payload con forma inesperada: descartado — ${detalle}`);
    return null;
  }
  return parsed.data;
}
