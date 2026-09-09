# Tasks — 013 Legajo académico y contenido de cursada

Orden de [plan.md](plan.md). Cada paso termina con el gate en verde antes de
pasar al siguiente.

**Toda pantalla nueva se crea Y se hace accesible según capacidades** (pedido
explícito del dueño, 2026-08-27): enlace en el menú donde corresponda, gate en
el servidor, y el motivo escrito cuando algo no se puede.

---

## Phase 0: Bloqueante

- [x] T001 Resolver las DV con el dueño y registrarlas en
      [research.md](research.md). **RESUELTAS 2026-08-27**: DV-001 (15/30 min,
      configurable), DV-001b (la grabación no caduca — ya lo fijaba DV-005 de
      012), DV-001c (capacidad `asistencia.editar`, no rol), DV-002 (material
      independiente), DV-003 (los anuncios no notifican; eso es 017), DV-004
      (legajo por CONTACT), DV-005 (`organization.timezone`), y **DV-006
      (NUEVA, la abrió la medición): B+C — calendario mixto + generación
      explícita por cohorte**.

---

## Phase 1: Cimientos — zona horaria y enlaces

- [x] T002 Columnas nuevas en `src/lib/db/schema.ts`: `organization.timezone`,
      `meeting_open_before_min`, `meeting_open_after_min`; `cohort.meeting_url`;
      `class_session.meeting_url`, `recording_url`.
- [x] T003 `pnpm db:generate` y **revisar la migración a mano**: puramente
      aditiva. `drizzle/0029_woozy_wild_child.sql`, revisada: 6 `ADD COLUMN`,
      todas nulas o con default. Cero filas tocadas. **Aplicada en desarrollo**
      con backup previo; 340 contactos y 41 cohortes intactos.
- [x] T004 Prefijos de ID: `resource: "res"`, `announcement: "anc"`.
- [x] T005 [TEST] Función pura que compone la fecha real de una clase.
      **26 casos** en `tests/unit/schedule-time.test.ts`.
      La comprobación principal es de **ida y vuelta** y no depende de que nadie
      recuerde un offset: componer "18:30 en tal zona" y volver a formatear ese
      instante en esa misma zona tiene que dar 18:30. Se cubren Montevideo,
      Asunción, Madrid (verano e invierno), Santo Domingo, horario vacío y zona
      inválida.
- [x] T006 Implementar esa función en `src/lib/schedule-time.ts`. **Nadie más
      compone fechas de clase a mano.** Sin dependencias nuevas: `Intl` ya está
      en el runtime (constitución II).
      **Detalle que importa**: el offset se calcula en DOS pasadas. La primera
      usa una hora tentativa; si ese instante cae del otro lado de un cambio de
      horario, el offset es el equivocado. Sin la segunda, las clases de la
      semana del cambio de hora se corren 60 minutos.
- [x] T007 [TEST] La ventana del enlace (FR-003): oculto antes, visible desde
      15' antes, hasta 30' después del fin, configurable, y **nunca** si la
      clase está cancelada (FR-005e) — ese corte va antes que cualquier cuenta
      de minutos.

---

## Phase 2: El calendario que dice la verdad

- [x] T008 `listCohortClasses(org, cohortId)` en `src/server/classes.ts`:
      clases reales de `class_session`; si la cohorte no tiene ninguna,
      proyección marcada con `projected: true` (FR-005, DV-006 opción C).
      La proyección se dibuja con la **misma** `buildClassSchedule()` que la
      generaría de verdad: dos algoritmos para el mismo cronograma es garantía
      de que un día no coincidan.
- [x] T009 [TEST] 18 casos en `tests/unit/cohort-classes.test.ts`: qué ofrece
      cada fila según el momento, herencia del enlace, cancelada sin enlace ni
      grabación, proyección sin nada, y los motivos por los que una cohorte no
      puede generar cronograma (dos motivos distintos, informados de a uno).
- [x] T010 `POST /api/cohorts/[id]/schedule` — reusa `generateSchedule()` de
      009. Capacidad `academico.editar`.
- [x] T011 [TEST] Cubierto en la verificación de T016 contra base real:
      generar dos veces **no duplica** y responde 409 explicado.
      *Corrección al enunciado*: el bloqueo no es `start_time` sino
      `days_of_week` y `end_date`, que es lo que `generateSchedule` exige.
- [x] T012 `GET /api/cohorts/[id]/classes` y `GET /api/calendar?from&to`
      (capacidad `academico.ver`). **`calendar-client.tsx` migrado**: ya no lee
      `/api/cohorts` ni repite la proyección en el navegador. Se eliminó
      `weekdayIndex` del componente — la convención 0=lunes vive ahora en un
      solo lugar.
- [x] T013 UI: pestaña "Clases" en la cohorte (`classes-client.tsx`) — UNA
      lista donde cada fila cambia según el momento (FR-005c). Va segunda,
      después de "Alumnos": primero se sabe QUIÉNES cursan, después CUÁNDO.
- [x] T014 UI: la proyección se avisa en un bloque visible (no un tooltip: si
      no se nota, el equipo cree que son clases reales y no entiende por qué no
      puede cancelar ninguna) y ofrece "Generar cronograma". Las cohortes que no
      pueden muestran el MOTIVO en vez del botón. En el calendario, cancelada
      va tachada y apagada, y la proyección punteada.
- [x] T015 `PATCH /api/class-sessions/[id]/links` — enlace de reunión y de
      grabación por clase (capacidad `asistencia.editar`, DV-001c). Valida que
      sean URLs: un enlace roto es peor que uno ausente, porque el alumno lo
      aprieta y cree que el problema es suyo.
- [x] T016 **Verificado contra base efímera con la forma de cohortes reales**
      (fechas, días y horarios copiados de Revit MEP 2, EBIM 14 y AutoCAD 2D-4):
      **22/22 checks**. Genera 19, 53 y 14 clases respectivamente, todas en los
      días declarados, numeradas sin huecos y dentro del rango. Idempotencia,
      404 y los dos 422 explicados, confirmados.
      **Hallazgo**: leyendo el resultado con la convención de JavaScript
      (`0=domingo`) parecía haber un off-by-one. No lo hay: en este repo
      `days_of_week` cuenta desde el **LUNES** (`WEEKDAY_LABELS`), y
      `buildClassSchedule` convierte con `(getDay() + 6) % 7`. Quedó fijado en
      3 tests para que el próximo no pierda la tarde.
- [x] T017 Gate completo: typecheck, lint, **457 tests en 55 archivos**, cero
      rutas sin capacidad declarada.
      **Verificado en vivo contra la base real (9/9)**: el calendario devuelve
      **210 clases proyectadas** en el trimestre, todas marcadas como
      proyección (0 cronogramas generados); "Revit MEP 2" trae sus 19 clases
      sin motivo de bloqueo y con la zona de la academia; una cohorte sin días
      declarados responde con el MOTIVO.

---

## Phase 3: Material y anuncios

- [x] T018 `resource` y `announcement` en el schema, con el CHECK de
      contenedor único (`course_id` XOR `class_session_id`).
      `announcement.author_user_id` es `set null` y no `cascade`: si la
      persona deja la academia, el aviso que publicó sigue siendo parte de la
      historia de la cohorte. Borrarlo reescribiría el pasado.
- [x] T019 Migración **con RLS incluida** (`drizzle/0030_cold_puma.sql`).
      **`db:generate` NO genera las políticas**: produce tablas e índices y
      las deja afuera. Se agregaron a mano.
      **Y quedó un guard permanente**: `tests/unit/rls-cobertura.test.ts` lee
      el schema, saca las tablas con `organization_id` y falla si alguna no
      está habilitada en ninguna migración, con la lista de las 5 excepciones
      y su motivo. Se verificó que el guard atrapa: quitando la RLS de
      `resource` a propósito, el test la nombra y dice qué hacer.
- [x] T020 [TEST] 16 casos en `tests/unit/resources.test.ts`: sin contenedor,
      con los dos, el módulo del temario que NO cuenta como contenedor, y el
      enlace que tiene que abrir algo (se rechazan `javascript:` y `file://`).
      El orden importa: la falta de contenedor se informa ANTES que la URL.
- [x] T021 `src/server/resources.ts` + `/api/resources` (GET/POST) y
      `/api/resources/[id]` (DELETE). Ver: `academico.ver`; editar:
      `academico.editar`.
- [x] T022 `/api/cohorts/[id]/announcements` (GET/POST). El autor sale de la
      SESIÓN, no del body: quién publicó un aviso no es un dato que el cliente
      pueda elegir.
- [x] T023 UI: `ResourcesPanel` reusable, montado por clase en la pestaña
      Clases. Una proyección no puede tener material: todavía no existe como
      clase a la cual colgarle nada.
- [x] T024 UI: pestaña Avisos en la cohorte, con autor y fecha visibles.
      **Dice que todavía no notifica**, en pantalla: si el equipo cree que al
      alumno le llega un mail, no lo avisa por WhatsApp y el aviso no llega a
      nadie.
- [x] T025 Gate completo: typecheck, lint, **477 tests en 57 archivos**, 0
      rutas sin capacidad. Migración aplicada en desarrollo con backup previo;
      verificado contra la base real: `resource` y `announcement` con RLS y su
      política, `cadit_app` sin alcance declarado ve 0 filas, y el CHECK
      rechaza un recurso con dos contenedores.

---

## Phase 4: El legajo

- [x] T026 `getStudentRecord(org, contactId, capabilities)` en
      `src/server/student-record.ts`. Reusa `attendancePercentage` y
      `approvalState` (009/010) en vez de reimplementar las reglas. Trae las
      cinco piezas en paralelo y las cruza en memoria: una persona con tres
      cursadas no debería costar quince consultas.
- [x] T027 [TEST] **Sin `cobranza.ver` la clave `account` NO EXISTE en el
      objeto** — no se filtra en la UI; el `return` temprano es deliberado.
      Más los casos de saldo: nunca mezcla monedas (regresión del bug de 007),
      las cuotas anuladas no inflan la deuda, los pagos anulados no descuentan,
      y deber no es lo mismo que estar en mora.
- [x] T028 `GET /api/contacts/[id]/record` con capacidad `contactos.ver`.
- [x] T029 UI: `/contacts/[id]/legajo`, enlazado desde el nombre del alumno en
      el roster — la pantalla donde surge la pregunta. Se agregó `contact.id`
      al DTO del roster para poder enlazar.
- [x] T030 [TEST] Verificado contra un alumno REAL de los 340 (SC-003):
      **Emanuel Silva Pintos, 5 cursadas**, 8/8 checks.
      **HALLAZGO — figuraba "Aprobado" en las cinco, sin un solo dato
      cargado.** `approvalState([], null, null)` devuelve "aprobado", y para la
      planilla de la cohorte está bien: ahí el coordinador sabe que todavía no
      cargó nada. En el legajo no — es un documento sobre una persona, y
      afirmar que aprobó sin una evaluación ni una asistencia es inventar un
      hecho. Se agregó el estado **`sin_datos`**, decidido en el legajo y no en
      `approvalState` (que es contrato de 010), con sus dos tests.
- [x] T031 Gate completo: typecheck, lint, **486 tests en 58 archivos**, 0
      rutas sin capacidad declarada.

---

## Phase 5: Reporte por empresa

- [x] T032 `GET /api/companies/[id]/report` (JSON y `?format=csv` en la misma
      ruta: misma información, distinto envase). Capacidad `contactos.ver`.
      **El reporte NO lleva montos**: lo que la empresa pagó es entre la
      empresa y la academia, y no va en la misma planilla que las notas de sus
      empleados. Export con la misma protección anti-inyección de fórmulas que
      el roster (`csvField`), que acá importa MÁS: el archivo lo abre alguien
      de afuera de la academia.
- [x] T033 UI: **pantalla `/empresas`** — no existía ninguna, así que el
      reporte no habría sido alcanzable. Enlace en el menú con capacidad
      `contactos.ver` y gate en el servidor: esconder el enlace no protege una
      URL que se puede tipear.
- [x] T034 Gate completo + `pnpm test:e2e`: **498 tests en 59 archivos** y
      **104/104 checks** en el arnés, con la app conectada como `cadit_app`.
      Se extendió el arnés con 21 checks de esta fase.
      **HALLAZGO DEL E2E que el test unitario no cubría**: con el cronograma
      generado pero SIN lista tomada, `attendancePercentage` devuelve 0 —no
      `null`— así que el legajo afirmaba "Aprobado con 0% de asistencia". Es
      una acusación: dice que la persona no fue a ninguna clase cuando lo que
      pasó es que el profesor todavía no pasó lista. **0% porque nadie pasó
      lista no es 0% porque no vino.** Corregido en el legajo y en el reporte
      por empresa, con su test permanente.
- [x] T035 `CLAUDE.md` (mapa del código + sección "Cursada y legajo" con las
      reglas para código nuevo) y ROADMAP actualizados.

---

## Notas de riesgo

- **La zona horaria es el riesgo real.** T005/T006 van primero y con test: un
  error ahí solo se nota para quien mira desde lejos, que son 87 personas.
- **`generateSchedule()` nunca corrió.** T016 lo verifica contra base efímera
  ANTES de que la pantalla lo ofrezca.
- El calendario mixto confunde si la proyección no se distingue: la marca tiene
  que ser visible, no un tooltip.
- Los pasos 3, 4 y 5 son independientes entre sí. Si la fase se corta, lo
  entregado sigue sirviendo.
