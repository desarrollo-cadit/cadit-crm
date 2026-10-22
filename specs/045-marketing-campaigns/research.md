# Research — 045 Marketing: campañas por correo (etapa 1)

**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Fecha**: 2026-10-22

Cada decisión cita el código real que la condiciona (`archivo:línea`, rama
`045-marketing-campaigns`). Formato: Decisión / Motivo / Alternativas
descartadas.

---

## R1 — Motor de envío: tablas propias, reusando el bucle de `processRecipients`

**Qué hay hoy**

- `src/server/bulk-sends.ts:237-258` — `processRecipients`: secuencial, registra
  el resultado de cada destinatario antes de pasar al siguiente, un fallo no
  corta la corrida, pausa solo después de un intento real (`attempted`).
- `src/server/bulk-sends.ts:264-319` — el candado es **en proceso**
  (`globalThis.__caditBulkSends`): no sobrevive a un reinicio ni ve otra réplica.
- `src/server/bulk-sends.ts:321-330` — el estado se **deriva** (`en_curso` /
  `terminada` / `interrumpida`); una corrida interrumpida NO se reanuda sola:
  alguien tiene que volver a apretar (`bulk-sends-panel.tsx:333-338`).
- `src/server/bulk-sends.ts:435-490` — `startBulkSend` inserta corrida y filas
  en la transacción del pedido y agenda el trabajo con `onAfterCommit` (:483).
- `src/server/bulk-sends.ts:501-533` — `processRun` corre fuera del pedido y
  declara la organización en cada paso con `withOrganizationScope`; la pausa es
  `BULK_SEND_PAUSE_MS` (`src/lib/env.ts:70`, 2 s ≈ 30/min, el límite de
  Exchange por buzón).
- `src/lib/db/schema.ts:1240-1287` — `bulk_send_run.cohort_id` NOT NULL,
  `kind` enum cerrado de tres, `bulk_send_recipient.enrollment_id` NOT NULL con
  `on delete cascade`. La idempotencia real NO está en esta tabla sino en las
  marcas por persona (`schema.ts:1227-1236`).
- `src/lib/m365/client.ts:129-186` — `sendMail` trata todo lo que no es 202 como
  `send_failed`: no distingue un 429 (Exchange limitó) de un rechazo real.

**Decisión**: tablas propias (`marketing_campaign`,
`marketing_campaign_recipient`) y un ejecutor propio
(`src/server/marketing/runner.ts`) que **reusa el bucle puro**
`processRecipients`, generalizado a `RecipientRef = { id: string }` con
`send(ref)` (cambio de firma compatible; el envío por cohorte pasa
`{ id, enrollmentId }` y su `send` lee `ref.enrollmentId`).

**Motivo**

- *Idempotencia (FR-017, SC-004)*: en `bulk_send` la verdad son las marcas de
  la inscripción; una campaña no tiene esa marca, la verdad tiene que ser la
  fila del destinatario. Se resuelve con un estado **persistido** por fila y un
  reclamo atómico antes de llamar a Graph:
  `UPDATE … SET status='enviando', attempted_at=now() WHERE id=$1 AND status='pendiente' RETURNING`.
  Una fila que quedó en `enviando` tras un reinicio NO se reintenta (no se
  sabe si Graph la aceptó): pasa a `fallido` con el motivo "se interrumpió
  durante el envío; no se reintenta para no duplicar". Entrega *a lo sumo una
  vez*, que es lo que exige SC-004. Además `UNIQUE (campaign_id, email)` hace
  imposible un segundo destinatario con la misma dirección (FR-004).
- *Reanudar solo (US3-5, Edge "límite del proveedor")*: el candado en memoria
  no sirve. Se usa un **lease en la base** (`marketing_campaign.lease_until`),
  el mismo patrón que Zoom (`zoom_sync_state`, ver CLAUDE.md §030): el
  arranque (`instrumentation-node.ts`, junto a `startStaffNoticesOnBoot` :73) y
  una periódica corta retoman toda campaña `enviando` con lease vencido.
- *Cancelar (FR-020)*: antes de cada envío el ejecutor relee
  `marketing_campaign.status`; si es `cancelada`, las filas `pendiente` pasan a
  `cancelado` en un solo `UPDATE` y el bucle termina. Cancelar desde la ruta
  hace lo mismo en su transacción, así que el efecto es inmediato aunque el
  ejecutor esté en la pausa.
- *Límites del proveedor*: `sendMail` gana un código `throttled` (429/503 con
  `Retry-After`). Un 429 significa que Graph NO aceptó el correo, así que es
  seguro devolver la fila a `pendiente`; la campaña guarda
  `paused_until = now + Retry-After` y el bucle duerme. Un error del buzón
  (401/403: falta la `ApplicationAccessPolicy`, credencial vencida) detiene la
  corrida sin tocar a nadie más (`last_error` visible), y la periódica lo
  reintenta.
- *Baja durante el envío (US3-2, FR-013)*: antes de cada envío se vuelve a
  consultar `marketing_unsubscribe` por contacto y por correo; si hay baja
  activa, la fila pasa a `omitido` con motivo `baja`.
- *Contacto borrado (Edge)*: `bulk_send_recipient` se borraría en cascada con
  la inscripción; acá la fila guarda correo y nombre al confirmar, y
  `contact_id` es `on delete set null`.

**Alternativas descartadas**

- *Agregar `kind = "campaign"` a `bulk_send_run`*: obliga a volver nullables
  `cohort_id` y `enrollment_id`, rompe la cascada que hoy es correcta para la
  cohorte, mezcla un estado derivado (cohorte) con uno persistido (campaña) y
  ensancha `BULK_SEND_OUTCOMES`, que `bulk-sends-panel.tsx:47-56` mapea
  exhaustivamente. Dos semánticas en una tabla.
- *Copiar `processRecipients`*: dos bucles que divergen en cuanto se arregle
  uno. Se generaliza el existente.
- *Cola externa*: prohibida por la constitución II.
- *Paralelismo*: la constitución 1.8.0 (II.c) exige envío de a uno.

**Una campaña por vez por organización**: índice único parcial
`(organization_id) WHERE status = 'enviando'`. El límite de Exchange es por
buzón; dos campañas en paralelo desde el mismo buzón se repartirían el cupo y
dispararían 429. La segunda recibe 409 `otra_campana_enviando`.

**Ritmo**: `MARKETING_SEND_PAUSE_MS` (default 2000, 0 solo en pruebas): 500
destinatarios ≈ 17-20 min, dentro de SC-002 (< 30 min).

---

## R2 — Buzón de marketing: misma credencial M365, buzón por organización en la base

**Qué hay hoy**

- `src/lib/env.ts:46-64` y `src/lib/m365/client.ts:48-64` — la credencial
  (tenant, client id, secret) y el buzón `M365_SENDER` salen del entorno. No hay
  pantalla de M365: `/api/settings/areas/route.ts:32` solo expone el booleano
  `m365Configured`.
- `src/lib/m365/client.ts:149-170` — el remitente es siempre `config.sender`.
- `src/app/api/dev/m365-mock/[...path]/route.ts` guarda cada `sendMail` con su
  `from` (el buzón de la URL); `fail/route.ts` fuerza un 500.

**Decisión**

- La **credencial** sigue en el entorno (una sola app de Entra ID; sin
  credenciales nuevas, constitución II "ninguna dependencia nueva").
- El **buzón de marketing**, el **nombre del remitente** y el **pie** (dirección
  y dato de contacto) viven en `marketing_settings` (una fila por
  organización), editables desde `/settings/marketing` con
  `marketing.configurar`. No son secretos: una dirección de correo no se cifra.
- `sendMail` acepta dos campos opcionales: `sender` (buzón emisor; default
  `config.sender`) y `fromName`. El correo de campaña pasa siempre el buzón de
  marketing; ningún correo operativo lo hace (test estructural).
- **Separado (1.8.0 II.a)**: el servidor rechaza con 422
  `buzon_no_separado` un buzón igual a `M365_SENDER` (comparado normalizado).
- **Probar el buzón (US5)**: `POST /api/settings/marketing/test` manda un correo
  de control DESDE el buzón de marketing A la dirección de quien prueba. Si
  Graph responde 202, se guarda `verified_at` y `verified_sender`; si no, se
  guarda `last_test_error` con el mensaje traducido (403 → "El sistema no tiene
  permiso para enviar desde ese buzón: hay que incluirlo en la
  ApplicationAccessPolicy") y la configuración queda **no verificada**.
  Cambiar el buzón borra la verificación. Enviar una campaña exige
  `verified_sender = sender_email`.
- El mock gana un modo `throttle` (`POST /api/dev/m365-mock/fail`
  `{ throttle: n }` → los próximos *n* `sendMail` responden 429 con
  `Retry-After: 1`) y un modo `deny` (403) para el camino infeliz del buzón.

**Riesgo registrado (VII)**: Exchange Online suele mostrar el nombre para
mostrar del buzón e ignorar `from.name` en `sendMail`. El nombre configurado
se manda igual, pero el `quickstart` y la pantalla le dicen al dueño que
ponga ese mismo nombre al buzón compartido en el centro de administración.

**Alternativas descartadas**

- *Variable de entorno `M365_MARKETING_SENDER`*: exige redeploy para cambiar
  algo que el dueño decide y no permite "probar" desde la pantalla (US5).
- *Una segunda app de Entra ID*: más credenciales sin ganar aislamiento; la
  `ApplicationAccessPolicy` ya acota los buzones de la app.

---

## R3 — Imágenes: volumen propio, ruta pública con token imposible de adivinar

**Qué hay hoy**

- `src/components/workshops/workshop-image-field.tsx:19,97,116` sube por
  `PUT /api/courses/[id]/image` (multipart, `file`), acepta JPG/PNG/WebP hasta
  5 MB.
- `src/server/course-image.ts:31-49` valida con `MEDIA_LIMITS.image`
  (`src/server/whatsapp/media.ts:22-29`: `image/(jpeg|png|webp)`, 5 MB) y
  guarda con `saveMediaFile(org, assetId, data)` en `MEDIA_DIR/<org>/<assetId>`
  (`media.ts:96-111`, con `assertSafeSegment`). El MIME se deduce de los bytes
  (`sniffImageMime`, `course-image.ts:55-70`), no del encabezado del cliente.
- `src/app/api/public/courses/[id]/image/route.ts:14-30` — sin sesión, con
  alcance vía `withOrganization(…, resolveSoleOrganizationId)` (`src/lib/api.ts:99`),
  `cache-control: immutable` y `x-content-type-options: nosniff`.

**Decisión**

- Tabla `marketing_image` (id, campaña dueña, `public_token`, mime, bytes). El
  archivo va con `saveMediaFile(org, "marketing-image-<id>")`, igual que la
  portada del curso. Mismos límites (`MEDIA_LIMITS.image`) y el tipo se valida
  por **bytes** (`sniffImageMime`) además del encabezado: un `.png` que no lo es
  responde 422.
- **Dirección pública**: `GET /api/public/marketing/images/<public_token>`,
  con `public_token` = 32 bytes aleatorios (`randomBytes`) en base64url (256
  bits), `UNIQUE`. El id interno (`mimg_…`) nunca aparece en el correo. Mismas
  cabeceras que la portada. Una imagen de otra organización o borrada → 404.
- **Vida (FR-007b)**: la imagen cuelga de la campaña (`on delete cascade`).
  Solo se puede borrar una campaña en borrador; al borrarla, el servidor borra
  también los archivos. Una campaña enviada no se borra en esta etapa, así que
  sus imágenes viven mientras ella exista.
- Copiar una imagen de otra campaña no está en el alcance (se vuelve a subir).

**Alternativas descartadas**

- *Servir por el id interno* (como la portada): el id del curso no es secreto
  y la portada es pública a propósito; la imagen de una campaña puede contener
  algo que no es del sitio comercial. Token largo y aleatorio.
- *Incrustar en base64 en el HTML (`data:`)*: Gmail y Outlook web lo bloquean;
  multiplica el peso de cada correo × 500.
- *Adjuntos CID*: complica el adaptador y Outlook los muestra como adjuntos.

---

## R4 — Filtros de audiencia: de dónde sale cada uno

| Filtro (FR-001) | Fuente real | Regla |
|---|---|---|
| Origen | `contact.source` (`schema.ts:196`), `contact_form_submission.source` (`schema.ts:3682-3712`, "formulario:<nombre>", talleres "formulario:Taller <curso>" en `workshops.ts:1117`) | Coincide si el `contact.source` **o cualquier** envío de formulario del contacto tiene uno de los valores elegidos (una persona que volvió por otro formulario también "llegó por" ese). Valores ofrecidos = `DISTINCT` de los dos. |
| Origen "WhatsApp" | `conversation` no de prueba (`schema.ts:1313-1324`). Los contactos que entran por WhatsApp no tienen `source` (`src/server/inbox/` no lo escribe; el seed usa "whatsapp", `seed/academic.ts:182`) | Opción sintética `whatsapp` = tiene al menos una conversación con `is_test = false`, o `source = 'whatsapp'`. |
| Etapa del pipeline | `enrollment.stage_id` (`schema.ts:880`) → `pipeline_stage.kind` (`schema.ts:235-251`, `open/won/lost`) | Alguna inscripción del contacto en una de las etapas elegidas. "Perdido" es la etapa con `kind = 'lost'`. |
| Grupo | `enrollment.cohort_id` (índice `enrollment_org_cohort_idx`) | Alguna inscripción en el grupo, terminado o no (US1-3); incluye las hijas de una especialización. |
| Curso de sus grupos | `enrollment.cohort_id → cohort.course_id` | Alguna inscripción en un grupo de ese curso. |
| Curso de interés | `enrollment.interest_course_id` (`schema.ts:944`, índice :1038) | Algún lead/inscripción con ese curso de interés. Es de la inscripción, NO del contacto. |
| Empresa | `contact.company_id` (`schema.ts:208`) | La empresa del contacto (043). No se mira `enrollment.company_id` (quién factura una venta). |
| Fecha de alta | `contact.created_at` | Rango cerrado `[desde, hasta]` en la zona de la organización, comparado contra el inicio y el fin de cada día. |

**Exclusiones (FR-003, FR-027), en este orden y una sola por persona**:

1. `prueba` — contacto con alguna conversación `is_test = true`. El
   Laboratorio crea sus contactos archivados y sin correo
   (`src/server/lab/runner.ts:240-249`), así que ya caerían por las otras
   reglas; la regla explícita es la garantía de 1.8.0 II.d, no un efecto
   colateral.
2. `baja` — baja de marketing activa por `contact_id` **o** por el correo
   normalizado.
3. `archivado` — `contact.archived_at IS NOT NULL`.
4. `sin_correo` — `email` nulo o que no pasa `z.string().email()`.
5. `duplicado` — segunda persona con el mismo correo normalizado
   (`normalizarCorreo`, `src/lib/contact-identity.ts:35-38`: trim + minúsculas).
   `contact_org_email_uq` (`schema.ts:224-226`) ya impide la mayoría, pero
   compara el texto tal cual; la deduplicación se hace sobre el normalizado.
   Gana el contacto más antiguo.

**Decisión**: los filtros son un objeto Zod versionado (`v: 1`) guardado como
`jsonb` en la audiencia; la consulta se arma en
`src/server/marketing/audiences.ts` con Drizzle + `scoped()` (subconsultas
`EXISTS` por filtro, `AND` entre filtros, `IN` dentro de cada uno). La partición
de exclusiones y la deduplicación son **puras** (`src/lib/marketing/audience.ts`)
para probarlas sin base. Se evalúa al usarse (FR-005); al confirmar el envío
se congela en `marketing_campaign_recipient` (FR-006) junto con los valores de
las variables.

**Alternativas descartadas**: SQL crudo con `sql.raw` (pierde `scoped()` y abre
inyección); guardar la lista al guardar la audiencia (viola FR-005).

---

## R5 — Editor y cuerpo: bloques JSON con el subconjunto de Markdown que ya existe

**Qué hay hoy**

- `src/components/offline-courses/markdown.tsx:1-80` — renderizador propio,
  seguro, SIN dependencia: arma elementos React, solo enlaces `http(s)`,
  títulos `#..###`, listas, negrita, cursiva.
- `src/components/offline-courses/editor/markdown-field.tsx:14-69` —
  `MarkdownField`: `<textarea>` + pestaña "Vista previa" con el mismo
  renderizador.
- `package.json`: no hay ningún editor rico, ni `marked`, ni sanitizador.
- `src/server/email/templates.ts:33-38,72-94` — plantillas HTML en
  `docs/email-templates/`, marcadores `{{x}}` escapados y bloques `{{{x}}}`
  solo de tipo `SafeHtml`.

**Decisión**

- **Sin dependencia nueva.** El cuerpo es una lista de **bloques** validada por
  Zod: `heading` (nivel 1-2), `paragraph`, `list` (con o sin número), `image`
  (`imageId`, `alt`, `href` opcional), `button` (`label`, `url`) y `divider`.
  Dentro de `heading`/`paragraph`/`list` el texto admite el MISMO subconjunto en
  línea que `markdown.tsx`: `**negrita**`, `*cursiva*`, `[texto](https://…)` y
  variables `{{…}}`. El parser en línea se extrae a
  `src/lib/markdown-inline.ts` (puro) y lo usan el renderizador de cursos
  offline y el de correo: una sola gramática.
- **Pegar HTML (FR-010, US2-4)**: el editor usa `<textarea>` por bloque (como
  `MarkdownField`), no `contentEditable`: el navegador pega texto plano por
  construcción. Del lado del servidor, todo lo que no entra en el esquema se
  rechaza (422) y todo texto se escapa al renderizar: un `<script>` escrito en
  un párrafo llega como texto.
- **Variables (FR-008)**: `{{nombre}}`, `{{apellido}}`, `{{curso_de_interes}}`,
  con alternativa en línea `{{nombre|colega}}`. Sin alternativa, se usa la de
  la lista (`nombre` → "", `curso_de_interes` → "nuestros cursos"); la llave
  cruda nunca llega al correo. Una variable desconocida → 422
  `variable_desconocida` con su nombre. `curso_de_interes` = el curso de
  interés del lead más reciente del contacto, congelado al confirmar.
- **Enlaces (Edge "dirección insegura")**: solo `https:` (y `mailto:` en
  párrafos); `http:`, `javascript:`, `data:` o una URL que no parsea → 422
  `enlace_invalido` con el bloque. Máximo 60 bloques y 20 000 caracteres.
- **HTML de correo**: `renderCampaignEmail(body, vars, ctx)` en
  `src/lib/marketing/render-email.ts` (puro) produce el HTML con **estilos en
  línea** y maquetación en tablas de 600 px (lo único que Outlook respeta). Los
  tokens CSS no existen en un cliente de correo: el color sale de
  `getBranding(org).accent` (`src/server/branding.ts:23`) pasado por
  `resolveAccentSet(accent, "light")` (`src/lib/branding.ts:152`), que ya
  garantiza 4.5:1 sobre fondo claro; los grises son constantes de ese módulo.
  Los hex viven en un `.ts` de `src/lib`, fuera del alcance de
  `tema-oscuro.test.ts` (que revisa `.tsx`, línea 58), igual que las plantillas
  de `docs/email-templates/`. El armazón (encabezado con el nombre de la
  academia, pie con remitente, dirección, contacto y "No quiero recibir más
  correos") es la plantilla nueva `docs/email-templates/campana-marketing.html`
  con `{{{cuerpo}}}`; el pie no es editable (FR-011).
- **Vista previa = el correo**: la ruta de vista previa devuelve el MISMO HTML
  que se enviaría (con los enlaces sin rastrear) y la pantalla lo muestra en un
  `<iframe sandbox srcdoc>` sin scripts.

**Alternativas descartadas**

- *TipTap / Lexical / Slate*: 100-300 kB en el cliente, un modelo
  `contentEditable` que hay que volver a sanear del lado del servidor, y HTML
  libre de entrada, justo lo que FR-010 excluye.
- *Markdown libre en un solo campo*: no tiene forma natural para "imagen" y
  "botón" con su enlace; los bloques sí, y se validan uno por uno.
- *`marked` + `sanitize-html`*: dos dependencias para hacer lo que ya hace
  `markdown.tsx`.

---

## R6 — Enlace de baja: HMAC por destinatario, sin login y en dos pasos

**Qué hay hoy**: `src/lib/crypto/index.ts:24-50` (AES-256-GCM con
`ENCRYPTION_KEY`); `timingSafeEqual` en `src/server/bot/auth.ts:25-27`. No hay
firmas HMAC de enlaces.

**Decisión**

- Token = `<recipientId>.<firma>`, con
  `firma = base64url(HMAC-SHA256(k, "baja:v1:" + recipientId))` y
  `k = HKDF-SHA256(ENCRYPTION_KEY, info = "cadit:marketing-links:v1")`. Se
  verifica con `timingSafeEqual`. Va en `src/lib/marketing/link-token.ts`
  (puro, recibe la clave). Cumple 1.8.0 II.b ("enlace firmado"): propio de cada
  destinatario e imposible de fabricar para otro (FR-012).
- Página pública `src/app/baja/[token]/page.tsx` (fuera de `(app)`, como
  `src/app/verificar/[code]/page.tsx`). La organización se resuelve con
  `resolveSoleOrganizationId` y todo corre en `withOrganizationScope` (sin
  sesión). Un token alterado, de otra organización o inexistente muestra el
  mismo texto neutro ("Este enlace no es válido") y **no revela de quién es**
  (US4-2).
- **Dos pasos**: GET muestra "¿No querés recibir más correos de <academia>?" y
  un botón; POST `/api/public/marketing/unsubscribe` registra la baja. Los
  filtros de seguridad de correo (Defender Safe Links, Mimecast) abren los
  enlaces con GET al recibirlos: una baja por GET daría de baja a destinatarios
  que nunca hicieron clic. Ver **P-01** en plan.md.
- Registrar es idempotente: si ya hay baja activa para ese correo, responde lo
  mismo. Guarda contacto, correo normalizado, campaña y destinatario de origen.
- Rate limit en el POST (`checkRateLimit`, `src/lib/rate-limit.ts:24`), como
  los formularios públicos.

**Alternativas descartadas**

- *Token aleatorio guardado (hash) en la fila*: equivalente en seguridad,
  pero agrega una columna e índice por destinatario para lo que una HMAC hace
  sin estado.
- *Firmar con `BETTER_AUTH_SECRET`*: mezclar la clave de sesiones con enlaces
  públicos; si se rota una, se rompe la otra.
- *`List-Unsubscribe` / one-click RFC 8058*: Graph `sendMail` solo acepta
  cabeceras `X-…` en `internetMessageHeaders`; no se puede mandar
  `List-Unsubscribe`. Queda registrado como limitación (plan, riesgos).

---

## R7 — Rastreo de clics: solo destinos guardados de la campaña

**Decisión**

- Al confirmar el envío, cada URL distinta del cuerpo (botones, enlaces en
  línea, `href` de imagen) se guarda en `marketing_campaign_link` con su
  posición. El HTML de cada destinatario reemplaza la URL por
  `/api/public/marketing/click/<token>/<linkId>`, con
  `token = <recipientId>.<HMAC("clic:v1:" + recipientId)>` (otro propósito,
  así un token de clic no sirve para dar de baja).
- La ruta verifica la firma, busca el destinatario y el enlace **de la misma
  campaña** y responde `302 Location: <url guardada>`. Cualquier otra cosa →
  404 neutro. Nunca se redirige a una URL que venga en el pedido (FR-023: no
  hay redirección abierta posible).
- Registra `marketing_click` (destinatario, enlace, fecha). Un clic con firma
  válida pero de una campaña cancelada o un destinatario no enviado redirige
  igual y no suma.
- Los `mailto:` no se rastrean. FR-024: no hay píxel de apertura.
- **Riesgo**: los mismos escáneres de R6 "hacen clic". Se mitiga ignorando un
  segundo clic del mismo destinatario al mismo enlace en < 10 s; las personas
  únicas (FR-022) son la métrica fiable.

---

## R8 — Capacidades y roles

**Qué hay hoy**: lista cerrada `src/lib/capabilities.ts:14-108`; respaldo
`ROLE_CAPABILITIES` (:190-206); `SYSTEM_ROLES` (:230-345) con filtros por
exclusión (`sinAreas`, `sinFacturacion`…); la 0063 suma una capacidad a roles
existentes por `key` con `jsonb_build_array` (`drizzle/0063_facturacion.sql`,
`update "role" … where "key" = … and not (capabilities @> …)`). La 0061 creó
Ventas. `tests/unit/rol-ventas.test.ts` fija lo que Ventas puede.

**Decisión**: tres capacidades nuevas.

| Capacidad | Qué abre | Dirección | Coordinación | Ventas | Soporte | Administración |
|---|---|---|---|---|---|---|
| `marketing.ver` | `/marketing`: audiencias, campañas, destinatarios y métricas | ✅ | ✅ | ✅ | — | — |
| `marketing.enviar` | crear/editar audiencias y campañas, subir imágenes, prueba, enviar y cancelar | ✅ | ✅ | ✅ | — | — |
| `marketing.configurar` | `/settings/marketing` (buzón, remitente, pie, probar) y revertir una baja | ✅ | — | — | — | — |

- `SYSTEM_ROLES`: Dirección recibe todo (`CAPABILITIES`); Coordinación suma un
  filtro `sinConfigurarMarketing`; Soporte suma `sinMarketing` (las tres);
  Ventas y Administración son listas explícitas (Ventas suma `.ver` y
  `.enviar`; `rol-ventas.test.ts` se actualiza). Respaldo: `owner`/`member`
  todo, `soporte` sin marketing.
- Migración 0071: suma por `key` a los roles de sistema existentes con el mismo
  `update … where not (capabilities @> …)` re-ejecutable; los roles creados a
  mano no se tocan.
- **Revertir una baja** es `marketing.configurar`: deshace una oposición
  expresa del destinatario (Ley 18.331), así que es de quien dirige.
- La lectura de la baja en la ficha viaja con `contactos.ver`, como el resto de
  la pestaña Seguimiento (`src/server/seguimiento.ts:99-104`): fecha y nombre de
  campaña no son plata ni datos nuevos de la persona.
- `marketing.ver` lista nombre y correo de cientos de contactos: por eso no es
  de Soporte ni de Administración por defecto. El dueño la reparte en
  `/settings/roles`.

---

## R9 — Navegación, guía y ajustes

- `src/lib/nav.ts:60` (`NAV_GROUPS`) — grupo "CRM" (:68-82, Bandeja,
  Pipeline, Contactos, Empresas): se agrega `{ href: "/marketing", label:
  "Marketing", icon: Megaphone, capability: "marketing.ver" }` después de
  Empresas.
- `src/lib/nav.ts:269` (`SETTINGS_TABS`) — pestaña `{ href:
  "/settings/marketing", label: "Marketing", capability:
  "marketing.configurar" }`. `settings/layout.tsx:27` deja entrar a quien tenga
  al menos una pestaña, así que no se toca.
- `src/lib/guia.ts` — `Record<Capability, EntradaGuia>` exhaustivo: no compila
  sin las tres entradas. `marketing.ver` y `.enviar` → `donde: "/marketing"`;
  `marketing.configurar` → `"/settings/marketing"`. `tests/unit/guia.test.ts`
  (:177-250) exige que todo ítem del menú con capacidad esté en la guía.
- `src/components/settings/roles-client.tsx:31` — `CAPABILITY_LABELS`: rótulos
  cortos para las tres.

---

## R10 — La baja en la ficha del contacto

- `src/server/seguimiento.ts:85-88,104-167` — `SeguimientoDto` gana
  `marketing: { estado: "suscripto" } | { estado: "baja"; desde: string;
  campana: string | null; revertible: boolean }`, y la línea de tiempo suma
  las entradas "Se dio de baja de marketing (campaña X)" y "<persona> reactivó
  los correos de marketing".
- Revertir: `DELETE /api/contacts/[id]/marketing-unsubscribe`
  (`marketing.configurar`) marca `reverted_at/_by`; nunca borra la fila.

---

## R11 — Rutas públicas y tests de estructura

- `tests/unit/route-capabilities.test.ts:39-48` (`SIN_CAPACIDAD`) suma, con
  motivo: `public/marketing/images/[token]/route.ts`,
  `public/marketing/unsubscribe/route.ts`,
  `public/marketing/click/[token]/[linkId]/route.ts`.
- `tests/unit/rls-cobertura.test.ts:71-127` detecta toda tabla con
  `organizationId` y exige `create policy tenant_isolation on "<tabla>"` en
  alguna migración: la 0071 los escribe a mano para las ocho tablas.
- Test estructural nuevo `tests/unit/marketing-guard.test.ts`: (a)
  `src/server/email/**`, `src/server/bulk-sends.ts` y los avisos internos no
  importan nada de `src/server/marketing` (la baja no toca el correo operativo,
  FR-014); (b) solo `src/server/marketing/send.ts` pasa `sender` a `sendMail`;
  (c) la única función que arma destinatarios (`evaluarAudiencia`, en
  `src/server/marketing/audiences.ts`) aplica siempre la condición de prueba,
  y el envío no tiene otro camino para obtener destinatarios.
