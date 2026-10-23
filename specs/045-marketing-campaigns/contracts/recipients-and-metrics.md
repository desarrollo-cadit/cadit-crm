# Contrato — Destinatarios y métricas

Puerta: `requireCapability("marketing.ver")`. La pantalla consulta cada 3 s
mientras la campaña está `enviando` (como `bulk-sends-panel.tsx`, `POLL_MS`).

```ts
CampaignMetricsDto = {
  total: number;          // recipient_count
  pending: number;        // pendiente + enviando
  sent: number;
  failed: number;
  skipped: number;        // omitido (baja durante el envío)
  cancelled: number;
  unsubscribes: number;   // destinatarios con unsubscribed_at (bajas desde esta campaña)
  clicks: { total: number; uniqueRecipients: number };
  pausedUntil: string | null;   // pausa por límite del proveedor
  lastError: string | null;     // detenida (p. ej. el buzón perdió el permiso)
}
CampaignRecipientDto = {
  id: string;
  name: string;
  email: string;
  contactId: string | null;     // null si el contacto se borró: la fila se conserva
  status: "pendiente" | "enviado" | "fallido" | "omitido" | "cancelado"; // "enviando" se muestra "pendiente"
  reason: string | null;        // motivo de la falla o "Se había dado de baja"
  sentAt: string | null;
  unsubscribedHere: boolean;    // se dio de baja desde ESTA campaña
  clicked: boolean;
  clickCount: number;
}
```

## GET `/api/marketing/campaigns/[id]/metrics`

**200** `CampaignMetricsDto & { status: CampaignStatus }` · **404**. Liviano: lo
que consulta la pantalla mientras envía.

## GET `/api/marketing/campaigns/[id]/recipients`

**Query**: `status?` (uno de los de arriba), `clicked?` (`true`), `q?` (nombre o
correo, ≤ 100), `page?` (default 1), `pageSize?` (50 | 100 | 500).

**200** `{ recipients: CampaignRecipientDto[]; total: number; page: number; pageSize: number }`
· **404** · **422** `invalid_query`. En borrador responde lista vacía.

## GET `/api/marketing/campaigns/[id]/links`

**200** `{ links: { id: string; url: string; clicks: number; uniqueRecipients: number }[] }` — clics por enlace.
