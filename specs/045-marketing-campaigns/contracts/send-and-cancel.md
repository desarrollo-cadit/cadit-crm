# Contrato — Enviar y cancelar

Puerta: `requireCapability("marketing.enviar")`. Corre en la transacción del
pedido (`withAuth` → `withTenantTransaction`); el ejecutor se agenda con
`onAfterCommit` (una tarea suelta no ve filas sin confirmar).

## POST `/api/marketing/campaigns/[id]/send`

Confirma el envío (FR-019). **Body**:
```ts
{ expectedCount: number }   // la cantidad que la persona vio en "Se enviará a N personas"
```

Validaciones, en este orden:

| Estado | Código | Cuándo |
|---|---|---|
| 404 | `not_found` | |
| 409 | `campana_no_editable` | No es borrador (doble clic, otra pestaña) |
| 422 | `buzon_no_listo` | Falta buzón, remitente o pie, el buzón no pasó la prueba, o M365 no está configurado. `fields` dice qué falta y la UI enlaza a `/settings/marketing` (US5-1) |
| 422 | `contenido_incompleto` | Sin asunto, sin bloques o sin audiencia |
| 422 | `invalid_body` / `variable_desconocida` / `enlace_invalido` / `imagen_ajena` | Se revalida el contenido guardado |
| 422 | `audiencia_vacia` | 0 destinatarios tras exclusiones |
| 422 | `tope_superado` | Más de 500 (FR-018); `message` sugiere acotar los filtros |
| 422 | `conteo_cambio` | La evaluación de ahora no da `expectedCount`; responde `{ count }` en `fields` para volver a confirmar |
| 409 | `otra_campana_enviando` | Ya hay una `enviando` en la organización (índice único parcial) |

Efecto (todo o nada): congela filtros, remitente, nombre y pie; inserta los
destinatarios (`pendiente`, con `vars` y `position`) y los enlaces; `status =
enviando`, `sent_by`, `send_confirmed_at`, `recipient_count`.

**202** `{ campaignId: string; recipientCount: number }`

## POST `/api/marketing/campaigns/[id]/cancel`

Cancela un envío en curso (FR-020). **Body**: `{}`.

Efecto (misma transacción): `status = cancelada`, `finished_at`,
`cancelled_by`; las filas `pendiente` → `cancelado`. Una fila que ya está en
`enviando` termina su intento (Graph ya la tiene) y queda con su resultado.

**200** `{ status: "cancelada"; cancelled: number }` (cuántos no lo reciben) ·
**404** · **409** `no_esta_enviando` (borrador, enviada o ya cancelada).

## Ejecutor (no es ruta; contrato interno)

`runCampaign(organizationId, campaignId)` en `src/server/marketing/runner.ts`:

1. Toma el lease: `UPDATE marketing_campaign SET lease_until = now() + 2 min
   WHERE id = $1 AND status = 'enviando' AND (lease_until IS NULL OR lease_until < now())`.
   Sin fila = otro proceso la tiene: sale.
2. Filas `enviando` de la campaña → `fallido` / `interrumpido`.
3. Bucle `processRecipients` sobre las `pendiente` por `position`; antes de
   cada una: relee `status` (cancelada → corta), respeta `paused_until`,
   renueva el lease, y si hay baja activa por contacto o correo → `omitido`/`baja`.
4. Reclamo atómico → render (`renderCampaignEmail` con `vars` congeladas,
   enlaces rastreados y token de baja) → `sendMail({ sender, fromName, … })`.
5. Resultado: 202 → `enviado`; `throttled` → `pendiente` + `paused_until`;
   `mailbox_denied` (401/403) → `pendiente`, `last_error`, suelta el lease y sale
   (la periódica reintenta); otro error → `fallido` con el mensaje.
6. Sin pendientes → `status = enviada`, `finished_at`, suelta el lease.

Arranque: `startMarketingOnBoot()` en `src/instrumentation-node.ts` retoma las
`enviando` con lease vencido; la periódica (`MARKETING_TICK_SEC`) repite eso y
las pausas cumplidas.
