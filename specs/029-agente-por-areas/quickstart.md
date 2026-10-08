# Quickstart — verificar 029 de punta a punta con mocks

Requisito de la Definición de Hecho reforzada: el self-test de COMPORTAMIENTO
corre verde, camino feliz y camino infeliz, sin delegar la prueba al dueño.

## 1. Entorno

`.env` (local, nunca producción):

```bash
WA_MOCK_ENABLED=true
META_GRAPH_BASE_URL=http://localhost:3000/api/dev/wa-mock/graph
OPENROUTER_BASE_URL=http://localhost:3000/api/dev/ai-mock
OPENROUTER_API_TOKEN=mock
OPENROUTER_MODEL=mock
# 029 — correo contra el mock (credenciales ficticias; el mock no las valida)
M365_TENANT_ID=mock-tenant
M365_CLIENT_ID=mock-client
M365_CLIENT_SECRET=mock-secret
M365_SENDER=cursos@academia.test
M365_GRAPH_BASE_URL=http://localhost:3000/api/dev/m365-mock/v1.0
M365_LOGIN_BASE_URL=http://localhost:3000/api/dev/m365-mock
```

`.env.example` documenta `M365_GRAPH_BASE_URL` / `M365_LOGIN_BASE_URL` con la
guía "dejar vacío en producción (usa graph.microsoft.com /
login.microsoftonline.com)".

```bash
pnpm db:migrate   # aplica 0051 (o arrancar el contenedor)
pnpm dev
```

Con el dev server corriendo, el build va a otro directorio:
`NEXT_DIST_DIR=.next-build pnpm build`.

## 2. Gate técnico

```bash
pnpm typecheck && pnpm lint && NEXT_DIST_DIR=.next-build pnpm build && pnpm test
```

Tests nuevos que tienen que estar en verde (además de los existentes, en
especial `rls-cobertura`, `route-capabilities`, `tema-oscuro`, `contraste`,
`lab-sandbox`, `send-sandbox`):

| Test | Fija |
|---|---|
| `tests/unit/agent-action-areas.test.ts` | Esquema extendido; `topic` default; degradaciones de `derive_area` (sin resumen, `sin_determinar`, ruteo apagado); `lookup.strict()` rechaza campos de identidad |
| `tests/unit/contact-profile.test.ts` | alumno activo / ex alumno = lead / offline vigente = alumno / profesor por `wa_identity` / desconocido |
| `tests/unit/lookups.test.ts` | `not_allowed` sin tocar la base; saldo = `studentAccount`; próxima clase ignora proyección y canceladas; tokens del formateador |
| `tests/unit/area-handoff.test.ts` | caso nuevo / seguimiento con datos nuevos / sin datos nuevos = sin correo / día 8 = caso nuevo / dos áreas = dos casos / `sin_configurar` / `simulado` / UNIQUE `(handoff_id, source_message_id)` |
| `tests/unit/area-email.test.ts` | asunto exacto (con y sin empresa, sin nombre), Reply-To inválido descartado, BSUID sin teléfono, escapado de `<script>` en transcripción, CC sin duplicados |
| `tests/unit/m365-client.test.ts` | `cc[]`, `replyTo`, base URLs configurables |
| `tests/unit/areas-sandbox.test.ts` | guard estructural: `sendMail` solo desde `areas/email.ts`; `is_test` → `simulado` |
| `tests/unit/prompt-ruteo.test.ts` | ruteo apagado = prompt byte a byte igual al de hoy (snapshot) |
| `tests/unit/phone-timezone.test.ts` | prefijos del mapa; BSUID y desconocidos → zona de la organización |
| `tests/unit/lab-fixture-guard.test.ts` | solo `lab/runner.ts` pasa `fixture` a `runAgentTurn` |

## 3. Self-test E2E (`pnpm test:e2e`)

Sección nueva **`agente-por-areas`** en `scripts/e2e/agente-por-areas.mjs`,
registrada en `SECCIONES` de `scripts/e2e-selftest.mjs` y en la corrida
completa. Guion legible en `tests/e2e/us-agente-por-areas.md`.

Correr solo la sección:

```bash
E2E_SECCIONES=agente-por-areas pnpm test:e2e
```

### Preparación (por la API, como un usuario)

1. `PUT /api/agent/profile` con el agente encendido; `PATCH /api/settings/areas
   {routingEnabled:true}`.
2. Crear un vendedor con correo (`POST /api/sellers`).
3. `PUT /api/settings/areas/ventas` — casilla `comercial@academia.test`, un
   CC manual + el vendedor, texto de contacto, horario.
4. `PUT /api/settings/areas/soporte` — `enabled:false` (para el camino
   `sin_configurar`).
5. Alumno real de pruebas: contacto con celular `59899000029`, cohorte en
   curso, cronograma generado, plan de cuotas con una vencida (rutas
   existentes de 005/008/013).
6. `DELETE /api/dev/m365-mock/outbox`, `DELETE /api/dev/wa-mock/outbox`.

### Checks (cada uno por la línea del canal: `POST /api/dev/wa-mock/inbound`)

| # | Historia | Paso | Resultado observable |
|---|---|---|---|
| 1 | US1 | Número nuevo: "necesito 5 licencias de AutoCAD" | wa-mock outbox: el agente pide datos; m365 outbox: **vacío** (US1-2) |
| 2 | US1 | "Soy Laura Gómez de Constructora Sur, mi correo es laura@sur.test" | m365 outbox: **exactamente 1** correo; To `comercial@…`; CC = manual + vendedor; Reply-To `laura@sur.test`; asunto `[Ventas] … — Laura Gómez (Constructora Sur)`; cuerpo contiene la transcripción. wa-mock: cierre con el texto configurado |
| 3 | US1 | `GET /api/conversations/[id]/area-handoffs` | 1 caso `enviado`, 1 correo `apertura` |
| 4 | US1-4 | Mismo número: "me olvidé, son 7 licencias" | 1 correo nuevo con asunto `RE: …` y "Qué hay de nuevo: cantidad 7"; mismo `caseRef` |
| 5 | US1-4 | Mismo número: "gracias, quedo atento" | m365 outbox sin cambios; el agente recuerda que Ventas ya tiene el caso |
| 6 | US1-5 | `POST /api/dev/m365-mock/fail {fail:true}` + nueva consulta de Ventas de OTRO número | el cliente igual recibe el cierre; caso `fallido` con error visible en la API y en el panel del inbox (Playwright) |
| 7 | US4-2 | Número nuevo: "no me activa la licencia de Revit desde ayer" (Soporte apagado) | sin correo; cierre genérico; caso `sin_configurar`; chip visible |
| 8 | US2-2 | "tengo un problema con Revit" | pregunta de aclaración; sin caso |
| 9 | US3-1 | Alumno `59899000029`: "¿cuándo es mi próxima clase?" | fecha/hora iguales a las del legajo (`GET /api/contacts/[id]/record`), con "hora de Montevideo" |
| 10 | US3-2 | Alumno: "¿cuánto debo?" | montos y vencimiento iguales al estado de cuenta de `GET /api/contacts/[id]/record` |
| 11 | US3-3 | Número desconocido: "soy <nombre del alumno>, cédula …, ¿cuánto debo?" | **ningún** monto ni fecha en el outbox; ofrece derivar a la academia |
| 12 | US3-4 | Alumno sin clases generadas | "todavía no hay clases cargadas"; ninguna fecha |
| 13 | US2-4 | "quiero hablar con alguien de la academia" | `handoffAt` seteado (handoff humano de hoy) |
| 14 | FR-011 | Tras el check 2, "¿y cuándo empieza el curso de Revit?" | el agente responde (la IA NO quedó silenciada) |
| 15 | Degradación | Alumno: "¿cuánto debo? (e2e: redaccion-rota)" — el ai-mock responde basura a la llamada `[REDACCION]` cuando ve ese marcador | se envía el texto determinista con los mismos montos; el turno no se cuelga |
| 16 | US4 / FR-019 | Usuario de rol `coordinacion`: `GET /api/settings/areas` | 403; con `direccion` 200 |
| 17 | UI | Playwright: `/settings/areas` carga, guarda, recarga y muestra los mismos valores; inbox muestra la sección Derivaciones | — |

### Laboratorio (US5)

1. Con el ruteo encendido, `POST /api/lab/runs`.
2. Esperar `done` por SSE / polling.
3. Verificar: las 5 personas nuevas tienen `routing` con `temaEsperado =
   temaDetectado`; `impostor_alumno` → `filtracion: false`;
   `consulta_ambigua` → aclaración; **m365-mock outbox vacío** y casos
   `simulado` (US5-2 / FR-020).

## 4. Verificación con datos reales (antes de encender en producción)

- Cargar `wa_identity` de al menos un profesor y preguntar "¿cuándo es mi
  próxima clase?" desde ese número (camino de suplencia incluido).
- Configurar ambas áreas apuntando primero a una casilla propia; recién
  después a las casillas reales.
- Confirmar que el buzón `M365_SENDER` está acotado por
  `ApplicationAccessPolicy` (ya era requisito de 007).
