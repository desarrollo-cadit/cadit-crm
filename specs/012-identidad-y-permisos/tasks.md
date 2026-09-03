# Tasks — 012 Identidad y permisos

Orden de [plan.md](plan.md). Cada fase termina con el gate en verde antes de
pasar a la siguiente.

**Organización**: por paso del plan, no por user story — esta fase es
infraestructura y su riesgo está en el orden.

---

## Phase 0: Bloqueante

- [x] T001 Resolver DV-001..DV-008 con el dueño y registrar cada resolución en
      [research.md](research.md). **RESUELTA 2026-08-26**: las ocho decididas.
      DV-002 → transacción por pedido (opción A), que es la que hace viable el
      paso 5 como está planteado.

---

## Phase 1: Capacidades en código

- [x] T002 Definir la lista cerrada de capacidades en `src/lib/capabilities.ts`
      como `const` tipado, con el mapeo rol→capacidades del data-model.
- [x] T003 Implementar `requireCapability(cap)` en `src/lib/api.ts`, encima de
      `withAuth`. `requireFullAccess` reimplementada sobre `cobranza.ver`.
      **Cambio de contrato deliberado**: antes fallaba ABIERTO (bloqueaba solo
      a `soporte`), ahora falla cerrado (FR-008). Ningún rol real cambia:
      en la base solo existen owner, member y soporte.
- [x] T004 [TEST] `tests/unit/capabilities.test.ts`: el mapeo actual reproduce
      exactamente los permisos de hoy — `soporte` sigue sin ver cobranza,
      `owner` y `member` siguen viendo todo lo que veían.
- [x] T005 [TEST] Test que recorre `src/app/api/**/route.ts` y falla si alguna
      ruta exportada no declara capacidad (FR-008). Arranca con una lista de
      excepciones conocidas (las 5 públicas) que debe ir vaciándose.

---

## Phase 2: Migración de endpoints

- [x] T006 Migrar el módulo académico (cursos, cohortes, clases, asistencia,
      evaluación, certificados) a `requireCapability`. **24 rutas.**
- [x] T007 Migrar el módulo comercial (contactos, pipeline, inscripciones,
      cobranza, finanzas). **17 rutas.** Las 9 que venían de
      `requireFullAccess` se repartieron en `inscripciones.editar`,
      `cobranza.ver` y `cobranza.editar`; el helper viejo se **eliminó**.
- [x] T008 Migrar inbox, plantillas, agente y laboratorio. **16 rutas.**
- [x] T009 Migrar configuración y equipo. **5 rutas.**
- [x] T010 Gate completo entre cada tanda: `pnpm typecheck && pnpm lint &&
      pnpm build && pnpm test`. **Verde, 367 tests.**

**Cierre de la fase 2** — 62 rutas migradas, 0 pendientes. Además:

- El 403 de las rutas financieras **conserva su texto** ("Sin acceso a datos
  financieros"). `requireCapability` lo deriva de la capacidad
  (`forbiddenMessage` en `lib/api.ts`) en vez de recibirlo por parámetro, así
  la próxima ruta financiera no nace con el mensaje genérico por olvido.
- `tests/unit/route-capabilities.test.ts` dejó de ser informativo: ahora
  **falla** si una ruta no declara capacidad o si importa `withAuth` /
  `requireFullAccess`. La detección mira el `import`, no el cuerpo, porque
  varias rutas nombran `withAuth` en un comentario legítimo.
- Dos rutas que **escriben** llevan capacidad `.ver` a propósito
  (`enrollments/[id]/checklist` y `pipeline/leads/[id]`): hoy las opera
  cualquier rol, soporte incluido, y `inscripciones.editar` se lo habría
  quitado. Queda escrito en cada ruta para que la fase 4 lo revise.

---

## Phase 3: Identidad de portal

- [x] T011 Agregar prefijos de ID: `accountLink: "alk"`, `role: "rol"`.
- [x] T012 Agregar `account_link` y `role` a `src/lib/db/schema.ts` per
      [data-model.md](data-model.md), con el CHECK de coherencia
      `kind`/`contact_id`/`teacher_id`. **Desvío menor**: `role` lleva además
      `created_at`/`updated_at`, como toda otra tabla del schema.
- [x] T013 `pnpm db:generate` y **revisar la migración a mano**: debe ser
      puramente aditiva. **`drizzle/0023_colorful_black_crow.sql`, revisada**:
      2 CREATE TABLE + FKs e índices SOLO sobre las tablas nuevas. Cero ALTER
      y cero DROP sobre lo existente.
- [x] T014 [TEST] `tests/unit/account-link.test.ts`: no se puede crear un
      vínculo de alumno para un contacto SIN inscripción (FR-005b); no se
      puede crear un vínculo con `kind` incoherente. **9 casos.** La regla se
      extrajo a `validateAccountLink(input, facts)`, PURA: recibe
      `contactHasEnrollment` ya averiguado, así se prueba sin base.
- [x] T015 Implementar `resolvePortalSession()` en `src/lib/auth/portal.ts`,
      separada de `requireSession()`.
- [x] T016 [TEST] Una sesión de portal NO satisface `withAuth` ni
      `requireCapability` (FR-018), verificado sin tocar la base. **5 casos.**
      La separación resultó ser ESTRUCTURAL, no de disciplina: `onUserCreated`
      solo crea membresía si no existe ninguna organización, así que una cuenta
      de portal nace sin fila en `member` y `requireSession()` la rechaza. El
      test exige **401 y no 403** — un 403 significaría que se le resolvió una
      sesión de staff.
- [x] T017 Implementar el alta de acceso desde el panel: `accesos.gestionar`,
      con invitación por CORREO y explícita, de a un alumno (DV-004, DV-008).
      `POST /api/enrollments/[id]/access` + botón en el roster.
- [x] T017b **NO existe envío masivo.** No se construye ninguna acción de
      "invitar a toda la cohorte" ni "invitar a todos": el dueño pidió
      expresamente que a los 340 alumnos actuales no se les mande nada.
      Construir el botón es invitar a que alguien lo apriete. **Hay test que
      lo mantiene así**: falla si el módulo exporta algo masivo o si la ruta
      empieza a aceptar una lista de inscripciones.
- [x] T017c [TEST] Desplegar la fase NO dispara ningún correo. La migración de
      T029 crea vínculos si corresponde, pero jamás invitaciones. **Fijado**:
      `createAccountLink` no llama a `sendMail`; invitar es otra función.
- [x] T017d Los 6 contactos sin correo quedan sin acceso, y la pantalla lo dice
      con ese motivo — no falla en silencio ni ofrece un botón que no anda.
      `portalAccess.blockedReason` viaja en el DTO del roster.

**DV-004 ampliada (2026-08-26, dueño)** — La resolución original fijó el CANAL
(solo correo) pero no el mecanismo de la primera contraseña. Se resolvió:
**contraseña temporal generada por el servidor**, mandada por correo, que el
alumno cambia al entrar. Se descartó el enlace de un solo uso porque abría un
endpoint PÚBLICO nuevo que fija contraseñas, y se descartó cablear
`sendResetPassword` de Better Auth porque cambiaba la postura de auth de toda
la instancia — que hoy está documentada como "sin recuperación por correo"
(`scripts/reset-password.ts`). **Cero superficie pública nueva.**

**Self-test E2E corrido en esta fase** (adelantado respecto de T031, contra
base efímera `vocero_e2e` en el puerto 3005): **84/84 checks, 0 fallos**. Se
extendió `scripts/e2e-selftest.mjs` con 13 checks de acceso al portal, casi
todos del camino infeliz: alumno sin correo (422 explicado, no 500), M365 sin
configurar (502 del proveedor, sin colgarse) y la verificación de que tras ese
fallo el acceso EXISTE de verdad — que es lo que la respuesta promete.

**Pendiente operativo**: la migración 0023 todavía NO está aplicada en la base
de desarrollo. El roster ahora hace LEFT JOIN a `account_link`, así que la
pantalla de cohorte falla hasta que se aplique.

Consecuencias registradas:

- La contraseña temporal queda escrita en el correo. La plantilla lo dice con
  todas las letras y pide cambiarla al entrar.
- Invitar a alguien que YA tiene cuenta se decide mirando `member`: si es del
  staff no se le toca la contraseña (pisársela lo dejaría afuera del panel);
  si es una cuenta de portal, reinvitar genera contraseña nueva y reenvía.
- Si Graph rechaza el envío, el acceso queda creado y se responde 502 — no un
  422, que sugeriría un dato mal puesto por quien invitó.

---

## Phase 4: Roles configurables

- [x] T018 Sembrar los roles de sistema con el mapeo de DV-006 en una
      migración idempotente. `drizzle/0024_seed_roles_sistema.sql`.
      **Idempotente por dos vías**: `on conflict do nothing` (nunca pisa lo que
      la dueña ya editó — `do update` habría sido una semilla que nadie puede
      correr tranquilo) e `id` DETERMINÍSTICO derivado de organización+llave.
      Verificado contra base efímera: `INSERT 0 3`, después `INSERT 0 0`.
      **Además**, `onUserCreated` siembra los roles al crear la organización:
      la migración solo alcanza a las que YA existían, así que sin eso una
      instalación nueva nunca tendría roles editables.
- [x] T019 Mover el mapeo de código a base, dejando el de código como respaldo
      si la organización no tiene roles sembrados. **Resuelto en
      `resolveMembership` con un `leftJoin` a `role`**, no dentro de
      `requireCapability`: la sesión ya consulta `member` en cada pedido, así
      que cuesta un join y no un viaje más a la base.
      **Verificado contra la app viva**: `GET /api/dashboard/finance` con el
      operador `owner` → **200** (código); insertando `role` key='owner' sin
      `cobranza.ver` → **403** (base); borrando la fila → **200** (respaldo).
- [x] T020 UI: pantalla de roles y capacidades en configuración.
      `/settings/roles`. **Guardarraíl**: no podés quitarle
      `configuracion.editar` a TU PROPIO rol — la pantalla exige esa misma
      capacidad, así que el error sería irreversible desde la interfaz.
      Recortar OTRO rol sí se permite: es legítimo y reversible.
- [x] T021 [TEST] El rol `direccion` tiene todas las capacidades — test que
      falla si se agrega una capacidad nueva y no se le otorga. **Y el
      compilador que le faltaba al SQL**: `tests/unit/seed-roles.test.ts`
      compara la semilla contra `SYSTEM_ROLES`. Escribiéndolo apareció un
      error real — a `soporte` le faltaba `contactos.editar`.

**Choque de artefactos resuelto (2026-08-27)** — `data-model.md` proyectaba
`soporte` como "las `.ver` no financieras + `asistencia.editar`", y la
resolución de DV-006 dice "sin capacidades financieras, **como hoy**". Manda la
resolución, y no por ser más nueva: el propio encabezado del data-model dice
que si el dueño resuelve distinto una DV, ese documento se corrige. Aplicar la
proyección le habría sacado SIETE capacidades a 2 cuentas reales sin que nadie
lo pidiera. El data-model quedó corregido con el motivo escrito.

**Sembrar no cambió los permisos de nadie.** Las cuentas siguen con
`member.role` en `owner`/`member`/`soporte`: solo `soporte` coincide con una
llave sembrada, y se sembró idéntico a lo que hace hoy. `owner` y `member` no
matchean y caen al respaldo en código. La distinción que la fase 1 pospuso
—coordinación sin `configuracion.editar`— llega recién en **T029**, al migrar
las cuentas.

**Aplicado en la base de desarrollo** (con backup previo en
`backups/vocero-pre-0024-*.sql`): 3 roles sembrados (17/16/14 capacidades),
340 contactos y 383 inscripciones intactos.

---

## Phase 5: RLS

- [x] T022 Migración que habilita RLS y crea la política `tenant_isolation` en
      toda tabla de dominio con `organization_id`. Con la app conectada como
      dueño, **nada cambia todavía**. `drizzle/0025_rls_tenant_isolation.sql`:
      **31 tablas**. El `with check` va explícito aunque Postgres reusaría el
      `using`: en una política de seguridad, entender qué protege no puede
      depender de recordar una regla del manual.
- [x] T023 [TEST] Contra base efímera y con el rol de aplicación: una consulta
      sin `app.current_org` devuelve **cero filas** (FR-015).
      `scripts/verify-rls.mjs` (`pnpm verify-rls`), **11/11 checks**.
- [x] T024 Implementar el envoltorio de transacción con `SET LOCAL
      app.current_org` y `app.current_actor` para todo pedido autenticado.
      `src/lib/db/{tenant-context,with-tenant}.ts` + `withAuth`.
      Resuelto con `AsyncLocalStorage`: `getDb()` devuelve la transacción del
      pedido si hay una abierta. Así las decenas de módulos de dominio que ya
      llamaban `getDb()` pasan a correr dentro de la transacción **sin cambiar
      una línea** — y sin dejar abierta la posibilidad de olvidarse en uno.
- [x] T025 [TEST] **El test que justifica la fase**: dos pedidos concurrentes
      con organizaciones distintas, sobre el mismo pool, y ninguno ve al otro.
      Verificado con `max: 1` en el pool, que FUERZA a que compartan la misma
      conexión física — con un pool grande podrían tocarles conexiones
      distintas y el test pasaría sin probar nada.
- [x] T026 Medir el impacto en latencia de la transacción por pedido.
      **Medido, 300 iteraciones**: sin transacción 0,342 ms de media (p95
      0,561); con `BEGIN` + 2 `set_config` + `COMMIT`, 1,546 ms (p95 2,334).
      **Sobrecosto: +1,2 ms de media, +1,8 ms p95.** Sobre un endpoint real
      es ~0,7%. **Aceptable: se mantiene la opción A de DV-002**, no hace
      falta la alternativa C.
- [x] T027 Crear el rol de conexión de aplicación (sujeto a RLS, NO dueño de
      las tablas) y documentar el cambio de `DATABASE_URL`.
      `drizzle/0026_rol_conexion_cadit_app.sql` + `docs/rls-rol-de-conexion.md`.
      Se llama **`cadit_app`** (decisión del dueño: la instancia es de CAD IT).
      Sin contraseña en la migración — un secreto versionado en git queda ahí
      para siempre.

**El huevo y la gallina que el data-model no contemplaba.** El documento decía
"RLS en toda tabla de dominio con `organization_id`" y medía 33 tablas. Pero
`member` y `account_link` son las que se consultan para AVERIGUAR de qué
organización es un usuario: si RLS les exige `app.current_org` para leer, y ese
valor sale justamente de ellas, la sesión no resuelve nunca y **no entra
nadie**. Se excluyeron cuatro, cada una con su motivo escrito en la migración:

| Tabla | Por qué queda afuera |
|---|---|
| `member` | `resolveMembership()` la consulta por `user_id` para averiguar la organización. Es la raíz del arranque. |
| `account_link` | `resolvePortalSession()` hace lo mismo para alumnos y profesores. |
| `role` | Viaja en el mismo `leftJoin` que `member`. Con la política puesta, el join no traería nada y cada sesión caería al mapeo de código **en silencio**, deshaciendo la fase 4 sin que nadie lo note. |
| `invitation` | La maneja Better Auth por token, sin contexto de organización. |

Las cuatro siguen pasando por `scoped()`, y ninguna guarda datos personales ni
de negocio: son permisos y vínculos.

**Reordenamiento en `requireCapability` (hallazgo de T024).** El envoltorio de
transacción quedaba por fuera del chequeo de capacidad, así que un 403 abría
transacción y gastaba dos `set_config` antes de negar. Se invirtió: el corte va
ANTES de abrir nada. Es el mismo principio de FR-014 —un 403 devuelto después
de leer ya expuso el dato— llevado un paso más atrás.

**Cambio de comportamiento a registrar**: si un handler LANZA, ahora la
transacción revierte y las escrituras previas del mismo pedido se deshacen.
Antes quedaban a medias. Es mejor, pero es distinto. Devolver una `Response` de
error NO revierte: eso es una decisión del handler, no una falla.

**Aplicado en la base de desarrollo** (backup en `backups/vocero-pre-rls-*.sql`):
31 políticas creadas, `cadit_app` existe con las cuatro banderas peligrosas en
`f`. **Inerte**: la app sigue conectándose como `postgres` y ve sus 340
contactos, 383 inscripciones y 41 cohortes igual que antes.
- [x] T028 Cambiar `DATABASE_URL` **primero en base efímera**, correr el gate
      completo y el self-test E2E, y recién ahí en la de desarrollo.
      **Verificado en efímera con la app conectada como `cadit_app`:
      84/84 en el arnés y 11/11 en `pnpm verify-rls`.**
      Falta el último paso, que es del dueño: editar el `DATABASE_URL` de su
      `.env` (la contraseña ya quedó asignada en la base de desarrollo).

### Lo que T028 destapó (de 17 fallos a 2)

Apuntar la app a `cadit_app` es lo único que hace que RLS filtre de verdad, y
por eso es lo único que muestra qué caminos nunca declaraban su organización.
Primera corrida: **17 fallos**. Cada uno fue un agujero real:

1. **`onUserCreated`** — el alta de la primera organización inserta en
   `pipeline_stage` y `agent_profile`, que tienen `with check`. Sin alcance
   declarado el INSERT se rechaza y, al estar todo en una transacción,
   **revierte también la organización y la membresía**. Síntoma desconcertante:
   el registro "funciona" (Better Auth crea el usuario en su propia
   transacción) pero la instancia queda sin organización y no entra nadie.
   Corregido declarando el alcance recién creado dentro de esa transacción.
2. **`meta_credentials` es la QUINTA tabla de arranque** (migración `0027`).
   El webhook resuelve a qué organización pertenece un mensaje leyéndola por
   `phone_number_id` — o sea, ANTES de saber la organización. Con RLS devolvía
   cero filas y el webhook **descartaba todos los mensajes entrantes**, con un
   warning que culpaba a la configuración. Sigue protegida por el cifrado en
   reposo del token (constitución I) y por `scoped()`.
3. **Webhook y `/api/bot/*`** — declaran el alcance una vez resuelta la
   organización (`withOrganizationScope`, actor `system:webhook` / `system:bot`).
4. **Trabajo en segundo plano** — el turno del agente corre en un `setTimeout`,
   después de que la transacción del pedido cerró. `scheduleAgentTurn` ahora
   recibe `organizationId` y abre su propio alcance.

### El quinto agujero: el enganche *after-commit*

Los últimos 2 checks eran dos adjuntos entrantes que quedaban en
`fetch_status = pending`. `fetch_error` estaba en NULL en los dos, o sea que
`ensureAssetAvailable` **nunca llegó a intentar la descarga**: salió antes, que
es lo que hace cuando no encuentra la fila.

Y no la encontraba porque el trabajo *fire-and-forget* abre su PROPIA
transacción y, en aislamiento read-committed, **no puede ver la fila
`media_asset` que la transacción del webhook todavía no confirmó**.

**La regla que deja, y que ahora rige todo el sistema**: una tarea suelta no ve
las filas que acaba de crear la transacción que la disparó. Reintentar o
esperar un rato habría tapado el problema hasta que reapareciera bajo carga.

Solución: `onAfterCommit()` en `src/lib/db/tenant-context.ts`. Registra la
tarea durante el alcance y `withOrganizationScope` la ejecuta **después** de
que la transacción resolvió — nunca si lanzó, porque no hay nada que hacer
sobre un trabajo que se revirtió. Cada tarea se aísla: una que falle no tumba
a las demás ni al pedido, que a esa altura ya respondió.

Se aplica a la descarga de adjuntos y al turno del agente.

### Estado final de la fase 5

- Arnés E2E con la app conectada como `cadit_app`: **84/84**.
- `pnpm verify-rls`: **11/11**.
- Gate completo: typecheck, lint, build, **406 tests**.
- Contra la base de desarrollo REAL, con `cadit_app`: sin declarar organización
  ve **0 contactos**; declarándola, los **340**. RLS filtra de verdad.
- La contraseña de `cadit_app` quedó asignada en desarrollo. **El cambio de
  `DATABASE_URL` en el `.env` lo hace el dueño**: es su archivo y su decisión.

---

## Phase 6: Cierre

- [x] T029 Migrar las 4 cuentas actuales a los roles nuevos, verificado contra
      base efímera antes que contra la real.
      `drizzle/0028_migrar_cuentas_a_roles_nuevos.sql`. Corrida DOS veces en
      efímera (idempotente) y aplicada en desarrollo con backup previo:
      `dev@`→Dirección (17), `verificacion005@`→Coordinación (16), las dos de
      soporte→Soporte (14). 340 contactos y 383 inscripciones intactos.
- [x] T030 [TEST] Las 4 cuentas entran y operan igual que antes de la fase.
      `tests/unit/migracion-cuentas.test.ts`: compara capacidad por capacidad
      el antes contra el después. Fija que coordinación pierda
      `configuracion.editar` **y nada más**.
- [x] T031 Gate técnico completo + `pnpm test:e2e` en verde.
      **413 tests, 53 archivos**; E2E **84/84** con la app conectada como
      `cadit_app`.
- [x] T032 Actualizar `CLAUDE.md` (mapa del código: capacidades, sesión de
      portal, RLS). La constitución NO necesitó enmienda: `cadit_app` no
      agrega una dependencia de runtime (principio II), es la misma
      PostgreSQL con otro usuario. El procedimiento operativo vive en
      `docs/rls-rol-de-conexion.md`.

### Lo que hubo que hacer ANTES de poder renombrar los roles

Renombrar las cuentas es un `update` de dos líneas. Lo peligroso era el código
que las miraba por nombre. Tres hallazgos, y los tres habrían pasado sin que
fallara nada visible:

1. **`settings/branding` y `settings/team` chequeaban `session.role !== "owner"`.**
   Con `owner` renombrado a `direccion`, el dueño quedaba afuera de su propia
   configuración con un 403. Los dos chequeos eran además redundantes: la
   capacidad del `requireCapability` ya decidía eso.
2. **`settings/team` validaba `z.enum(["member","soporte"])` al crear cuentas.**
   Después de migrar, `member` deja de existir como llave: cada cuenta nueva
   habría nacido con un rol sin mapear y —por el respaldo en código— **con
   TODAS las capacidades**. Escalada de privilegios silenciosa en cada alta.
   Ahora valida contra los roles que existen en la organización.
3. **`buildRosterEntry` decidía los campos financieros con `role === "soporte"`.**
   Lo encontró el test estructural que se escribió para esto, no una revisión
   a ojo. Ahora recibe capacidades.

`onUserCreated` también se corrigió: creaba la membresía como `owner`, así que
toda instalación nueva habría nacido con un rol sin mapear.

**La red que queda**: `migracion-cuentas.test.ts` recorre `src/` y falla si
reaparece cualquier `role === "owner" | "member" | "soporte"` en código (los
comentarios se ignoran, y `capabilities.ts` está exento porque ahí VIVEN los
nombres).

### UI accesible según rol (pedido explícito del dueño)

- **Menú lateral**: cada destino declara su capacidad y se filtra por lo que la
  sesión puede. Un grupo sin ítems permitidos no se dibuja — un encabezado
  vacío parece un error de carga.
- **Ajustes**: el enlace solo aparece con `configuracion.editar` o
  `accesos.gestionar`, y el layout **redirige** a quien no tenga ninguna. Un
  enlace escondido sigue siendo una URL que se puede tipear.
- **Pestañas de configuración**: filtradas por capacidad. Equipo pide
  `accesos.gestionar`; el resto, `configuracion.editar`.
- **Equipo**: el selector de rol ofrece los roles REALES de la base (con enlace
  a Roles), y los badges muestran el nombre configurado, no un `if` con
  nombres quemados.
- **Perfil del menú**: muestra "Dirección" / "Coordinación" en vez de un
  genérico "Equipo".

---

## Notas de riesgo

- **T025 es la tarea que justifica toda la fase.** Si ese test no pasa, RLS no
  está protegiendo nada y hay que volver a DV-002.
- **T027/T028 es el punto de no retorno operativo**: si el `SET LOCAL` falla,
  la aplicación deja de ver datos. Por eso van al final y contra base efímera
  primero.
- Las fases 1 y 2 se pueden entregar solas: dejan el sistema mejor (capacidades
  explícitas y probadas) aunque RLS no llegue nunca.
