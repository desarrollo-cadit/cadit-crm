import type { mediaAsset, message } from "@/lib/db/schema";

/**
 * La forma en la que un mensaje viaja al cliente (SSE y API).
 *
 * Vive fuera de `ingest.ts` porque `send.ts` también la usa, y esa importación
 * cerraba el ciclo send → ingest → ai/trigger → ai/pipeline → send. Es un
 * mapeo puro de fila a DTO: no consulta nada, así que no arrastra el módulo de
 * ingesta detrás.
 */
export function serializeMessage(
  m: typeof message.$inferSelect,
  media: typeof mediaAsset.$inferSelect | null = null
) {
  return {
    id: m.id,
    conversationId: m.conversationId,
    direction: m.direction,
    type: m.type,
    text: m.text,
    status: m.status,
    aiGenerated: m.aiGenerated,
    origin: m.origin,
    /** 029 — tema que clasificó el agente (solo salientes de la IA con ruteo). */
    aiTopic: m.aiTopic ?? null,
    media: media
      ? {
          assetId: media.id,
          kind: media.kind,
          mimeType: media.mimeType,
          fileName: media.fileName,
          fileSize: media.fileSize,
          caption: media.caption,
          fetchStatus: media.fetchStatus,
          payload: media.payload,
        }
      : null,
    createdAt: (m.waTimestamp ?? m.createdAt).toISOString(),
  };
}
