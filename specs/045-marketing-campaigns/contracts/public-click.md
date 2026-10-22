# Contrato — Redirección de clics (pública)

## GET `/api/public/marketing/click/[token]/[linkId]`

Sin sesión. Excepción en `SIN_CAPACIDAD` de `route-capabilities.test.ts`.
`withOrganization("public:marketing-clic", resolveSoleOrganizationId, …)`.

- `token` = `<recipientId>.<base64url(HMAC-SHA256(k, "clic:v1:" + recipientId))>`
  — misma clave que la baja, **otro propósito**: un token de clic no sirve
  para dar de baja ni al revés.
- `linkId` = `mkl_…` de `marketing_campaign_link`.

Algoritmo:

1. Forma inválida o firma que no coincide (`timingSafeEqual`) → 404.
2. Busca el destinatario y el enlace con `campaign_id` **igual** al del
   destinatario. Si no existe esa pareja → 404. Jamás se lee una URL del
   pedido: no hay redirección abierta (FR-023).
3. Si el destinatario está `enviado` y no hubo un clic suyo al mismo enlace en
   los últimos 10 s, inserta `marketing_click`.
4. **302** `Location: <url guardada>` con `cache-control: no-store` y
   `referrer-policy: no-referrer`.

**404**: página/JSON neutro "Este enlace no es válido."; nunca dice si la
campaña o la persona existen.

No hay píxel de apertura (FR-024). Los `mailto:` no pasan por acá.
