# Feature Specification: Vencimiento de accesos y accesos directos a cursos offline

**Feature Branch**: `043-vencimiento-de-accesos`

**Created**: 2026-10-19

**Status**: Implementada (primera entrega)

**Depende de**: 005 (empresas, `enrollment.company_id`), 012 (capacidades, RLS, `account_link`), 013 (`schedule-time`, día como medianoche UTC), 015 (portal del alumno: ausencia = 404, solo lectura, todo parte de `contactId`), 025/030 (enlaces de reunión, grabaciones de Zoom en `class_session.recording_url`), 028/034 (especializaciones: madre e hijas), cursos-offline (`offline_course_access`, intentos por contacto), 035 (lo grupal bloquea lo individual), 040 (rol Ventas sin escrituras académicas)

**Input**: Decisión del dueño (2026-10-19), no se reabre:

1. El acceso a una cohorte vence solo, un mes después de que termina. Se
   pierden grabaciones, material, avisos, enlaces de clase y los cursos
   offline que llegaron por esa cohorte. Se conservan para siempre notas y
   correcciones, asistencia, certificados (y su PDF), escolaridad y legajo.
   El staff puede fijar a mano la fecha de una persona (más tarde o más
   temprano), con autor.
2. Accesos DIRECTOS a un curso offline para una persona, sin inscripción, con
   fecha límite, revocables. Asignación en bloque a todas las personas de una
   empresa, con vista previa. La persona tiene empresa propia
   (`contact.company_id`). Quien solo tiene un acceso directo entra al portal.
3. El staff ve la fecha de cada alumno en la cohorte y en el legajo, y si es
   calculada o fijada a mano.

## Por qué esta fase existe

Una cohorte `finalizada` solo escondía la "próxima clase": el alumno seguía
viendo las grabaciones, el material, los avisos y los cursos offline de esa
cohorte para siempre. La academia vende el acceso por el período del curso y
un margen; lo demás era un regalo que nadie decidió. Y al revés, no había
forma de darle un curso offline a alguien que no cursa una cohorte (una
empresa que compra la biblioteca para su equipo): el acceso offline nacía
solamente de una inscripción.

## User Scenarios & Testing

### US1 — El acceso vence solo (P1)

Ana terminó Revit Julio el 31 de agosto.

1. **Given** el 30 de septiembre a las 23:59 (Montevideo), **Then** Ana sigue
   viendo grabaciones, material y avisos, con el cartel «Tenés acceso hasta el
   30 de septiembre de 2026».
2. **Given** el 1° de octubre a las 00:00, **Then** la cursada sigue en su
   historial con notas, asistencia y certificado, y el cartel «Acceso
   finalizado el 30 de septiembre de 2026»; las clases ya no traen grabación
   ni enlace, Material y Avisos dicen que el acceso finalizó, y los cursos
   offline de esa cohorte responden 404.
3. **Given** el PDF del certificado o la escolaridad, **Then** se descargan
   igual: lo logrado no vence.

### US2 — El staff extiende (o acorta) el acceso de una persona (P1)

1. **Given** Soporte (con `academico.editar`) en el roster o el legajo,
   **When** fija «hasta el 31/12/2026» para Ana, **Then** Ana recupera el
   acceso hasta ese día y el staff ve «Fijada a mano por Lucía el …» y cuál
   sería la calculada.
2. **When** toca «Volver a la calculada», **Then** la fecha vuelve a la regla.
3. **Given** una inscripción HIJA (módulo), **Then** 422 `acceso_en_la_madre`.
4. **Given** Ventas, **Then** ve la fecha y no puede cambiarla (403).

### US3 — Especialización (P1)

Diego cursa EBIM 13: módulo 1 terminó en marzo, el módulo 2 termina el 25 de
septiembre.

1. **Given** junio, **Then** Diego sigue viendo las grabaciones del módulo 1.
2. **Given** el 26 de octubre, **Then** vencen la madre y todos los módulos
   juntos.
3. **Given** un módulo sin fecha (sin fin ni clases), **Then** el programa no
   vence y la cohorte lo avisa al staff.

### US4 — Un curso offline para una persona sin inscripción (P1)

1. **Given** Eva (sin inscripciones), **When** coordinación le da «Curso A
   hasta el 30/11», **Then** Eva lo ve en el portal con «Disponible hasta el
   30 de noviembre de 2026», puede hacer sus cuestionarios (el intento queda
   sin inscripción) y el 1° de diciembre lo deja de ver.
2. **Given** una fecha ya pasada al CREAR, **Then** 422 `fecha_pasada`.
3. **When** se quita, **Then** queda marcado (quién y cuándo) y deja de verlo
   al instante.
4. **Given** Eva sin acceso al portal, **When** alguien con
   `accesos.gestionar` toca «Dar acceso al portal» en su legajo, **Then** se
   le crea la cuenta y el portal le muestra solo sus cursos offline.

### US5 — A toda una empresa (P2)

1. **Given** ACME con 3 personas (una ya con acceso hasta marzo, otra hasta
   noviembre), **When** se elige ACME y «hasta el 31/12», **Then** la vista
   previa dice: lo reciben 1, se les extiende 1 (tenía hasta noviembre), ya lo
   tienen 1 (hasta marzo).
2. **When** se confirma, **Then** se crean y extienden exactamente esos; volver
   a confirmar no cambia nada; con una fecha anterior no acorta a nadie.
3. **Given** alguien que se suma a ACME después, **Then** no lo recibe.

### US6 — Quiénes tienen acceso (P2)

En la pantalla del curso offline, una fila por fuente: «Cohorte X»,
«Cohorte X (otorgado a esta inscripción)», «Acceso directo · empresa ACME»,
cada una con su fecha y si venció.

## Reglas

### La fecha

- **Referencia de una cohorte**: `cohort.end_date`; sin ella, la fecha de la
  última `class_session` NO cancelada; sin ninguna de las dos, **no hay
  referencia y el acceso no vence**. La cohorte lo avisa en su roster.
- **Hasta** = referencia + 1 mes CALENDARIO, recortado a fin de mes
  (31/01 → 28/02 o 29/02; 31/03 → 30/04). Es el último día con acceso,
  inclusive.
- **Corte**: el acceso termina al terminar ese día en la zona de la
  organización (`organization.timezone`); se calcula con `classEndsAt` de
  `src/lib/schedule-time.ts`, el único lugar que compone fechas de clase. El
  día se lee con los componentes UTC del timestamp, como en 013.
- **Fecha manual** (`enrollment.access_until`) REEMPLAZA a la calculada, más
  tarde o más temprano; guarda autor y fecha (`access_until_set_by/_at`).
  Vacía = la regla.
- **Se calcula al leer.** Nada se guarda como "vencido" y nada se revoca; no
  hay cron. Cambiar la fecha de fin de una cohorte mueve el vencimiento de
  todos sus alumnos al instante.

### Especializaciones (028/034)

- Madre e hijas vencen JUNTAS: el recorrido es uno.
- Referencia del programa = la más tarde entre la de cada módulo (los módulos
  del programa y las cohortes de las inscripciones hijas, que pueden ser de
  otra camada) y la `end_date` de la madre si existe.
- Si algún módulo no tiene referencia, el programa **no vence**: cortar con la
  fecha de los módulos que sí la tienen le quitaría el material a alguien que
  todavía está cursando.
- La fecha manual se fija en la madre; en una hija responde 422.
- Quien compró un módulo suelto (inscripción sin madre a una cohorte módulo)
  vence con la fecha de ese módulo.

### Qué vence y qué no

| Vence (CONTENIDO) | No vence (LOGRO) |
|---|---|
| Grabaciones (`recordingUrl`, reproductor de Zoom) | Notas, evaluaciones, correcciones, entregas |
| Enlaces de reunión y "próxima clase" | Asistencia (la lista de clases se sigue viendo) |
| Material (`resources`) | Certificados y su PDF |
| Avisos (`announcements`) | Escolaridad |
| Cursos offline que dio esa cohorte (heredados y otorgados a esa inscripción) | Legajo, estado de cuenta |

- **Vencido = no viaja.** `studentCourseDetail` no consulta material ni
  avisos, vacía grabación y enlace de cada clase y no arma próxima clase; el
  inicio no elige próxima clase de una cursada vencida. Un curso offline
  vencido responde `null` → 404, igual que uno que no existe (nunca 403).
- El aviso al alumno: «Acceso finalizado el …» una vez vencido; «Tenés acceso
  hasta el …» en los últimos 31 días antes del corte (con el cálculo de un mes
  es todo el período posterior al fin). Fuera de eso, nada.
- **Portal del profesor: sin cambios.** El profesor conserva sus cohortes; el
  vencimiento es una regla sobre lo que el ALUMNO compró.

### Cursos offline

- Acceso = (cohortes NO vencidas, con las reglas de cursos-offline y 035
  adentro) ∪ (accesos directos NO vencidos). El mismo curso por varias
  fuentes: gana la fecha más tarde; una fuente sin fecha gana a todas.
- **Un acceso directo da el curso aunque una cohorte lo haya quitado** a esa
  inscripción: la quita es una excepción DENTRO de la cohorte; el acceso
  directo es una decisión sobre la persona.
- **035 no se toca.** "Lo grupal bloquea lo individual" sigue aplicando a las
  excepciones por inscripción (`offline_course_access.mode`); los accesos
  directos viven en otra tabla y ni los bloquea ni los borra asignar el curso
  al grupo.
- El intento de un cuestionario se registra contra la inscripción vigente más
  antigua que da el curso; si solo llega por acceso directo, sin inscripción
  (`offline_quiz_attempt.enrollment_id` NULL). Los intentos se cuentan por
  persona, como antes.
- La actividad del alumno en Administración (staff) sigue mostrando todo lo
  que la persona TUVO, vencido o no.

### Accesos directos

- De un CONTACTO, no de una inscripción. Fecha límite **obligatoria** (un
  acceso sin fecha es exactamente el regalo que esta fase cierra); nota
  opcional; autor y fecha de alta y de último cambio.
- Uno activo por (persona, curso) (índice único parcial). Asignar de a uno a
  quien ya tiene: cambia la fecha (más tarde o más temprano). Al CREAR, la
  fecha no puede haber pasado.
- Quitar = marcar (`revoked_at/_by`), no borrar. Volver a dar crea uno nuevo.
- **A toda la empresa**: un acceso INDIVIDUAL por cada persona que la empresa
  tiene HOY (contactos activos con `company_id`). Quien se sume después no lo
  recibe. Vista previa obligatoria (lo reciben / se extiende / ya lo tienen);
  al confirmar se re-planea en el servidor. Idempotente y **nunca acorta**: a
  quien ya lo tiene solo se le extiende si la fecha nueva es posterior (y el
  `UPDATE` lo vuelve a exigir con `access_until < nueva`). A quien se le había
  quitado lo vuelve a recibir, y la vista previa lo dice.

### La empresa de la persona

- `contact.company_id` (nullable, `on delete set null`).
- Se edita en el contacto con `contactos.editar` (es un dato del contacto,
  como su correo; la empresa en sí sigue siendo de `empresas.editar`).
- Se completa sola al inscribir con empresa (y al cambiar la empresa de una
  venta) **solo si estaba vacía**: nunca pisa una distinta (una venta vieja
  puede estar facturada a la empresa anterior de la persona).
- Backfill en la migración: la empresa de la inscripción con empresa más
  reciente de cada persona.

### Portal sin inscripción

`validateAccountLink` acepta a un alumno con inscripción **o** con un acceso
directo sin quitar. `grantPortalAccessToContact` lo valida ANTES de crear la
cuenta. El portal funciona con cero inscripciones (inicio vacío que señala
Cursos offline; la biblioteca muestra lo suyo).

### Capacidades (sin capacidades nuevas)

- Ver fechas y "quiénes tienen acceso": `academico.ver`.
- Fijar fechas y dar/extender/quitar accesos directos (uno o empresa):
  **`academico.editar`**. Es una decisión sobre la cursada, no sobre la venta
  (`inscripciones.editar` también cambia montos); Soporte —que recibe el "no
  puedo ver la grabación"— la tiene; Ventas y Administración no.
- Portal de una persona sin inscripción: `accesos.gestionar`.
- Empresa del contacto: `contactos.editar`.

## IMPACTO AL DESPLEGAR — LEER ANTES

En el momento en que 043 llega a producción, **toda persona cuya cohorte
terminó hace más de un mes pierde el acceso** a sus grabaciones, material,
avisos y cursos offline de esa cohorte. No hay período de gracia silencioso
(decisión del dueño). Para mirarlo antes:

```bash
psql "$OWNER_DATABASE_URL" -v fecha=2026-10-20 -f scripts/accesos-que-vencen.sql
```

Solo lectura (vistas temporales + ROLLBACK). Da el resumen (personas,
cursadas, cohortes), las cohortes afectadas con su fecha, las cohortes sin
fecha (que no vencen) y el detalle por persona. Si hace falta, se puede fijar
a mano la fecha de quien corresponda después de desplegar.

## Requisitos funcionales

- **FR-001** Regla pura de fechas (`src/lib/access-expiry.ts`) con tests de
  fin de mes, zona y especialización.
- **FR-002** Corte en el servidor en toda ruta de contenido del alumno;
  guard estructural que obliga a clasificar cada ruta de `api/portal/me`.
- **FR-003** `PATCH /api/enrollments/[id]/access-until` (`academico.editar`),
  body estricto `{ accessUntil: "AAAA-MM-DD" | null }`.
- **FR-004** `GET /api/cohorts/[id]/content-access` y
  `GET /api/contacts/[id]/content-access` (`academico.ver`).
- **FR-005** Accesos directos: `POST /api/offline-courses/[id]/grants`,
  `PATCH|DELETE /api/offline-course-grants/[id]`,
  `GET|POST /api/offline-courses/[id]/grants/company` (vista previa con
  `confirm: false`), `GET /api/offline-courses/[id]/access`.
- **FR-006** `GET|POST /api/contacts/[id]/portal-access` (`accesos.gestionar`).
- **FR-007** Migración 0064: `offline_course_grant` (+ RLS),
  `enrollment.access_until/_set_at/_set_by`, `contact.company_id` (+
  backfill), `offline_quiz_attempt.enrollment_id` NULL-able.
- **FR-008** UI: carteles en el portal; fecha por alumno en el roster y el
  legajo; accesos directos en el legajo; "Quiénes tienen acceso" con
  asignación a persona y a empresa en el curso offline; empresa en el
  contacto.
- **FR-009** Script de solo lectura `scripts/accesos-que-vencen.sql`.

## Fuera de alcance

- Asignar a una empresa desde `/empresas` (se hace desde el curso offline).
- Avisar por WhatsApp o correo que el acceso está por vencer.
- Vencimiento de licencias de software (ya tienen su `expires_at`, 034).
- Vencer el acceso del profesor.
- Prueba E2E (decisión del dueño).
