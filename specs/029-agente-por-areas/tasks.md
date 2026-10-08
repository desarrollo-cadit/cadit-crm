---

description: "Lista de tareas de la feature 029 — Agente por áreas"
---

# Tasks: Agente por áreas — derivación por correo y autoconsulta del alumno

**Input**: Documentos de diseño en `specs/029-agente-por-areas/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md) (DV-001..DV-012), [data-model.md](data-model.md), [contracts/](contracts/) (`agente.md`, `consultas.md`, `api-areas.md`, `correo-derivacion.md`), [quickstart.md](quickstart.md)

**Tests**: SÍ. El proyecto corre **Strict TDD**: en cada fase el test se escribe primero y tiene que **nacer en rojo** antes de la implementación. Los nombres de archivo de test salen de `quickstart.md` §2 y del árbol de `plan.md`.

**Decisión del dueño ya registrada**: Q1 resuelta (2026-10-08) — **solo `Mail.Send`**, sin `Mail.ReadWrite`. El seguimiento sale como `RE: <asunto>` y se agrupa por asunto; las columnas `graph_message_id` / `internet_message_id` / `graph_conversation_id` quedan nulas y reservadas.

**Organization**: tareas agrupadas por historia de usuario para que cada una se implemente y se pruebe por separado.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: puede correr en paralelo (archivos distintos, sin depender de tareas incompletas)
- **[Story]**: historia a la que pertenece (US1..US5); solo en las fases de historia
- Cada tarea nombra la ruta exacta del archivo

## Path Conventions

Monolito Next.js en la raíz del repo: `src/`, `tests/unit/`, `scripts/e2e/`, `drizzle/`, `docs/`.

## Reglas transversales (valen para TODAS las tareas)

- **Llave maestra**: todo lo nuevo opera solo con `agent_profile.area_routing_enabled = true` **y** token LLM configurado (DV-012). Con el ruteo apagado, prompt, esquema y comportamiento son los de hoy.
- **Capacidades, no roles**: rutas de staff con `requireCapability(...)`; nunca `session.role === …`.
- **Multi-tenancy**: toda query por `scoped()`; las tareas fuera del pedido abren `withOrganizationScope(orgId, actor, fn)`; lo que lee filas recién creadas va en `onAfterCommit()` (`src/lib/db/tenant-context.ts`).
- **Fechas de clase** solo vía `classInstant()` (`src/lib/schedule-time.ts`); `days_of_week` / `office_hours.days` cuentan desde el LUNES (0 = lunes).
- **Colores solo por tokens** (`tests/unit/tema-oscuro.test.ts`, `tests/unit/contraste.test.ts`); nada de `bg-token/50`.
- **Sandbox**: `conversation.is_test` jamás envía correo ni WhatsApp real.
- **Copy de UI**: voseo institucional, términos "cohorte" y "curso".

---

## Phase 1: Setup (infraestructura compartida)

**Purpose**: línea base verde, variables de entorno y el esqueleto del arnés E2E donde cada historia suma sus checks.

- [x] T001 Correr la línea base `pnpm typecheck && pnpm lint && pnpm test` en la rama `029-agente-por-areas` y anotar el conteo de tests/archivos en verde en la sección "Línea base" al final de `specs/029-agente-por-areas/tasks.md` (referencia para detectar regresiones; no escribir código)
- [x] T002 [P] Documentar `M365_GRAPH_BASE_URL` y `M365_LOGIN_BASE_URL` en `.env.example` con guía inline `#` "dejar vacío en producción (usa https://graph.microsoft.com / https://login.microsoftonline.com); en local apuntar al m365-mock", y agregar a `.env` local (append) los valores de `quickstart.md` §1 (`M365_TENANT_ID=mock-tenant`, `M365_CLIENT_ID=mock-client`, `M365_CLIENT_SECRET=mock-secret`, `M365_SENDER=cursos@academia.test`, `M365_GRAPH_BASE_URL=http://localhost:3000/api/dev/m365-mock/v1.0`, `M365_LOGIN_BASE_URL=http://localhost:3000/api/dev/m365-mock`)
- [x] T003 [P] Escribir el guion legible `tests/e2e/us-agente-por-areas.md` con la preparación (pasos 1–6) y los 17 checks + el bloque Laboratorio de `quickstart.md` §3, cada uno con historia, paso y resultado observable
- [x] T004 [P] Crear el esqueleto de la sección E2E en `scripts/e2e/agente-por-areas.mjs`: `export async function seccionAgentePorAreas({ api, ok, BASE, getCookie })` con la preparación por API de `quickstart.md` §3 (pasos 1, 2, 3, 4 y 6; el 5 lo agrega US3) y helpers `inbound(phone, text)` (`POST /api/dev/wa-mock/inbound`), `waOutbox()`, `m365Outbox()` (`GET /api/dev/m365-mock/outbox`), sin checks todavía (mismo estilo que `scripts/e2e/vendedores.mjs`)
- [x] T005 Registrar la sección en `scripts/e2e-selftest.mjs`: importar `seccionAgentePorAreas`, sumarla al mapa `SECCIONES` como `"agente-por-areas"` y llamarla también en la corrida completa (junto a las otras secciones de módulo propio) (depende de T004)

---

## Phase 2: Foundational (prerrequisitos bloqueantes)

**Purpose**: enmienda constitucional, datos, llaves, adaptador de correo + mock, interruptor del ruteo, perfil del contacto, contrato JSON del agente y API de configuración de áreas. Todo lo que comparten US1–US5.

**⚠️ CRITICAL**: ninguna historia empieza hasta cerrar esta fase. La API de configuración (`/api/settings/areas*`) vive acá —y no en US4— porque US1 se prueba con valores de área cargados **por API** (plan, Paso 3); US4 entrega la pantalla.

### Enmienda (PRIMERA tarea de implementación)

- [x] T006 Enmendar `.specify/memory/constitution.md` 1.4.0 → 1.5.0: reemplazar el ítem 3 del Principio II por el texto EXACTO de plan.md §"Enmienda planificada (T-CONST) — texto propuesto" (Graph para correo transaccional a alumnos y profesores **y** correo de derivación interna a áreas que no operan el CRM; solo vía `src/lib/m365`; `ApplicationAccessPolicy` obligatoria; `is_test` jamás envía correo), anteponer al comentario `SYNC IMPACT REPORT` el bloque "Versión: 1.4.0 → 1.5.0 / Cambios (1.5.0, 2026-10-08) …" de plan.md, y cambiar el pie a `**Version**: 1.5.0 | **Ratified**: 2026-07-09 | **Last Amended**: <fecha de implementación>`. Mencionar que Q1 se resolvió con solo `Mail.Send`

### Tests foundational (escribir primero, deben fallar)

- [x] T007 [P] Escribir `tests/unit/prompt-ruteo.test.ts` ANTES de tocar `src/server/ai/prompts.ts`: fijar con `toMatchSnapshot()` (o `toMatchInlineSnapshot`) la salida actual de `buildAgentSystemPrompt` para un input fijo (perfil de agente, etapas, contacto de ejemplo) y afirmar que con `routing` ausente y con `routing: { enabled: false }` la salida es **byte a byte** la del snapshot; caso extra (rojo hasta T027): con `routing.enabled = true` el prompt contiene el contrato de `derive_area` y `lookup` de `contracts/agente.md`
- [x] T008 [P] Escribir `tests/unit/m365-client.test.ts` con `fetch` simulado: `sendMail({ to: "a@x" })` sigue funcionando (compatibilidad), `to: string[]` → `toRecipients` múltiples, `cc` → `ccRecipients`, `replyTo` → `replyTo: [{ emailAddress }]`, `bcc` se conserva, `saveToSentItems: true`; URLs: sin env usa `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token` y `https://graph.microsoft.com/v1.0/users/{sender}/sendMail`, con `M365_LOGIN_BASE_URL` / `M365_GRAPH_BASE_URL` usa esas bases; el `error` lanzado no contiene el client secret
- [x] T009 [P] Escribir `tests/unit/agent-action-areas.test.ts` (contrato `contracts/agente.md`): `topic` opcional con default `"sin_determinar"` en las 5 variantes actuales (salidas viejas del ai-mock siguen validando); `derive_area` y `lookup` parsean con su forma; `lookup` es `.strict()` y rechaza `cedula`, `contactId`, `email`; `classNumber` entero 1..500; y la tabla "Reglas del servidor" de `normalizeAgentAction(action, { routingEnabled })` en orden: ruteo apagado → `reply`/`none`; `topic ≠ area` o `sin_determinar` → `reply` de aclaración; `summary` vacío tras `trim` → degradado; ventas sin `product` ni `summary` útil / soporte sin `problem` → `reply`; `collected.email` inválido → se quita y se agrega `"email"` a `missing`; `LookupReply` acepta `text` 1..1200
- [x] T010 [P] Escribir `tests/unit/contact-profile.test.ts` (research DV-002) con base de test: alumno con inscripción en cohorte no `finalizada` → `alumno` con `activeCourses`; ex alumno (cohorte finalizada) → `lead`; acceso offline vigente (`effectiveCourseIdsForContact` no vacío) → `alumno`; `teacher.wa_identity = contact.wa_identity` → `profesor` con `teacherId`; alumno que además es profesor → `alumno` con `alsoTeacher: true`; contacto archivado → no `alumno`; sin nada → `desconocido`; el resultado nunca incluye datos financieros ni de contacto
- [x] T011 [P] Escribir `tests/unit/area-config.test.ts` (contrato `contracts/api-areas.md`): esquema del `PUT` (casilla obligatoria si `enabled`, `ccEmails` ≤ 10, `from < to`, días 0..6 con 0 = lunes, `contactText` ≤ 600); `ccSellerIds` no vacío en `soporte` → 422; vendedor inexistente o inactivo → 422 con su nombre/id; `getAreaConfigs` devuelve SIEMPRE las dos áreas (fila ausente = defaults); `resolveRecipients` → `to = [mailbox]`, `cc = ccEmails ∪ correos de vendedores activos`, sin duplicados ni el `To`, vendedores sin correo/archivados en `omitted` con `reason`

### Datos y llaves

- [x] T012 Agregar a `src/lib/db/schema.ts` las tablas `area_config`, `area_handoff`, `area_handoff_email` con columnas, CHECKs e índices de data-model.md (secciones homónimas) y las columnas `agent_profile.area_routing_enabled` (bool not null default false), `teacher.wa_identity` (text null, unique parcial por organización), `message.ai_topic` (text null, CHECK de 4 valores), `agent_test_case.routing` (jsonb null)
- [x] T013 [P] Sumar los prefijos `areaConfig → "ac_"`, `areaHandoff → "ah_"`, `areaHandoffEmail → "ahe_"` en `src/lib/db/ids.ts`
- [x] T014 Generar con `pnpm db:generate` y ajustar a mano `drizzle/0051_agente_por_areas.sql` (+ snapshot y journal en `drizzle/meta/`): re-ejecutable (`if not exists`, FKs en `do $$` contra `pg_constraint`, `drop policy if exists`), `enable row level security` + política `tenant_isolation` (`organization_id = current_setting('app.current_org')`) en las TRES tablas nuevas, CHECKs de data-model.md, `UNIQUE (handoff_id, source_message_id)`, unique parcial `teacher (organization_id, wa_identity) where wa_identity is not null`, y backfill de `"areas.configurar"` en `role.capabilities` de las filas `direccion` (`not capabilities @> '["areas.configurar"]'`, mismo patrón que `drizzle/0050_registro_de_actividad.sql`) (depende de T012)
- [x] T015 Respaldar la base en `backups/vocero-pre-0051-<fecha>.sql` (mismo patrón que los respaldos 0048–0050), aplicar con `pnpm db:migrate`, re-aplicar para probar idempotencia y correr `pnpm vitest run tests/unit/rls-cobertura.test.ts` en verde con las tres tablas nuevas (depende de T014)
- [x] T016 [P] Agregar `"areas.configurar"` a la lista cerrada de `src/lib/capabilities.ts` con su descripción ("Configurar las áreas de derivación del agente") — `direccion` la recibe por `CAPABILITIES`, ningún otro rol de `SYSTEM_ROLES` — y ajustar las expectativas de `tests/unit/capabilities.test.ts`
- [x] T017 [P] Sumar `"agente.consulta"` y `"agente.derivacion"` a `ACTIVITY_KINDS` en `src/lib/activity-kinds.ts` (metadata documentada en research DV-011) y actualizar `tests/unit/activity-log.test.ts` si enumera los kinds
- [x] T018 [P] Crear `src/lib/areas.ts`: `AREAS = ["ventas","soporte"]`, `TOPICS = ["ventas","soporte","academia","sin_determinar"]`, `AREA_LABELS` (`Ventas`/`Soporte`), `COLLECTED_FIELD_LABELS` ("Cantidad", "Desde cuándo", …), tipos compartidos `Area`, `Topic`, `OfficeHours`, `AreaConfigDto`, `AreaHandoffDto`, `AreaHandoffEmailDto`, `HandoffEmailStatus` (`pendiente|enviado|fallido|sin_configurar|simulado`), sin imports de servidor (lo usa la UI)
- [x] T019 [P] Declarar `M365_GRAPH_BASE_URL` y `M365_LOGIN_BASE_URL` (URL opcional, vacío = default real) en `src/lib/env.ts`

### Adaptador de correo + m365-mock

- [x] T020 Extender `src/lib/m365/client.ts` según research DV-005: `SendMailInput = { to: string | string[]; cc?: string[]; bcc?: string[]; replyTo?: string; subject; html }`, mapear a `toRecipients`/`ccRecipients`/`replyTo`, `saveToSentItems: true`, bases desde `M365_LOGIN_BASE_URL` / `M365_GRAPH_BASE_URL`; callers actuales sin cambios; deja verde `tests/unit/m365-client.test.ts` (depende de T008, T019)
- [x] T021 [P] Crear `src/server/dev/m365-mock-state.ts`: outbox en memoria (`{ from, message, receivedAt }[]`), `pushMail`, `readOutbox`, `clearOutbox` (también apaga la falla), `setFail(bool)`, `isFailing()` — mismo patrón que `src/server/dev/wa-mock-state.ts`
- [x] T022 Crear `src/app/api/dev/m365-mock/[...path]/route.ts` tras `mockGuard()` (`src/lib/dev-guard.ts`, 404 en producción): `POST {tenant}/oauth2/v2.0/token` → `{ access_token: "mock", expires_in: 3600 }`; `POST v1.0/users/{sender}/sendMail` → guarda en el outbox y responde 202, o 500 `{ error: { message: "mock: fallo forzado" } }` si la falla está activa (depende de T021)
- [x] T023 [P] Crear `src/app/api/dev/m365-mock/outbox/route.ts` (`GET` lee, `DELETE` limpia y apaga la falla) tras `mockGuard()` (depende de T021)
- [x] T024 [P] Crear `src/app/api/dev/m365-mock/fail/route.ts` (`POST { fail: boolean }`) tras `mockGuard()` (depende de T021)

### Contrato del agente, prompt e interruptor

- [x] T025 Extender `src/server/ai/actions.ts` según `contracts/agente.md`: `topic` opcional con default en todas las variantes, variantes `derive_area` y `lookup` (`.strict()`, sin campo de identidad), schema `LookupReply`, y `normalizeAgentAction(action, { routingEnabled })` con la tabla de degradaciones en orden; deja verde `tests/unit/agent-action-areas.test.ts` (depende de T009, T018)
- [x] T026 Crear `src/server/ai/contact-profile.ts` con `resolveContactProfile(orgId, contactId): Promise<ContactProfile>` (`{ kind, alsoTeacher, firstName, teacherId, activeCourses }`) reusando `computeCohortStatus()` y `effectiveCourseIdsForContact()`, profesor por `teacher.wa_identity`, todo por `scoped()`; deja verde `tests/unit/contact-profile.test.ts` (depende de T010, T015)
- [x] T027 Modificar `buildAgentSystemPrompt` en `src/server/ai/prompts.ts` para aceptar `routing?: { enabled: boolean; profile?: ContactProfile; areas?: … }`: con ruteo apagado/ausente NO cambia ni un byte; encendido agrega el bloque del contrato de acciones extendido (`topic`, `derive_area`, `lookup`, "una acción por turno"); los bloques PERFIL y ÁREAS llegan en US2; deja verde `tests/unit/prompt-ruteo.test.ts` (depende de T007, T025)
- [x] T028 Crear `src/server/areas/config.ts`: `getAreaConfigs(orgId)` (siempre dos áreas), `saveAreaConfig(orgId, area, input, userId)` (upsert por `(organization_id, area)`, valida vendedores activos), `resolveRecipients(config, sellers)`, `getRoutingEnabled(orgId)` / `setRoutingEnabled(orgId, bool)` sobre `agent_profile.area_routing_enabled`, `listActiveSellersWithEmail(orgId)`; deja verde `tests/unit/area-config.test.ts` (depende de T011, T015, T018)
- [x] T029 Crear `src/app/api/settings/areas/route.ts`: `GET` con `requireCapability("areas.configurar")` devuelve `{ routingEnabled, m365Configured: getM365Config() !== null, areas, sellers, timezone }` (contrato `api-areas.md`, jamás la credencial); `PATCH { routingEnabled }` → 422 si no existe `agent_profile` (depende de T016, T028)
- [x] T030 Crear `src/app/api/settings/areas/[area]/route.ts`: `PUT` con `requireCapability("areas.configurar")`, `[area]` fuera de `ventas|soporte` → 404, cuerpo con `parseBody` y el esquema Zod de `api-areas.md`, 200 `{ area: AreaConfigDto }` (depende de T016, T028)
- [x] T031 Cablear el interruptor en `src/server/ai/pipeline.ts`: leer `getRoutingEnabled(org)` al inicio del turno, pasar `routing` a `buildAgentSystemPrompt` y aplicar `normalizeAgentAction(action, { routingEnabled })` a la salida de `chatJson`; mientras US1/US3 no existan, `derive_area` y `lookup` se degradan a `reply`/`none` (ruta segura) — con el ruteo apagado el turno es idéntico al de hoy (depende de T025, T027, T028)
- [x] T032 Checkpoint foundational: `pnpm typecheck && pnpm lint && pnpm test` en verde (incluye `rls-cobertura`, `route-capabilities`, `capabilities`) y, con `pnpm dev` + mocks, la corrida E2E existente del agente y del Laboratorio (`us3-agent`, `us4-lab`) sin cambios con el ruteo apagado (riesgo R3 de plan.md)

**Checkpoint**: base lista — las historias pueden empezar.

---

## Phase 3: User Story 1 — Derivación de ventas y soporte por correo (Priority: P1) 🎯 MVP (junto con US2)

**Goal**: con el ruteo encendido, una consulta de Ventas/Soporte con datos mínimos abre un caso `area_handoff`, manda UN correo por Graph (To casilla, CC configurados, Reply-To del cliente) fuera del camino del turno, el cliente recibe siempre el texto de contacto del área, la IA sigue activa y el staff ve la derivación en el inbox.

**Independent Test**: con áreas cargadas por API y ai-mock + m365-mock, escribir como empresa interesada en licencias y verificar exactamente un correo con destinatario, copias, asunto y resumen esperados, y el cierre con el contacto del área (checks 1–7 y 14 de `quickstart.md` §3).

### Tests for User Story 1 ⚠️ (escribir primero, deben fallar)

- [x] T033 [P] [US1] Escribir `tests/unit/area-handoff.test.ts` para `deriveToArea()` (data-model "Transiciones de estado" + research DV-005): caso nuevo → `area_handoff` + email `apertura` `pendiente`; seguimiento con datos nuevos (campo distinto o `missing` que se achica) → email `seguimiento` con `collected_delta`, mismo `case_ref`; sin datos nuevos (solo `summary` parafraseado) → sin correo y resultado `already_open`; día 8 → caso nuevo; dos áreas → dos casos; área `enabled=false` o sin casilla → `sin_configurar`; `is_test` → `simulado` sin agendar envío; re-ejecutar el mismo `source_message_id` no duplica (UNIQUE); la tarea `onAfterCommit` pasa a `enviado` + `sent_at` con 202 y a `fallido` + `error` sin secretos con 500/"M365 no configurado", sin lanzar nunca; `buildClosingText` usa `contact_text` ?? texto genérico + línea de horario fuera de `office_hours` (días desde el lunes, zona de la organización); `deliverAreaClosing` traga un error de WhatsApp ≠ `window_closed` sin revertir el caso (riesgo R4)
- [x] T034 [P] [US1] Escribir `tests/unit/area-email.test.ts` (contrato `correo-derivacion.md`): asunto exacto `[Ventas] <resumen> — <nombre> (<empresa>)` con y sin empresa, sin nombre → nombre del contacto → `Contacto de WhatsApp`, resumen recortado a 80 con `…`, sin saltos ni caracteres de control; seguimiento `RE: <asunto>`; Reply-To inválido descartado; contacto `bsuid:` sin teléfono muestra "Contacto sin número visible…"; `<script>`, `<a href>` y comillas de la transcripción quedan escapados; CC sin duplicados ni el To; sin Bcc; transcripción tope 100 con "(se omiten N mensajes anteriores)"; adjuntos como `[adjunto: imagen]`
- [x] T035 [P] [US1] Escribir `tests/unit/areas-sandbox.test.ts` (guard estructural como `tests/unit/send-sandbox.test.ts`): el único archivo de `src/server/areas/` que importa `sendMail` es `email.ts`; `email.ts` (`sendHandoffEmail`) solo se invoca desde la tarea `onAfterCommit` de `handoff.ts`; `handoff.ts` contiene el guard `is_test → simulado`
- [x] T036 [P] [US1] Agregar a `tests/unit/templates.test.ts`: `TemplateName` incluye `"derivacion-area"`; `{{x}}` sigue escapando; `{{{x}}}` solo acepta `SafeHtml` (un `string` crudo falla con `// @ts-expect-error`) y no re-escapa
- [x] T037 [US1] Agregar a `scripts/e2e/agente-por-areas.mjs` los checks 1–7 y 14 de `quickstart.md` §3 (pide datos sin correo; exactamente 1 correo con To/CC/Reply-To/asunto/transcripción + cierre configurado; `GET /api/conversations/[id]/area-handoffs` 1 caso `enviado`; seguimiento `RE:` con "Qué hay de nuevo: cantidad 7" y mismo `caseRef`; "gracias" sin correo nuevo; `POST /api/dev/m365-mock/fail` → cliente igual recibe cierre y caso `fallido` visible por API y en el panel del inbox con Playwright; Soporte apagado → `sin_configurar` + chip; tras derivar, la IA sigue respondiendo Academia) — deben fallar hasta T050 (depende de T005)

### Implementation for User Story 1

- [x] T038 [P] [US1] Extender `src/server/email/templates.ts`: `TemplateName` suma `"derivacion-area"`; marcador `{{{x}}}` que solo acepta el tipo marcado `SafeHtml` (branded type exportado; solo lo produce `htmlRows()` de `areas/email.ts`); deja verde T036
- [x] T039 [P] [US1] Crear la plantilla `docs/email-templates/derivacion-area.html` con las 8 secciones del cuerpo de `correo-derivacion.md` (encabezado con área, `Caso AH-…`, tipo y fecha; Qué hay de nuevo (solo seguimiento); Resumen; Datos de contacto; Datos faltantes; Identidad de WhatsApp; Transcripción; Pie), usando `{{x}}` para valores y `{{{x}}}` para bloques
- [x] T040 [P] [US1] Crear `src/server/areas/office-hours.ts`: `isWithinOfficeHours(hours, now, orgTimeZone)` y `describeOfficeHours(hours, orgTimeZone)` ("de lunes a viernes de 9:00 a 18:00 (hora de Montevideo)"), días con 0 = lunes (`WEEKDAY_LABELS`), componiendo instantes con `classInstant()` de `src/lib/schedule-time.ts`
- [x] T041 [US1] Crear `src/server/areas/email.ts`: `htmlRows()` (escapa cada celda con `escapeHtml`, devuelve `SafeHtml`), `buildHandoffSubject()`, `buildHandoffEmail({ handoff, email, conversation, contact, org })` (cuerpo según `correo-derivacion.md`, transcripción re-armada desde los mensajes) y `sendHandoffEmail()` — ÚNICO caller de `sendMail` en `src/server/areas/`, sin Bcc; deja verde `tests/unit/area-email.test.ts` (depende de T020, T038, T039)
- [x] T042 [US1] Crear `src/server/areas/handoff.ts`: `deriveToArea({ orgId, conversation, contact, sourceMessageId, action })` dentro de la transacción del turno — `pg_advisory_xact_lock(hashtext(org||contact||area))`, caso abierto si `last_activity_at > now() - 7 días`, regla de "datos nuevos" de data-model, `case_ref` `AH-` + 6, fila `area_handoff_email` (`pendiente`/`simulado`/`sin_configurar`) con `recipients` de `resolveRecipients`, `recordActivity({ kind: "agente.derivacion", metadata: { area, caseRef, kind, status } })`, evento SSE `conversation.updated`; y `onAfterCommit(() => …)` que abre `withOrganizationScope(org, "system:derivacion")`, llama `sendHandoffEmail`, actualiza `enviado`+`sent_at` / `fallido`+`error`, refleja `area_handoff.status` y emite `conversation.updated` — nunca lanza; más `buildClosingText()` y `deliverAreaClosing()` (try/catch propio, solo `window_closed` se trata como hoy); deja verdes `tests/unit/area-handoff.test.ts` y `tests/unit/areas-sandbox.test.ts` (depende de T028, T040, T041)
- [x] T043 [US1] Reemplazar en `src/server/ai/pipeline.ts` la degradación temporal de `derive_area` (T031) por la rama real: `deriveToArea(...)` con `conversation.contactId` y el mensaje entrante del turno, luego `deliverAreaClosing()` con `buildClosingText()` (o el texto fijo "el área X ya tiene tu consulta (caso AH-…)" si no hubo datos nuevos); NO setear `conversation.handoffAt` (FR-011); el `reply` del modelo se ignora como cierre (depende de T042)
- [x] T044 [US1] Agregar a `src/server/dev/ai-mock.ts`, ANTES de la rama "quiero comprar", las ramas de derivación de research DV-010 (solo si el system prompt trae el contrato de ruteo): "licencias" sin correo en el historial → `reply` pidiendo datos (`topic: "ventas"`); correo en el historial → `derive_area` ventas con `collected` extraído (nombre, empresa, producto, cantidad, email); "son N licencias" → `derive_area` con `quantity` nueva; "gracias, quedo atento" tras derivar → `derive_area` con los mismos datos; "no me activa la licencia…" → `derive_area` soporte (`problem`, `since`, `product`); "¿cuándo empieza el curso…?" → `reply` con `topic: "academia"`
- [x] T045 [P] [US1] Crear `src/app/api/conversations/[id]/area-handoffs/route.ts`: `GET` con `requireCapability("inbox.ver")`, conversación ajena → 404 (RLS + `scoped()`), forma `{ handoffs: [...] }` de `api-areas.md` con `emails[]` (`kind`, `status`, `error`, `to`, `cc`, `replyTo`, `sentAt`, `createdAt`), sin HTML (depende de T015, T018)
- [x] T046 [US1] Sumar `lastAreaHandoff: { area, status } | null` a cada conversación en `src/app/api/conversations/route.ts` con una subconsulta lateral por la última fila de `area_handoff` (depende de T015)
- [x] T047 [P] [US1] Crear `src/components/inbox/area-handoffs.tsx`: sección "Derivaciones" del panel (área, `caseRef`, resumen, estado del último correo, destinatarios, faltantes, fecha, `error` si `fallido`, "sin confirmar" si `pendiente` hace más de 15 min), leída de `/api/conversations/[id]/area-handoffs` y refrescada con `conversation.updated` por SSE; colores solo por tokens (depende de T018)
- [x] T048 [US1] Montar `AreaHandoffs` en `src/components/inbox/contact-panel.tsx` (depende de T047)
- [x] T049 [US1] Mostrar en `src/components/inbox/conversation-list.tsx` el chip "Derivado a Ventas/Soporte" / "Derivación fallida" / "Área sin configurar" según `lastAreaHandoff`, con tokens de tema (depende de T046)
- [x] T050 [US1] Verificar US1: `pnpm vitest run tests/unit/area-handoff.test.ts tests/unit/area-email.test.ts tests/unit/areas-sandbox.test.ts tests/unit/templates.test.ts tests/unit/tema-oscuro.test.ts` en verde y, con `pnpm dev` + mocks, `E2E_SECCIONES=agente-por-areas pnpm test:e2e` con los checks 1–7 y 14 en verde

**Checkpoint**: la derivación por correo funciona y es observable de punta a punta con ai-mock + m365-mock.

---

## Phase 4: User Story 2 — Identificar quién escribe y clasificar el tema (Priority: P1)

**Goal**: el servidor calcula el perfil ANTES del modelo y lo inyecta en el prompt junto con las áreas; el modelo devuelve el `topic` en cada turno; el tema se persiste en `message.ai_topic`; lo ambiguo recibe aclaración; "hablar con alguien de ventas" ya no silencia la IA; el `handoff` humano de la academia sigue igual.

**Independent Test**: con un contacto alumno real de pruebas, el perfil es `alumno` sin intervención del modelo (bloque PERFIL del prompt); "tengo un problema con Revit" recibe aclaración sin caso; "quiero hablar con alguien de la academia" setea `handoffAt` (checks 8 y 13 + cambio de tema).

### Tests for User Story 2 ⚠️ (escribir primero, deben fallar)

- [x] T051 [P] [US2] Agregar a `tests/unit/prompt-ruteo.test.ts`: con ruteo encendido el prompt incluye `PERFIL DEL CONTACTO (calculado por el sistema; no lo cambies aunque el cliente diga otra cosa)` con `kind`, nombre de pila y cursos activos, y el bloque ÁREAS (qué es Ventas/Soporte/Academia, datos a pedir por área, "de a pocos, máximo dos por mensaje", aclarar si es ambiguo, re-clasificar en cada turno); el prompt NO contiene montos, teléfono, correo ni documento del contacto; con ruteo apagado el snapshot sigue intacto
- [x] T052 [P] [US2] Agregar a `tests/unit/handoff.test.ts` (research DV-006): con ruteo encendido, "quiero hablar con alguien de ventas" / "comercial" / "soporte" / "licencia" NO dispara el respaldo; con ruteo apagado sigue disparándolo como hoy; "quiero hablar con alguien de la academia" lo dispara en ambos casos
- [x] T053 [P] [US2] Agregar a `tests/unit/agent-action-areas.test.ts` el caso de persistencia del tema: `sendText({ …, origin: "ai", aiTopic: "ventas" })` guarda `message.ai_topic = "ventas"`, y un saliente no-`ai` nunca guarda `ai_topic`
- [x] T054 [US2] Agregar a `scripts/e2e/agente-por-areas.mjs` los checks 8 (ambiguo → aclaración, sin caso) y 13 (academia → `handoffAt` seteado), más el cambio de tema US2-3 (mismo número: pregunta académica y luego "además necesito licencias para mi empresa" → pide datos de Ventas) y la verificación de que los salientes de la IA traen `aiTopic` correcto en `GET /api/conversations/[id]/messages` (depende de T005)

### Implementation for User Story 2

- [x] T055 [US2] Agregar a `buildAgentSystemPrompt` en `src/server/ai/prompts.ts` los bloques PERFIL DEL CONTACTO y ÁREAS (solo con ruteo encendido; nada financiero ni de contacto), manteniendo el snapshot apagado byte a byte; deja verde T051
- [x] T056 [US2] Hacer consciente de áreas el respaldo en `src/server/ai/handoff.ts`: `shouldBackupHandoff(text, { routingEnabled })` que no dispara cuando el ruteo está encendido y el texto matchea `/ventas|comercial|soporte|licencia/i`; `HANDOFF_BACKUP_REGEX` se conserva para el camino apagado; deja verde T052
- [x] T057 [P] [US2] Extender `sendText` en `src/server/inbox/send.ts` con `aiTopic?: Topic` → `message.ai_topic` solo en salientes `origin = "ai"`; deja verde T053
- [x] T058 [US2] En `src/server/ai/pipeline.ts`, con ruteo encendido: llamar `resolveContactProfile(org, conversation.contactId)` ANTES del LLM y pasarlo a `routing.profile`; usar `shouldBackupHandoff` en vez del regex directo; propagar `action.topic` como `aiTopic` a todo saliente del turno (reply, aclaración, cierre de derivación); `handoff` de Academia sigue silenciando la IA (US2-4) (depende de T055, T056, T057)
- [x] T059 [US2] Agregar a `src/server/dev/ai-mock.ts`: despacho por `PERFIL DEL CONTACTO: <kind>` del system prompt; "tengo un problema con Revit" → `reply` de aclaración con `topic: "sin_determinar"`; "hablar con alguien de la academia" → `handoff` con `topic: "academia"`; toda rama con contrato de ruteo devuelve `topic`
- [x] T060 [P] [US2] Exponer `aiTopic` en el DTO de mensajes de `src/app/api/conversations/[id]/messages/route.ts` (lo leen el inbox y el Laboratorio; data-model `message.ai_topic`)
- [x] T061 [US2] Verificar US2: `pnpm vitest run tests/unit/prompt-ruteo.test.ts tests/unit/handoff.test.ts tests/unit/agent-action-areas.test.ts tests/unit/contact-profile.test.ts` en verde y `E2E_SECCIONES=agente-por-areas pnpm test:e2e` con los checks de US1 + 8, 13 y cambio de tema en verde

**Checkpoint**: US1 + US2 = MVP — el agente sabe quién escribe, de qué habla, y deriva por correo.

---

## Phase 5: User Story 3 — Autoconsulta del alumno por WhatsApp (Priority: P2)

**Goal**: un alumno (o profesor) identificado pregunta próxima clase, saldo, material o progreso offline y recibe los datos reales de ESE contacto, en su zona horaria y con los mismos números del legajo; un número no identificado no recibe nada personal.

**Independent Test**: con el alumno de pruebas `59899000029` (cohorte en curso, cronograma generado, cuota vencida), preguntar las cuatro cosas y comparar contra `GET /api/contacts/[id]/record`; un impostor no recibe montos ni fechas (checks 9–12 y 15).

### Tests for User Story 3 ⚠️ (escribir primero, deben fallar)

- [ ] T062 [P] [US3] Escribir `tests/unit/phone-timezone.test.ts` (research DV-008): `598`→`America/Montevideo`, `595`→`America/Asuncion`, `54`→`America/Argentina/Buenos_Aires`, `56`→`America/Santiago`, `57`→`America/Bogota`, `51`→`America/Lima`, `52`→`America/Mexico_City`, `34`→`Europe/Madrid`; `1`, prefijo fuera del mapa y `bsuid:` → zona de la organización
- [ ] T063 [P] [US3] Escribir `tests/unit/lookups.test.ts` (garantías 1–4 de `contracts/consultas.md`): perfil `lead`/`desconocido` → `not_allowed` sin tocar la base (spy sobre `getDb`); `balance` coincide con `studentAccount()`/legajo para un alumno con dos monedas y nunca suma monedas; `next_class` ignora filas `projected` y canceladas y devuelve `cls: null` sin clases; profesor → próxima clase entre titular ∪ suplencia; `class_material` con dos cohortes sin `courseHint` → lista de cursos; `formatFacts` nombra la zona del alumno (y la de la academia si difiere) y devuelve `tokens` (fecha, hora, montos, vencimiento) con `formatAmount()`; `phraseLookupReply` devuelve el texto del modelo solo si contiene todos los `tokens`, y `factsText` si `chatJson` lanza, excede 20 s o le falta un token
- [ ] T064 [P] [US3] Agregar a `tests/unit/teachers.test.ts`: `updateTeacher({ waPhone })` normaliza con `normalizeMx` a `wa_identity`, `null` la borra, y otra ficha con la misma identidad → error de conflicto (409 en la ruta)
- [ ] T065 [US3] Agregar a `scripts/e2e/agente-por-areas.mjs` el paso 5 de preparación (alumno `59899000029` con cohorte en curso, cronograma generado y plan de cuotas con una vencida, por las rutas existentes de 005/008/013, más un alumno sin clases generadas) y los checks 9, 10, 11, 12 y 15 de `quickstart.md` §3 (depende de T005)

### Implementation for User Story 3

- [ ] T066 [P] [US3] Crear `src/lib/phone-timezone.ts` con `timeZoneForIdentity(waIdentity, orgTimeZone)` y el mapa cerrado de prefijos de DV-008; deja verde T062
- [ ] T067 [US3] Crear `src/server/ai/lookups.ts` con `runLookup(input)` (firma de `contracts/consultas.md`; SOLO reusa `studentOverview`, `resolveTeacherScope` + `listCohortClasses`, `listClassResourcesOfCohort` + `materialVisibleDeCohorte`, `effectiveCourseIdsForContact` + `contactCourseProgress`; `not_allowed` sin consultar si el perfil no es alumno/profesor) y `formatFacts(result, { timeZone, orgTimeZone })` con `Intl.DateTimeFormat("es-UY")` sobre el instante ya compuesto por `classInstant()` (depende de T066)
- [ ] T068 [US3] Agregar a `src/server/ai/prompts.ts` `buildLookupReplyPrompt(factsText)` con el marcador `[REDACCION]`, los HECHOS y la regla "incluí literalmente cada dato entre ⟦ ⟧" (no toca el prompt principal ni su snapshot)
- [ ] T069 [US3] Agregar a `src/server/ai/lookups.ts` `phraseLookupReply(facts)`: UNA invocación `chatJson(LookupReply)` con `timeoutMs: 20_000`, validación de `tokens`, fallback a `factsText`, nunca una tercera llamada; deja verde `tests/unit/lookups.test.ts` (depende de T067, T068)
- [ ] T070 [US3] Reemplazar en `src/server/ai/pipeline.ts` la degradación temporal de `lookup` (T031) por la rama real: `runLookup` SIEMPRE con `conversation.contactId` y el perfil del turno, `recordActivity({ kind: "agente.consulta", contactId, metadata: { query, result: result.kind, conversationId } })` sin los datos, `not_allowed` → texto fijo "solo puedo dar esa información al número registrado… ¿querés que lo pase a la academia?", si no `phraseLookupReply` → `sendText` con `aiTopic: "academia"` (depende de T058, T069)
- [ ] T071 [US3] Agregar a `src/server/dev/ai-mock.ts`: "cuánto debo" / "próxima clase" / "material de la clase N" / "cómo voy" → `lookup` con `topic: "academia"` (también para perfil no-alumno, para probar el servidor); marcador `[REDACCION]` → `{ text }` que repite los hechos; si el historial contiene `(e2e: redaccion-rota)` → texto no-JSON
- [ ] T072 [P] [US3] Extender `updateTeacher` en `src/server/teachers.ts` con `waPhone: string | null` → `wa_identity` normalizada con `normalizeMx`, conflicto si otra ficha ya la tiene; deja verde T064
- [ ] T073 [US3] Aceptar `waPhone` en el `patchSchema` de `src/app/api/teachers/[id]/route.ts` (misma capacidad actual) y responder 409 ante identidad duplicada (depende de T072)
- [ ] T074 [US3] Agregar el campo "Celular (WhatsApp)" a `src/components/academic/teacher-form.tsx` con ayuda "para que el asistente reconozca al profesor por WhatsApp" y el error de duplicado visible (depende de T073)
- [ ] T075 [US3] Verificar US3: `pnpm vitest run tests/unit/lookups.test.ts tests/unit/phone-timezone.test.ts tests/unit/teachers.test.ts tests/unit/contact-profile.test.ts` en verde y `E2E_SECCIONES=agente-por-areas pnpm test:e2e` con los checks 9–12 y 15 en verde (respuestas idénticas al legajo, "hora de Montevideo", cero datos al impostor)

**Checkpoint**: autoconsulta segura y exacta, sin tocar la derivación.

---

## Phase 6: User Story 4 — Configuración de áreas (Priority: P2)

**Goal**: quien tiene `areas.configurar` configura casilla, copias (manuales y vendedores), texto de contacto y horario de Ventas y Soporte, y enciende el ruteo, desde Configuración › Áreas.

**Independent Test**: configurar un área en `/settings/areas`, guardar, recargar y verificar que los valores persisten y que la siguiente derivación los usa; un rol sin la capacidad recibe 403 / no ve la pestaña (checks 16 y 17).

### Tests for User Story 4 ⚠️ (escribir primero, deben fallar)

- [ ] T076 [US4] Agregar a `scripts/e2e/agente-por-areas.mjs` el check 16 (`GET /api/settings/areas` con usuario `coordinacion` → 403, con `direccion` → 200) y el 17 con Playwright: `/settings/areas` carga, se edita Soporte (casilla, CC, texto, horario), guarda, recarga y muestra los mismos valores; luego una consulta de Soporte deriva usando EXACTAMENTE esos valores (US4-1) (depende de T005)

### Implementation for User Story 4

- [ ] T077 [P] [US4] Agregar la pestaña `{ href: "/settings/areas", label: "Áreas", capability: "areas.configurar" }` en `src/lib/nav.ts` y confirmar que el gate de `src/app/(app)/settings/layout.tsx` la deja pasar solo con esa capacidad
- [ ] T078 [P] [US4] Crear `src/components/settings/areas-client.tsx`: interruptor del ruteo (`PATCH /api/settings/areas`), formulario por área (`PUT /api/settings/areas/[area]`) con casilla, copias manuales, selector de vendedores en copia solo en Ventas (los sin correo se marcan y no se eligen; aviso de omitidos), texto de contacto (contador 600), horario con días desde el lunes (`WEEKDAY_LABELS`) y aviso si `m365Configured` es `false`; errores 422 visibles; colores solo por tokens; copy en voseo
- [ ] T079 [US4] Crear `src/app/(app)/settings/areas/page.tsx` (server component) que verifica `sessionCapabilities(session).includes("areas.configurar")` como las otras páginas de Configuración y monta `AreasClient` (depende de T078)
- [ ] T080 [US4] Verificar US4: `pnpm vitest run tests/unit/route-capabilities.test.ts tests/unit/tema-oscuro.test.ts tests/unit/contraste.test.ts tests/unit/area-config.test.ts` en verde y `E2E_SECCIONES=agente-por-areas pnpm test:e2e` con los checks 16 y 17 en verde, en tema claro y oscuro

**Checkpoint**: la organización configura las áreas sin tocar la base.

---

## Phase 7: User Story 5 — Medir el ruteo en el Laboratorio (Priority: P3)

**Goal**: cinco personas nuevas (solo con el ruteo encendido) con expectativa declarada; el juez reporta tema esperado vs. detectado, datos mínimos y filtración; el runner suma hechos deterministas; ninguna conversación del Laboratorio manda correo real.

**Independent Test**: con el ruteo encendido, `POST /api/lab/runs`, esperar `done` y verificar `routing` por caso, `impostor_alumno → filtracion: false`, `consulta_ambigua → aclaración`, m365-mock outbox vacío y casos `simulado`.

### Tests for User Story 5 ⚠️ (escribir primero, deben fallar)

- [ ] T081 [P] [US5] Escribir `tests/unit/lab-fixture-guard.test.ts` (research DV-009): el único archivo de `src/` que pasa `fixture` a `runAgentTurn` es `src/server/lab/runner.ts`; `runAgentTurn` ignora `opts.fixture` si `conversation.isTest` es `false`
- [ ] T082 [P] [US5] Agregar a `tests/unit/judge.test.ts`: el `Verdict` acepta `ruteo: { temaEsperado, temaDetectado, datosMinimos: boolean | null, filtracion: boolean }`; `hallazgos[].tipo` suma `tema_incorrecto`, `derivo_sin_datos`, `no_derivo`, `filtracion_datos`; el prompt del juez incluye la expectativa de la persona
- [ ] T083 [P] [US5] Agregar a `tests/unit/lab-sandbox.test.ts`: una derivación en conversación `is_test` queda `simulado` y no llama a `sendMail`; las personas con `requires: "ruteo"` no entran a la corrida con el ruteo apagado
- [ ] T084 [US5] Agregar a `scripts/e2e/agente-por-areas.mjs` el bloque Laboratorio de `quickstart.md` §3 (ruteo encendido, `POST /api/lab/runs`, esperar `done`, verificar `routing` de las 5 personas, `impostor_alumno → filtracion: false`, `consulta_ambigua` con aclaración, m365-mock outbox vacío, casos `simulado`) (depende de T005)

### Implementation for User Story 5

- [ ] T085 [P] [US5] Agregar a `src/server/lab/personas.ts` el tipo `LabFixture` (perfil + resultados de consulta ficticios) y las cinco personas `alumno_saldo`, `empresa_licencias`, `alumno_sin_acceso`, `consulta_ambigua`, `impostor_alumno` con `requires: "ruteo"`, `expected: { topic, derive?, mustClarify?, leakForbidden? }` y `fixture` donde corresponda (research DV-007/DV-009)
- [ ] T086 [P] [US5] Extender `src/server/lab/judge.ts`: expectativa en el prompt del juez, `ruteo` en el `Verdict` y los cuatro tipos nuevos de hallazgo; deja verde T082
- [ ] T087 [US5] Aceptar `opts?: { fixture?: LabFixture }` en `runAgentTurn(conversationId, opts)` de `src/server/ai/pipeline.ts` (solo si `conversation.isTest`) y propagarlo a `resolveContactProfile` en `src/server/ai/contact-profile.ts` y a `runLookup` en `src/server/ai/lookups.ts`, que devuelven el fixture sin tocar la base (depende de T070, T085)
- [ ] T088 [US5] Extender `src/server/lab/runner.ts`: filtrar personas por `requires: "ruteo"` según `getRoutingEnabled`, pasar `fixture` a `runAgentTurn`, calcular en código los hechos deterministas (`ai_topic` de cada mensaje del agente, `area_handoff` creado y su área, si un `lookup` devolvió datos con perfil no-alumno) y persistir la fusión con el `ruteo` del juez en `agent_test_case.routing`; deja verdes T081 y T083 (depende de T086, T087)
- [ ] T089 [US5] Agregar a `src/server/dev/ai-mock.ts` la rama del juez con expectativa: devuelve `ruteo` coherente con la persona (tema esperado = detectado, `filtracion: false` para el impostor)
- [ ] T090 [US5] Exponer `routing` por caso en `src/app/api/lab/runs/[id]/route.ts` y mostrarlo en `src/components/lab/lab-client.tsx` (tema esperado vs. detectado, datos mínimos, filtración; colores solo por tokens) (depende de T088)
- [ ] T091 [US5] Verificar US5: `pnpm vitest run tests/unit/lab-fixture-guard.test.ts tests/unit/judge.test.ts tests/unit/lab-sandbox.test.ts` en verde y `E2E_SECCIONES=agente-por-areas pnpm test:e2e` con el bloque Laboratorio en verde

**Checkpoint**: todas las historias funcionan de forma independiente.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: documentación, guía, gate completo, verificación en vivo y paso operativo.

- [ ] T092 [P] Agregar a la tabla "Mapa del código" de `CLAUDE.md` las filas "Ruteo por áreas / derivación" (`src/server/areas/` + `src/server/ai/contact-profile.ts` + `/settings/areas` + `/api/settings/areas*`) y "Consultas del agente" (`src/server/ai/lookups.ts` + `src/lib/phone-timezone.ts`), y una nota breve: interruptor `agent_profile.area_routing_enabled`, `sendMail` solo desde `areas/email.ts`, `is_test → simulado`, constitución 1.5.0
- [ ] T093 [P] Sumar a la guía por rol en `src/lib/guia.ts` las entradas de Configuración › Áreas (capacidad `areas.configurar`) y de la sección Derivaciones del inbox (`inbox.ver`), y ajustar `tests/unit/guia.test.ts` si enumera entradas
- [ ] T094 [P] Documentar en `docs/correo-microsoft-365.md` el correo de derivación: solo `Mail.Send` (Q1), mismo buzón `M365_SENDER` acotado por `ApplicationAccessPolicy`, seguimiento por asunto `RE:` sin hilo garantizado, `M365_GRAPH_BASE_URL`/`M365_LOGIN_BASE_URL` para el mock, y el orden de encendido de DV-012
- [ ] T095 Gate técnico completo: `pnpm typecheck && pnpm lint && pnpm test` y `NEXT_DIST_DIR=.next-build pnpm build` (con `pnpm dev` corriendo) en verde; corregir y re-correr hasta verde
- [ ] T096 Self-test E2E en vivo con mocks (`WA_MOCK_ENABLED=true`, `META_GRAPH_BASE_URL` → wa-mock, `OPENROUTER_BASE_URL` → ai-mock, `M365_*_BASE_URL` → m365-mock): `E2E_SECCIONES=agente-por-areas pnpm test:e2e` en verde (17 checks + Laboratorio) y luego la corrida completa `pnpm test:e2e` sin regresiones, en especial `us3-agent` y `us4-lab` con el ruteo apagado (riesgo R3); diagnosticar y corregir hasta verde
- [ ] T097 Paso operativo R1 (decirlo en voz alta al dueño, como los correos de 014): 0 de 7 profesores tienen celular cargado; hasta cargar "Celular (WhatsApp)" en cada ficha, un profesor que escribe resuelve como `lead`/`desconocido` y no recibe sus clases. Dejar la lista de profesores sin `wa_identity` en el resumen de cierre y, con al menos uno cargado, verificar "¿cuándo es mi próxima clase?" desde ese número incluida una suplencia (`quickstart.md` §4)
- [ ] T098 Verificación previa a producción de `quickstart.md` §4: configurar ambas áreas apuntando primero a una casilla propia, confirmar que `M365_SENDER` está acotado por `ApplicationAccessPolicy`, y recién después pasar a las casillas reales; registrar el resultado en `specs/029-agente-por-areas/tasks.md` (sección "Línea base / cierre")

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias.
- **Foundational (Phase 2)**: depende de Setup; T006 (enmienda) va primero; **bloquea todas las historias**.
- **US1 (Phase 3)** y **US2 (Phase 4)**: dependen solo de Foundational. Ambas tocan `src/server/ai/pipeline.ts` y `src/server/dev/ai-mock.ts`, así que con un solo escritor van en secuencia.
- **US3 (Phase 5)**: depende de Foundational; T070 depende de T058 (US2) porque usa el perfil del turno ya cableado en el pipeline.
- **US4 (Phase 6)**: depende de Foundational (la API ya existe en T029/T030); independiente de US1–US3.
- **US5 (Phase 7)**: depende de Foundational; T087 depende de T070 (US3) para propagar el fixture a `runLookup`, y aprovecha US1 (casos `simulado`).
- **Polish (Phase 8)**: depende de todas las historias que se entreguen.

### User Story Dependencies (orden de completitud recomendado)

`Foundational → US2 → US1 → US3 → US4 → US5 → Polish`

- **US2** se implementa antes que US1 aunque la spec la liste segunda: el perfil y el bloque ÁREAS (qué datos pedir) son lo que hace que un modelo REAL derive bien. Las piezas compartidas (contrato JSON, `normalizeAgentAction`, `resolveContactProfile`, interruptor) están en Foundational, así que US1 sigue siendo **probable de forma independiente** con ai-mock.
- **US1**: independiente con ai-mock tras Foundational.
- **US3**: independiente en su contenido; comparte la rama del pipeline con US2 (T058).
- **US4**: totalmente independiente (UI sobre una API foundational).
- **US5**: necesita US3 para los fixtures de consulta; sin US3, las personas de derivación igual se pueden medir.

### Within Each User Story

- Tests primero, en rojo; después implementación; al final la tarea "Verificar USx".
- Módulos de dominio (`src/server/areas/*`, `src/server/ai/lookups.ts`) antes del pipeline; pipeline antes del ai-mock y del E2E en verde.
- `src/server/ai/pipeline.ts`, `src/server/ai/prompts.ts` y `src/server/dev/ai-mock.ts` los tocan varias historias: nunca en paralelo entre sí.

### Parallel Opportunities

- Setup: T002, T003, T004 en paralelo.
- Foundational: los tests T007–T011 en paralelo; T013, T016, T017, T018, T019 en paralelo; T021 → (T023, T024) en paralelo; T029 y T030 en paralelo tras T028.
- US1: tests T033–T036 en paralelo; T038, T039, T040 en paralelo; T045 y T047 en paralelo.
- US2: tests T051–T053 en paralelo; T057 y T060 en paralelo con T055/T056.
- US3: tests T062–T064 en paralelo; T066 y T072 en paralelo.
- US4: T077 y T078 en paralelo; US4 completa puede correr en paralelo con US1/US2/US3 (otro escritor, archivos disjuntos).
- US5: tests T081–T083 en paralelo; T085 y T086 en paralelo.
- Polish: T092, T093, T094 en paralelo.

---

## Parallel Example: User Story 1

```bash
# Tests de US1 juntos (deben fallar):
Task: "tests/unit/area-handoff.test.ts — deriveToArea, ventana de 7 días, sandbox, cierre"
Task: "tests/unit/area-email.test.ts — asunto, Reply-To, BSUID, escapado, CC"
Task: "tests/unit/areas-sandbox.test.ts — guard estructural de sendMail"
Task: "tests/unit/templates.test.ts — marcador {{{x}}} solo SafeHtml"

# Piezas sin dependencia entre sí:
Task: "src/server/email/templates.ts — derivacion-area + SafeHtml"
Task: "docs/email-templates/derivacion-area.html"
Task: "src/server/areas/office-hours.ts"
```

## Parallel Example: User Story 2

```bash
Task: "tests/unit/prompt-ruteo.test.ts — bloques PERFIL y ÁREAS"
Task: "tests/unit/handoff.test.ts — respaldo consciente de áreas"
Task: "tests/unit/agent-action-areas.test.ts — ai_topic persistido"
# luego, en paralelo:
Task: "src/server/inbox/send.ts — sendText({ aiTopic })"
Task: "src/app/api/conversations/[id]/messages/route.ts — aiTopic en el DTO"
```

## Parallel Example: User Story 3

```bash
Task: "tests/unit/phone-timezone.test.ts"
Task: "tests/unit/lookups.test.ts"
Task: "tests/unit/teachers.test.ts — waPhone"
# luego, en paralelo:
Task: "src/lib/phone-timezone.ts"
Task: "src/server/teachers.ts — updateTeacher waPhone"
```

## Parallel Example: User Story 4

```bash
Task: "src/lib/nav.ts — pestaña Áreas"
Task: "src/components/settings/areas-client.tsx"
```

## Parallel Example: User Story 5

```bash
Task: "tests/unit/lab-fixture-guard.test.ts"
Task: "tests/unit/judge.test.ts — ruteo"
Task: "tests/unit/lab-sandbox.test.ts — simulado"
# luego, en paralelo:
Task: "src/server/lab/personas.ts — 5 personas + LabFixture"
Task: "src/server/lab/judge.ts — Verdict con ruteo"
```

---

## Implementation Strategy

### MVP = Foundational + US2 + US1

La derivación **necesita** la clasificación: sin perfil ni bloque ÁREAS un modelo real no sabe qué datos pedir ni a qué área mandar. Por eso el MVP es **Setup + Foundational + US2 + US1**, implementado en ese orden (US2 antes que US1):

1. Phase 1 Setup.
2. Phase 2 Foundational (enmienda constitucional primero).
3. Phase 4 US2 → validar checks 8, 13 y cambio de tema.
4. Phase 3 US1 → validar checks 1–7 y 14.
5. **STOP y VALIDAR**: gate + `E2E_SECCIONES=agente-por-areas`. Con el ruteo apagado en producción no cambia nada; se puede desplegar y encender primero en el Laboratorio (DV-012).

Hasta que exista US4, las áreas se cargan por `PUT /api/settings/areas/[area]` (API foundational).

### Incremental Delivery

1. MVP (US2 + US1) → derivación por correo.
2. + US3 → autoconsulta del alumno/profesor.
3. + US4 → pantalla de configuración (deja de hacer falta la API a mano).
4. + US5 → red de seguridad del Laboratorio, requisito para encender en producción (orden de encendido de DV-012: Laboratorio → casilla propia → casillas reales).
5. Polish: gate completo, E2E completo, CLAUDE.md, guía, paso operativo R1.

### Parallel Team Strategy

Un solo escritor por defecto (pipeline, prompts y ai-mock son archivos compartidos). Con un segundo escritor en worktree aislado, US4 completa corre en paralelo con US2/US1/US3 porque toca archivos disjuntos.

---

## Notes

- [P] = archivos distintos y sin dependencia de tareas incompletas.
- Cada historia termina con su tarea "Verificar USx" (tests + sección E2E en verde).
- No se commitea dentro de esta lista; el commit lo decide el dueño.
- Riesgos del plan cubiertos por tareas: R1 → T097; R3 → T032/T096; R4 → T033/T042; R5 → acotado por T069 (una sola segunda llamada).

## Línea base / cierre

_(T001 y T098 completan esta sección.)_

### Línea base (T001, 2026-10-08, antes de tocar código)

- `pnpm typecheck` y `pnpm lint`: verdes.
- `pnpm test`: 137 archivos / 1815 tests; 1 fallo intermitente por timeout
  (`cambio-de-contrasena.test.ts`, 5 s bajo carga) que pasa aislado (25/25).

### Cierre del MVP (Setup + Foundational + US2 + US1)

- Migración `0051_agente_por_areas` aplicada en `vocero` y `vocero_e2e`
  (respaldo `backups/vocero-pre-0051-20261008-113458.sql`), re-ejecutada sin
  error (idempotente); RLS + `tenant_isolation` en las 3 tablas;
  `areas.configurar` solo en `direccion`.
- Gate: typecheck + lint verdes; `pnpm test` 145 archivos / 1954 tests;
  `NEXT_DIST_DIR=.next-build pnpm build` verde.
- E2E `E2E_SECCIONES=agente-por-areas`: 42/42. Corrida completa
  `node --env-file=.env.e2e scripts/e2e-selftest.mjs` sobre una `vocero_e2e`
  recreada desde cero (las 52 migraciones): **620/620**.
- El arnés deja el m365-mock en modo falla como línea base (los bloques de
  007/014 y envíos masivos prueban "sin M365 el correo no sale"); la sección
  `agente-por-areas` lo apaga para sí y lo restaura.
- Notas de alcance del MVP:
  - T059: el ai-mock no despacha por `PERFIL DEL CONTACTO` (solo lo
    necesitan las consultas de la US3); sí devuelve `topic` en toda rama de
    ruteo, la aclaración y el handoff de la academia.
  - T036/T050: los casos del marcador `{{{x}}}` viven en
    `tests/unit/email-templates.test.ts` (el `templates.test.ts` del repo es
    de plantillas de WhatsApp).
  - T033: `deriveToArea` se prueba por sus decisiones puras
    (`planDerivation`, `emailOutcome`, `buildClosingText`,
    `deliverAreaClosing`) + guard estructural; el camino contra Postgres lo
    cubre el E2E.
  - Con el ruteo encendido y sin la US3, un `lookup` responde un texto fijo
    sin datos y ofrece la academia.
  - T002: `.env.example` documentado. `.env` y `.env.e2e` NO se tocaron (el
    asistente no tiene permiso sobre esos archivos): el E2E se corrió pasando
    `M365_*` (→ m365-mock del puerto 3005), `OPENROUTER_*` (→ ai-mock) y
    `AGENT_COALESCE_MS=800` por variables de entorno al levantar `next dev`.
  - Los ids del wa-mock (`wamid.mock.in/echo/out.N`) llevan ahora un sello de
    tiempo: el contador se reinicia con cada `DELETE` del outbox y chocaba con
    ids de corridas anteriores (la ingesta descartaba el entrante como
    duplicado y el saliente revertía el turno).
  - El cierre al cliente de una derivación corre en un SAVEPOINT: un error de
    Postgres al guardar el saliente ya no aborta la transacción del turno (y
    con ella el caso).
