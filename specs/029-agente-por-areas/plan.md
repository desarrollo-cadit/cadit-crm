# Implementation Plan: Agente por áreas — derivación por correo y autoconsulta del alumno

**Branch**: `029-agente-por-areas` | **Date**: 2026-10-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/029-agente-por-areas/spec.md`

Asume [research.md](research.md) (12 DV resueltas), [data-model.md](data-model.md)
y los contratos de [contracts/](contracts/).

## Summary

El agente deja de tener un único `handoff` genérico. En cada turno: (1) el
**servidor** calcula quién escribe (`resolveContactProfile`: alumno con cursada
activa, profesor, lead, desconocido) y lo inyecta en el prompt; (2) el modelo
devuelve, en la MISMA respuesta JSON, el `topic` (ventas/soporte/academia/
sin_determinar) y una acción; (3) el servidor actúa según el área:

- **Ventas/Soporte** → `derive_area`: caso `area_handoff` con ventana de
  seguimiento de 7 días, correo por Graph a la casilla del área con CC y
  Reply-To, enviado con `onAfterCommit` fuera del camino del turno; el cliente
  recibe siempre el texto de contacto configurado; la IA sigue activa.
- **Academia** → `lookup` de una lista cerrada (próxima clase, saldo,
  material, progreso offline) sobre el contacto de la conversación, reusando
  `studentOverview`, `listClassResourcesOfCohort`, `contactCourseProgress`,
  `resolveTeacherScope`; una segunda llamada solo redacta, con fallback
  determinista. El `handoff` humano de la academia queda como está.

Todo detrás de `agent_profile.area_routing_enabled` (default apagado) y sin
token LLM nada cambia. Requiere enmienda MINOR de la constitución (1.4.0 →
1.5.0) para el uso de Graph en correo interno.

## Technical Context

**Language/Version**: TypeScript 5 estricto (`strict` + `noUncheckedIndexedAccess`), Node 20

**Primary Dependencies**: Next.js 15 (App Router) + React 19, Drizzle ORM, Zod, Better Auth (organization), Tailwind (tema Atlas por tokens). Sin dependencias nuevas.

**Storage**: PostgreSQL. Migración `0051_agente_por_areas.sql`: tablas `area_config`, `area_handoff`, `area_handoff_email` (RLS + `tenant_isolation` a mano); columnas `agent_profile.area_routing_enabled`, `teacher.wa_identity`, `message.ai_topic`, `agent_test_case.routing`; backfill de `areas.configurar` en `direccion`.

**Testing**: Vitest (unit, incluidos guards estructurales) + arnés E2E `scripts/e2e-selftest.mjs` (sección nueva `agente-por-areas`) contra wa-mock + ai-mock + **m365-mock nuevo**; Playwright para `/settings/areas` y el panel del inbox.

**Target Platform**: Contenedor Docker (Linux) self-hosted, Coolify o compose + Caddy.

**Project Type**: Monolito web (Next.js App Router, API + UI en el mismo proyecto).

**Performance Goals**: el turno con `lookup` responde en una sola tanda de mensajes (SC-005): ≤ 2 llamadas LLM por turno, la 2.ª con `timeoutMs` 20 s; el envío del correo nunca suma latencia al turno.

**Constraints**: una acción por turno; sandbox `is_test` sin correo ni WhatsApp real; ningún dato personal a un contacto no-alumno (estructural); fechas de clase solo vía `classInstant()`; números idénticos al legajo; colores solo por tokens; capacidades, no roles.

**Scale/Scope**: una organización real; ~340 alumnos (87 fuera de Uruguay), 7 profesores (0 con teléfono cargado), 2 áreas externas. 2 pantallas nuevas/modificadas (Configuración › Áreas; panel del inbox), 4 rutas nuevas.

## Constitution Check

*GATE: pasa antes de Phase 0 con la enmienda planificada. Re-evaluado después de Phase 1 (abajo).*

| Principio | Cómo lo cumple | Estado |
|---|---|---|
| **I — Seguridad** | Las consultas se atan a `conversation.contactId`; el esquema `lookup` no tiene campo de identidad (`.strict()`). Datos financieros nunca en el prompt base: solo vía `lookup` y solo a perfil alumno. Correo: todo valor escapado (`SafeHtml` para bloques); `error` de Graph sin secretos; `m365Configured` es un booleano, nunca la credencial. | ✅ |
| **II — Soberanía** | Sin servicios nuevos. Graph ya es dependencia permitida, **pero su alcance escrito es "correo transaccional a los alumnos"**: el correo interno a áreas del staff lo excede. | ⚠️ **Enmienda MINOR 1.4.0 → 1.5.0** (tarea T-CONST, abajo). Q1 resuelta (2026-10-08): solo `Mail.Send`, sin permisos nuevos en Entra ID. |
| **III — Multi-tenancy** | Tres tablas nuevas con `organization_id NOT NULL`, índices org-first, RLS `tenant_isolation`; toda query por `scoped()`; la tarea de envío abre `withOrganizationScope(org, "system:derivacion")`. `rls-cobertura.test.ts` las cubre. | ✅ |
| **IV — Idempotencia** | `UNIQUE (handoff_id, source_message_id)`: re-ejecutar el turno del mismo entrante no duplica correo. Advisory lock por (org, contacto, área) para "un caso abierto". Migración re-ejecutable. La marca `sent_at` se escribe después del 202. | ✅ |
| **V — Calidad verificable** | Gate técnico + tests listados en [quickstart.md](quickstart.md) §2. | ✅ |
| **VI — Specs antes de código** | spec.md → este plan → tasks.md. | ✅ |
| **VII — Trazabilidad** | Supuestos visibles: inferencia de zona horaria por prefijo (DV-008), hilo por asunto (DV-005, Q1 resuelta: `Mail.Send`), profesor sin identidad cargada (R1). | ✅ |
| **VIII — Foco vertical** | Es atender y rutear conversaciones de WhatsApp de UN negocio; el correo es el puente a áreas que no usan el CRM, no un canal de marketing. | ✅ |
| **IX — Verificación en vivo** | Sección E2E `agente-por-areas` por la línea del canal (wa-mock) con correo observable (m365-mock outbox), incluidos caminos infelices (Graph caído, área sin configurar, redacción rota, impostor). | ✅ |

### Enmienda planificada (T-CONST) — texto propuesto

Principio II, ítem 3, reemplazar por:

> 3. **Microsoft 365 / Microsoft Graph**, para el envío de correo
>    transaccional a alumnos y profesores (términos de licencia ATC,
>    bienvenida a la cohorte, acceso al portal) **y para el correo de
>    derivación interna que el agente de IA envía a las áreas del propio
>    negocio que no operan el CRM (p. ej. Ventas y Soporte), con el resumen
>    del caso y la transcripción de la conversación**, accedido EXCLUSIVAMENTE
>    a través del adaptador `src/lib/m365`. Autenticación por client
>    credentials contra Entra ID; el buzón emisor DEBE estar acotado con una
>    `ApplicationAccessPolicy` de Exchange Online, porque los permisos de
>    aplicación de correo (`Mail.Send`) sin
>    acotar habilitan operar sobre CUALQUIER buzón del tenant. Las
>    conversaciones de prueba (`is_test`) JAMÁS envían correo.

Sync Impact Report a agregar:

```text
Versión: 1.4.0 → 1.5.0
Cambios (1.5.0, 2026-10-08):
  - Principio II, ítem 3: el alcance de Microsoft 365 / Graph se AMPLÍA del
    correo transaccional a alumnos al correo de derivación interna a áreas
    del staff que no usan el CRM (feature 029-agente-por-areas). Sin servicio
    externo nuevo; mismo adaptador. Se nombra a los profesores (ya recibían
    el acceso al portal desde 014) y se fija que `is_test` no envía correo.
  Bump: MINOR — amplía el alcance de una dependencia ya permitida sin
  redefinir principios.
```

Pie: `**Version**: 1.5.0 | **Ratified**: 2026-07-09 | **Last Amended**: <fecha de implementación>`.
Se aplica como PRIMERA tarea de implementación, antes de cualquier código
que envíe correo a un área.

### Re-check post-diseño (Phase 1)

Sin cambios respecto de la tabla: el diseño no agregó dependencias, todas las
tablas nuevas tienen RLS, y el único punto que requiere enmienda sigue siendo
II. Complexity Tracking vacío.

## Project Structure

### Documentation (this feature)

```text
specs/029-agente-por-areas/
├── spec.md
├── plan.md                    # este archivo
├── research.md                # DV-001..DV-012
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── agente.md              # JSON del agente (topic, derive_area, lookup)
│   ├── consultas.md           # lista cerrada de lookups y reuso
│   ├── api-areas.md           # rutas + capacidades + mocks
│   └── correo-derivacion.md   # sobre, asunto, cuerpo, escapado, sandbox
├── checklists/
└── tasks.md                   # /speckit-tasks (no lo crea este comando)
```

### Source Code (repository root)

```text
.specify/memory/constitution.md                 # MOD  T-CONST 1.4.0 → 1.5.0
drizzle/0051_agente_por_areas.sql               # NEW  tablas + RLS + columnas + backfill
drizzle/meta/…                                  # NEW  snapshot (db:generate)

src/lib/
├── db/schema.ts                                # MOD  area_config, area_handoff, area_handoff_email; columnas nuevas
├── db/ids.ts                                   # MOD  prefijos ac_, ah_, ahe_
├── capabilities.ts                             # MOD  "areas.configurar" (solo direccion en SYSTEM_ROLES)
├── activity-kinds.ts                           # MOD  "agente.consulta", "agente.derivacion"
├── areas.ts                                    # NEW  AREAS, AREA_LABELS, tipos compartidos UI/servidor, rótulos de campos
├── phone-timezone.ts                           # NEW  timeZoneForIdentity()
├── env.ts                                      # MOD  M365_GRAPH_BASE_URL, M365_LOGIN_BASE_URL
├── nav.ts                                      # MOD  pestaña Configuración › Áreas (capability areas.configurar)
└── m365/client.ts                              # MOD  to[], cc[], replyTo, base URLs

src/server/
├── ai/actions.ts                               # MOD  topic + derive_area + lookup; degradaciones
├── ai/prompts.ts                               # MOD  bloques PERFIL/ÁREAS/contrato (solo con ruteo); prompt [REDACCION]; juez con expectativa
├── ai/pipeline.ts                              # MOD  perfil antes del LLM; ramas derive_area/lookup; ai_topic; cierre sin revertir el caso; opts.fixture (solo lab)
├── ai/handoff.ts                               # MOD  regex de respaldo consciente de áreas externas
├── ai/contact-profile.ts                       # NEW  resolveContactProfile()
├── ai/lookups.ts                               # NEW  runLookup(), formatFacts(), phraseLookupReply()
├── areas/config.ts                             # NEW  getAreaConfigs(), saveAreaConfig(), resolveRecipients()
├── areas/office-hours.ts                       # NEW  isWithinOfficeHours() (compone con classInstant)
├── areas/handoff.ts                            # NEW  deriveToArea(): lock, caso/seguimiento, fila email, onAfterCommit, guard is_test
├── areas/email.ts                              # NEW  buildHandoffEmail(), sendHandoffEmail() — único caller de sendMail en areas/
├── email/templates.ts                          # MOD  TemplateName "derivacion-area"; marcador {{{x}}} solo SafeHtml
├── inbox/send.ts                               # MOD  sendText({… aiTopic?})
├── teachers.ts                                 # MOD  updateTeacher: waPhone → wa_identity normalizada (409 si duplicada)
├── lab/personas.ts                             # MOD  5 personas nuevas (requires:"ruteo", expected, fixture)
├── lab/judge.ts                                # MOD  Verdict + ruteo; tipos nuevos de hallazgo
├── lab/runner.ts                               # MOD  filtra personas por ruteo; pasa fixture; hechos deterministas → routing
├── dev/ai-mock.ts                              # MOD  ramas de ruteo, lookup, [REDACCION], juez con ruteo
└── dev/m365-mock-state.ts                      # NEW  outbox + modo falla

src/app/
├── api/settings/areas/route.ts                 # NEW  GET, PATCH (areas.configurar)
├── api/settings/areas/[area]/route.ts          # NEW  PUT (areas.configurar)
├── api/conversations/[id]/area-handoffs/route.ts # NEW GET (inbox.ver)
├── api/conversations/route.ts                  # MOD  lastAreaHandoff en la lista
├── api/teachers/[id]/route.ts                  # MOD  waPhone en patchSchema
├── api/dev/m365-mock/[...path]/route.ts        # NEW  token + sendMail (mockGuard)
├── api/dev/m365-mock/outbox/route.ts           # NEW  GET/DELETE
├── api/dev/m365-mock/fail/route.ts             # NEW  POST
└── (app)/settings/areas/page.tsx               # NEW

src/components/
├── settings/areas-client.tsx                   # NEW  formulario de las dos áreas + interruptor del ruteo
├── inbox/area-handoffs.tsx                     # NEW  sección Derivaciones del panel
├── inbox/contact-panel.tsx                     # MOD  monta Derivaciones
├── inbox/conversation-list.tsx                 # MOD  chip "Derivado a …" / "Derivación fallida"
└── academic/teacher-form.tsx                   # MOD  campo "Celular (WhatsApp)"

docs/email-templates/derivacion-area.html       # NEW
.env.example                                    # MOD  M365_GRAPH_BASE_URL / M365_LOGIN_BASE_URL con guía
CLAUDE.md                                       # MOD  filas del mapa: "Ruteo por áreas / derivación" y "Consultas del agente"

scripts/e2e/agente-por-areas.mjs                # NEW  sección E2E
scripts/e2e-selftest.mjs                        # MOD  registra la sección
tests/e2e/us-agente-por-areas.md                # NEW  guion
tests/unit/
├── agent-action-areas.test.ts                  # NEW
├── contact-profile.test.ts                     # NEW
├── lookups.test.ts                             # NEW
├── area-handoff.test.ts                        # NEW
├── area-email.test.ts                          # NEW
├── areas-sandbox.test.ts                       # NEW  guard estructural
├── prompt-ruteo.test.ts                        # NEW  snapshot ruteo apagado
├── phone-timezone.test.ts                      # NEW
├── lab-fixture-guard.test.ts                   # NEW
├── m365-client.test.ts                         # NEW/MOD cc, replyTo, base URLs
├── rls-cobertura.test.ts                       # (sin cambio: debe pasar con las 3 tablas nuevas)
└── route-capabilities.test.ts                  # (sin cambio: debe pasar con las rutas nuevas)
```

**Structure Decision**: monolito Next.js existente. El dominio nuevo vive en
`src/server/areas/` (configuración, caso, correo) y `src/server/ai/`
(perfil, consultas), siguiendo las fronteras del mapa de CLAUDE.md: el cerebro
LLM no se toca (`src/lib/ai`), Graph sigue detrás de `src/lib/m365`, y las
consultas solo REUSAN `student-portal.ts`, `teacher-portal.ts`, `classes.ts`,
`resources.ts` y `offline-courses/`.

## Orden, y por qué es ese

### Paso 0 — Enmienda (T-CONST)
Antes de cualquier línea que mande correo a un área. Texto arriba.

### Paso 1 — Datos y llaves (bloquea todo)
Migración 0051, schema, ids, capacidad, activity kinds, `phone-timezone`,
extensión del adaptador M365 + m365-mock. **Va primero porque el mock es lo
que permite probar el resto sin un tenant real.**

### Paso 2 — US2: perfil + tema (P1, base de las otras)
`resolveContactProfile`, `topic` en el esquema, prompt con ruteo (y snapshot
del prompt apagado), regex de respaldo consciente de áreas, `message.ai_topic`.
Test de impostor estructural acá, no al final.

### Paso 3 — US1: derivación (P1)
`deriveToArea` + correo + cierre al cliente + panel del inbox. Se prueba con
valores de área cargados por API (la pantalla llega en el paso 5, como dice
la spec de US4).

### Paso 4 — US3: autoconsulta (P2)
`runLookup` sobre funciones existentes, formateo determinista, segunda
llamada con validación de tokens. Profesor por `wa_identity` + campo en el
formulario de profesor.

### Paso 5 — US4: configuración (P2)
Rutas + `/settings/areas`. Tokens de tema, `contraste`, `tema-oscuro`.

### Paso 6 — US5: Laboratorio (P3)
Personas, fixtures, juez con ruteo, hechos deterministas.

### Paso 7 — Cierre
Gate + `E2E_SECCIONES=agente-por-areas` + corrida E2E completa (que nada de lo
anterior se rompió, en especial `us3-agent` y `us4-lab` con el ruteo apagado)
+ filas de CLAUDE.md.

## Riesgos y preguntas abiertas

- **Q1 — hilo de correo real. RESUELTA (2026-10-08): solo `Mail.Send`**; el
  hilo real queda como mejora futura. Con el permiso actual
  (`Mail.Send`), el seguimiento va como `RE: <asunto>` y se agrupa por asunto,
  sin `In-Reply-To`: en la práctica Outlook/Gmail lo muestran junto, pero no
  está garantizado. El hilo real necesita `Mail.ReadWrite` de aplicación en
  Entra ID (acotado por la misma política). El plan implementa la variante
  `Mail.Send` y deja las columnas listas para la otra.
- **R1 — Profesores invisibles por WhatsApp.** 0 de 7 profesores tienen
  teléfono; `teacher` no tiene vínculo con `contact`. Hasta que alguien cargue
  "Celular (WhatsApp)" en cada ficha, un profesor que escribe resuelve como
  `lead`/`desconocido` y NO recibe sus clases (fallo seguro, pero la historia
  "profesor pregunta su próxima clase" no funciona de entrada). Paso operativo
  a decir en voz alta, como los correos de 014.
- **R2 — Zona horaria inferida.** No existe `contact.timezone`; se infiere por
  prefijo y el texto siempre nombra la zona (DV-008). Argentina/México con
  varias zonas o BSUID caen a la de la academia.
- **R3 — El regex de respaldo.** Hoy "hablar con alguien de ventas" silencia la
  IA hacia la academia. El cambio (DV-006) solo aplica con el ruteo encendido;
  hay que verificar que `us3-agent` (ruteo apagado) siga igual.
- **R4 — Rollback de la transacción del turno.** `deliverReply` re-lanza
  errores ≠ `window_closed`; si no se encapsula, un fallo de WhatsApp borraría
  el caso ya creado. Va con test.
- **R5 — Costo LLM.** Los turnos con `lookup` hacen 2 llamadas. Acotado a ese
  tipo de turno; el resto no cambia.

## Complexity Tracking

Sin violaciones que justificar (la ampliación de Graph se resuelve por
enmienda, no por excepción).
