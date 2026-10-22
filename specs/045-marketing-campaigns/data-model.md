# Data model — 045 Marketing: campañas por correo

**Migración**: `drizzle/0071_campanas_de_marketing.sql` (la última es
`0070_avisos_sin_confirmar.sql`). Re-ejecutable (constitución IV): tablas e
índices `if not exists`; FKs y CHECK dentro de `do $$` contra `pg_constraint`;
políticas `drop policy if exists` + `create policy`; capacidades con
`update … where not (capabilities @> …)`.

Todas las tablas son de dominio: `organization_id text NOT NULL` →
`organization(id) on delete cascade`, índice org-first, y **RLS escrita a
mano** en la 0071 (`db:generate` no la produce; `rls-cobertura.test.ts` falla
si falta):

```sql
alter table "<tabla>" enable row level security;
drop policy if exists tenant_isolation on "<tabla>";
create policy tenant_isolation on "<tabla>"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));
```

Prefijos nuevos en `src/lib/db/ids.ts`: `marketingSettings: "mks"`,
`marketingAudience: "mka"`, `marketingCampaign: "mkc"`,
`marketingCampaignRecipient: "mkr"`, `marketingCampaignLink: "mkl"`,
`marketingClick: "mkk"`, `marketingUnsubscribe: "mku"`, `marketingImage:
"mki"`.

---

## 1. `marketing_settings` — buzón, remitente y pie (una fila por organización)

| Columna | Tipo | Nulo | Nota |
|---|---|---|---|
| `id` | text PK | no | `mks_…` |
| `organization_id` | text FK | no | `UNIQUE` |
| `sender_email` | text | sí | Buzón de marketing, normalizado (`normalizarCorreo`). Distinto de `M365_SENDER` (validado en el servidor, 422 `buzon_no_separado`). |
| `sender_name` | text | sí | Nombre que ve el destinatario. ≤ 80. |
| `footer_address` | text | sí | Dirección de la academia. ≤ 200. |
| `footer_contact` | text | sí | Dato de contacto (correo, teléfono o web). ≤ 200. |
| `verified_sender` | text | sí | El buzón que pasó la prueba. |
| `verified_at` | timestamp | sí | Cuándo. |
| `last_test_at` | timestamp | sí | |
| `last_test_error` | text | sí | Mensaje legible del último fallo; NULL si la última prueba salió bien. |
| `updated_by` | text FK `user` | sí | `on delete set null` |
| `created_at`, `updated_at` | timestamp | no | |

**"Listo para enviar"** (derivado, no guardado): `sender_email`, `sender_name`,
`footer_address`, `footer_contact` cargados **y** `verified_sender =
sender_email` **y** M365 configurado (`getM365Config() !== null`). Cambiar
`sender_email` pone `verified_sender`/`verified_at` en NULL en el mismo
`UPDATE`.

---

## 2. `marketing_audience` — filtros guardados

| Columna | Tipo | Nulo | Nota |
|---|---|---|---|
| `id` | text PK | no | `mka_…` |
| `organization_id` | text FK | no | |
| `name` | text | no | ≤ 120 |
| `filters` | jsonb | no | `AudienceFilters` (abajo), validado por Zod al escribir y al leer |
| `created_by` | text FK `user` | sí | `set null` |
| `created_at`, `updated_at` | timestamp | no | |

Índice único: `marketing_audience_org_name_uq (organization_id, lower(name))`.

```ts
// src/lib/marketing/audience.ts
AudienceFilters = {
  v: 1,
  sources?: string[];          // valores de contact.source / contact_form_submission.source, o "whatsapp"
  stageIds?: string[];         // pipeline_stage.id (incluye la de kind = 'lost')
  cohortIds?: string[];
  courseIds?: string[];        // cursos de sus grupos
  interestCourseIds?: string[];
  companyIds?: string[];
  createdFrom?: "YYYY-MM-DD";  // contact.created_at, zona de la organización, inclusive
  createdTo?: "YYYY-MM-DD";
}
// .strict(); cada lista 1..200 elementos; createdFrom <= createdTo.
// Sin ningún filtro = toda la base de contactos (permitido; el tope de 500 aplica igual).
```

Una audiencia no se congela (FR-005). Borrarla no toca campañas: la campaña
guarda su propia copia de los filtros.

---

## 3. `marketing_campaign`

| Columna | Tipo | Nulo | Nota |
|---|---|---|---|
| `id` | text PK | no | `mkc_…` |
| `organization_id` | text FK | no | |
| `name` | text | no | Interno, ≤ 120 |
| `subject` | text | no | ≤ 200; admite variables |
| `body` | jsonb | no | `CampaignBody` (abajo); default `{"v":1,"blocks":[]}` |
| `audience_id` | text FK `marketing_audience` | sí | `on delete set null` |
| `filters` | jsonb | sí | Copia de los filtros. En borrador sigue a la audiencia elegida; al confirmar queda **congelada**. |
| `status` | text | no | `borrador` · `enviando` · `enviada` · `cancelada` (CHECK) |
| `recipient_count` | integer | sí | Fijado al confirmar |
| `sender_email`, `sender_name` | text | sí | Copia de `marketing_settings` al confirmar |
| `footer` | jsonb | sí | `{ address, contact }` copiado al confirmar |
| `created_by` | text FK `user` | sí | `set null` |
| `sent_by` | text FK `user` | sí | Quien confirmó |
| `send_confirmed_at` | timestamp | sí | |
| `finished_at` | timestamp | sí | `enviada` o `cancelada` |
| `cancelled_by` | text FK `user` | sí | |
| `lease_until` | timestamp | sí | Lease del ejecutor (un solo proceso la envía) |
| `paused_until` | timestamp | sí | Pausa por límite del proveedor (`Retry-After`) |
| `last_error` | text | sí | Motivo de la última detención (buzón sin permiso, etc.); NULL al retomar bien |
| `created_at`, `updated_at` | timestamp | no | |

Índices:
- `marketing_campaign_org_created_idx (organization_id, created_at desc)`
- `marketing_campaign_one_sending_uq` UNIQUE `(organization_id) WHERE status = 'enviando'` — una campaña enviándose por organización (mismo buzón, mismo cupo).
- `marketing_campaign_sending_idx (status, lease_until) WHERE status = 'enviando'` — lo que busca el arranque.

```ts
// src/lib/marketing/body.ts
CampaignBody = { v: 1, blocks: Block[] }  // 0..60 bloques; texto total ≤ 20 000
Block =
  | { type: "heading"; level: 1 | 2; text: string }          // ≤ 200
  | { type: "paragraph"; text: string }                      // ≤ 3000, inline: **b** *i* [t](url) {{var|alt}}
  | { type: "list"; ordered: boolean; items: string[] }      // 1..30 ítems, ≤ 500 c/u
  | { type: "image"; imageId: string; alt: string; href?: string } // imageId de marketing_image de ESTA campaña
  | { type: "button"; label: string; url: string }           // ≤ 60; url https
  | { type: "divider" }
// Variables: nombre, apellido, curso_de_interes. Desconocida → 422.
// URL: https: (y mailto: en línea). Otra cosa → 422 enlace_invalido.
```

### Transiciones

```text
           confirmar envío (POST /send)                  último destinatario procesado
borrador ───────────────────────────────▶ enviando ─────────────────────────────────▶ enviada
   │                                          │
   │ borrar (DELETE; solo borrador)           │ cancelar (POST /cancel)
   ▼                                          ▼
(no existe)                               cancelada
```

- Solo `borrador` se edita o se borra (409 `campana_no_editable`).
- `borrador → enviando` en UNA transacción: valida configuración, evalúa la
  audiencia, aplica tope (≤ 500, si no 422 `tope_superado`), compara con el
  `expectedCount` que vio la persona (422 `conteo_cambio` si difiere), congela
  filtros/remitente/pie, inserta destinatarios y enlaces, y agenda el ejecutor
  con `onAfterCommit`.
- `enviando → enviada` lo hace el ejecutor cuando no quedan filas `pendiente`
  ni `enviando`.
- `enviando → cancelada`: la ruta pone `status`, `finished_at`,
  `cancelled_by` y pasa las `pendiente` a `cancelado` en la misma transacción.
- No hay vuelta atrás desde `enviada` ni `cancelada` (FR-019).

---

## 4. `marketing_campaign_recipient` — la foto de a quién se le envía

| Columna | Tipo | Nulo | Nota |
|---|---|---|---|
| `id` | text PK | no | `mkr_…`; va (firmado) en los enlaces |
| `organization_id` | text FK | no | |
| `campaign_id` | text FK | no | `on delete cascade` |
| `contact_id` | text FK `contact` | sí | `on delete set null` (Edge: la campaña conserva el registro) |
| `email` | text | no | Normalizado |
| `first_name` | text | no | Al confirmar |
| `last_name` | text | sí | |
| `vars` | jsonb | no | Valores de las variables al confirmar (`{ curso_de_interes: "Revit" }`) |
| `position` | integer | no | Orden de envío |
| `status` | text | no | `pendiente` · `enviando` · `enviado` · `fallido` · `omitido` · `cancelado` (CHECK) |
| `reason` | text | sí | `baja` (omitido) · mensaje de error (fallido) · `interrumpido` |
| `attempted_at` | timestamp | sí | Cuando se reclamó para enviar |
| `sent_at` | timestamp | sí | Graph respondió 202 |
| `unsubscribed_at` | timestamp | sí | Se dio de baja **desde esta campaña** |

Índices:
- `marketing_recipient_campaign_email_uq` UNIQUE `(campaign_id, email)` — FR-004 garantizado por la base.
- `marketing_recipient_org_campaign_status_idx (organization_id, campaign_id, status, position)` — el ejecutor y la tabla.
- `marketing_recipient_org_contact_idx (organization_id, contact_id)`.

### Transiciones

```text
pendiente ──reclamo atómico──▶ enviando ──202──▶ enviado
    │                              │
    │                              ├──error definitivo──▶ fallido (reason = mensaje)
    │                              ├──429/503 (throttled)──▶ pendiente (no salió; se reintenta tras la pausa)
    │                              └──reinicio a mitad──▶ fallido (reason = 'interrumpido'; NO se reintenta)
    ├──baja activa al llegarle el turno──▶ omitido (reason = 'baja')
    └──campaña cancelada──▶ cancelado
```

- Reclamo: `UPDATE … SET status='enviando', attempted_at=now() WHERE id=$1 AND
  status='pendiente' RETURNING id`. Sin fila devuelta = otro proceso la tomó o
  ya cambió: se saltea.
- Al retomar (arranque o lease vencido), toda fila `enviando` de esa campaña
  pasa primero a `fallido`/`interrumpido`: a lo sumo una vez (SC-004).
- La pantalla muestra `enviando` como "Pendiente".

---

## 5. `marketing_campaign_link` — destinos permitidos

| Columna | Tipo | Nulo | Nota |
|---|---|---|---|
| `id` | text PK | no | `mkl_…`; va en la URL de clic |
| `organization_id` | text FK | no | |
| `campaign_id` | text FK | no | `cascade` |
| `position` | integer | no | |
| `url` | text | no | Destino real (https), ≤ 2000 |

Índice único `(campaign_id, url)`. Se escriben al confirmar el envío.

---

## 6. `marketing_click`

| Columna | Tipo | Nulo | Nota |
|---|---|---|---|
| `id` | text PK | no | `mkk_…` |
| `organization_id` | text FK | no | |
| `campaign_id` | text FK | no | `cascade` (para contar sin join) |
| `recipient_id` | text FK | no | `cascade` |
| `link_id` | text FK | no | `cascade` |
| `clicked_at` | timestamp | no | default now |

Índices: `(organization_id, campaign_id)`, `(recipient_id, link_id, clicked_at)`.
Métricas: clics totales = `count(*)`; personas únicas = `count(distinct
recipient_id)`. Un segundo clic del mismo destinatario al mismo enlace en
menos de 10 s no se inserta (escáneres, research R7).

---

## 7. `marketing_unsubscribe` — bajas de marketing

| Columna | Tipo | Nulo | Nota |
|---|---|---|---|
| `id` | text PK | no | `mku_…` |
| `organization_id` | text FK | no | |
| `contact_id` | text FK `contact` | sí | `set null`: la baja sobrevive al borrado del contacto (por correo) |
| `email` | text | no | Normalizado |
| `campaign_id` | text FK | sí | Campaña de origen; `set null` |
| `recipient_id` | text FK | sí | `set null` |
| `created_at` | timestamp | no | Fecha de la baja |
| `reverted_at` | timestamp | sí | |
| `reverted_by` | text FK `user` | sí | `set null` |

Índices:
- `marketing_unsub_org_email_active_uq` UNIQUE `(organization_id, email) WHERE reverted_at IS NULL` — una baja activa por dirección; registrar dos veces es idempotente (`on conflict do nothing`).
- `marketing_unsub_org_contact_idx (organization_id, contact_id)`.

"Dado de baja" = existe fila con `reverted_at IS NULL` por `contact_id` **o**
por `email` normalizado. Revertir marca, nunca borra (historial para la
ficha). La consultan SOLO `src/server/marketing/*` (FR-014: el correo
operativo no la lee; test estructural).

---

## 8. `marketing_image`

| Columna | Tipo | Nulo | Nota |
|---|---|---|---|
| `id` | text PK | no | `mki_…` |
| `organization_id` | text FK | no | |
| `campaign_id` | text FK | no | `cascade` |
| `public_token` | text | no | 32 bytes aleatorios en base64url; `UNIQUE` |
| `mime_type` | text | no | CHECK `image/jpeg`, `image/png`, `image/webp` (por bytes) |
| `size_bytes` | integer | no | ≤ 5 MB |
| `created_by` | text FK `user` | sí | |
| `created_at` | timestamp | no | |

Archivo: `MEDIA_DIR/<org>/marketing-image-<id>` (`saveMediaFile`). Índice
`(organization_id, campaign_id)`. Borrar una campaña en borrador borra
primero los archivos (el `cascade` solo borra filas).

---

## 9. Capacidades (misma migración)

```sql
-- marketing.ver y marketing.enviar → direccion, coordinacion, ventas
-- marketing.configurar → direccion
update "role" set "capabilities" = "capabilities" || jsonb_build_array('marketing.ver'),
  "updated_at" = now()
where "key" in ('direccion','coordinacion','ventas')
  and not ("capabilities" @> jsonb_build_array('marketing.ver'));
-- (ídem marketing.enviar; marketing.configurar solo 'direccion')
```

Los roles creados a mano no se tocan.

---

## 10. Entorno (`src/lib/env.ts`)

| Variable | Default | Uso |
|---|---|---|
| `MARKETING_SEND_PAUSE_MS` | 2000 | Pausa entre dos correos (0 solo en pruebas) |
| `MARKETING_TICK_SEC` | 60 | Periódica que retoma campañas con lease vencido o pausa cumplida. 0 = solo al arrancar. No corre en tests ni en `next build` (`shouldStartScheduler`). |

Sin secretos nuevos: la firma de enlaces deriva de `ENCRYPTION_KEY` (HKDF).
