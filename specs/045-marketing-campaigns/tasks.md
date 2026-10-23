---

description: "Lista de tareas de 045 — Marketing: campañas por correo (etapa 1)"
---

# Tasks: Marketing — campañas por correo (etapa 1)

**Input**: documentos de diseño en `/specs/045-marketing-campaigns/`

**Prerequisites**: [plan.md](./plan.md) (incluidas las "Decisiones del dueño"),
[spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/),
[quickstart.md](./quickstart.md), constitución 1.8.0.

**Tests**: TDD estricto. Toda unidad de lógica tiene ANTES una tarea que
escribe el test en `tests/unit/` y lo deja en ROJO; la tarea de
implementación que le sigue lo pone en verde. El dueño decidió **no correr
E2E en vivo** en esta etapa: no hay tareas de ejecución E2E (solo una tarea
OPCIONAL de escribir la sección del arnés, sin correrla).

**Organization**: tareas agrupadas por historia de usuario. US1–US4 son P1 y
juntas forman el MVP (una campaña no se puede enviar legalmente sin bajas);
US5 es P2.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se puede hacer en paralelo (archivos disjuntos, sin dependencias pendientes)
- **[Story]**: historia a la que pertenece (US1…US5); solo en las fases de historia
- Cada tarea nombra el archivo exacto, la función/ruta/tabla, la regla que
  impone y el requisito que cumple (FR-###)

## Reglas del proyecto que toda tarea respeta

- **Capacidades, no roles**: toda ruta de staff usa `requireCapability("<cap>")`;
  jamás `session.role === …`. `tests/unit/route-capabilities.test.ts` falla si
  una ruta nueva no declara capacidad.
- **RLS**: toda tabla de dominio lleva `organization_id` NOT NULL, índice
  org-first y la política `tenant_isolation` escrita A MANO en la migración
  (`db:generate` no la genera); `tests/unit/rls-cobertura.test.ts` lo exige.
  Consultas con `scoped()` de `src/lib/db/tenant.ts`.
- **Rutas públicas** (`src/app/api/public/**`): sin sesión, envueltas en
  `withOrganization(…, resolveSoleOrganizationId, …)` /
  `withOrganizationScope`; `tests/unit/rutas-publicas-rls.test.ts` lo exige.
  Ausencia = 404 neutro, nunca 403.
- **Trabajo en segundo plano**: se agenda con `onAfterCommit()`; una tarea
  suelta no ve filas sin confirmar. Si un handler debe revertir, LANZA; devolver
  una `Response` de error no revierte.
- **Colores**: ningún hex ni clase de paleta en `.tsx`
  (`tests/unit/tema-oscuro.test.ts`); el contraste se calcula con
  `contrastRatio()` (`tests/unit/contraste.test.ts`). Los hex del correo viven
  en `src/lib/marketing/render-email.ts` (un `.ts`), no en componentes.
- **Copia de UI**: voseo institucional; el término visible es "grupo" (no
  "cohorte") y "curso".

---

## Phase 1: Setup (infraestructura compartida)

**Purpose**: variables de entorno del ejecutor de campañas.

- [x] T001 Escribir el test en rojo `tests/unit/marketing-env.test.ts`: `MARKETING_SEND_PAUSE_MS` vale 2000 por defecto y acepta 0; `MARKETING_TICK_SEC` vale 60 por defecto y acepta 0 (= solo al arrancar); un valor negativo o no numérico se rechaza (data-model §10, SC-002)
- [x] T002 Agregar `MARKETING_SEND_PAUSE_MS` (default 2000) y `MARKETING_TICK_SEC` (default 60) al esquema Zod de `src/lib/env.ts`, junto a `BULK_SEND_PAUSE_MS`, hasta poner verde T001
- [ ] T003 [P] **(PENDIENTE: quien implementó no tiene acceso a `.env*`; queda para el dueño. Texto sugerido: `# 045 — Pausa entre correos de una campaña (2000 ≈ 30/min, límite de Exchange por buzón; 0 solo en pruebas)` + `MARKETING_SEND_PAUSE_MS=2000`, y `# 045 — Segundos entre pasadas que retoman campañas (0 = solo al arrancar)` + `MARKETING_TICK_SEC=60`. Los defaults del esquema ya cubren su ausencia.)** Documentar `MARKETING_SEND_PAUSE_MS` y `MARKETING_TICK_SEC` con guía inline `#` en `.env.example` (2000 en producción ≈ 30 correos/min, el límite de Exchange por buzón; 0 solo en pruebas), sin secretos nuevos (la firma de enlaces deriva de `ENCRYPTION_KEY`)

---

## Phase 2: Foundational (prerrequisitos bloqueantes)

**Purpose**: tablas, RLS, capacidades, prefijos, navegación, guía, lectura de
ajustes y firmas de enlaces. Todo lo demás depende de esto.

**⚠️ CRITICAL**: ninguna historia empieza hasta cerrar esta fase.

### Tests de la fundación (escribir primero, en rojo)

- [x] T004 [P] Escribir el test en rojo `tests/unit/migracion-marketing.test.ts` que lee `drizzle/0071_campanas_de_marketing.sql` y exige: las 8 tablas (`marketing_settings`, `marketing_audience`, `marketing_campaign`, `marketing_campaign_recipient`, `marketing_campaign_link`, `marketing_click`, `marketing_unsubscribe`, `marketing_image`) con `create table if not exists`; para CADA una `enable row level security`, `drop policy if exists tenant_isolation` y `create policy tenant_isolation … using/with check (organization_id = current_setting('app.current_org', true))`; FKs y CHECKs dentro de bloques `do $$` contra `pg_constraint`; índices `if not exists`, incluidos el único parcial `marketing_campaign_one_sending_uq … where status = 'enviando'` (DV-005), `marketing_unsub_org_email_active_uq … where reverted_at is null` (DV-011), `marketing_recipient_campaign_email_uq (campaign_id, email)` (FR-004) y `marketing_audience_org_name_uq (organization_id, lower(name))`; CHECK de `status` de campaña y de destinatario y de `mime_type` de imagen; ningún `do update` (re-ejecutable, constitución IV; FR-026)
- [x] T005 [P] Agregar `migracion("0071_campanas_de_marketing.sql")` a la lista `GRANTS` de `tests/unit/seed-roles.test.ts` con el comentario "045 — `marketing.ver`/`.enviar` (dirección, coordinación, ventas) y `marketing.configurar` (dirección)", de modo que el rol sembrado + los grants posteriores deban coincidir con `SYSTEM_ROLES` (queda en rojo hasta T013/T014; FR-025, DV-014)
- [x] T006 [P] Extender `tests/unit/rol-ventas.test.ts`: Ventas tiene `marketing.ver` y `marketing.enviar` y NO tiene `marketing.configurar` (FR-025, decisión P-02 del dueño)
- [x] T007 [P] Extender `tests/unit/capabilities.test.ts`: `CAPABILITIES` contiene `marketing.ver`, `marketing.enviar` y `marketing.configurar`; en `SYSTEM_ROLES` Dirección tiene las tres, Coordinación tiene `.ver` y `.enviar` pero no `.configurar`, Soporte y Administración no tienen ninguna; en el respaldo `ROLE_CAPABILITIES` `owner`/`member` tienen todo y `soporte` ninguna de marketing (FR-025, DV-014)
- [x] T008 [P] Escribir el test en rojo `tests/unit/marketing-nav.test.ts`: `NAV_GROUPS` (grupo "CRM") contiene `{ href: "/marketing", label: "Marketing", capability: "marketing.ver" }` inmediatamente después de "Empresas"; `SETTINGS_TABS` contiene `{ href: "/settings/marketing", label: "Marketing", capability: "marketing.configurar" }`; en `src/lib/guia.ts` `marketing.ver` y `marketing.enviar` tienen `donde: "/marketing"` y `marketing.configurar` tiene `donde: "/settings/marketing"` (complementa `tests/unit/guia.test.ts`, que exige que todo ítem del menú con capacidad esté en la guía)
- [x] T009 [P] Escribir el test en rojo `tests/unit/marketing-token.test.ts` para `src/lib/marketing/link-token.ts`: `derivarClave(encryptionKey)` usa HKDF-SHA256 con `info = "cadit:marketing-links:v1"` y es determinística; `firmarBaja(clave, recipientId)` produce `<recipientId>.<base64url(HMAC-SHA256(k, "baja:v1:" + recipientId))>` y `verificarBaja` devuelve el `recipientId`; un carácter alterado, una firma de otro destinatario, un token sin punto, vacío o de largo distinto devuelve `null` sin lanzar (comparación con `timingSafeEqual`); un token de clic (`firmarClic`, propósito `"clic:v1:"`) NO verifica como baja y viceversa (FR-012, DV-012, research R6/R7)
- [x] T010 [P] Escribir el test en rojo `tests/unit/marketing-ajustes.test.ts` (parte de lectura) para `src/server/marketing/settings.ts`: `preparacionParaEnviar(settings, m365Configured)` devuelve `{ ok, missing }` con `"buzon"` si falta `sender_email`/`sender_name`/`footer_address`/`footer_contact`, `"buzon_sin_verificar"` si `verified_sender !== sender_email`, `"m365"` si M365 no está configurado, y `ok: true` solo sin faltantes; `toMarketingSettingsDto` nunca incluye la credencial de M365 (solo `m365Configured: boolean`) y calcula `verified` y `ready`; `getMarketingSettings(orgId)` con dobles de base devuelve todo `null` si no hay fila (contracts/marketing-settings.md; constitución I; FR-016)

### Implementación de la fundación

- [x] T011 [P] Agregar los prefijos `marketingSettings: "mks"`, `marketingAudience: "mka"`, `marketingCampaign: "mkc"`, `marketingCampaignRecipient: "mkr"`, `marketingCampaignLink: "mkl"`, `marketingClick: "mkk"`, `marketingUnsubscribe: "mku"`, `marketingImage: "mki"` en `src/lib/db/ids.ts` (data-model, encabezado)
- [x] T012 Declarar las 8 tablas de data-model §1–§8 en `src/lib/db/schema.ts` (`marketingSettings`, `marketingAudience`, `marketingCampaign`, `marketingCampaignRecipient`, `marketingCampaignLink`, `marketingClick`, `marketingUnsubscribe`, `marketingImage`) con `organizationId` NOT NULL → `organization` en cascada, las FKs con su `on delete` exacto (`contact_id` de destinatario y de baja `set null`; `campaign_id` de destinatario/enlace/clic/imagen `cascade`; `audience_id` `set null`), los índices org-first, los únicos (incluidos los parciales) y los CHECKs; tipos inferidos exportados (FR-026)
- [x] T013 **(Desvío: un `update` por rol y capacidad con `where "key" = …`, como la 0063, en vez de `in (…)`: `seed-roles.test.ts` lee los grants sentencia por sentencia y solo reconoce `=`. Verificada en un PostgreSQL descartable: 0000→0071 con el migrador y la 0071 re-ejecutada dos veces sin error. No se aplicó a las bases locales: `db:migrate` lee `.env`.)** Crear `drizzle/0071_campanas_de_marketing.sql` (con `pnpm db:generate` como base y su entrada en `drizzle/meta/_journal.json` + snapshot) y completarla a mano: `if not exists` en tablas e índices, FKs y CHECKs en `do $$ … pg_constraint`, RLS + `tenant_isolation` para las 8 tablas, y los grants por `key` con `update "role" set "capabilities" = "capabilities" || jsonb_build_array('<cap>'), "updated_at" = now() where "key" in (…) and not ("capabilities" @> jsonb_build_array('<cap>'))` — `marketing.ver` y `marketing.enviar` para `direccion`, `coordinacion`, `ventas`; `marketing.configurar` solo para `direccion`; los roles creados a mano no se tocan. Pone verdes T004 y `tests/unit/rls-cobertura.test.ts` (FR-025, FR-026, constitución IV)
- [x] T014 Agregar `marketing.ver`, `marketing.enviar` y `marketing.configurar` a la lista cerrada `CAPABILITIES` de `src/lib/capabilities.ts`; en `SYSTEM_ROLES` Dirección recibe todo, Coordinación suma el filtro `sinConfigurarMarketing`, Soporte suma `sinMarketing` (las tres), Ventas suma `.ver` y `.enviar` a su lista explícita y Administración no recibe ninguna; respaldo `ROLE_CAPABILITIES` con `soporte` sin marketing. Pone verdes T005, T006 y T007 (FR-025, DV-014)
- [x] T015 Agregar en `src/lib/guia.ts` (registro exhaustivo `Record<Capability, EntradaGuia>`) las entradas de `marketing.ver` y `marketing.enviar` (`donde: "/marketing"`) y `marketing.configurar` (`donde: "/settings/marketing"`), con una frase que explique qué abre cada una (depende de T014)
- [x] T016 [P] **(Desvío: `guia.test.ts` y `settings-acceso.test.ts` exigen que `/marketing` y `/settings/marketing` existan como página; se adelantan `src/app/(app)/marketing/page.tsx` (vacía, la completa T029) y `src/app/(app)/settings/marketing/page.tsx` de solo lectura (estado del buzón; la completa US5). También se suma `marketing` al grupo "Comercial y financiero" de la guía y de `/settings/roles`.)** Agregar en `src/lib/nav.ts` el ítem `{ href: "/marketing", label: "Marketing", icon: Megaphone, capability: "marketing.ver" }` después de "Empresas" en el grupo CRM de `NAV_GROUPS`, y la pestaña `{ href: "/settings/marketing", label: "Marketing", capability: "marketing.configurar" }` en `SETTINGS_TABS`. Pone verde T008 junto con T015 (depende de T014)
- [x] T017 [P] Agregar rótulos cortos para las tres capacidades en `CAPABILITY_LABELS` de `src/components/settings/roles-client.tsx` ("Ver marketing", "Enviar campañas", "Configurar marketing y revertir bajas") (depende de T014)
- [x] T018 [P] Implementar `src/lib/marketing/link-token.ts` (puro, recibe la clave): `derivarClave`, `firmarBaja`/`verificarBaja`, `firmarClic`/`verificarClic`, con HMAC-SHA256 y `timingSafeEqual` de `node:crypto` y propósitos `"baja:v1:"` y `"clic:v1:"`. Pone verde T009 (FR-012, FR-023)
- [x] T019 Implementar la lectura en `src/server/marketing/settings.ts`: `getMarketingSettings(orgId)` (con `scoped()`), `preparacionParaEnviar(settings, m365Configured)` y `toMarketingSettingsDto(row, { m365Configured, operationalSender })`, usando `getM365Config() !== null` para `m365Configured`. Pone verde T010 (depende de T012; FR-016, constitución I)
- [x] T020 Correr `pnpm typecheck` y `pnpm vitest run tests/unit/{rls-cobertura,seed-roles,rol-ventas,capabilities,guia,marketing-nav,marketing-token,marketing-ajustes,marketing-env,migracion-marketing}.test.ts` y dejar todo en verde antes de abrir cualquier historia

**Checkpoint**: fundación lista. Las historias pueden empezar.

---

## Phase 3: User Story 1 — Armar una audiencia y ver a quién llegaría (Priority: P1) 🎯 MVP

**Goal**: definir filtros de negocio, ver al instante cantidad, lista y
excluidos por motivo, y guardar la audiencia para reusarla (evaluada al usarse).

**Independent Test**: con datos conocidos, combinar origen = un formulario y
etapa = perdido y comprobar que la cantidad, la lista y los excluidos por
motivo (baja, sin correo, archivado) coinciden; guardar la audiencia, sumar un
lead que cumple y verla incluirlo.

### Tests for User Story 1 (escribir primero, en rojo) ⚠️

- [x] T021 [P] [US1] Escribir el test en rojo `tests/unit/marketing-audiencia.test.ts` para `src/lib/marketing/audience.ts`: `AudienceFiltersSchema` es `.strict()` con `v: 1`, listas de 1..200 elementos, `createdFrom <= createdTo` (si no, error) y sin filtros = válido; `particionarAudiencia(candidatos)` asigna UNA sola exclusión por persona en el orden `prueba > baja > archivado > sin_correo > duplicado`, deduplica por correo normalizado (`normalizarCorreo`: trim + minúsculas) dejando al contacto más antiguo, y devuelve `{ recipients, excluded: { prueba, baja, archivado, sin_correo, duplicado }, count }`; `sin_correo` incluye correos que no pasan `z.string().email()`; `MARKETING_RECIPIENT_CAP === 500` y `overCap` es `count > 500`; `rangoDeAlta(createdFrom, createdTo, timeZone)` devuelve el inicio del primer día y el fin del último en la zona de la organización (FR-001, FR-003, FR-004, FR-018, FR-027)
- [x] T022 [P] [US1] Escribir el test en rojo `tests/unit/marketing-audiencias-servidor.test.ts` (dobles de base) para `src/server/marketing/audiences.ts`: `opcionesDeFiltros(orgId)` devuelve listas vacías sin error si no hay formularios, grupos ni empresas e incluye la opción sintética `{ value: "whatsapp", label: "WhatsApp" }`; `crearAudiencia` responde conflicto `duplicate` con nombre repetido sin distinguir mayúsculas; `actualizarAudiencia` exige al menos un campo; `borrarAudiencia` deja `audience_id = NULL` en las campañas y no borra sus filtros copiados; `evaluarAudiencia` siempre aplica la exclusión `prueba` (contacto con conversación `is_test = true`) y la de baja activa por `contact_id` O por correo normalizado, y pagina ordenando por nombre (FR-001…FR-005, FR-027)
- [x] T023 [P] [US1] **(Nota: la lectura de `contact` vive en `candidatosDeAudiencia`, que usan `evaluarAudiencia` y `destinatariosDeAudiencia`; el guard fija esa función. La otra lectura admitida es la de las opciones del filtro de origen, sin correos.)** Crear el guard estructural en rojo `tests/unit/marketing-guard.test.ts`, regla (c): `evaluarAudiencia` en `src/server/marketing/audiences.ts` es la ÚNICA función de `src/server/marketing/**` que arma destinatarios a partir de `contact`, y su código contiene la condición de prueba (`is_test`) y la consulta a `marketing_unsubscribe` (constitución 1.8.0 II.b y II.d; FR-003, FR-027)

### Implementation for User Story 1

- [x] T024 [US1] **(Nota: `rangoDeAlta` devuelve `{ desde, hastaExclusivo }`: el fin del último día es el inicio del día siguiente, exclusivo.)** Implementar `src/lib/marketing/audience.ts` (puro): `AudienceFiltersSchema` (Zod, versión 1), tipos `AudienceFilters`/`ExclusionCounts`, `particionarAudiencia`, `MARKETING_RECIPIENT_CAP = 500` y `rangoDeAlta`. Pone verde T021 (FR-001, FR-003, FR-004, FR-018)
- [x] T025 [US1] Implementar `src/server/marketing/audiences.ts`: `evaluarAudiencia(orgId, filters, { page, pageSize })` con Drizzle + `scoped()` — subconsulta `EXISTS` por filtro, `AND` entre filtros e `IN` dentro de cada uno (origen = `contact.source` o cualquier `contact_form_submission.source`; `whatsapp` = alguna conversación `is_test = false` o `source = 'whatsapp'`; etapa = alguna inscripción en `stage_id`; grupo = alguna inscripción en el grupo, terminado o no, incluidas hijas de especialización; curso = grupo de ese curso; curso de interés = `enrollment.interest_course_id`; empresa = `contact.company_id`; fecha de alta con `rangoDeAlta`), luego `particionarAudiencia`; `destinatariosDeAudiencia(orgId, filters)` (lista completa para confirmar el envío, con `curso_de_interes` del lead más reciente); `opcionesDeFiltros`; y el CRUD `listarAudiencias`, `crearAudiencia`, `obtenerAudiencia`, `actualizarAudiencia`, `borrarAudiencia`. Sin SQL crudo con `sql.raw`. Pone verdes T022 y T023 (FR-001…FR-005, FR-027)
- [x] T026 [P] [US1] Crear `src/app/api/marketing/audiences/options/route.ts` (GET, `requireCapability("marketing.ver")`) y `src/app/api/marketing/audiences/preview/route.ts` (POST, `marketing.ver`, cuerpo Zod `.strict()` `{ filters, page?, pageSize?: 25|50|100 }`, 422 `invalid_body` con `fields`) según contracts/audiences.md (FR-001, FR-002, FR-003)
- [x] T027 [P] [US1] Crear `src/app/api/marketing/audiences/route.ts` (GET `marketing.ver`; POST `marketing.enviar`, 201/409 `duplicate`/422) y `src/app/api/marketing/audiences/[id]/route.ts` (GET `marketing.ver` con `preview` de la primera página; PATCH y DELETE `marketing.enviar`; 404 para id ajeno) según contracts/audiences.md (FR-005)
- [x] T028 [US1] Crear `src/components/marketing/audience-builder.tsx`: selectores múltiples por filtro alimentados por `/options`, rango de fechas, conteo en vivo vía `/preview` (con espera breve tras cada cambio), "N excluidos: … dado de baja, … sin correo, … archivado, … de prueba, … duplicado", lista paginada con nombre y correo, aviso si supera 500, y guardar/renombrar/borrar; solo tokens de color, voseo, "grupo" (FR-001…FR-005, FR-018, SC-001)
- [x] T029 [US1] Crear `src/app/(app)/marketing/page.tsx` (pestañas "Campañas" y "Audiencias"; la de campañas muestra un estado vacío hasta US3) y `src/app/(app)/marketing/audiencias/[id]/page.tsx` (`[id] = "nueva"` para crear), ambas protegidas por `marketing.ver` y mostrando los controles de edición solo con `marketing.enviar` (`sessionCapabilities(session)`) (FR-002, FR-005, FR-025)

**Checkpoint**: US1 se puede demostrar sola: contar, listar y guardar segmentos con excluidos por motivo.

---

## Phase 4: User Story 2 — Redactar el correo y verlo antes de enviar (Priority: P1)

**Goal**: editor de bloques sin HTML libre, imágenes subidas y servidas
públicamente con token, variables con alternativa, vista previa idéntica al
correo y envío de prueba al propio correo.

**Independent Test**: redactar un cuerpo con `Hola {{nombre}}`, previsualizar
con dos contactos (cada uno ve su nombre; sin dato, el texto alternativo) y
enviar una prueba que llega solo a quien la pidió con `[PRUEBA]` (con
`marketing_settings` cargado y verificado por SQL si US5 aún no está).

### Tests for User Story 2 (escribir primero, en rojo) ⚠️

- [x] T030 [P] [US2] Escribir el test en rojo `tests/unit/markdown-inline.test.ts` para `src/lib/markdown-inline.ts`: `parseInline(texto, { esquemas })` reconoce `**negrita**`, `*cursiva*`, `[texto](url)` y `{{var|alt}}` como nodos; un enlace con esquema no permitido queda como texto; `<script>` y cualquier HTML quedan como texto literal. `tests/unit/cursos-offline-markdown.test.ts` debe seguir verde sin cambios (una sola gramática, DV-007; FR-010)
- [x] T031 [P] [US2] Escribir el test en rojo `tests/unit/marketing-cuerpo.test.ts` para `src/lib/marketing/body.ts`: `CampaignBodySchema` acepta solo `heading` (nivel 1|2, ≤ 200), `paragraph` (≤ 3000), `list` (1..30 ítems, ≤ 500 c/u), `image` (`imageId`, `alt`, `href?`), `button` (`label` ≤ 60, `url` https) y `divider`; 0..60 bloques y ≤ 20 000 caracteres; un campo `html` o un tipo desconocido falla; `validarCuerpo(body, subject, imageIds)` devuelve el código `variable_desconocida` con el nombre (solo `nombre`, `apellido`, `curso_de_interes`), `enlace_invalido` con la ruta del bloque para `http:`, `javascript:`, `data:` o URL que no parsea (`mailto:` solo en línea), e `imagen_ajena` para un `imageId` fuera de la campaña; `reemplazarVariables(texto, vars)` usa la alternativa en línea, luego la de la lista (`nombre` → "", `curso_de_interes` → "nuestros cursos") y nunca deja una llave cruda; `extraerEnlaces(body)` devuelve las URLs https únicas en orden (botones, enlaces en línea, `href` de imagen), sin `mailto:` (FR-007, FR-008, FR-010, FR-023)
- [x] T032 [P] [US2] Escribir el test en rojo `tests/unit/marketing-render.test.ts` para `renderCampaignEmail(body, vars, ctx)` de `src/lib/marketing/render-email.ts`: todo texto se escapa (un `<script>` de un párrafo aparece como `&lt;script&gt;`); salida en tablas de 600 px con estilos en línea y sin `<style>` ni `class`; el color del botón sale de `resolveAccentSet(ctx.accent, "light")` y `contrastRatio` contra el fondo es ≥ 4.5; el pie (remitente, dirección, contacto) y el enlace "No quiero recibir más correos" están SIEMPRE, aun con cuerpo vacío; con `ctx.trackLink` cada URL de `extraerEnlaces` se reemplaza por la URL de clic y los `mailto:` no; sin `trackLink` (vista previa/prueba) los enlaces quedan directos y la baja apunta a `ctx.unsubscribeUrl`; las imágenes usan la URL pública absoluta; nunca aparece `{{` en la salida (FR-007, FR-008, FR-011, FR-023)
- [x] T033 [P] [US2] Extender `tests/unit/email-templates.test.ts`: existe `docs/email-templates/campana-marketing.html`, tiene el bloque `{{{cuerpo}}}` y marcadores escapados para remitente, dirección, contacto y la URL de baja en un pie no editable, y `"campana-marketing"` es un `TemplateName` válido de `src/server/email/templates.ts` (FR-011)
- [x] T034 [P] [US2] Extender `tests/unit/m365-client.test.ts`: `sendMail({ …, sender, fromName })` llama a `/users/<sender>/sendMail` y manda `from: { emailAddress: { address: sender, name: fromName } }`; sin `sender` usa `config.sender` exactamente como hoy (los llamadores operativos no cambian; DV-004; FR-016)
- [x] T035 [P] [US2] Escribir el test en rojo `tests/unit/marketing-imagenes.test.ts` (dobles de base y de `saveMediaFile`) para `src/server/marketing/images.ts`: `subirImagen` valida el tipo por bytes con `sniffImageMime` (un `.png` falso → `invalid_body`), aplica `MEDIA_LIMITS.image` (≤ 5 MB), máximo 20 por campaña (`demasiadas_imagenes`), solo en borrador (`campana_no_editable`), guarda como `marketing-image-<id>` y genera un `public_token` de 32 bytes en base64url (43 caracteres, `^[A-Za-z0-9_-]{43}$`); `borrarImagen` responde `imagen_en_uso` si un bloque la usa; `imagenPorToken` devuelve `null` sin consultar la base si el token no tiene esa forma (FR-007a, FR-007b, DV-013)
- [x] T036 [P] [US2] Escribir el test en rojo `tests/unit/marketing-campanas.test.ts` (dobles de base) para `src/server/marketing/campaigns.ts`: `crearCampana` nace en `borrador` y copia los filtros de la audiencia elegida; `actualizarCampana` y `borrarCampana` responden `campana_no_editable` si no es borrador; `borrarCampana` borra antes los archivos de sus imágenes; el DTO trae `readOnly` y `readiness.missing` (`buzon`, `buzon_sin_verificar`, `m365`, `audiencia`, `asunto`, `cuerpo`); `vistaPrevia` usa el primer contacto de la audiencia o el pedido y responde `contact_not_in_audience` si no cumple los filtros o está excluido, y con audiencia vacía usa los textos alternativos; `enviarPrueba` manda SOLO al correo de la sesión con asunto `[PRUEBA] …`, desde el buzón de marketing, no crea destinatarios ni cambia estado ni métricas, responde `buzon_no_listo` con `missing` y respeta el límite de 10 cada 10 minutos por persona (FR-006, FR-009, FR-010; US2-1…US2-4)
- [x] T037 [P] [US2] Sumar a `SIN_CAPACIDAD` de `tests/unit/route-capabilities.test.ts` la excepción `"public/marketing/images/[token]/route.ts": "imagen de campaña pública por token (045)"` (FR-007b)

### Implementation for User Story 2

- [x] T038 [US2] Extraer la gramática en línea de `src/components/offline-courses/markdown.tsx` a `src/lib/markdown-inline.ts` (`parseInline` puro, con esquemas permitidos configurables) y hacer que `markdown.tsx` la use sin cambio de comportamiento. Pone verde T030 (DV-007, FR-010)
- [x] T039 [US2] Implementar `src/lib/marketing/body.ts`: `CampaignBodySchema`, `KNOWN_VARIABLES`, `validarCuerpo`, `reemplazarVariables` y `extraerEnlaces`, apoyado en `parseInline`. Pone verde T031 (depende de T038; FR-007, FR-008, FR-010, FR-023)
- [x] T040 [P] [US2] Crear `docs/email-templates/campana-marketing.html` (armazón de 600 px en tablas con estilos en línea: encabezado con el nombre de la academia, `{{{cuerpo}}}`, pie fijo con remitente, dirección, contacto y "No quiero recibir más correos") y agregar `"campana-marketing"` a `TemplateName` en `src/server/email/templates.ts`. Pone verde T033 (FR-011)
- [x] T041 [US2] Implementar `src/lib/marketing/render-email.ts` (puro): `renderCampaignEmail(body, vars, ctx)` con escape de todo texto, bloques a tablas con estilos en línea, color de `resolveAccentSet(ctx.accent, "light")`, grises como constantes del módulo, plantilla `campana-marketing` y enlaces rastreados opcionales; devuelve `{ subject, html }`. Pone verde T032 (depende de T039 y T040; FR-007, FR-008, FR-011)
- [x] T042 [P] [US2] Agregar a `sendMail` de `src/lib/m365/client.ts` los campos opcionales `sender` (default `config.sender`) y `fromName`. Pone verde T034 (DV-004, FR-016)
- [x] T043 [US2] Crear `src/server/marketing/send.ts` con `enviarCorreoDeMarketing({ sender, fromName, to, subject, html })`, el ÚNICO llamador de `sendMail` que pasa `sender` (buzón de marketing, distinto de `M365_SENDER`) (depende de T042; FR-016, constitución 1.8.0 II.a)
- [x] T044 [P] [US2] **(Nota: se suma `deleteMediaFile` a `src/server/whatsapp/media.ts`; borrar un archivo que ya no existe no es error.)** Implementar `src/server/marketing/images.ts`: `subirImagen`, `borrarImagen`, `borrarImagenesDeCampana` (archivos del disco) e `imagenPorToken`, con `saveMediaFile(org, "marketing-image-<id>")`, `sniffImageMime`, `MEDIA_LIMITS.image`, `randomBytes(32)` en base64url y URL absoluta `APP_BASE_URL + /api/public/marketing/images/<public_token>`. Pone verde T035 (FR-007a, FR-007b)
- [x] T045 [US2] Implementar en `src/server/marketing/campaigns.ts` el borrador: `listarCampanas`, `crearCampana`, `obtenerCampana` (DTO con `readOnly`, `readiness` vía `preparacionParaEnviar` + asunto/cuerpo/audiencia, `images`), `actualizarCampana`, `borrarCampana`, `vistaPrevia` (mismo HTML que se enviaría, enlaces sin rastrear, baja inerte, contacto validado con `evaluarAudiencia`) y `enviarPrueba` (destino = `user.email` de la sesión, prefijo `[PRUEBA] `, baja a `/baja/prueba`, por `enviarCorreoDeMarketing`, `checkRateLimit` 10/10 min). Pone verde T036 (depende de T025, T041, T043, T044; FR-006, FR-009, FR-010)
- [x] T046 [P] [US2] **(Nota: los códigos de error se traducen a HTTP en un solo lugar, `src/server/marketing/http.ts`. La pestaña Campañas ya ofrece "Nueva campaña"; la lista llega en T078.)** Crear `src/app/api/marketing/campaigns/route.ts` (GET `marketing.ver` con `status?`/`page?`; POST `marketing.enviar`) y `src/app/api/marketing/campaigns/[id]/route.ts` (GET `marketing.ver`; PATCH/DELETE `marketing.enviar`, 409 `campana_no_editable`, 422 con los códigos de contracts/campaigns.md) (FR-007, FR-008, FR-021)
- [x] T047 [P] [US2] Crear `src/app/api/marketing/campaigns/[id]/preview/route.ts` (POST `marketing.ver`, cuerpo `{ contactId?, subject?, body? }` validado igual que al guardar) y `src/app/api/marketing/campaigns/[id]/test/route.ts` (POST `marketing.enviar`, cuerpo `{ contactId? }` sin campo de destinatario; 422 `buzon_no_listo`, 429 `too_many_requests`, 502 `envio_fallido` con mensaje legible) (FR-009)
- [x] T048 [P] [US2] Crear `src/app/api/marketing/campaigns/[id]/images/route.ts` (POST multipart campo `file`, `marketing.enviar`, 201 `{ id, url, sizeBytes }`, 400/404/409/422) y `src/app/api/marketing/campaigns/[id]/images/[imageId]/route.ts` (DELETE `marketing.enviar`, 409 `imagen_en_uso`) según contracts/images.md (FR-007a)
- [x] T049 [P] [US2] Crear `src/app/api/public/marketing/images/[token]/route.ts` (GET sin sesión, `withOrganization("public:marketing-imagen", resolveSoleOrganizationId, …)`, token con otra forma → 404 sin tocar la base, cabeceras `content-type` por bytes, `cache-control: public, max-age=31536000, immutable`, `x-content-type-options: nosniff`, `content-disposition: inline`; 404 neutro, nunca 403). Pone verdes T037 y `tests/unit/rutas-publicas-rls.test.ts` (FR-007b)
- [x] T050 [P] [US2] Crear `src/components/marketing/block-editor.tsx`: un `<textarea>` por bloque de texto (pegar = texto plano por construcción), alta/orden/borrado de bloques, subida de imagen con `alt` y `href`, botón con etiqueta y URL, insertar variables `{{nombre}}`/`{{apellido}}`/`{{curso_de_interes|…}}`, errores 422 junto al bloque de su `fields`; solo tokens de color (FR-007, FR-008, FR-010)
- [x] T051 [P] [US2] Crear `src/components/marketing/email-preview.tsx`: muestra el HTML de `/preview` en un `<iframe sandbox srcdoc>` sin `allow-scripts`, con selector de contacto de la audiencia y el asunto ya personalizado (FR-009)
- [x] T052 [US2] Crear `src/components/marketing/campaign-editor.tsx`: nombre, asunto, audiencia, `BlockEditor`, `EmailPreview`, guardar y "Enviar prueba" (muestra "Se envió a <correo>"); en solo lectura si `readOnly` (depende de T050 y T051; FR-007…FR-010)
- [x] T053 [US2] Crear `src/app/(app)/marketing/campanas/[id]/page.tsx` (`[id] = "nueva"` para crear) que monta `CampaignEditor` con `marketing.ver`, editable solo con `marketing.enviar` (FR-025)

**Checkpoint**: US1 + US2: redactar con imágenes y variables, previsualizar y recibir una prueba.

---

## Phase 5: User Story 3 — Enviar la campaña y seguir el resultado (Priority: P1)

**Goal**: confirmar con la cantidad exacta, enviar de a uno desde el buzón de
marketing en segundo plano (idempotente, cancelable, con pausa por límite y
reanudación tras reinicio) y ver destinatarios, métricas y clics.

**Independent Test**: confirmar una campaña a una audiencia de prueba contra el
m365-mock y comprobar con tests de servidor que cada dirección recibe un solo
correo, que la tabla refleja enviados y fallidos, y que un clic válido suma y
redirige al destino guardado.

### Tests for User Story 3 (escribir primero, en rojo) ⚠️

- [x] T054 [P] [US3] Escribir el test en rojo `tests/unit/marketing-transiciones.test.ts` para `src/lib/marketing/transitions.ts`: `puedeTransicionarCampana` permite solo `borrador→enviando`, `enviando→enviada` y `enviando→cancelada` (nada sale de `enviada` ni `cancelada`); `puedeTransicionarDestinatario` permite `pendiente→enviando|omitido|cancelado` y `enviando→enviado|fallido|pendiente`; `clasificarResultado(sendMailResult)` mapea 202 → `{ estado: "enviado" }`, `throttled` → `{ estado: "pendiente", pausaMs: retryAfterMs }`, `mailbox_denied` → `{ detener: true, estado: "pendiente" }` y cualquier otro error → `{ estado: "fallido", motivo }` (FR-017, FR-019, FR-020; DV-002)
- [x] T055 [P] [US3] Extender `tests/unit/m365-client.test.ts`: 429 y 503 devuelven el código `throttled` con `retryAfterMs` leído de `Retry-After` (segundos); 401 y 403 devuelven `mailbox_denied`; otro estado sigue siendo `send_failed` (DV-004)
- [x] T056 [P] [US3] Extender `tests/unit/bulk-sends.test.ts`: `processRecipients` acepta `RecipientRef = { id: string }` genérico con `send(ref)` y conserva el comportamiento (secuencial, registra cada resultado antes del siguiente, un fallo no corta, pausa solo tras un intento real); el envío por grupo sigue pasando `{ id, enrollmentId }` (DV-001)
- [x] T057 [P] [US3] Escribir el test en rojo `tests/unit/marketing-confirmar.test.ts` (dobles de base) para `confirmarEnvio(session, campaignId, expectedCount)` y `cancelarCampana` de `src/server/marketing/campaigns.ts`: el orden de validación es `not_found` → `campana_no_editable` → `buzon_no_listo` (con `fields`) → `contenido_incompleto` → revalidación del cuerpo → `audiencia_vacia` → `tope_superado` (> 500) → `conteo_cambio` (con `fields.count`) → `otra_campana_enviando`; el éxito congela filtros, `sender_email`, `sender_name` y `footer`, inserta destinatarios `pendiente` con `vars`, `position`, `first_name`, `last_name` y correo normalizado, inserta `marketing_campaign_link` desde `extraerEnlaces`, pone `status = enviando`, `sent_by`, `send_confirmed_at`, `recipient_count`, y agenda `runCampaign` con `onAfterCommit`; `cancelarCampana` pone `cancelada`, `finished_at`, `cancelled_by` y pasa las `pendiente` a `cancelado` en la misma transacción, y responde `no_esta_enviando` si no está enviando (FR-006, FR-018, FR-019, FR-020)
- [x] T058 [P] [US3] **(Nota: el ejecutor toca la base a través de un puerto (`PuertoDeEnvio`); el test usa uno en memoria y `puertoReal` abre su `withOrganizationScope` por paso. Un 429 vuelve a la cola y se reintenta en la ronda siguiente, tras la pausa.)** Escribir el test en rojo `tests/unit/marketing-envio.test.ts` (dobles de base y de `sendMail`) para `runCampaign(orgId, campaignId)` de `src/server/marketing/runner.ts`: sin lease libre sale sin enviar; al tomar el lease las filas `enviando` pasan a `fallido`/`interrumpido` y nunca se reenvían; reclamo atómico `pendiente→enviando` antes de llamar a Graph (sin fila devuelta = se saltea); 202 → `enviado` con `sent_at`; `throttled` → vuelve a `pendiente` y guarda `paused_until`; `mailbox_denied` → `pendiente`, `last_error`, suelta el lease y sale; otro error → `fallido` con motivo y el resto sigue; una baja activa (por contacto o correo) al llegar el turno → `omitido`/`baja`; una cancelación leída antes del siguiente envío corta el bucle; sin pendientes → `enviada`, `finished_at`, lease suelto; nunca dos correos a la misma dirección (FR-013, FR-016, FR-017, FR-020; SC-004; US3-1, US3-2, US3-3, US3-5)
- [x] T059 [P] [US3] Escribir el test en rojo `tests/unit/marketing-resultados.test.ts` (dobles de base) para `metricasDeCampana`, `destinatariosDeCampana` y `enlacesDeCampana` de `src/server/marketing/campaigns.ts`: `pending` suma `pendiente` + `enviando` y la fila `enviando` se muestra como `pendiente`; `unsubscribes` cuenta destinatarios con `unsubscribed_at`; clics totales = `count(*)` y únicos = `count(distinct recipient_id)`; filtros `status`, `clicked`, `q` y `pageSize` 50|100|500 (422 `invalid_query` fuera de eso); un destinatario con `contact_id` nulo se conserva; en borrador la lista viene vacía; `pausedUntil` y `lastError` viajan (FR-021, FR-022)
- [x] T060 [P] [US3] Escribir el test en rojo `tests/unit/marketing-clic.test.ts` (dobles de base) para `registrarClic(token, linkId)` de `src/server/marketing/unsubscribe.ts`: firma inválida, token de baja usado como clic, o enlace de OTRA campaña → `null` (404); destinatario no `enviado` o campaña cancelada → devuelve la URL guardada sin insertar clic; un segundo clic del mismo destinatario al mismo enlace en menos de 10 s no se inserta; nunca se lee una URL del pedido (FR-023; US3-4)
- [x] T061 [P] [US3] Escribir el test en rojo `tests/unit/marketing-scheduler.test.ts` para `startMarketingOnBoot` y `startMarketingScheduler` de `src/server/marketing/runner.ts`: no arrancan si `shouldStartScheduler(process.env)` es falso (tests, `next build`); al arrancar retoman toda campaña `enviando` con lease vencido; con `MARKETING_TICK_SEC = 0` solo corre al arrancar; la periódica retoma también las de `paused_until` cumplido y las detenidas por `mailbox_denied`; un error no tumba el arranque (DV-003; US3-5)
- [x] T062 [P] [US3] Extender `tests/unit/marketing-guard.test.ts`, regla (b): en todo `src/` solo `src/server/marketing/send.ts` pasa `sender` a `sendMail`, y el ejecutor no obtiene destinatarios por otro camino que las filas de `marketing_campaign_recipient` congeladas por `confirmarEnvio` (constitución 1.8.0 II.a; FR-006, FR-016)
- [x] T063 [P] [US3] Sumar a `SIN_CAPACIDAD` de `tests/unit/route-capabilities.test.ts` la excepción `"public/marketing/click/[token]/[linkId]/route.ts": "redirección de clic firmada (045)"` (FR-023)

### Implementation for User Story 3

- [x] T064 [P] [US3] Implementar `src/lib/marketing/transitions.ts` (puro): `puedeTransicionarCampana`, `puedeTransicionarDestinatario` y `clasificarResultado`. Pone verde T054 (FR-017, FR-020)
- [x] T065 [P] [US3] Agregar a `sendMail` de `src/lib/m365/client.ts` los códigos `throttled` (429/503 con `retryAfterMs` de `Retry-After`) y `mailbox_denied` (401/403), sin cambiar el resultado para los demás estados. Pone verde T055 (DV-004)
- [x] T066 [P] [US3] Generalizar `processRecipients` de `src/server/bulk-sends.ts` a `RecipientRef = { id: string }` con `send(ref)`; el envío por grupo pasa `{ id, enrollmentId }` y su `send` lee `ref.enrollmentId`. Pone verde T056 sin cambio de comportamiento (DV-001)
- [x] T067 [US3] Extender `src/server/marketing/send.ts` con `enviarADestinatario(campaign, recipient, ctx)`: arma el correo con `renderCampaignEmail` usando las `vars` congeladas, enlaces rastreados `APP_BASE_URL/api/public/marketing/click/<firmarClic>/<linkId>` y baja `APP_BASE_URL/baja/<firmarBaja>`, y lo manda por `enviarCorreoDeMarketing` con el remitente y pie copiados al confirmar (depende de T018, T041, T065; FR-011, FR-012, FR-016, FR-023)
- [x] T068 [US3] Implementar en `src/server/marketing/campaigns.ts` `confirmarEnvio`, `cancelarCampana`, `metricasDeCampana`, `destinatariosDeCampana` y `enlacesDeCampana` según contracts/send-and-cancel.md y recipients-and-metrics.md; `confirmarEnvio` usa `destinatariosDeAudiencia` (única fuente), `MARKETING_RECIPIENT_CAP`, el índice único parcial para `otra_campana_enviando` y `onAfterCommit(() => runCampaign(orgId, id))`. Pone verdes T057 y T059 (FR-006, FR-018…FR-022)
- [x] T069 [US3] Implementar `src/server/marketing/runner.ts`: `runCampaign` (lease `now() + 2 min` con `UPDATE … WHERE lease_until IS NULL OR lease_until < now()`, filas `enviando` → `fallido`/`interrumpido`, bucle `processRecipients` por `position` que antes de cada destinatario relee el estado, respeta `paused_until`, renueva el lease y consulta la baja activa; reclamo atómico; `enviarADestinatario`; `clasificarResultado`; pausa `MARKETING_SEND_PAUSE_MS`; cierre a `enviada`), cada paso en `withOrganizationScope`; más `startMarketingOnBoot` y `startMarketingScheduler` (`MARKETING_TICK_SEC`). Pone verdes T058, T061 y T062 (depende de T064, T066, T067, T068; FR-013, FR-016, FR-017, FR-020; SC-002, SC-004)
- [x] T070 [US3] Registrar `startMarketingOnBoot()` en `src/instrumentation-node.ts` junto a `startStaffNoticesOnBoot`, con la misma guarda `shouldStartScheduler` y sin poder tumbar el arranque (DV-003; US3-5)
- [x] T071 [P] [US3] Crear `src/app/api/marketing/campaigns/[id]/send/route.ts` (POST `marketing.enviar`, cuerpo `{ expectedCount }`, 202 `{ campaignId, recipientCount }`) y `src/app/api/marketing/campaigns/[id]/cancel/route.ts` (POST `marketing.enviar`, 200 `{ status: "cancelada", cancelled }`, 409 `no_esta_enviando`) (FR-019, FR-020)
- [x] T072 [P] [US3] Crear `src/app/api/marketing/campaigns/[id]/metrics/route.ts`, `src/app/api/marketing/campaigns/[id]/recipients/route.ts` (query Zod `status?`, `clicked?`, `q?` ≤ 100, `page?`, `pageSize?`) y `src/app/api/marketing/campaigns/[id]/links/route.ts`, todas GET con `marketing.ver` (FR-021, FR-022)
- [x] T073 [US3] **(Desvío de orden: `bajaActiva` se crea acá en `src/server/marketing/unsubscribe.ts` porque el ejecutor ya la necesita; T079/T083 la prueban y completan. La firma es `registrarClic(orgId, token, linkId)`.)** Implementar `registrarClic(token, linkId)` en `src/server/marketing/unsubscribe.ts`: `verificarClic`, pareja destinatario–enlace de la MISMA campaña, inserción en `marketing_click` solo si el destinatario está `enviado` y no hubo clic igual en los últimos 10 s; devuelve la URL guardada o `null`. Pone verde T060 (depende de T018; FR-023)
- [x] T074 [US3] Crear `src/app/api/public/marketing/click/[token]/[linkId]/route.ts` (GET sin sesión, `withOrganization("public:marketing-clic", resolveSoleOrganizationId, …)`): 302 `Location: <url guardada>` con `cache-control: no-store` y `referrer-policy: no-referrer`; 404 neutro "Este enlace no es válido." en cualquier otro caso. Pone verdes T063 y `tests/unit/rutas-publicas-rls.test.ts` (depende de T073; FR-023, FR-024)
- [x] T075 [P] [US3] Agregar al m365-mock los modos `throttle: n` (los próximos n `sendMail` responden 429 con `Retry-After: 1`) y `deny: true` (403 `ErrorAccessDenied` hasta apagarlo) en `src/server/dev/m365-mock-state.ts`, `src/app/api/dev/m365-mock/fail/route.ts` y `src/app/api/dev/m365-mock/[...path]/route.ts`; `DELETE /outbox` los apaga; todo detrás de `src/lib/dev-guard.ts` (404 en producción) (quickstart §4)
- [x] T076 [P] [US3] Crear `src/components/marketing/send-dialog.tsx` reusando `ConfirmSendDialog`: "Se enviará a N personas" con el conteo recalculado, "un envío confirmado no se puede deshacer", y ante `conteo_cambio` muestra la cantidad nueva y pide confirmar otra vez; ante `tope_superado` sugiere acotar los filtros (FR-018, FR-019)
- [x] T077 [US3] Crear `src/components/marketing/campaign-results.tsx`: métricas (enviados, fallidos, omitidos, cancelados, bajas, clics totales y personas únicas), aviso "En pausa por el límite del buzón" (`pausedUntil`) y "Detenida: <lastError>", tabla de destinatarios con filtros (estado, hizo clic, búsqueda) y motivo de falla, clics por enlace, botón Cancelar con confirmación, y consulta cada 3 s mientras está `enviando` (como `POLL_MS` de `bulk-sends-panel.tsx`); solo tokens de color (FR-020, FR-021, FR-022)
- [x] T078 [US3] Integrar `SendDialog` y `CampaignResults` en `src/app/(app)/marketing/campanas/[id]/page.tsx` (resultados cuando la campaña no es borrador) y la lista de campañas (nombre, estado, fecha, audiencia, destinatarios) en la pestaña "Campañas" de `src/app/(app)/marketing/page.tsx` (FR-019, FR-021)

**Checkpoint**: US1–US3 completas a nivel de servidor y UI. **No habilitar el envío en producción sin US4** (constitución 1.8.0 II.b).

---

## Phase 6: User Story 4 — Darse de baja y que se respete siempre (Priority: P1)

**Goal**: baja pública en dos pasos con enlace firmado, registrada en el
contacto, respetada por toda audiencia y por el ejecutor, visible en la ficha y
reversible solo con `marketing.configurar`; el correo operativo no se entera.

**Independent Test**: dar de baja con el enlace de un destinatario (GET muestra,
POST registra), comprobar que la ficha lo muestra con fecha y campaña, que una
audiencia nueva lo cuenta como "dado de baja", que el correo de bienvenida
sigue saliendo y que un token alterado no da de baja a nadie.

### Tests for User Story 4 (escribir primero, en rojo) ⚠️

- [x] T079 [P] [US4] Escribir el test en rojo `tests/unit/marketing-baja.test.ts` (dobles de base) para `src/server/marketing/unsubscribe.ts`: `estadoDeEnlaceDeBaja(token)` devuelve `"valido"`, `"ya_dado_de_baja"`, `"prueba"` (token `prueba`) o `"invalido"` — este último IGUAL para firma alterada, destinatario inexistente u otra organización — y nunca devuelve correo ni nombre; `registrarBaja(token)` inserta `marketing_unsubscribe` (contacto, correo normalizado, campaña y destinatario) con `on conflict do nothing` sobre la baja activa por correo, pone `unsubscribed_at` en el destinatario si estaba vacío y es idempotente; `bajaActiva(orgId, { contactId, email })` es verdadera por `contact_id` O por correo normalizado y sobrevive al borrado del contacto; `revertirBaja(session, contactId)` marca `reverted_at`/`reverted_by` sin borrar la fila y devuelve `not_found` si no hay baja activa (FR-012, FR-013, FR-015; DV-010, DV-011; US4-1, US4-2, US4-5)
- [x] T080 [P] [US4] **(Nota: la parte pura (`estadoDeMarketing`, `entradasDeMarketing`) vive en `src/lib/seguimiento.ts`; `armarLineaDeTiempo` acepta un tercer argumento.)** Extender `tests/unit/seguimiento.test.ts`: `SeguimientoDto.marketing` es `{ estado: "suscripto" }` o `{ estado: "baja", desde, campana, revertible }` con `revertible` verdadero solo si la sesión tiene `marketing.configurar`; la línea de tiempo suma `baja_marketing` (con `campaignName`) y `baja_marketing_revertida` (con `authorName`) (FR-013, FR-015; research R10)
- [x] T081 [P] [US4] Extender `tests/unit/marketing-guard.test.ts`, regla (a): ningún archivo de `src/server/email/**`, `src/server/bulk-sends.ts`, `src/server/staff-notices.ts`, `src/server/billing-notices*.ts`, `src/server/lead-notices*.ts` ni `src/server/workshop-notices.ts` importa `@/server/marketing` ni nombra `marketing_unsubscribe`; además `src/app/baja/[token]/page.tsx` no importa `registrarBaja` (el GET nunca escribe) y no muestra correo ni nombre del destinatario (FR-014, SC-005; DV-010)
- [x] T082 [P] [US4] Sumar a `SIN_CAPACIDAD` de `tests/unit/route-capabilities.test.ts` la excepción `"public/marketing/unsubscribe/route.ts": "baja de marketing sin sesión con token firmado (045)"` (FR-012)

### Implementation for User Story 4

- [x] T083 [US4] Implementar en `src/server/marketing/unsubscribe.ts` `estadoDeEnlaceDeBaja`, `registrarBaja`, `bajaActiva`, `revertirBaja` y `estadoDeMarketingDelContacto`, con `verificarBaja` y todo dentro de `withOrganizationScope` para las superficies sin sesión. Pone verde T079 (depende de T018; FR-012, FR-013, FR-015)
- [x] T084 [US4] **(Nota: la regla vive en `src/server/marketing/bajas.ts` (`whereDeBajaActiva` + `bajaActiva`); `unsubscribe.ts` lee el correo de UN contacto por id para revertir y para la ficha, y el guard lo admite solo así.)** Reemplazar la consulta de baja de `evaluarAudiencia` (`src/server/marketing/audiences.ts`) y del ejecutor (`src/server/marketing/runner.ts`) por `bajaActiva`/su condición SQL compartida, para que audiencias y envío usen la MISMA regla (por contacto o por correo normalizado); T022, T023 y T058 siguen verdes (depende de T083; FR-003, FR-013; US3-2, US4-3)
- [x] T085 [P] [US4] Crear `src/app/api/public/marketing/unsubscribe/route.ts` (POST sin sesión, `withOrganization(…, resolveSoleOrganizationId, …)`, cuerpo `{ token }` ≤ 200, `checkRateLimit` con `publicFormRateLimit`, 200 `{ ok: true }` también si ya estaba de baja, 404 `not_found` con el mismo cuerpo para todo motivo, 429). Pone verdes T082 y `tests/unit/rutas-publicas-rls.test.ts` (depende de T083; FR-012, FR-013)
- [x] T086 [P] [US4] Crear la página pública `src/app/baja/[token]/page.tsx` (fuera de `(app)` y `(portal)`, como `src/app/verificar/[code]/page.tsx`) que solo LEE `estadoDeEnlaceDeBaja` y muestra los cuatro textos de contracts/public-unsubscribe.md ("¿No querés recibir más correos de <academia>?" + "Seguirás recibiendo los correos de tus cursos…", "Ya no te enviamos correos de novedades.", "Este es un correo de prueba…", "Este enlace no es válido."), y el componente cliente `src/components/marketing/unsubscribe-confirm.tsx` con el botón "Confirmar la baja" que hace el POST; sin correo ni nombre del destinatario; solo tokens de color (depende de T083; FR-012, FR-014; decisión P-01 del dueño)
- [x] T087 [US4] Extender `src/server/seguimiento.ts`: `SeguimientoDto.marketing` vía `estadoDeMarketingDelContacto` (viaja con `contactos.ver`; `revertible` según `marketing.configurar`) y las entradas `baja_marketing`/`baja_marketing_revertida` en la línea de tiempo. Pone verde T080 (depende de T083; FR-013, FR-015)
- [x] T088 [P] [US4] Crear `src/app/api/contacts/[id]/marketing-unsubscribe/route.ts` (DELETE, `requireCapability("marketing.configurar")`, 200 `{ reverted: true }`, 404 `not_found` para contacto ajeno o sin baja activa) que llama a `revertirBaja` (depende de T083; FR-015)
- [x] T089 [US4] Mostrar en `src/components/contacts/seguimiento-client.tsx` el estado de marketing ("Se dio de baja de marketing el <fecha> desde <campaña>") y el botón "Reactivar correos de marketing" con confirmación solo si `revertible`, más las entradas nuevas de la línea de tiempo; solo tokens de color (depende de T087 y T088; FR-013, FR-015; US4-5)

**Checkpoint**: MVP completo (US1–US4): una campaña se puede enviar cumpliendo la ley y la constitución.

---

## Phase 7: User Story 5 — Configurar el buzón de marketing y el diseño base (Priority: P2)

**Goal**: cargar buzón, remitente y pie desde Ajustes, probar el buzón antes de
usarlo y que el botón Enviar explique qué falta.

**Independent Test**: cargar un buzón, probarlo contra el mock (200 verifica;
`deny` informa el error legible y no verifica); con los ajustes vacíos, la
campaña dice qué falta y enlaza a Ajustes → Marketing.

### Tests for User Story 5 (escribir primero, en rojo) ⚠️

- [x] T090 [P] [US5] Extender `tests/unit/marketing-ajustes.test.ts` (parte de escritura y prueba): `guardarAjustes(session, input)` normaliza `senderEmail`, rechaza con `buzon_no_separado` un buzón igual a `M365_SENDER` (comparado normalizado), borra `verified_sender`/`verified_at` en el mismo `UPDATE` si cambia el buzón, y responde `campana_enviando` si se cambia el buzón con una campaña `enviando`; `probarBuzon(session)` manda "Prueba del buzón de marketing" DESDE el buzón A `user.email`: 202 → `verified_sender`, `verified_at`, `last_test_error = NULL`; 403/`mailbox_denied` → mensaje "…incluirlo en la ApplicationAccessPolicy…"; 404 → "Ese buzón no existe en Microsoft 365."; otro → mensaje de Graph; en todos los fallos guarda `last_test_error` y NO lanza; `sin_buzon` y `m365_no_configurado` como 422 (FR-016; US5-1, US5-2; research R2)
- [x] T091 [P] [US5] **(Nota: este test nace verde: la pestaña y su página existen desde la Fase 2.)** Extender `tests/unit/settings-acceso.test.ts`: con solo `marketing.configurar`, `primerDestinoDeSettings` lleva a `/settings/marketing`; sin ella la pestaña no aparece (FR-025)

### Implementation for User Story 5

- [x] T092 [US5] **(Nota: `sendMail` suma el código `mailbox_not_found` (404) para poder decir "Ese buzón no existe en Microsoft 365."; los demás llamadores no cambian.)** Implementar en `src/server/marketing/settings.ts` `guardarAjustes` (upsert de la fila única por organización, `updated_by`) y `probarBuzon` (vía `enviarCorreoDeMarketing`, traducción de errores, `checkRateLimit` 5 cada 10 min). Pone verde T090 (depende de T043, T065; FR-016)
- [x] T093 [P] [US5] Crear `src/app/api/settings/marketing/route.ts` (GET y PUT con `requireCapability("marketing.configurar")`, cuerpo Zod `.strict()` `{ senderEmail ≤ 200, senderName 1..80, footerAddress 1..200, footerContact 1..200 }`, 200 `MarketingSettingsDto`, 422 `invalid_body`/`buzon_no_separado`, 409 `campana_enviando`) y `src/app/api/settings/marketing/test/route.ts` (POST `marketing.configurar`, 200 `{ ok, sentTo | error }`, 422 `sin_buzon`/`m365_no_configurado`, 429) (FR-016, FR-025)
- [x] T094 [P] [US5] Crear `src/app/(app)/settings/marketing/page.tsx` y `src/components/settings/marketing-settings-client.tsx`: formulario de buzón, remitente y pie, aviso "debe ser distinto de <operationalSender>", estado "Verificado el <fecha>" o el último error legible, botón "Probar el buzón", y la nota de que Exchange suele mostrar el nombre del buzón (decisión P-04); solo tokens de color (FR-011, FR-016; US5-2)
- [x] T095 [US5] En `src/components/marketing/campaign-editor.tsx` y `src/components/marketing/send-dialog.tsx`, deshabilitar "Enviar" cuando `readiness.ok` es falso y listar qué falta (buzón, verificación, M365, audiencia, asunto, cuerpo) con enlace a `/settings/marketing`; mismo tratamiento ante un 422 `buzon_no_listo` (US5-1)

**Checkpoint**: todas las historias funcionan de forma independiente.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: documentación, guía y gate técnico.

- [x] T096 [P] Actualizar `CLAUDE.md`: filas del mapa del código para Marketing (`src/lib/marketing/` + `src/server/marketing/` + `/marketing` + `/api/marketing/*` + `/settings/marketing` + `/api/public/marketing/*` + `/baja/[token]`) y para `src/lib/markdown-inline.ts`; viñeta de Soberanía con la constitución 1.8.0 ítem 3 (buzón separado, baja firmada, tope 500 de a uno, `is_test` jamás); y una sección "Campañas de marketing (ciclo 045)" con las reglas no obvias: `evaluarAudiencia` única fuente, a lo sumo una vez (`interrumpido` no se reintenta), una campaña `enviando` por organización, baja en dos pasos y por contacto O correo, el correo operativo no lee bajas, solo `send.ts` pasa `sender`
- [x] T097 [P] Revisar la redacción final de las tres entradas de marketing en `src/lib/guia.ts` (qué abre cada capacidad, quién la tiene por defecto, que revertir una baja es de Dirección por la Ley 18.331) en voseo institucional
- [ ] T098 [P] **(NO HECHA: opcional y sin E2E en esta etapa por decisión del dueño; queda para cuando se corra el arnés.)** (OPCIONAL) Escribir, SIN correrla, la sección `marketing` del arnés en `scripts/e2e/marketing.mjs` y registrarla en `scripts/e2e-selftest.mjs`, recorriendo los pasos 1–8 y los caminos infelices del quickstart §3–§4 contra el m365-mock
- [x] T099 **(Pendiente de verificación humana: la ApplicationAccessPolicy real de Exchange con el buzón de marketing y el aspecto del correo en Outlook, Gmail y celular, quickstart §6. El build no se corrió en esta etapa.)** Correr el gate `pnpm typecheck && pnpm lint && pnpm test` (si el dev server está levantado, el build va con `NEXT_DIST_DIR=.next-build pnpm build`) y dejarlo verde, incluidos `route-capabilities`, `rls-cobertura`, `rutas-publicas-rls`, `tema-oscuro`, `contraste`, `guia`, `seed-roles` y `rol-ventas`; dejar marcado como "pendiente de verificación humana" lo del quickstart §6 (política de Exchange real, aspecto en Outlook/Gmail/móvil)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias.
- **Foundational (Phase 2)**: depende de Setup. BLOQUEA todas las historias.
- **US1 (Phase 3)**: depende de Foundational.
- **US2 (Phase 4)**: depende de Foundational y de `evaluarAudiencia` de US1 (T025) para la vista previa con un contacto real.
- **US3 (Phase 5)**: depende de US1 (destinatarios) y US2 (render, `send.ts`, `sendMail` con `sender`).
- **US4 (Phase 6)**: depende de Foundational (tabla y `link-token`); T084 depende además de US1 y US3. Se integra en la misma rama que US3 antes de desplegar.
- **US5 (Phase 7)**: depende de Foundational (lectura de ajustes) y de T043/T065 para probar el buzón; la UI de T095 depende de US2/US3.
- **Polish (Phase 8)**: depende de las historias que se entreguen.

### User Story Dependencies

- **US1 (P1)**: independiente tras la fundación.
- **US2 (P1)**: usa la audiencia de US1 para la vista previa; la prueba se puede validar sola con ajustes cargados por SQL.
- **US3 (P1)**: usa US1 + US2.
- **US4 (P1)**: la baja pública y la ficha son independientes; la exclusión unificada (T084) toca US1 y US3.
- **US5 (P2)**: independiente para pantalla y prueba del buzón; el "qué falta" (T095) toca componentes de US2/US3.

### Within Each User Story

- El test se escribe y FALLA antes de su implementación (TDD estricto).
- Puro (`src/lib/marketing/*`) antes que servidor (`src/server/marketing/*`), servidor antes que rutas, rutas antes que UI.
- Las excepciones de `SIN_CAPACIDAD` se escriben antes de crear la ruta pública.

### Parallel Opportunities

- Setup: T003 en paralelo con T001/T002.
- Foundational: los tests T004–T010 en paralelo; luego T011 y T018 en paralelo con T012→T013; T015, T016 y T017 en paralelo después de T014.
- En cada historia, todos los tests marcados [P] en paralelo; rutas de archivos distintos en paralelo.
- US4 (salvo T084) y US5 (salvo T095) pueden avanzar en paralelo con US3 una vez cerrada US2.

---

## Parallel Example: User Story 1

```bash
# Tests en rojo, juntos:
Task: "T021 tests/unit/marketing-audiencia.test.ts"
Task: "T022 tests/unit/marketing-audiencias-servidor.test.ts"
Task: "T023 tests/unit/marketing-guard.test.ts (regla c)"

# Rutas, juntas (después de T025):
Task: "T026 src/app/api/marketing/audiences/{options,preview}/route.ts"
Task: "T027 src/app/api/marketing/audiences/{route.ts,[id]/route.ts}"
```

## Parallel Example: User Story 2

```bash
# Tests en rojo, juntos:
Task: "T030 tests/unit/markdown-inline.test.ts"
Task: "T031 tests/unit/marketing-cuerpo.test.ts"
Task: "T032 tests/unit/marketing-render.test.ts"
Task: "T033 tests/unit/email-templates.test.ts"
Task: "T034 tests/unit/m365-client.test.ts"
Task: "T035 tests/unit/marketing-imagenes.test.ts"
Task: "T036 tests/unit/marketing-campanas.test.ts"
Task: "T037 tests/unit/route-capabilities.test.ts"

# Implementación independiente, junta:
Task: "T040 docs/email-templates/campana-marketing.html + TemplateName"
Task: "T042 src/lib/m365/client.ts (sender/fromName)"
Task: "T044 src/server/marketing/images.ts"

# Rutas y componentes, juntos (después de T045):
Task: "T046 … T049 rutas de campañas, vista previa, prueba, imágenes e imagen pública"
Task: "T050 block-editor.tsx" / "T051 email-preview.tsx"
```

## Parallel Example: User Story 3

```bash
# Tests en rojo, juntos:
Task: "T054 marketing-transiciones" / "T055 m365-client" / "T056 bulk-sends"
Task: "T057 marketing-confirmar" / "T058 marketing-envio" / "T059 marketing-resultados"
Task: "T060 marketing-clic" / "T061 marketing-scheduler" / "T062 marketing-guard" / "T063 route-capabilities"

# Piezas independientes, juntas:
Task: "T064 src/lib/marketing/transitions.ts"
Task: "T065 src/lib/m365/client.ts (throttled/mailbox_denied)"
Task: "T066 src/server/bulk-sends.ts (RecipientRef genérico)"
Task: "T075 m365-mock throttle/deny"
```

## Parallel Example: User Story 4

```bash
# Tests en rojo, juntos:
Task: "T079 tests/unit/marketing-baja.test.ts"
Task: "T080 tests/unit/seguimiento.test.ts"
Task: "T081 tests/unit/marketing-guard.test.ts (regla a)"
Task: "T082 tests/unit/route-capabilities.test.ts"

# Después de T083, juntas:
Task: "T085 src/app/api/public/marketing/unsubscribe/route.ts"
Task: "T086 src/app/baja/[token]/page.tsx + unsubscribe-confirm.tsx"
Task: "T088 src/app/api/contacts/[id]/marketing-unsubscribe/route.ts"
```

## Parallel Example: User Story 5

```bash
# Tests en rojo, juntos:
Task: "T090 tests/unit/marketing-ajustes.test.ts (escritura y prueba)"
Task: "T091 tests/unit/settings-acceso.test.ts"

# Después de T092, juntas:
Task: "T093 src/app/api/settings/marketing/{route.ts,test/route.ts}"
Task: "T094 src/app/(app)/settings/marketing/page.tsx + marketing-settings-client.tsx"
```

---

## Implementation Strategy

### MVP = Foundational + US1 + US2 + US3 + US4

Las cuatro historias P1 son el mínimo para enviar una campaña de forma legal:
sin audiencia no hay a quién, sin editor no hay qué, sin envío no hay campaña y
sin baja la constitución 1.8.0 (II.b) y la Ley 18.331 lo prohíben.

1. Phase 1 (Setup) y Phase 2 (Foundational): migración 0071 con RLS,
   capacidades sembradas, navegación, guía, lectura de ajustes y firmas.
2. Phase 3 (US1) → **se puede demostrar sola**: contar, listar y guardar
   segmentos con excluidos por motivo, sin enviar nada.
3. Phase 4 (US2) → redactar y recibir una prueba (ajustes cargados por SQL
   mientras no esté US5).
4. Phase 5 (US3) + Phase 6 (US4) en la misma rama: **US3 no se habilita en
   producción sin US4**.
5. **STOP y VALIDAR**: gate técnico verde (T099) y los tests de servidor de
   envío, baja y clic.

### Incremental Delivery

1. Setup + Foundational → base lista.
2. US1 → demo de segmentos.
3. US2 → demo de redacción y prueba.
4. US3 + US4 → MVP: primera campaña real a una audiencia chica del equipo.
5. US5 → el dueño configura y prueba el buzón sin tocar la base.
6. Polish → `CLAUDE.md`, guía y gate final.

### Parallel Team Strategy

1. Fundación entre todos.
2. Luego: A en US1 → US3; B en US2; C en US4 (página y ficha) y US5
   (pantalla y prueba del buzón).
3. Integración: T084 (exclusión unificada) y T095 (qué falta) al final.

---

## Notes

- La marca `[P]` = archivos distintos y sin dependencias pendientes.
- La marca `[US#]` mapea la tarea a su historia para trazabilidad.
- Verificar que cada test falla antes de implementar.
- Sin E2E en vivo en esta etapa (decisión del dueño); T098 es opcional y no se corre.
- Lo que no se puede verificar automáticamente (política de Exchange real,
  aspecto del correo en clientes) queda como "pendiente de verificación humana".
- No commitear desde estas tareas sin pedido explícito.
