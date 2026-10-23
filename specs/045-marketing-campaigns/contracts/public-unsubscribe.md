# Contrato — Baja pública (sin iniciar sesión)

Token: `<recipientId>.<firma>` con `firma = base64url(HMAC-SHA256(k,
"baja:v1:" + recipientId))`, `k = HKDF(ENCRYPTION_KEY, "cadit:marketing-links:v1")`.
Verificación con `timingSafeEqual` (research R6). La organización se resuelve
con `resolveSoleOrganizationId` y todo corre en `withOrganizationScope`.

## Página `GET /baja/[token]` (`src/app/baja/[token]/page.tsx`)

Fuera de `(app)` y `(portal)`, como `src/app/verificar/[code]/page.tsx`. Usa
los tokens de color del tema (es un `.tsx`).

| Caso | Muestra |
|---|---|
| Token válido, sin baja activa | "¿No querés recibir más correos de **<nombre de la academia>**?" + "Seguirás recibiendo los correos de tus cursos (bienvenida, cuotas, acceso al portal)." + botón **"Confirmar la baja"** |
| Token válido, ya dado de baja | "Ya no te enviamos correos de novedades." (sin botón) |
| Token de un correo de prueba (`prueba`) | "Este es un correo de prueba: el enlace no da de baja a nadie." |
| Firma inválida, destinatario inexistente u otra organización | "Este enlace no es válido." — mismo texto para todos los casos: no revela de quién es (US4-2) |

La página NO muestra el correo ni el nombre del destinatario. GET nunca
escribe (los filtros de seguridad de correo abren los enlaces solos).

## POST `/api/public/marketing/unsubscribe`

Excepción en `SIN_CAPACIDAD`. Rate limit por IP (`checkRateLimit`,
`publicFormRateLimit`).

**Body**: `{ token: string }` (≤ 200).

Efecto: inserta `marketing_unsubscribe` (contacto, correo normalizado, campaña
y destinatario de origen) con `on conflict do nothing` sobre la baja activa por
correo; pone `unsubscribed_at` en el destinatario si estaba vacío. Una campaña
que se está enviando lo saltea a partir del siguiente turno (FR-013).

**200** `{ ok: true }` — también si ya estaba dado de baja (idempotente).
**404** `not_found` — token inválido (mismo cuerpo para todo motivo).
**429** `too_many_requests`.

## DELETE `/api/contacts/[id]/marketing-unsubscribe` (staff)

**Capacidad**: `marketing.configurar` (FR-015). Revierte la baja activa del
contacto (por `contact_id` o por su correo): `reverted_at = now()`,
`reverted_by = sesión`. Nunca borra la fila.

**200** `{ reverted: true }` · **404** `not_found` (contacto ajeno o sin baja activa).

## Lectura en la ficha

`GET /api/contacts/[id]/seguimiento` (`contactos.ver`, existente) suma:
```ts
marketing:
  | { estado: "suscripto" }
  | { estado: "baja"; desde: string; campana: string | null; revertible: boolean } // revertible = la sesión tiene marketing.configurar
```
y la línea de tiempo suma `{ kind: "baja_marketing" | "baja_marketing_revertida", at, campaignName?, authorName? }`.
