# Contrato — Campañas (borrador, vista previa y prueba)

Puerta: `requireCapability`. Errores `{ error: { code, message, fields? } }`.

```ts
CampaignStatus = "borrador" | "enviando" | "enviada" | "cancelada"
CampaignSummaryDto = {
  id: string; name: string; status: CampaignStatus;
  audienceName: string | null;          // null si la audiencia se borró
  recipientCount: number | null;        // null en borrador
  createdAt: string; sentAt: string | null; finishedAt: string | null;
  createdByName: string | null; sentByName: string | null;
}
CampaignDto = CampaignSummaryDto & {
  subject: string;
  body: CampaignBody;                   // data-model §3
  audienceId: string | null;
  filters: AudienceFilters | null;
  images: { id: string; url: string; sizeBytes: number }[];
  readOnly: boolean;                    // status !== "borrador"
  readiness: {                          // por qué no se puede enviar todavía (US5-1)
    ok: boolean;
    missing: ("buzon" | "buzon_sin_verificar" | "m365" | "audiencia" | "asunto" | "cuerpo")[];
    settingsHref: "/settings/marketing";
  };
  metrics: CampaignMetricsDto | null;   // ver send-and-results.md; null en borrador
}
```

Errores de validación del contenido (422, `fields` con la ruta del bloque):

| Código | Cuándo |
|---|---|
| `invalid_body` | No cumple el esquema (bloque desconocido, demasiados bloques, HTML no se acepta: un campo `html` es un campo desconocido) |
| `variable_desconocida` | `{{x}}` que no es `nombre`, `apellido` ni `curso_de_interes` |
| `enlace_invalido` | URL que no es `https:` (o `mailto:` en línea), o no parsea |
| `imagen_ajena` | `imageId` que no es de esta campaña |

---

## GET `/api/marketing/campaigns`

**Capacidad**: `marketing.ver`. **Query**: `status?`, `page?`. **200** `{ campaigns: CampaignSummaryDto[]; total: number }` (FR-021), más recientes primero.

## POST `/api/marketing/campaigns`

**Capacidad**: `marketing.enviar`. **Body**: `{ name: string (1..120); audienceId?: string; subject?: string; body?: CampaignBody }`

**201** `CampaignDto` (status `borrador`) · **404** `audience_not_found` · **422** (tabla de arriba).

## GET `/api/marketing/campaigns/[id]`

**Capacidad**: `marketing.ver`. **200** `CampaignDto` · **404**.

## PATCH `/api/marketing/campaigns/[id]`

**Capacidad**: `marketing.enviar`. **Body**: `{ name?; subject?; body?; audienceId?: string | null }`

**200** `CampaignDto` · **404** · **409** `campana_no_editable` (no es borrador; Edge "se edita mientras se envía") · **422**.

## DELETE `/api/marketing/campaigns/[id]`

**Capacidad**: `marketing.enviar`. Solo borrador; borra también sus imágenes del disco.
**204** · **404** · **409** `campana_no_editable`.

## POST `/api/marketing/campaigns/[id]/preview`

**Capacidad**: `marketing.ver`. Arma el correo con un contacto real de la audiencia (FR-009, US2-1/2).

**Body**: `{ contactId?: string; subject?: string; body?: CampaignBody }` — sin
`contactId`, el primero de la audiencia; `subject`/`body` permiten previsualizar
lo que se está editando sin guardar (se validan igual).

**200**
```ts
{
  contact: { id: string; name: string; email: string } | null;  // null = audiencia vacía: se usan los textos alternativos
  subject: string;     // variables reemplazadas
  html: string;        // EL MISMO HTML que se enviaría; enlaces sin rastrear, baja con enlace inerte
}
```
**404** (campaña, o `contact_not_in_audience` si el contacto no cumple los filtros o está excluido) · **422**.

## POST `/api/marketing/campaigns/[id]/test`

**Capacidad**: `marketing.enviar`. Envío de prueba (FR-009, US2-3).

**Body**: `{ contactId?: string }` (con qué datos personalizar).

- Destino: SIEMPRE el correo de la sesión (`user.email`); el cuerpo no acepta destinatario.
- Sale desde el buzón de marketing; asunto con prefijo `[PRUEBA] `; enlaces sin rastrear; el enlace de baja lleva a una página que dice "Este es un correo de prueba".
- No crea destinatarios, no suma métricas, no cambia el estado.
- Rate limit: 10 por persona cada 10 minutos.

**200** `{ sentTo: string }` · **404** · **409** `campana_no_editable` no aplica (se puede probar una enviada) · **422** `buzon_no_listo` (con `missing`) · **429** `too_many_requests` · **502** `envio_fallido` (mensaje de Graph legible).
