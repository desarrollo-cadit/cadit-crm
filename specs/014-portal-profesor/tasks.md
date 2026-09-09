# Tasks — 014 Portal del profesor

Orden de [plan.md](plan.md). Cada paso termina con el gate en verde.

**Toda pantalla nueva se crea Y se hace accesible según capacidades** (regla
permanente del dueño): enlace donde corresponda, gate en el servidor, y el
motivo escrito cuando algo no se puede.

---

## Phase 0: Bloqueante

- [x] T001 Resolver las DV y registrarlas en [research.md](research.md).
      **RESUELTAS 2026-08-27**: DV-001 (corrige asistencia pasada, con
      registro), DV-002 (**no** crea evaluaciones, solo carga resultados),
      DV-003 (asistencia de SU cohorte), DV-004 (**no** ve correo ni teléfono
      de alumnos), DV-005 (cohorte finalizada: la ve, no la edita), DV-006
      (invitación por `POST /api/teachers/[id]/access`), DV-007 (los 7 correos
      los carga el dueño), **DV-008 (alumnos se archivan, profesores exigen
      reasignar)** y **DV-009 (las evaluaciones son por cohorte; se agrega
      copiar de otra)**.

---

## Phase 1: Que la gente pueda existir y entrar

- [x] T002 ~~`contact.archived_at` en el schema + migración aditiva.~~
      **NO HACE FALTA NADA.** Medido: la columna existe desde la **migración
      0000**, y el archivado YA está implementado de punta a punta — la lista
      filtra por `archivedAt`, el `PATCH /api/contacts/[id]` lo alterna y la UI
      tiene el botón de archivar/desarchivar. 0 contactos archivados de 340.
      Lo único que falta es el **borrado** y la regla que decide entre borrar y
      archivar. Segundo hallazgo de la fase en el que medir ahorró trabajo
      (el primero fue `class_session.teacher_id`).
- [x] T003 [TEST] `decidirBaja`, PURA: sin inscripciones se borra; con
      historial se archiva y **nunca** se borra. 7 casos. Ante datos
      inconsistentes (un certificado sin inscripción) también protege: ante la
      duda no se destruye.
- [x] T004 `archiveOrDeleteContact()` + `previewBaja()` en
      `src/server/contacts-admin.ts`, con el conteo de lo que hay en juego.
- [x] T005 `DELETE /api/contacts/[id]` (`contactos.editar`). El archivado y el
      desarchivado ya existían (ver T002).
- [x] T006 [TEST] La baja de un profesor exige reasignar: con cohortes
      responde 409 con el número y **no borra nada**. 6 casos, incluido que
      reasignar a un profesor inexistente se rechaza ANTES de mover nada —
      dejaría las cohortes apuntando a la nada, el mismo problema por otra
      puerta.
- [x] T007 `DELETE /api/teachers/[id]` (`academico.editar`) + `PUT` para
      reasignar las cohortes a otro docente.
- [x] T008 UI: baja en la lista de alumnos y en la de profesores, diciendo QUÉ
      pasó. **La decisión es del servidor, no del navegador**: el diálogo de
      confirmación sería un cartel, no una barrera.
- [x] T009 `POST /api/teachers/[id]/access` — invita al profesor al portal
      (`accesos.gestionar`). Reusa entera la maquinaria de 012 cambiando el
      `kind` y de dónde sale el correo. `validateAccountLink` ya contemplaba
      que un profesor NO necesita inscripción, así que no hubo que tocar la
      regla. Sin envío masivo.
- [x] T010 [TEST] Invitar a un profesor SIN correo responde el motivo, no un
      500. **Es el estado de los 7 de hoy.**
- [x] T011 UI: "Dar acceso" en la ficha del profesor, con el motivo en vez del
      botón cuando falta el correo.
- [x] T012 Gate completo: typecheck, lint, **524 tests en 62 archivos**, 0
      rutas sin capacidad.
      **Verificado en vivo contra la base real (12/12)**: invitar a un
      profesor sin correo da 422 explicado; dar de baja a Ovidio da 409 y dice
      que son **18 cohortes**; dar de baja a un alumno con historial lo
      ARCHIVA y su legajo queda intacto. La base se dejó como estaba.

---

## Phase 2: Que haya algo que mostrar

- [x] T013 `copyAssessments(org, desdeCohorte, haciaCohorte)` en
      `src/server/grading.ts`: copia nombre, posición y obligatoriedad. **No
      copia resultados** — son de las personas de la otra cohorte. La decisión
      vive en `planAssessmentCopy()`, **pura**: qué se copia y qué se saltea es
      la parte que puede romperse en silencio, y probarla no debería necesitar
      una base de datos.
- [x] T014 [TEST] 10 casos en `tests/unit/assessment-copy.test.ts`. La llave de
      deduplicación es el **nombre normalizado**, no el `id`: la copia crea
      filas nuevas, así que el `id` nunca coincide y comparar por `id` dejaría
      duplicar sin límite. Apretar dos veces el botón es lo más probable que va
      a pasar. Copiar de una cohorte vacía **avisa**, y su aviso es distinto
      del de "ya estaban todas": son dos problemas distintos.
- [x] T015 `POST /api/cohorts/[id]/assessments/copy` — **`evaluacion.editar`**,
      no `academico.editar` como decía el plan: la acción CREA evaluaciones,
      que es exactamente lo que hace el `POST /grading`. Corregido acá.
- [x] T016 UI: selector "Copiar evaluaciones de…" en la pestaña Evaluación,
      con las cohortes del mismo curso primero. La pantalla vacía explica que
      copiar **no ata** las dos cohortes. `GradingClient` pasó a recibir
      `canEdit` (`evaluacion.editar`): antes la planilla se editaba sin mirar
      capacidades en la UI.
- [x] T017 Gate completo: typecheck, lint, build, **534 tests en 63 archivos**,
      0 rutas sin capacidad.
      **Verificado en vivo contra la base real (20/20)** con dos cohortes de
      Revit MEP: copiar de una vacía avisa; copiar lleva las 3 en orden y
      respeta lo opcional; copiar dos veces deja 3 en la base, no 6; ningún
      resultado viaja; y **agregar una evaluación en el destino no toca el
      origen** — la pregunta del dueño, respondida contra datos reales. La base
      quedó como estaba (0 evaluaciones).

---

## Phase 3: El alcance del profesor

- [x] T018 `resolveTeacherScope(org, teacherId)` en
      `src/server/teacher-portal.ts`: cohortes donde es titular **o** dictó
      alguna clase (suplencia, FR-001). Una sola regla, en un solo lugar: todo
      lo demás del portal pregunta por acá. Con el alcance vacío corta antes de
      la consulta siguiente — un `in ()` vacío es un error de SQL, así que
      cortar no es una optimización, es lo que evita el 500.
- [x] T019 [TEST] **`teacherReachesCohort` devuelve un BOOLEANO, no una
      respuesta HTTP**, y `teacherCohortDetail` devuelve `null`: quien elige el
      código es la ruta, y la ausencia se traduce a 404. Hay un test que exige
      que el módulo **no contenga ningún 403** (fuera de comentarios): la regla
      se rompe con cualquier `if (!puede) return 403` bien intencionado, y como
      no hay ninguno que copiar, quien lo agregue tiene que escribirlo a mano.
- [x] T020 [TEST] La suplencia da acceso a la cohorte entera con UNA clase
      dictada, y la pantalla la marca `suplente` en vez de `titular` — el
      profesor necesita saber por qué le aparece una cohorte que no es suya.
- [x] T021 [TEST] Verificado sobre la **forma del objeto**: la cohorte del
      profesor no trae `cost` ni `currency`, el alumno es `enrollmentId` +
      `name` y nada más (sin correo, teléfono ni identidad de WhatsApp), y las
      horas dictadas no llevan tarifa. Más un guard estructural: el módulo no
      **nombra** ninguna columna financiera ni de contacto. 17 casos en
      `tests/unit/teacher-scope.test.ts`.
- [x] T022 Gate completo: typecheck, lint, build, **551 tests en 64 archivos**,
      0 rutas sin capacidad.
      **Medido contra la base real (5/5)**: Ovidio alcanza la suya, Sandra NO
      alcanza la de Ovidio, Ovidio NO alcanza la de Sandra, y una cohorte
      inventada tampoco. Alcance por profesor: Ovidio 18, Claudio 4, Sandra 3,
      Ximena 3, Andrés 2, Nicolás 2, Fernán 1.
      **Dos hallazgos de la medición**: `class_session` sigue en **0 filas**,
      así que hoy no existe ninguna suplencia y el alcance sale entero de
      `cohort.teacher_id`; y **8 de las 41 cohortes no tienen profesor
      asignado**, con lo cual hoy no las alcanza nadie.

---

## Phase 4: Las pantallas del portal

- [x] T023 `/api/portal/cohorts` + el resto de la superficie propia, detrás de
      `requireTeacherPortal` (`src/lib/portal-api.ts`). **Puerta aparte de
      `requireCapability`**: un profesor no tiene ninguna capacidad, y darle una
      para que entre le abriría también las pantallas del staff que piden esa
      misma capacidad. El guard de rutas ahora exige que las dos no se mezclen,
      en ningún sentido.
- [x] T024 `/portal` con su propio caparazón (`(portal)/layout.tsx`), sin
      reusar `AppNav`. Las cohortes **en curso van primero y separadas**: una
      lista plana de 18 tarjetas iguales es inservible un martes a las 18:30.
      **Bug encontrado y arreglado**: `(app)/layout.tsx` mandaba a `/login` a
      cualquiera sin fila en `member`, así que un profesor entraba bien y
      volvía al login para siempre. Ahora desvía al portal.
- [x] T025 `/api/portal/cohorts/[id]/classes` + la pantalla con tres pestañas.
      El 404 se decide en el servidor: `teacherCohortClasses` devuelve `null`
      tanto si no existe como si no la alcanza.
- [x] T026 Toma de asistencia **para el celular primero**: botones de 44px,
      **guarda al tocar** (un formulario que hay que confirmar al final se
      pierde cuando suena el teléfono) y actualización optimista. Nadie arranca
      "presente" por defecto — eso convertiría el olvido en una afirmación
      falsa; hay un atajo, pero es un acto deliberado.
- [x] T027 [TEST] 8 casos en `tests/unit/portal-attendance.test.ts`. Migración
      **`0031`**: `attendance.recorded_by` no existía, y una corrección sin
      autor no se puede revisar. Una marca vieja sin autor viaja como `null` en
      vez de inventar uno. Un `enrollmentId` de otra cohorte se descarta en el
      servidor: el cuerpo lo arma el navegador.
- [x] T028 Carga de resultados. **La ruta del portal no exporta POST ni
      DELETE**, y hay un test que lo exige: no es un botón escondido.
- [x] T029 Material y avisos, de solo lectura.
- [x] T030 "Mis horas dictadas": clases y horas, **sin tarifa**. El campo no se
      arma, así que no hay nada que esconder.
- [x] T031 Gate completo: typecheck, lint, build, **561 tests en 65 archivos**,
      0 rutas sin puerta declarada.
      **Verificado en vivo contra la base real (39/39)** con dos profesores de
      verdad: Ovidio ve sus **18** cohortes; la de Sandra responde **404 con el
      cuerpo byte a byte idéntico** al de una cohorte inventada; el profesor no
      entra a `/api/cohorts` y el dueño no entra al portal; Ovidio genera
      asistencia real y queda **él** como autor; corregir CORRIGE (1 fila, no
      2); Sandra recibe 404 al intentar marcar en la clase de Ovidio y el dato
      no se mueve; el POST de evaluaciones responde **405**. La base quedó como
      estaba.

---

## Phase 5: Cierre

- [x] T032 Gate técnico + `pnpm test:e2e` extendido: **136/136** contra base
      efímera. 31 checks nuevos que cubren los cuatro criterios de éxito, la
      copia de evaluaciones y el ABM.
      **SC-002 se comprueba comparando los CUERPOS** de la cohorte ajena y de
      una inventada, no solo los códigos: dos 404 con mensajes distintos
      seguirían filtrando que una existe.
      **Dos checks del arnés estaban desactualizados** y por eso fallaban:
      esperaban el **502** de la invitación sin M365, que la fase 4 cambió a
      "entrega el acceso igual". Se reescribieron a la conducta nueva — el
      arnés es documentación ejecutable, y dejarlo mintiendo es peor que no
      tenerlo.
- [x] T033 `CLAUDE.md` (sección nueva del portal + mapa del código) y el
      ROADMAP con la 014 en ✅.
      **Corrección de documentación**: el `CLAUDE.md` decía "tema oscuro
      propio, acento `#25D366`". Es falso desde el rediseño Atlas — el tema es
      **claro** (`--bg: #ffffff`), el acento es azul acero `#3f5972` y **no
      existe modo oscuro ni bloque `prefers-color-scheme`**. Lo notó el dueño
      antes que la documentación.

---

## RESUELTO — la invitación ya no se traba sin correo

**Decidido por el dueño (2026-08-28): opción 1.** El acceso se entrega igual y
la pantalla muestra la contraseña con el motivo de por qué el correo no salió.

`GrantPortalAccessResult` suma `emailError`. Un fallo del correo ya **no** corta
el alta: la contraseña viaja en la respuesta y las dos pantallas que invitan
—profesores y roster— dicen la verdad en vez de "ya se la mandamos por correo".

Y no es un parche hasta que M365 funcione: **perder una credencial recién
generada porque un tercero falló está mal con M365 configurado y sin
configurar**. Una caída de Graph de 30 segundos produce exactamente el mismo
agujero.

3 tests nuevos en `tests/unit/portal-invitation.test.ts`, incluido uno que
falla si alguna de las dos pantallas deja de mirar `emailError`.
**Verificado en vivo (8/8)** con Fernán Luna y M365 caído: la invitación
responde **201 con la contraseña**, y esa contraseña **sirve** — entra y llega
a su portal con su cohorte.

### El agujero original, para memoria

Apareció verificando la fase 4, pero era de la fase 1:

`POST /api/teachers/[id]/access` **crea la cuenta, la vincula y recién después
manda el correo**. Si el correo falla —hoy falla: M365 no está configurado en
desarrollo— devuelve **502** y la contraseña temporal se pierde con la
respuesta. Como devuelve una `Response` de error y no lanza, **la transacción
NO revierte**: la cuenta queda creada.

Reintentar no destraba nada: la segunda vez entra por el camino de "ya existe",
genera OTRA contraseña, y vuelve a fallar en el mismo lugar. El dueño no tiene
forma de darle acceso al profesor desde la pantalla.

La verificación se destrabó con `pnpm reset-password`, que es la vía ordenada y
existe justamente para esto. **Pero eso es una salida del dueño con acceso a la
consola, no un flujo de producto.**

Se eligió devolver la contraseña aunque el correo falle. Configurar M365 sigue
pendiente y es un track aparte: hace que el correo salga, no que el sistema
deje de perder credenciales cuando no sale.

---

## Notas de riesgo

- **El borrado en cascada es el riesgo real** (`contact → enrollment → todo`).
  La barrera va en el servidor y con test; un diálogo de confirmación es un
  cartel, no una barrera.
- **404 vs 403** se rompe con cualquier `if (!puede) return 403` bien
  intencionado. Tiene test propio.
- **No reusar los endpoints del staff** (FR-008) es una tentación fuerte
  porque el roster ya existe — y es exactamente cómo un campo financiero
  termina en la pantalla equivocada.
- Los pasos 1 y 2 sirven solos aunque el portal no llegue: dejan el ABM y las
  evaluaciones, que hoy no existen.
