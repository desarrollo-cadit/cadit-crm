# Feature Specification: Modelo académico + CRM de ventas — cursos, camadas e inscripciones (Fase 1)

**Feature Branch**: `004-modelo-academico`

**Created**: 2026-08-10

**Status**: Implemented

**Input**: Reconvertir el pipeline de ventas kanban existente (`pipeline_stage` + `lead`)
para que sirva DOS cosas a la vez: (1) CRM de ventas general de la academia — leads que
todavía no tienen curso/camada definida, tal como funciona hoy — y (2) gestión de
inscripciones por camada. Un `enrollment` con `cohort_id` vacío ES el lead general de
ventas de hoy; con `cohort_id` asignada, es una inscripción a esa camada puntual. Fase 1
de 7: solo modelo de datos y migraciones — sin importar los Excel, sin pantallas nuevas,
sin email, sin formulario público, sin licencias con UI, sin automatización de
WhatsApp, sin tocar el Laboratorio de IA.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Gestionar leads generales de ventas de la academia (Priority: P1)

Como responsable de capacitaciones, cuando alguien me escribe por WhatsApp interesado
pero todavía no sé a qué curso/camada lo voy a anotar, quiero que siga apareciendo
automáticamente como una tarjeta en un tablero general de ventas (sin camada asignada
todavía) — exactamente como pasa hoy — y poder asignarle una camada más adelante sin
perder su historial ni duplicar el contacto.

**Why this priority**: Es el comportamiento que YA existe hoy (auto-creación de tarjeta
al primer mensaje) y no se puede perder — es la base de que esta instancia siga
sirviendo como CRM de ventas de la academia, no solo como gestión académica por camada.

**Independent Test**: Con un contacto nuevo que escribe por WhatsApp (o insertando un
`enrollment` sin `cohort_id` vía seed), verificar que aparece en el tablero general
(`GET /api/pipeline/board` sin `cohortId`).

**Acceptance Scenarios**:

1. **Given** un contacto nuevo que escribe por WhatsApp por primera vez, **When** se
   procesa su mensaje, **Then** se crea automáticamente un `enrollment` sin
   `cohort_id` en la primera etapa abierta — igual que hoy crea un `lead` (sin ningún
   cambio de comportamiento observable para quien usa el inbox).
2. **Given** un `enrollment` sin camada asignada, **When** el responsable le asigna una
   `cohort_id`, **Then** esa misma tarjeta (sin crear una inscripción nueva) deja de
   verse en el tablero general y pasa a verse en el tablero de esa camada, conservando
   su etapa, posición e historial.
3. **Given** el tablero general (`/api/pipeline/board` sin filtro), **When** lo
   consulto, **Then** muestra únicamente los `enrollment` sin `cohort_id` — no se
   mezcla con los ya asignados a una camada.

---

### User Story 2 - Planificar una camada y verla como tablero propio (Priority: P1)

Como responsable de capacitaciones, cargo un curso (p. ej. "Revit") y una camada nueva
(fechas, profesor, cupo) desde un seed script o Drizzle Studio, y quiero que el pipeline
kanban ya existente en el CRM se pueda filtrar por esa camada específica, mostrando solo
sus inscripciones — sin mezclarse con las de otra camada del mismo curso, con las de
otro curso, ni con el tablero general de ventas.

**Why this priority**: Es la base de la gestión académica — sin curso + camada + tablero
filtrado no hay dónde colgar una inscripción concreta.

**Independent Test**: Se puede probar de punta a punta creando un curso y una camada por
script, sin ninguna UI nueva, y verificando que el endpoint del tablero
(`/api/pipeline/board?cohortId=...`) devuelve un tablero vacío con las etapas
configurables.

**Acceptance Scenarios**:

1. **Given** un curso y una camada creados, **When** consulto el tablero filtrado por
   esa camada, **Then** veo las etapas del pipeline de la organización (lead,
   contactado, inscripto, con_licencia, cursando, finalizado, abandonó) sin ninguna
   inscripción todavía.
2. **Given** dos camadas del mismo curso con fechas distintas, **When** consulto el
   tablero de cada una por separado, **Then** cada tablero es independiente aunque
   compartan `course_id`.

---

### User Story 3 - Un contacto se inscribe en más de una camada sin conflicto (Priority: P1)

Como responsable de capacitaciones, inscribo al mismo contacto en dos camadas distintas
a lo largo del tiempo (p. ej. Revit en agosto y Civil 3D en octubre), y necesito que
ambas inscripciones existan de forma independiente, cada una con su propio estado —
incluso si ese contacto además tiene (o tuvo) un lead general de ventas sin camada.

**Why this priority**: Es el requisito que rompe la limitación actual del pipeline
(hoy un contacto solo puede tener un lead activo) y es el motivo central de esta fase.

**Independent Test**: Insertar dos filas de `enrollment` con `cohort_id` para el mismo
`contact_id` en camadas distintas vía seed script y confirmar que ambas persisten sin
error de restricción única.

**Acceptance Scenarios**:

1. **Given** un contacto con una inscripción activa en la camada A, **When** lo inscribo
   también en la camada B, **Then** ambas inscripciones coexisten, cada una con su
   propia etapa y posición en su respectivo tablero.
2. **Given** un contacto ya inscripto en la camada A, **When** intento crear una segunda
   inscripción para el mismo contacto en la MISMA camada A, **Then** el sistema lo
   rechaza (una inscripción por contacto y camada, no duplicados).
3. **Given** un contacto con un lead general (sin camada) y una inscripción a la camada
   A, **When** reviso ambos, **Then** conviven sin conflicto — son filas distintas del
   mismo contacto.
4. **Given** dos inscripciones del mismo contacto en camadas distintas, **When** muevo
   una de etapa en su tablero, **Then** la otra inscripción no se ve afectada.

---

### User Story 4 - Mover una inscripción de etapa reutilizando el kanban existente (Priority: P2)

Como responsable de capacitaciones, uso el mismo tablero de arrastrar-y-soltar que ya
existe en el CRM para mover una inscripción entre etapas (por ejemplo de "contactado" a
"inscripto"), tanto en el tablero general de ventas como en el tablero de una camada.

**Why this priority**: Confirma que la UI existente (`PipelineClient`/`StageManager`)
sigue funcionando sin cambios de interfaz, solo reapuntada a `enrollment`.

**Independent Test**: Con datos de seed, mover una tarjeta en el tablero general o en el
filtrado por camada y verificar que persiste el nuevo `stage_id` de esa inscripción
puntual.

**Acceptance Scenarios**:

1. **Given** una inscripción en la etapa "contactado" de una camada (o del tablero
   general), **When** la muevo a "inscripto", **Then** el cambio persiste y es visible
   al recargar ese mismo tablero.

---

### User Story 5 - Registrar el origen de un contacto (Priority: P3)

Como responsable de capacitaciones, quiero poder guardar de dónde vino un contacto
(campaña, formulario, referido) aunque todavía no haya una UI para cargarlo, para que
las fases futuras (formulario web, fase 5) tengan dónde escribir ese dato.

**Why this priority**: No bloquea nada de esta fase — es un campo de datos que las
fases futuras necesitan, sin urgencia de UI propia todavía.

**Independent Test**: Crear un contacto con `source` y `utm_campaign` vía seed script y
confirmar que persisten y se pueden leer.

**Acceptance Scenarios**:

1. **Given** un contacto creado con `source="feria-2026"`, **When** lo consulto,
   **Then** el valor persiste sin afectar los contactos existentes que no tienen
   `source`.

---

### Edge Cases

- ¿Puede un contacto tener un lead general Y una o más inscripciones a camadas al mismo
  tiempo? Sí — son filas independientes del mismo `contact_id` (una con `cohort_id`
  NULL, el resto con `cohort_id` distinto cada una).
- ¿Qué pasa si se intenta crear un segundo lead general (sin camada) para el mismo
  contacto? Se rechaza — un solo `enrollment` con `cohort_id IS NULL` por contacto,
  mismo criterio que hoy aplica `lead_contact_uq`.
- ¿Qué pasa si se borra una camada que ya tiene inscripciones? El borrado debe fallar o
  requerir reasignación explícita — nunca perder inscripciones en silencio (mismo
  criterio que hoy aplica al borrar una etapa con leads, ver `StageManager`).
- ¿Qué pasa si se borra un curso que tiene camadas? Mismo criterio: no debe ser posible
  sin resolver antes las camadas dependientes.
- ¿Qué pasa si una organización nueva no tiene sembradas las 7 etapas académicas?
  Deben sembrarse automáticamente (igual que hoy se asume un `pipeline_stage` inicial) —
  esas mismas 7 etapas sirven tanto al tablero general como a cada camada.
- ¿Qué pasa con una `license` cuando se borra su `enrollment`? Debe borrarse en cascada
  (no puede quedar una licencia huérfana).
- Un `enrollment` sin `license` asociada es el caso normal (recién inscripto, sin
  licencia todavía) — no es un error.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE permitir crear un `course` (catálogo: nombre +
  descripción) por organización.
- **FR-002**: El sistema DEBE permitir crear una `cohort` (camada) asociada a un
  `course`, con fecha de inicio, fecha de fin, profesor, cupo, link del grupo de
  WhatsApp y estado (`planificada` / `en_curso` / `finalizada`).
- **FR-003**: El sistema DEBE permitir crear un `enrollment` que asocie un `contact`
  existente con una `cohort` específica, **o sin ninguna camada asignada** (lead
  general de ventas de la academia) — `cohort_id` es opcional.
- **FR-004**: El sistema DEBE impedir duplicados en dos sentidos: (a) dos `enrollment`
  para el mismo par (`contact_id`, `cohort_id`) cuando hay camada asignada; (b) dos
  `enrollment` sin camada para el mismo `contact_id` (un solo lead general por
  contacto, igual que hoy).
- **FR-005**: El sistema DEBE permitir que el mismo `contact` tenga simultáneamente su
  lead general (sin camada) y `enrollment` en una o más camadas, de forma
  independiente entre sí.
- **FR-006**: El estado de un `enrollment` (lead / contactado / inscripto / con_licencia
  / cursando / finalizado / abandonó) DEBE representarse reutilizando `pipeline_stage`
  existente (una etapa = una columna del kanban), sembrando esas 7 etapas por
  organización — compartidas por el tablero general y por cada tablero de camada, en
  vez de agregar una columna de estado nueva y separada.
- **FR-007**: El tablero de inscripciones (`GET /api/pipeline/board`) DEBE aceptar un
  filtro `cohortId` opcional: sin filtro devuelve el tablero GENERAL (solo
  `enrollment` con `cohort_id` vacío — el CRM de ventas de la academia); con filtro
  devuelve solo las inscripciones de esa camada.
- **FR-008**: El sistema DEBE permitir asignar o reasignar la `cohort_id` de un
  `enrollment` existente (pasarlo del tablero general al de una camada, o entre
  camadas) sin crear una fila nueva ni perder su etapa/posición/historial.
- **FR-009**: Mover una inscripción de etapa (drag & drop existente) DEBE afectar
  únicamente a esa inscripción puntual, sin tocar otras inscripciones del mismo
  contacto (ni su lead general, ni sus inscripciones a otras camadas).
- **FR-010**: La auto-creación de tarjeta al recibir el primer mensaje de un contacto
  por WhatsApp (`onLeadActivity`) DEBE seguir funcionando exactamente como hoy, ahora
  creando un `enrollment` sin `cohort_id` — sin ningún cambio de comportamiento
  observable para el usuario del inbox.
- **FR-011**: El sistema DEBE permitir asociar una `license` (0 o 1) a un `enrollment`,
  con estado asignada/no asignada, fecha de asignación y de vencimiento.
- **FR-012**: El sistema DEBE permitir registrar `source` y `utm_campaign` (ambos
  opcionales) en un `contact`, sin requerirlos en los contactos ya existentes.
- **FR-013**: El sistema DEBE modelar `automation_rule` (evento disparador, canal,
  plantilla, activo/inactivo) como tabla, sin ejecutar ninguna lógica de disparo en esta
  fase (eso es Fase 4/7).
- **FR-014**: Toda tabla nueva de este dominio DEBE llevar `organization_id NOT NULL`
  con índice org-first, y toda consulta DEBE pasar por `scoped()`, igual que el resto
  del dominio (Constitución III).
- **FR-015**: Las migraciones DEBEN ser versionadas en `drizzle/` y re-ejecutables
  (Constitución IV). Esta instancia arranca en limpio para el uso académico: la
  migración renombra/extiende `lead`→`enrollment` (con `cohort_id` NULLABLE, así que
  cualquier fila existente queda automáticamente como lead general, sin necesitar
  backfill).

### Key Entities *(include if feature involves data)*

- **course**: catálogo de cursos que dicta el área de capacitaciones (nombre,
  descripción). Pertenece a una organización.
- **cohort**: una edición/camada concreta de un `course`, con sus propias fechas,
  profesor, cupo, link de WhatsApp y estado. Varias `cohort` pueden compartir `course`.
- **enrollment**: la relación de un `contact` con el embudo de ventas/académico de la
  academia — reemplaza el rol que hoy cumple `lead`. Con `cohort_id` vacío es un lead
  general de ventas (el caso de hoy, sin cambios); con `cohort_id` asignada es la
  inscripción a esa camada puntual. Un contacto puede tener a la vez su lead general y
  N inscripciones a camadas distintas. Referencia la etapa (`pipeline_stage`) igual que
  `lead` hoy.
- **license**: la licencia de software asociada (0 o 1) a un `enrollment` — asignada o
  no, con fechas de asignación/vencimiento.
- **automation_rule**: regla de automatización (evento → canal → plantilla) — solo
  modelo en esta fase, sin lógica de disparo.
- **contact** *(existente, extendido)*: se le agregan `source` y `utm_campaign`,
  ambos opcionales, sin tocar sus campos actuales (`wa_identity`, `phone`, etc.).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Se puede registrar un curso y una camada nueva (vía seed/Drizzle Studio)
  en menos de 1 minuto, sin escribir código de aplicación nuevo.
- **SC-002**: Un mismo contacto puede tener inscripciones activas simultáneas en 2 o
  más camadas distintas, verificable sin ningún error ni pérdida de datos.
- **SC-003**: El tablero de una camada muestra el 100% de sus inscripciones y 0% de
  inscripciones de otras camadas ni del tablero general.
- **SC-004**: Mover una inscripción de etapa en cualquier tablero no modifica el estado
  de ninguna otra inscripción del mismo contacto.
- **SC-005**: El comportamiento actual de auto-creación de tarjeta al primer mensaje de
  WhatsApp sigue funcionando sin cambios observables para el usuario del inbox (mismo
  contacto, misma conversación, misma etapa inicial).

## Assumptions

- Vocero es "una instancia = un negocio" (ya establecido en el proyecto): el pipeline
  general de ventas y la gestión académica por camada conviven en el mismo tablero
  (mismo componente, misma tabla `enrollment`, distinguidos por `cohort_id`
  presente/ausente) — no son dos sistemas separados.
- `license` es una relación 1:0 o 1:1 con `enrollment` (fila creada solo cuando se
  asigna una licencia por primera vez), no una columna embebida en `enrollment`.
- `automation_rule` se modela sin sembrar filas por defecto en esta fase; las reglas
  concretas (Fase 4 y 7) se agregan cuando se implemente su lógica.
- Las 7 etapas de estado (lead/contactado/inscripto/con_licencia/cursando/finalizado/
  abandonó) se siembran como `pipeline_stage` por organización y se usan tanto para el
  tablero general de ventas como para cada tablero de camada — mismas etapas, dos
  contextos de filtrado.
