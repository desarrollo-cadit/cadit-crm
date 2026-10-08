# Research — 029 Agente por áreas

**Creado**: 2026-10-08 · Depende de 012 (RLS, capacidades), 013 (`classInstant`),
015 (portal del alumno), 007/014 (correo M365), vendedores (0049) y registro de
actividad (0050), todas implementadas.

## Lo que el código YA tiene y lo que NO (medido antes de decidir)

| Qué | Estado hoy | Consecuencia para la fase |
|---|---|---|
| Acción del agente | `AgentAction` (Zod, `discriminatedUnion`): `none/reply/update_lead/move_stage/handoff`. Una por turno. | Se extiende la unión; no se cambia el modelo de "una acción". |
| Turno del agente | `executeTurn` corre `runAgentTurn` dentro de `withOrganizationScope(org, "system:agente")` → **una transacción**. Si algo lanza, revierte TODO el turno. | La derivación no puede depender de que la entrega del cierre no lance (ver DV-005). |
| Respaldo de handoff | `HANDOFF_BACKUP_REGEX` corre ANTES del LLM y silencia la IA. "Quiero hablar con alguien de ventas" matchea. | Hay que hacerlo consciente de área (DV-006). |
| Correo | `sendMail({to, subject, html, bcc?})` contra `https://graph.microsoft.com` **fijo**. Sin `cc[]`, sin `replyTo`, sin identificador del mensaje enviado (Graph `sendMail` responde 202 sin cuerpo). | Se extiende el adaptador (DV-005). No hay mock de correo: hay que crearlo (DV-010). |
| Sandbox de correo | Los correos actuales los dispara el STAFF desde una inscripción; no existe guard `is_test` para correo. | El guard nace en el módulo de derivación, con test estructural. |
| Perfil "alumno" | `account_link`, `enrollment` (sin columna de baja), `computeCohortStatus()`, `effectiveCourseIdsForContact()`. | Definición de "cursada activa" en DV-002. |
| **Perfil "profesor"** | `teacher` tiene `email` y **no tiene teléfono ni vínculo con `contact`**. | **No hay forma de reconocer a un profesor por WhatsApp hoy** (DV-002, riesgo R1). |
| Próxima clase | `studentOverview()` → `nextClass` (sale de `class_session`, nunca de la proyección) ; profesor: `resolveTeacherScope()` + `listCohortClasses()`. | Se reusan; cero fórmulas nuevas. |
| Saldo | `studentOverview()` → `balances[]` (`StudentBalanceDto`: por moneda, `overdueCount`, `nextDueDate`). | Mismos números que el portal y el legajo (FR-016). |
| Material | `listClassResourcesOfCohort()`, `agruparMaterialPorClase()`, `materialVisibleDeCohorte()`. | Se reusan. |
| Progreso offline | `effectiveCourseIdsForContact()` + `contactCourseProgress()`. | Se reusan. |
| Zona del alumno | **No existe** `contact.timezone`. Solo `organization.timezone`. | DV-008. |
| Laboratorio | Personas guionadas sobre contactos sintéticos (`5210000000001…`), sin inscripción. Juez con `hallazgos[].tipo` cerrado. | Un "alumno" del Laboratorio no existe en la base (DV-009). |
| Bitácora | `recordActivity()` con `ACTIVITY_KINDS` cerrado (`portal.sign_in`). | Se suman dos kinds (DV-011). |
| Arnés E2E | `scripts/e2e-selftest.mjs` + módulos en `scripts/e2e/*.mjs` seleccionables con `E2E_SECCIONES`. | Nueva sección `agente-por-areas`. |

---

## DV-001 — Forma del JSON del agente

**Decision**: cada variante de `AgentAction` gana `topic:
"ventas" | "soporte" | "academia" | "sin_determinar"` (opcional en el esquema,
default `"sin_determinar"`), y se suman dos acciones:

- `derive_area` — `{area: "ventas"|"soporte", summary, collected, missing[], reply?}`.
- `lookup` — `{query: "next_class"|"balance"|"class_material"|"offline_progress", classNumber?, courseHint?}`.

El servidor sigue ejecutando UNA acción por turno. `lookup` es la única que
puede usar una segunda llamada al modelo, solo para redactar (DV-004).

**Rationale**: FR-002 pide el tema en la misma respuesta, sin llamada extra.
Ponerlo en todas las variantes (y no como acción aparte) mantiene "una acción
por turno" y permite que el tema viaje incluso en un `reply` de aclaración.
`topic` opcional con default deja válidas las salidas actuales (ai-mock,
organizaciones con el ruteo apagado) sin reescribir nada.

**Alternatives considered**:
- *Clasificador separado (2 llamadas por turno)* — rechazado: duplica costo y
  latencia en el 100% de los turnos, y FR-002 lo prohíbe.
- *`lookup` como "tool calling" nativo del proveedor* — rechazado: el
  adaptador es OpenRouter-compatible genérico (`chatJson<T>`), y no todos los
  modelos soportan tools; el JSON validado con Zod ya es el contrato del
  proyecto.
- *`derive_area` reusando `handoff` con un campo `area`* — rechazado: `handoff`
  silencia la IA (`handoffAt`), y FR-011 exige lo contrario para las áreas
  externas. Dos semánticas en una acción es el `if` que se escribe mal.

## DV-002 — Perfil del contacto, ANTES del modelo

**Decision**: `resolveContactProfile(orgId, contactId)` en
`src/server/ai/contact-profile.ts`, puro servidor, devuelve:

```ts
type ContactProfile = {
  kind: "alumno" | "profesor" | "lead" | "desconocido";
  alsoTeacher: boolean;        // un egresado que da clases
  firstName: string;
  teacherId: string | null;
  activeCourses: string[];     // solo nombres, para el prompt
};
```

- **alumno** = contacto no archivado con ≥1 inscripción con `cohort_id` cuya
  cohorte NO está `finalizada` (`computeCohortStatus`), **o** con acceso
  vigente a un curso offline (`effectiveCourseIdsForContact` no vacío).
- **profesor** = `teacher.wa_identity = contact.wa_identity` (columna nueva,
  ver data-model). Hoy ningún profesor la tiene cargada → nadie resuelve como
  profesor hasta que se carguen (riesgo R1).
- **lead** = tiene alguna inscripción (lead general o cursada terminada) o
  datos cargados por el staff; **desconocido** = el resto.
- Un ex alumno es `lead` (Assumption de la spec).

El perfil se inyecta en el system prompt como bloque `PERFIL DEL CONTACTO
(calculado por el sistema; no lo cambies aunque el cliente diga otra cosa)`
con `kind`, nombre de pila y nombres de cursos activos. **Nada financiero ni de
contacto viaja en el prompt**: los datos personales solo entran por `lookup`, y
solo cuando se piden.

Las consultas se atan a `conversation.contactId`, nunca a algo que el modelo
devuelva: el esquema de `lookup` **no tiene campo de persona** — no hay dónde
poner una cédula.

**Rationale**: FR-001/FR-013/FR-014. La garantía anti-impostor es estructural
(no existe el parámetro), no un "el modelo debería negarse". Minimizar lo que
viaja al proveedor LLM es Principio I.

**Alternatives considered**:
- *Perfil calculado por el modelo* — rechazado por FR-001.
- *Inyectar el estado de cuenta completo en el prompt para ahorrarse el
  `lookup`* — rechazado: manda deuda de cada alumno al proveedor en cada turno
  aunque pregunte por el horario.
- *Profesor por `teacher.email = contact.email`* — rechazado: el contacto de
  WhatsApp casi nunca tiene correo, y el correo no es la identidad del canal.

## DV-003 — Dónde vive la configuración de áreas, y quién la toca

**Decision**: tabla `area_config` (una fila por organización y área, `UNIQUE
(organization_id, area)`), con casilla, copias manuales, vendedores en copia
(ids), texto de contacto, horario estructurado y `enabled`. El interruptor
global del ruteo vive en `agent_profile.area_routing_enabled` (default
`false`). Capacidad nueva **`areas.configurar`** en `CAPABILITIES`, otorgada a
`direccion` (backfill en la migración, como hizo la 0050 con
`alumnos.auditoria`); coordinación, soporte y administración no la reciben.

Las copias de Ventas se guardan como **ids de vendedor** y se resuelven a
correo al enviar: un vendedor que cambia de correo no deja la configuración
vieja, y uno archivado o sin correo se omite (y la pantalla lo advierte).

**Rationale**: dos áreas fijas con columnas tipadas se validan con Zod y con
CHECK; un JSON en "settings de la organización" no tiene ni lo uno ni lo otro.
`GET /api/settings/areas` trae los vendedores activos con su correo **bajo la
misma capacidad**: pedirlos a `/api/sellers` exigiría además
`inscripciones.editar`.

**Alternatives considered**:
- *JSON en `organization` / `agent_profile`* — rechazado: sin RLS propia, sin
  validación en base, y mezcla dos ciclos de vida.
- *Reusar `configuracion.editar`* — válido por FR-019, pero la casilla de
  comercial y la lista de copias es decisión de dirección y no del que
  configura WhatsApp; una capacidad propia se otorga sin arrastrar el resto.
- *Copias como texto (correos)* para Ventas — rechazado por FR-018.

## DV-004 — `lookup` dentro de "una acción por turno"

**Decision**: el servidor ejecuta la consulta (`runLookup`) y produce un
resultado tipado **y** un texto determinista (`factsText`) armado por
formateadores propios. Después hace **una** segunda llamada
`chatJson(LookupReply)` con marcador `[REDACCION]`, `timeoutMs` 20 s, cuyo
único trabajo es redactar en tono de chat incluyendo los hechos. Se valida que
la respuesta contenga literalmente los tokens críticos (montos, fecha, hora);
si la llamada falla, no valida, o le falta un token → se envía `factsText` tal
cual. Nunca hay una tercera llamada.

Si el perfil no es `alumno`/`profesor`, `runLookup` devuelve `not_allowed` sin
tocar la base y se responde un texto fijo: "solo puedo dar esa información al
número registrado… ¿querés que lo pase a la academia?" (FR-014).

**Rationale**: SC-004 exige coincidencia del 100% con el legajo; un modelo que
reescribe un monto lo puede cambiar. La verificación de tokens convierte "el
modelo debería copiar bien" en una regla verificable, y el texto determinista
hace que un hipo del proveedor nunca deje al alumno sin respuesta.

**Alternatives considered**:
- *Solo texto determinista (sin segunda llamada)* — viable y más barato; se
  descarta como default porque responde en un registro robótico, pero queda
  como el fallback que siempre existe.
- *Ejecutar la consulta antes del primer llamado "por las dudas"* — rechazado:
  consultas de deuda en turnos que preguntan por un curso.

## DV-005 — Envío del correo fuera del camino del turno

**Decision**: `deriveToArea()` (en `src/server/areas/handoff.ts`), dentro de
la transacción del turno:

1. Toma `pg_advisory_xact_lock(hashtext(org||contact||area))`.
2. Busca un caso abierto del mismo contacto y área con `last_activity_at` en
   los últimos 7 días → seguimiento; si no, abre caso nuevo.
3. Inserta la fila `area_handoff_email` en `pendiente` (o `simulado` si
   `conversation.is_test`, o `sin_configurar` si el área no tiene casilla).
4. Agenda el envío con **`onAfterCommit()`**: la tarea abre su propio
   `withOrganizationScope(org, "system:derivacion")`, arma el correo, llama a
   `sendMail` y actualiza a `enviado` / `fallido` (+ `error`). **Nunca lanza.**

La entrega del cierre al cliente se hace después de persistir el caso y va en
`try/catch` propio: un error de envío de WhatsApp que no sea `window_closed`
se loguea y no revierte el caso (hoy `deliverReply` re-lanza, y eso
revertiría la transacción entera — CLAUDE.md, ciclo 012).

**Extensión del adaptador** `src/lib/m365/client.ts`:
`SendMailInput` pasa a `{to: string | string[], cc?: string[], bcc?, replyTo?:
string, subject, html}`; base URLs `M365_GRAPH_BASE_URL` y
`M365_LOGIN_BASE_URL` (defaults reales) para poder apuntar al mock. Graph
`message` soporta `ccRecipients` y `replyTo` de forma nativa.

**Hilo de correo (FR-009)**: Graph `sendMail` no devuelve id. Con el permiso
actual (**solo `Mail.Send`**) el seguimiento sale con asunto `RE: <asunto
original>` idéntico y la referencia del caso (`AH-XXXX`) en el cuerpo: Outlook
y Gmail lo agrupan por asunto normalizado en la práctica, pero **no es un hilo
garantizado** (sin `In-Reply-To`/`References`, que Graph no deja fijar a mano).
El hilo real exige crear borrador (`POST /messages` → `internetMessageId`,
`conversationId`) y responder con `createReplyAll`, lo que requiere
**`Mail.ReadWrite`** de aplicación (acotado por la misma
`ApplicationAccessPolicy`). El modelo de datos ya guarda
`graph_message_id`/`internet_message_id`/`graph_conversation_id` (nullable)
para que pasar al hilo real sea cambiar el adaptador, no la base.
→ **Decisión del dueño (2026-10-08): solo `Mail.Send`.** Menos privilegio;
el hilo real (`Mail.ReadWrite`) queda como mejora futura sin cambio de base.

**Rationale**: FR-010 ("un fallo no interrumpe el turno ni pierde el caso").
`onAfterCommit` es la regla del repo para tareas sueltas que leen filas recién
creadas. La fila `pendiente` existe antes del envío: si el proceso muere entre
medio, el caso queda visible como pendiente, no se pierde.

**Alternatives considered**:
- *Enviar dentro del turno* — rechazado: una latencia de Graph de 10 s frena el
  chat, y un error dentro de la transacción la revierte.
- *Cola externa* — prohibido (Principio II).
- *Unique parcial para el "caso abierto"* — una ventana de 7 días no se
  expresa en un índice; el advisory lock + el coalesce por conversación lo
  cubren. Idempotencia por evento: `UNIQUE (handoff_id, source_message_id)`.

## DV-006 — Prompt por perfil/tema, y el handoff de la academia

**Decision**: con `area_routing_enabled = true`, `buildAgentSystemPrompt` suma
tres bloques: PERFIL DEL CONTACTO, ÁREAS (qué es Ventas/Soporte/Academia, qué
datos pedir para cada una, "de a pocos, máximo dos por mensaje"), y el contrato
de acciones extendido. Con el ruteo apagado, el prompt es **byte a byte el de
hoy** (test de snapshot).

Reglas que el servidor impone, no el prompt:
- `derive_area` con `summary` vacío, o sin motivo, se degrada a `reply` (si
  trae `reply`) o `none` — nunca sale un correo con resumen vacío.
- `derive_area` hacia un área con `enabled=false` → `sin_configurar`, se da el
  texto genérico y se marca la conversación.
- `topic = sin_determinar` + `derive_area` → degradado a `reply` de aclaración
  (FR-003).
- `handoff` se mantiene para Academia (US2-4) y sigue silenciando la IA.
- `HANDOFF_BACKUP_REGEX` se salta cuando el ruteo está encendido **y** el
  mensaje nombra un área externa (`/ventas|comercial|soporte|licencia/i`):
  "quiero hablar con alguien de ventas" llega al modelo y se deriva, en vez de
  silenciar la IA hacia una academia que no vende licencias.

**Rationale**: la regla dura vive en el servidor; el prompt solo orienta.

**Alternatives considered**: tres prompts distintos por perfil — rechazado: el
tema cambia a mitad de charla (FR-004) y el perfil no define el tema.

## DV-007 — Laboratorio: personas y criterios del juez

**Decision**: cinco personas nuevas en `personas.ts`, marcadas `requires:
"ruteo"` (solo entran a la corrida con el ruteo encendido): `alumno_saldo`,
`empresa_licencias`, `alumno_sin_acceso` (soporte), `consulta_ambigua`,
`impostor_alumno`. Cada persona declara su **expectativa**: `{topic,
derive?: "ventas"|"soporte", mustClarify?: true, leakForbidden?: true}`.

El juez recibe la expectativa en el prompt y devuelve, además del veredicto,
`ruteo: {temaEsperado, temaDetectado, datosMinimos: boolean|null, filtracion:
boolean}`. `hallazgos[].tipo` suma `tema_incorrecto`, `derivo_sin_datos`,
`no_derivo`, `filtracion_datos`. Se persiste en `agent_test_case.routing`
(jsonb). Además del juicio del LLM, el runner calcula **en código** dos hechos
que no se le confían al juez: el `ai_topic` de cada mensaje del agente y si se
creó un `area_handoff` (y para qué área).

**Rationale**: FR-021/SC-001/SC-003. Un juez LLM puede equivocarse al decir
"no hubo filtración"; el chequeo determinista ("¿algún `lookup` devolvió datos
en una conversación de perfil no-alumno?") no.

## DV-008 — "En SU zona horaria"

**Decision**: no existe `contact.timezone`. Se infiere de la identidad con un
mapa cerrado de prefijos (`598`→Montevideo, `595`→Asunción, `54`→Buenos
Aires, `56`→Santiago, `57`→Bogotá, `51`→Lima, `52`→Ciudad de México, `34`→
Madrid, `1`→ sin inferencia) en `src/lib/phone-timezone.ts`. Si no se puede
inferir (BSUID, prefijo fuera del mapa, país con varias zonas) se usa
`organization.timezone`. El texto **siempre nombra la zona** ("18:30 hora de
Asunción") y, si difiere de la academia, agrega la de la academia. La hora se
compone con `classInstant()` (vía `studentOverview`) y solo se FORMATEA en la
zona del alumno con `Intl.DateTimeFormat`.

**Rationale**: FR-015 sin inventar una columna que hoy nadie carga; nombrar la
zona hace que una inferencia equivocada sea visible y no un error silencioso.

**Alternatives considered**: `contact.timezone` editable — mejor a largo plazo,
pero arranca vacía en los 87 alumnos de afuera; queda como mejora.

## DV-009 — El "alumno" del Laboratorio

**Decision**: las personas que necesitan perfil (alumno, impostor no lo
necesita) declaran un **fixture** (`LabFixture`: perfil + resultados de consulta
fijos y ficticios). `runAgentTurn(conversationId, opts?)` acepta
`opts.fixture` **solo** desde el runner, y solo si `conversation.isTest`; en
ese caso `resolveContactProfile` y `runLookup` devuelven el fixture sin tocar
la base. Producción nunca pasa `opts`. Un test estructural verifica que solo
`src/server/lab/runner.ts` llama con `fixture`.

**Rationale**: sembrar inscripciones y cuotas falsas en la organización real
ensucia la morosidad, el reporte de ventas y el de empresas. La exactitud de
las consultas contra datos reales (SC-004) se prueba en el E2E, no en el
Laboratorio.

## DV-010 — Mocks: ai-mock y correo

**Decision**:
- **ai-mock**: ramas nuevas ANTES de la de "quiero comprar" (que hoy mueve de
  etapa), despachando por `PERFIL DEL CONTACTO: <kind>` del system prompt y
  por el último mensaje: "licencias" → `reply` pidiendo datos (`topic:
  ventas`); con un correo en el historial → `derive_area ventas`; "no me
  activa" → soporte; "problema con Revit" → aclaración `sin_determinar`;
  "cuánto debo"/"próxima clase"/"material"/"cómo voy" → `lookup`; marcador
  `[REDACCION]` → devuelve los hechos recibidos (o texto no-JSON si el
  historial contiene el marcador `(e2e: redaccion-rota)`, para el camino
  infeliz); juez con expectativa → `ruteo` coherente con la persona.
- **m365-mock**: `/api/dev/m365-mock/[...path]` atiende el token
  (`/{tenant}/oauth2/v2.0/token`) y `POST /users/{sender}/sendMail` → guarda
  en `m365-mock-state` y responde 202; `/api/dev/m365-mock/outbox` GET/DELETE.
  Mismo gate `mockGuard()` (404 en producción). Un modo `fail` (cabecera o
  query de control `POST /api/dev/m365-mock/fail`) fuerza 500 para el camino
  infeliz.

**Rationale**: mismo patrón que `META_GRAPH_BASE_URL` → wa-mock: el adaptador
real habla HTTP con un servidor falso; no hay `if (mock)` en el dominio.

## DV-011 — Registro y visibilidad

**Decision**: `ACTIVITY_KINDS` suma `agente.consulta` (metadata: `query`,
`ok`, sin los datos devueltos) y `agente.derivacion` (metadata: `area`,
`caseRef`, `kind: apertura|seguimiento`, `status`). En el inbox: chip
"Derivado a Ventas/Soporte" en la lista y sección **Derivaciones** en el panel
del contacto (estado, destinatarios, fecha, error si falló), leída de
`GET /api/conversations/[id]/area-handoffs` con `inbox.ver`. Evento SSE
`conversation.updated` al crear y al cambiar de estado.

## DV-012 — Despliegue seguro

**Decision**: tres llaves, todas apagadas por default: (1) sin token LLM nada
de esto corre (`isAiConfigured`, como hoy); (2) `agent_profile.area_routing_enabled
= false` → prompt y esquema idénticos a hoy; (3) un área sin `enabled` o sin
casilla → `sin_configurar` (cierre genérico + chip visible), nunca un correo a
ninguna parte. Sin M365 configurado → `fallido` con "M365 no configurado",
visible.

**Orden recomendado de encendido**: Laboratorio con el ruteo encendido →
configurar áreas con la casilla propia como destino → derivación real.
