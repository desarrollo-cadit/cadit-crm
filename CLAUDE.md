# CadIT CRM — Guía para Claude

CadIT es un CRM de WhatsApp open source (MIT), self-hosted, con agente de IA y
Laboratorio de auto-evaluación. Una instancia = un negocio. Este archivo guía a
Claude Code (u otro asistente) para operar y **modificar** este repositorio —
el caso típico: una agencia adaptando CadIT para un cliente.

## Stack

**Next.js 15 (App Router) + React 19** en monolito · TypeScript estricto
(`strict` + `noUncheckedIndexedAccess`) · Tailwind CSS (**tema Atlas, claro y
oscuro**, acento sobreescribible por white-label) · **PostgreSQL + Drizzle ORM**
(migraciones versionadas en
`drizzle/`, aplicadas al ARRANCAR el contenedor) · **Better Auth** + plugin
organization · **Zod** en todo input externo · nanoid con prefijos (`ct_`,
`cv_`, `msg_`…) · pnpm · Vitest (unit) + guiones E2E en `tests/e2e/`
conducidos con Playwright · Docker multi-stage (standalone, healthcheck
`/api/health`) · deploy en Coolify (Ruta A) o docker compose + Caddy (Ruta B).

Tiempo real por **SSE** (`/api/events`): heartbeat `: ping` ~25s, headers
anti-buffering, catch-up por refetch con `since=`. Sin WebSockets, sin colas
externas: el trabajo en segundo plano (agente, Laboratorio) es in-process.

## Mapa del código (fronteras de modificación)

| Quieres cambiar… | Toca… |
|---|---|
| El cerebro/proveedor LLM | `src/lib/ai/` (adaptador OpenRouter-compatible, `chatJson<T>`) |
| El comportamiento/prompt del agente | `src/server/ai/prompts.ts` |
| Las acciones que puede tomar el agente | `src/server/ai/actions.ts` + ejecución en `src/server/ai/pipeline.ts` |
| Las personas o el juez del Laboratorio | `src/server/lab/personas.ts` · `src/server/lab/judge.ts` |
| El canal WhatsApp (Graph API) | `src/lib/meta/` (cliente único) + `src/server/whatsapp/` |
| Cobranza (cuotas, pagos, morosidad) | `src/server/billing.ts` + `/api/enrollments/[id]/{installments,payments}` |
| Clases y asistencia | `src/server/attendance.ts` + `/api/cohorts/[id]/attendance` |
| **Quién puede qué** | `src/lib/capabilities.ts` (lista CERRADA) + `src/server/roles.ts` + `/settings/roles` |
| Clases, cronograma y calendario | `src/server/classes.ts` + `/api/cohorts/[id]/{classes,schedule}` + `/api/calendar` |
| Horarios con zona horaria | `src/lib/schedule-time.ts` — **el único lugar** que compone fechas de clase |
| Material y avisos | `src/server/resources.ts` + `/api/resources` + `/api/cohorts/[id]/announcements` |
| Legajo del alumno | `src/server/student-record.ts` + `/contacts/[id]/legajo` |
| Reporte por empresa | `src/server/company-report.ts` + `/empresas` |
| **Acceso al portal** (alumnos y profesores) | `src/server/access.ts` + `src/lib/auth/portal.ts` |
| **El portal del profesor** | `src/lib/portal-api.ts` + `src/server/teacher-portal.ts` + `/api/portal/{cohorts,classes,hours}` |
| **El portal del alumno** | `src/lib/portal-api.ts` + `src/server/student-portal.ts` + `/api/portal/me/*` |
| **El caparazón del portal** (barra lateral) | `src/app/(portal)/layout.tsx` + `src/components/portal/portal-nav.tsx` |
| **La pantalla de acceso** | `src/app/(auth)/layout.tsx` + `src/app/(auth)/login/page.tsx` |
| Copiar evaluaciones entre cohortes | `planAssessmentCopy()` en `src/server/grading.ts` |
| Baja de alumnos y profesores | `src/server/contacts-admin.ts` (`decidirBaja`) |
| **Aislamiento entre organizaciones (RLS)** | `src/lib/db/with-tenant.ts` + `docs/rls-rol-de-conexion.md` |
| Campos/tablas | `src/lib/db/schema.ts` → `pnpm db:generate` → migración nueva en `drizzle/` |
| La ingesta/envío de mensajes | `src/server/inbox/` (ingest idempotente, send con guard de sandbox, ventana 24h) |
| Cómo se identifica a un contacto | `src/server/inbox/identity.ts` (teléfono normalizado o `bsuid:<id>`) |
| Conectar TU propio bot en vez del agente | `src/app/api/bot/*` + `src/server/bot/auth.ts` (X-API-Key) |
| UI | `src/components/` + `src/app/(app)/` |

Los mocks del entorno de pruebas viven en `src/app/api/dev/` (wa-mock +
ai-mock) tras un gate único (`src/lib/dev-guard.ts`): 404 incondicional en
producción.

**Identidad de contacto**: Meta está migrando de teléfono a Business-Scoped
User IDs, así que `from` puede no venir. La llave estable es
`contact.wa_identity` (teléfono normalizado 521→52, o `bsuid:<id>`); `phone` es
un atributo OPCIONAL. Nunca asumas que un contacto tiene teléfono.

**Cerebro externo**: `/api/bot/*` (autenticada por `BOT_API_KEY`) deja que un
microservicio propio conduzca la conversación sin que el token de WhatsApp
salga del CRM: marcar leído + "escribiendo…", descargar adjuntos y reiniciar la
conversación de pruebas. Respeta `conversation.ai_enabled`/`handoff_at` igual
que el agente in-process. Sin la key, esa superficie responde 401 y el CRM
funciona igual.

## Reglas de la constitución (no negociables)

Ver [.specify/memory/constitution.md](.specify/memory/constitution.md).

- **Soberanía (II, endurecida)**: dependencias de runtime SOLO WhatsApp Cloud
  API, proveedor LLM OpenRouter-compatible opcional, y Microsoft Graph para el
  correo transaccional a alumnos (constitución 1.3.0, tras `src/lib/m365`).
  PROHIBIDO en v1 introducir S3/R2, Stripe, Google u otros servicios externos.
  Auth y BD self-hosted.
- **Seguridad (I)**: secretos cifrados en reposo (AES-256-GCM, `lib/crypto`);
  jamás al cliente ni a logs. El token de WhatsApp solo muestra sus últimos 4.
- **Multi-tenancy (III)**: `organization_id` NOT NULL en toda tabla de dominio;
  toda query pasa por `scoped()` de `src/lib/db/tenant.ts`.
- **Idempotencia (IV)**: webhooks dedup por `wa_message_id` UNIQUE; estados
  monotónicos; seeds y migraciones re-ejecutables.
- **Sandbox del Laboratorio**: las conversaciones `is_test` JAMÁS tocan la API
  real — el sender lanza excepción (no lo "arregles": es un guardrail).

## Permisos, portal y aislamiento (ciclo 012)

**Capacidades, no roles.** Nunca compares `session.role === "algo"`: los roles
se renombran y se editan desde `/settings/roles`, así que ese `if` miente en
cuanto alguien toca la pantalla. Preguntá por la capacidad:

```ts
export const GET = requireCapability("cobranza.ver", async (session) => { … });
// en server components / UI:
sessionCapabilities(session).includes("cobranza.ver")
```

La lista de capacidades es **cerrada y tipada** (`src/lib/capabilities.ts`):
el compilador rechaza una inventada. Los ROLES viven en la base porque son lo
que el dueño cambia sin deploy; el mapeo de código queda como respaldo si la
organización no tiene roles sembrados. Hay tests que fallan si vuelve a
colarse una comparación por nombre de rol o si una ruta nueva no declara
capacidad.

**Dos audiencias, dos puertas.** El staff vive en `member` y entra por
`requireSession()`. Alumnos y profesores viven en `account_link` y entran por
`resolvePortalSession()`. La separación es **estructural**: una cuenta de
portal no tiene fila en `member`, así que falla `withAuth` por construcción,
no por disciplina.

**RLS.** Toda tabla de dominio tiene la política `tenant_isolation`, y cada
pedido autenticado corre dentro de una transacción que declara
`app.current_org` (`withAuth` → `withTenantTransaction`). Consecuencias que
hay que tener presentes al escribir código nuevo:

- Si un handler **lanza**, la transacción revierte las escrituras de ese
  pedido. Devolver una `Response` de error NO revierte.
- Una superficie SIN sesión que toque datos (webhook, `/api/bot/*`, catálogo
  público) debe envolverse en `withOrganizationScope(orgId, actor, fn)`.
- Una tarea *fire-and-forget* **no ve las filas que la transacción que la
  disparó acaba de crear**. Usá `onAfterCommit()`.
- Cinco tablas quedan fuera de RLS a propósito (`member`, `account_link`,
  `role`, `invitation`, `meta_credentials`): son las que responden "¿de quién
  es esto?" y se leen antes de que exista un alcance que declarar.

La app se conecta como `cadit_app`, un rol de PostgreSQL **sujeto** a RLS.
Conectarse como `postgres` (dueño de las tablas) desactiva el filtrado sin
avisar. Ver `docs/rls-rol-de-conexion.md`.

**`db:generate` NO genera las políticas RLS.** Produce tablas e índices y las
deja afuera. Al agregar una tabla de dominio hay que sumar a mano
`enable row level security` + la política `tenant_isolation` en la migración;
`tests/unit/rls-cobertura.test.ts` falla si alguien se olvida.

## Cursada y legajo (ciclo 013)

- **Los horarios de clase se componen en UN solo lugar**: `classInstant()` de
  `src/lib/schedule-time.ts`. Nunca armes una fecha de clase a mano — el texto
  `"18:30"` no lleva zona, y hay 87 alumnos fuera de Uruguay.
- **`days_of_week` cuenta desde el LUNES** (`WEEKDAY_LABELS`), no desde el
  domingo como `Date.getDay()`. `buildClassSchedule` convierte con
  `(getDay() + 6) % 7`.
- **El calendario mezcla clases reales y proyección.** Una fila `projected` es
  un dibujo: no se cancela, no lleva enlace ni grabación y no registra
  asistencia. Se vuelve real cuando alguien genera el cronograma.
- **Cuidado con los defaults optimistas.** `approvalState([], null, null)`
  devuelve "aprobado", y en la planilla de cohorte está bien. En el legajo se
  convierte en una afirmación falsa sobre una persona: por eso ahí existe
  `sin_datos`. Igual con la asistencia — **0% porque nadie pasó lista no es 0%
  porque no vino**.
- **Un dato que no se debe ver NO VIAJA.** El estado de cuenta del legajo no se
  arma si falta `cobranza.ver`; no se esconde en la UI.

## Identidad visual (ciclo 020)

**Los colores viven en tokens. Punto.** `globals.css` declara `:root` (claro) y
`:root[data-theme="dark"]`, y `tailwind.config.ts` los mapea a nombres
semánticos. Escribir un color en un `.tsx` —un hex, `bg-white`, `bg-amber-500`,
lo que sea— **hace fallar `tests/unit/tema-oscuro.test.ts`**, que además dice el
archivo y la línea. No es celo: cada color escrito a mano es una mancha clara
en el tema oscuro.

**Tres trampas que ya costaron caro:**

1. **`bg-token/50` NO EXISTE.** Tailwind solo aplica el modificador de opacidad
   a los colores de SU paleta; sobre un `var(--x)` no emite ninguna regla. Eran
   52 clases que no hacían nada, incluido el hover de las filas de tabla. Si
   necesitás una variante más suave, agregá un token.
2. **Tailwind escanea el archivo entero**, comentarios incluidos: escribir el
   nombre de una clase vieja en un comentario le hace generar la regla muerta.
3. **Los comentarios de `globals.css` viajan al CSS servido.** Cualquier script
   que verifique el CSS tiene que quitarlos primero o va a dar falsos
   negativos.

**El contraste se calcula, no se mira.** `contrastRatio()` vive en
`src/lib/branding.ts` —una sola fórmula— y `contraste.test.ts` recorre las
combinaciones declaradas en los dos temas exigiendo 4.5:1 (3:1 para íconos y
bordes de control). Los valores se LEEN del CSS: un test que repite los colores
a mano deja de hablar del producto.

**`resolveAccentSet(hex, theme)` aleja el color DEL FONDO** hasta alcanzar el
umbral. Sobre fondo claro alejarse es oscurecer; sobre oscuro, aclarar. La
misma frase sirve para los dos temas — decirla como "oscurecer hasta contrastar
con blanco" fue el bug que ató todo al tema claro. `THEME_SURFACES` es la única
fuente de verdad del color de fondo y hay un test que compara contra el CSS.

**La preferencia de tema va en COOKIE, no en `localStorage`**: el servidor tiene
que saber qué pintar antes de mandar el HTML, o hay un fogonazo blanco en cada
carga.

**Dos intensidades, un solo sistema.** `[data-surface="portal"]` sube radios y
presencia de marca en el portal, y **no puede** redefinir `--bg`, `--bg-panel`
ni ningún token de texto: eso invalidaría las garantías de contraste. El panel
del staff conserva su densidad (`--row-py`, `text-xs/sm/base` intactos) porque
el equipo lo mira ocho horas por día.

## El portal del profesor (ciclo 014)

**Dos puertas, y un test que las separa.** El staff entra por
`requireCapability`; el profesor, por `requireTeacherPortal`
(`src/lib/portal-api.ts`). No se mezclan en ningún sentido: una ruta de
`api/portal/` con `requireCapability` le estaría exigiendo a un profesor una
capacidad de staff —o no entra nunca, o alguien se la asigna para destrabarlo y
de paso le abre el panel entero—. `tests/unit/route-capabilities.test.ts` falla
si pasa cualquiera de las dos cosas.

**Ausencia = 404, jamás 403.** `teacherReachesCohort()` devuelve un **booleano**
y `teacherCohortDetail()` devuelve **`null`**: quien elige el código de estado
es la ruta. Un 403 confirmaría que la cohorte existe, y eso ya es información
que el profesor ajeno no tenía. Hay un test que exige que
`src/server/teacher-portal.ts` **no contenga ningún `403`** fuera de
comentarios: la regla se rompe con cualquier `if (!puede) return 403` bien
intencionado, y como no hay ninguno para copiar, quien lo agregue tiene que
escribirlo a mano.

**Un dato que el profesor no debe ver no se consulta.** No se consulta, no se
arma y no viaja. El roster del staff hace casi lo mismo que el del portal —
casi: trae correo, teléfono y estado de cuenta. Reusarlo es exactamente cómo un
campo financiero termina en la pantalla equivocada (FR-008). Hay un guard
estructural que prohíbe nombrar columnas de plata o de contacto en ese módulo.

**El alcance incluye la suplencia**: `cohort.teacher_id` ∪
`class_session.teacher_id`. Quien cubrió UNA clase tiene que poder cargar su
asistencia.

**`attendance.recorded_by`** (migración 0031) existe porque con el portal la
asistencia deja de tocarla solo la coordinación. El profesor puede corregir una
clase pasada —el sistema no discute con lo que pasó en el aula— y una
corrección sin autor no se puede revisar. Es nullable: las marcas anteriores no
tienen autor, e inventarles uno sería peor.

**Un fallo del correo no se lleva puesta la contraseña.** Invitar crea la
cuenta y RECIÉN DESPUÉS manda el correo. Como devolver una `Response` de error
no revierte la transacción, un fallo del envío dejaba la cuenta creada y la
contraseña perdida —y reintentar generaba otra y volvía a fallar igual—. Hoy
`GrantPortalAccessResult` trae `emailError` y el acceso se entrega igual: la
pantalla muestra la contraseña y dice que hay que dictarla. **Vale con M365
configurado y sin configurar**: una caída de Graph produce el mismo agujero.

## El portal del alumno y el caparazón (ciclos 015 / 021)

**Tres puertas, no dos.** Al staff (`requireCapability`) y al profesor
(`requireTeacherPortal`) se les suma el alumno (`requireStudentPortal`). Son
tres envoltorios y no uno con un parámetro a propósito: un envoltorio único que
decide adentro "¿alumno o profesor?" tiene, por construcción, un camino en el
que la respuesta se elige mal. `tests/unit/route-capabilities.test.ts` falla si
una ruta mezcla dos, y `tests/unit/student-portal.test.ts` guarda la forma del
módulo — sin `403`, sin escrituras, y **toda función exportada recibe
`contactId`**: no existe un camino de lectura que no pase por "¿de quién es
esto?".

**`student-portal.ts` no reusa `student-record.ts`** aunque calculen casi lo
mismo. Casi: el legajo lleva cédula y teléfono, y su estado de cuenta aparece
según una capacidad de STAFF que un alumno nunca va a tener. Hay test.

**El portal tiene la MISMA forma que el panel: barra lateral.** 014 lo había
resuelto con un encabezado angosto y una columna de 768px centrada, pensando en
el profesor de pie en el aula; se ganó el celular y se perdió el escritorio.
Hoy `PortalNav` es barra fija en `md+` y cajón abajo de `md`, con blancos de
44px. `tests/unit/portal-intensidad.test.ts` declara qué superficies encienden
`data-surface="portal"` — hoy el portal y el acceso — y falla si aparece otra
sin declararla.

**Las evaluaciones son por cohorte, no por curso** (`assessment.cohort_id`), y
eso es lo que impide que editar un curso altere una cohorte en marcha. El
precio es que cada cohorte nace vacía, y por eso existe *copiar de otra
cohorte* — copiar, no heredar. La deduplicación es por **nombre normalizado**,
no por `id`: la copia crea filas nuevas, así que el `id` nunca coincide.

## Variables de entorno

Ver `.env.example` (cada una con guía inline). Las claves: `APP_BASE_URL`,
`DATABASE_URL`, `BETTER_AUTH_SECRET`, `ENCRYPTION_KEY` (32 bytes base64),
`META_WEBHOOK_VERIFY_TOKEN` (segmento secreto del webhook), `META_APP_SECRET`
(opcional, firma), y para IA:

```bash
OPENROUTER_API_TOKEN=sk-or-...
OPENROUTER_MODEL=anthropic/claude-sonnet-4.5
OPENROUTER_JUDGE_MODEL=anthropic/claude-haiku-4.5   # opcional: juez más barato
```

Para el self-test local existe además el modo de pruebas interno (mocks) —
ver `specs/001-vocero-core/quickstart.md`. Nunca actives mocks en producción.

## Manejo de credenciales (obligatorio)

Cuando una feature necesite una variable/credencial nueva: (1) agrégala a
`.env` como placeholder `REEMPLAZA_...` (append), (2) deja guía inline `#` de
cómo obtenerla, (3) resume en el chat y sigue. `.env` está gitignored; para
deploy, las vars van también en la plataforma de hosting (runtime, no build).

## Definición de Hecho REFORZADA (obligatoria)

"Typecheck + lint + build (+ tests)" es el piso, NO el techo. Una feature no
está "Hecha" hasta correr el **self-test de COMPORTAMIENTO de punta a punta**
(Playwright + mocks: `WA_MOCK_ENABLED=true`, `META_GRAPH_BASE_URL` → wa-mock,
`OPENROUTER_BASE_URL` → ai-mock) y dejarlo verde: flujo real como usuario,
resultado observable, y el camino infeliz degradando sin colgarse. Prohibido
delegar la prueba al usuario. Si algo depende de un LLM/proveedor externo,
todo turno tolera formato inesperado con extracción robusta + reintentos — un
hipo del proveedor nunca tumba el turno. Al detectar un fallo: diagnostica,
corrige y re-verifica tú mismo hasta verde (loop de auto-corrección).

Gate técnico:

```bash
pnpm typecheck && pnpm lint && pnpm build && pnpm test
```

**Con el dev server levantado, el build va a OTRO directorio.** `pnpm build`
escribe en `.next`, que es el mismo que usa `next dev`: los dos procesos se
pisan los chunks y el dev server empieza a tirar `Cannot find module
'./XXXX.js'` en rutas al azar. El error no dice nada sobre la causa y parece
que se perdieron datos, porque las pantallas quedan en 500.

```bash
NEXT_DIST_DIR=.next-build pnpm build   # con `pnpm dev` corriendo
```

`next.config.ts` ya lee `NEXT_DIST_DIR` desde el ciclo 008 justamente por
esto. Si ya pasó: parar el dev server, `rm -rf .next` y volver a levantarlo —
la base no se toca, el estropicio es solo del build.

Guiones E2E por historia en `tests/e2e/*.md`. Parte de ellos ya están
automatizados: con la app viva y los mocks encendidos, `pnpm test:e2e`
(`scripts/e2e-selftest.mjs`) los conduce contra la app real y sale distinto de
cero si algo falla. Al agregar una historia, extiende el arnés en vez de dejar
solo el `.md`.

## Modo Objetivo — Loop SDD

Cuando el dueño da una META (no prompts paso a paso): Discover → Plan →
Execute → Verify → Iterate, de forma autónoma, volviendo solo con el objetivo
verificado en vivo o con un bloqueo real (decisión de producto, credenciales,
acción irreversible/costosa). Agrupa TODAS las preguntas bloqueantes al inicio.
El estado durable son los artefactos SDD en `specs/` (spec/plan/tasks) —
manténlos al día. Invocable como `/loop-sdd <objetivo>`.

## Memoria persistente

Memoria de archivos en `memory/` (índice `memory/MEMORY.md`, cargado por
sesión). Persiste decisiones, gotchas y correcciones; no dupliques lo que el
repo ya registra. Los subagentes con `memory: project` usan
`.claude/agent-memory/`.

## Arquitectura de agentes

1. **Orquestador** = la sesión principal de Claude Code (este CLAUDE.md + skill
   `loop-sdd`).
2. **Subagentes** (`.claude/agents/`): `deploy-ops` (deploy/logs/healthchecks,
   no escribe código de app) · `public-site-builder` (páginas públicas/legales
   y config de paneles externos).
