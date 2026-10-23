# Contrato — Imágenes de campaña

## POST `/api/marketing/campaigns/[id]/images`

**Capacidad**: `marketing.enviar`. `multipart/form-data`, campo `file` (como
`PUT /api/courses/[id]/image`).

- Solo campaña en `borrador` (409 `campana_no_editable`).
- Tipos: JPG, PNG o WebP, **validados por los bytes** (`sniffImageMime`) y por
  `MEDIA_LIMITS.image` (≤ 5 MB). Máximo 20 imágenes por campaña.
- Guarda en `MEDIA_DIR/<org>/marketing-image-<id>` (`saveMediaFile`).

**201** `{ id: string; url: string; sizeBytes: number }` — `url` absoluta
(`APP_BASE_URL` + `/api/public/marketing/images/<public_token>`), la que va en
el correo.

**400** `invalid` (no es multipart) · **404** · **409** · **422**
`invalid_body` ("Se espera imagen (jpeg/png/webp, máx. 5 MB)") · **422**
`demasiadas_imagenes`.

## DELETE `/api/marketing/campaigns/[id]/images/[imageId]`

**Capacidad**: `marketing.enviar`. Solo borrador; si un bloque la usa, 409
`imagen_en_uso`. **204** · **404**.

## GET `/api/public/marketing/images/[token]` (pública)

Sin sesión. `withOrganization("public:marketing-imagen",
resolveSoleOrganizationId, …)` (`src/lib/api.ts:99`), como la portada del
curso. Excepción declarada en `route-capabilities.test.ts` (`SIN_CAPACIDAD`).

- `token`: `^[A-Za-z0-9_-]{43}$` (32 bytes base64url); otra forma → 404 sin
  tocar la base.
- **200** con el archivo; cabeceras `content-type` (deducido de los bytes),
  `cache-control: public, max-age=31536000, immutable`,
  `x-content-type-options: nosniff`, `content-disposition: inline`.
- **404** `not_found` neutro: token inexistente, de otra organización, o
  imagen de una campaña borrada. Nunca 403.
