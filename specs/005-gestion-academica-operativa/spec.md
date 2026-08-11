# Feature Specification: Gestión académica operativa (Fase 2)

**Feature Branch**: `005-gestion-academica-operativa`

**Created**: 2026-08-10

**Status**: Implemented

**Input**: User description: "Gestión académica operativa (Fase 2) — reemplaza las planillas de Excel de coordinación/ventas y de soporte por el CRM: catálogo de software con inventario de licencias, camadas enriquecidas (costo, horario, aula, temario, software), profesor como entidad con alerta de choque de horario, inscripciones con datos comerciales (monto, cuotas, cédula, factura, recibo, vendedor, empresa opcional) con email/celular únicos, checklist de onboarding de soporte compartido con ventas/coordinación, roles (ventas+coordinación vs. soporte sin ver finanzas), calendario de camadas, dashboard financiero en el home, y un endpoint público de solo lectura con el catálogo de cursos y próximos comienzos."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Planificar una camada con toda la información operativa (Priority: P1) 🎯 MVP

Como coordinación, cuando ofrezco un curso necesito crear una camada (grupo) con
costo, horario, aula, docente, fechas de inicio/fin, URL del temario y qué software
usa — todo lo que hoy anoto en la planilla "cursos activos" — sin volver a esa
planilla.

**Why this priority**: Es el punto de partida de todo lo demás: sin una camada
completa no hay dónde inscribir gente ni qué mostrar en el checklist de soporte.

**Independent Test**: Crear un curso y una camada indicando costo, horario, aula,
docente, fechas y software; verificar que los datos quedan guardados y visibles al
consultar esa camada.

**Acceptance Scenarios**:

1. **Given** un curso ya existente, **When** coordinación crea una camada indicando
   fecha de inicio/fin, costo, horario, aula, docente (texto) y el/los software que
   usa, **Then** la camada queda creada con todos esos datos visibles.
2. **Given** una camada creada, **When** coordinación edita su costo o su horario,
   **Then** el cambio se refleja de inmediato para cualquiera que consulte esa
   camada.

---

### User Story 2 - Inscribir un alumno con sus datos comerciales, sin duplicar contactos (Priority: P1)

Como ventas, cuando un alumno se anota a una camada necesito registrar monto,
cantidad de cuotas, cédula, número de factura, número de recibo, vendedor que lo
atendió, observaciones y, si corresponde, la empresa que factura — reemplazando la
planilla de ventas — y el sistema debe evitar que cargue dos veces el mismo email o
celular.

**Why this priority**: Es el otro lado del MVP: sin esto, ventas sigue dependiendo
del Excel para lo comercial aunque la camada ya viva en el CRM.

**Independent Test**: Inscribir un contacto nuevo en una camada cargando monto,
cuotas, cédula, factura, recibo y vendedor; luego intentar inscribir OTRO contacto
con el mismo email o el mismo celular y verificar que el sistema lo rechaza con un
mensaje claro (no un error genérico).

**Acceptance Scenarios**:

1. **Given** una camada con cupo, **When** ventas inscribe un contacto nuevo
   cargando monto, cantidad de cuotas, cédula, factura, recibo y vendedor,
   **Then** la inscripción queda guardada con esos datos y visible en la camada.
2. **Given** un contacto ya registrado con un email o celular determinado,
   **When** se intenta crear otro contacto con el mismo email o el mismo celular,
   **Then** el sistema lo rechaza y explica cuál de los dos datos está repetido.
3. **Given** una inscripción, **When** ventas indica que corresponde a una empresa
   (facturación B2B), **Then** la empresa queda asociada a esa inscripción sin
   reemplazar los datos personales del alumno.

---

### User Story 3 - Soporte hace seguimiento del onboarding por camada (Priority: P1)

Como soporte, necesito entrar a la lista de alumnos de una camada y marcar si ya se
le asignó licencia, si se le envió el correo de términos y condiciones, si se le
instaló el software, si ya tenía licencia propia, y si se le dio acceso a "Academia
Online" — reemplazando la planilla de soporte que hoy armo copiando y pegando.

**Why this priority**: Completa el reemplazo de los dos Excel actuales; sin esto
soporte sigue duplicando trabajo a mano.

**Independent Test**: Abrir la vista de una camada como soporte, marcar cada ítem
del checklist para un alumno y verificar que queda guardado con fecha, visible
también para ventas/coordinación en la misma pantalla.

**Acceptance Scenarios**:

1. **Given** una camada con inscripciones, **When** soporte marca "licencia
   asignada" para un alumno, **Then** queda registrado con fecha y visible para
   cualquiera que consulte esa camada.
2. **Given** la vista de una camada, **When** coordinación/ventas la abre,
   **Then** ve la misma información de checklist que ve soporte (pantalla
   compartida).
3. **Given** un usuario con rol soporte, **When** intenta acceder al dashboard
   financiero o a montos de facturación, **Then** el sistema no se lo muestra.

---

### User Story 4 - Inventario de licencias con alerta de faltante (Priority: P2)

Como coordinación, al planificar una camada que usa cierto software necesito saber
si tengo licencias suficientes, para no comprometerme con alumnos sin poder
entregarles acceso.

**Why this priority**: Mejora directa sobre el dolor real ("hoy no sabemos si
alcanzan las licencias hasta que es tarde"), pero el negocio puede seguir operando
un tiempo más sin esto si hace falta priorizar US1-3 primero.

**Independent Test**: Configurar un total de licencias para un software, crear una
camada que lo usa con más cupo que licencias disponibles, y verificar que aparece
una alerta visible.

**Acceptance Scenarios**:

1. **Given** un software con licencias totales configuradas, **When** se asigna una
   licencia a una inscripción y no queda ninguna disponible, **Then** el sistema
   impide la asignación y explica que no hay stock.
2. **Given** una camada que declara usar un software, **When** su cupo planificado
   supera las licencias disponibles de ese software, **Then** coordinación ve una
   alerta al crear o editar la camada (no se bloquea la creación).
3. **Given** una inscripción con licencia asignada, **When** se da de baja esa
   inscripción o se le retira la licencia, **Then** la licencia vuelve al pool
   disponible.

---

### User Story 5 - Alertar choques de horario de un profesor (Priority: P3)

Como coordinación, al asignarle una camada nueva a un profesor que ya tiene otra
camada en un horario superpuesto, quiero que el sistema me avise antes de
confirmar.

**Why this priority**: Evita un problema operativo real pero de menor frecuencia
que los anteriores; el negocio hoy lo resuelve a mano revisando la planilla.

**Independent Test**: Crear dos camadas con el mismo profesor y horarios
superpuestos y verificar que aparece una advertencia al guardar la segunda.

**Acceptance Scenarios**:

1. **Given** un profesor con una camada ya asignada en un horario, **When**
   coordinación intenta asignarle otra camada que se superpone en fecha/horario,
   **Then** el sistema muestra una advertencia (no bloquea, coordinación decide).

---

### User Story 6 - Calendario y dashboard financiero para coordinación/ventas (Priority: P3)

Como coordinación/ventas, quiero un calendario con todas las camadas ubicadas por
fecha, y un panel en el home con la facturación del mes comparada con el mes
anterior, para tener una vista general sin sumar la planilla a mano.

**Why this priority**: Valor de visibilidad, no bloquea la operación diaria como
las historias anteriores.

**Independent Test**: Con camadas e inscripciones ya cargadas, abrir el calendario
y verificar que cada camada aparece en su rango de fechas; abrir el home y
verificar que el dashboard muestra el total facturado del mes actual y del
anterior.

**Acceptance Scenarios**:

1. **Given** varias camadas con fechas de inicio/fin, **When** coordinación abre el
   calendario, **Then** cada camada aparece ubicada en su rango de fechas.
2. **Given** inscripciones con montos cargados en distintos meses, **When**
   coordinación/ventas abre el home, **Then** ve el total facturado del mes actual
   comparado con el mes anterior.

---

### User Story 7 - Publicar el catálogo de cursos para el sitio web (Priority: P3)

Como negocio, quiero que mi sitio web público (hoy WordPress, a futuro Astro) pueda
mostrar los cursos disponibles y sus próximos comienzos, sin que ese sitio tenga
acceso al CRM.

**Why this priority**: Valor de marketing/ventas externo, independiente de la
operación interna; puede esperar a que el resto esté funcionando.

**Independent Test**: Con cursos y camadas futuras cargadas, consultar el endpoint
público sin autenticación y verificar que devuelve los cursos con su descripción,
temario y las camadas con fecha de inicio futura.

**Acceptance Scenarios**:

1. **Given** un curso con camadas futuras, **When** se consulta el endpoint público
   de ese curso, **Then** devuelve nombre, descripción, temario y la lista de
   próximos comienzos (fecha de inicio, sin datos de alumnos).
2. **Given** una camada ya finalizada o en curso, **When** se consulta el endpoint
   público, **Then** esa camada NO aparece como "próximo comienzo".
3. **Given** cualquier request al endpoint público, **When** no incluye
   credenciales de sesión, **Then** igual responde con éxito (es de acceso
   público) y nunca incluye datos de alumnos, montos ni información interna.

---

### Edge Cases

- Un usuario con rol soporte intenta acceder por URL directa a una pantalla de
  finanzas/dashboard: el sistema debe negar el acceso igual que si no existiera el
  enlace, no solo ocultar el botón.
- Se intenta inscribir un contacto reutilizando un email o celular que pertenece a
  un contacto de OTRA organización: no aplica — la unicidad de email/celular es
  por organización, igual que el resto del modelo multi-tenant.
- Se intenta bajar el total de licencias de un software por debajo de las que ya
  están asignadas: el sistema lo rechaza y explica cuántas están en uso.
- Una camada no declara ningún software: no dispara alerta de licencias (no aplica).
- Se solicita el endpoint público para un curso sin camadas futuras: responde igual
  con lista de próximos comienzos vacía, no un error.
- Una camada alcanza su capacidad configurada: el sistema permite seguir
  inscribiendo (no hay lista de espera en esta fase); queda como mejora futura.

## Requirements *(mandatory)*

### Functional Requirements

**Catálogo y licencias**

- **FR-001**: El sistema MUST permitir crear/editar un catálogo de software por
  organización (nombre, total de licencias disponibles).
- **FR-002**: El sistema MUST descontar del pool de licencias disponibles de un
  software al asignarle una licencia a una inscripción, y devolverla al pool al
  desasignarla o al dar de baja la inscripción.
- **FR-003**: El sistema MUST impedir asignar una licencia de un software cuyo pool
  disponible sea cero, explicando el motivo.
- **FR-004**: El sistema MUST impedir reducir el total de licencias de un software
  por debajo de la cantidad actualmente asignada.

**Camadas**

- **FR-005**: El sistema MUST permitir registrar en una camada: costo, horario
  (texto libre), aula, URL del temario, y qué software(s) del catálogo utiliza,
  además de los campos ya existentes (curso, profesor, fechas, capacidad, estado).
- **FR-006**: El sistema MUST mostrar una advertencia (no bloqueante) al crear o
  editar una camada cuyo cupo planificado supere las licencias disponibles de
  alguno de sus software declarados.
- **FR-007**: El sistema MUST modelar el profesor como una entidad propia (no texto
  libre), con nombre.
- **FR-008**: El sistema MUST mostrar una advertencia (no bloqueante) al asignar a
  un profesor una camada cuyo rango de fechas se superpone con otra camada que ya
  tiene asignada.

**Inscripciones y datos comerciales**

- **FR-009**: El sistema MUST permitir registrar en una inscripción: monto total,
  cantidad de cuotas, observaciones libres sobre el estado de pago, cédula de
  identidad del contacto, número de factura, número de recibo, y el vendedor
  (miembro de la organización) que la gestionó.
- **FR-010**: El sistema MUST validar que el email de un contacto sea único dentro
  de la organización, rechazando con un mensaje explícito el intento de duplicarlo.
- **FR-011**: El sistema MUST validar que el celular de un contacto sea único
  dentro de la organización, rechazando con un mensaje explícito el intento de
  duplicarlo.
- **FR-012**: El sistema MUST permitir asociar opcionalmente una inscripción a una
  empresa (razón social + identificación fiscal) para facturación B2B, sin que eso
  reemplace los datos personales del contacto.

**Checklist de soporte**

- **FR-013**: El sistema MUST permitir marcar por inscripción, con fecha, cada uno
  de: licencia asignada, correo de términos y condiciones enviado, software
  instalado, alumno con licencia propia, acceso a "Academia Online" otorgado.
- **FR-014**: El sistema MUST mostrar la lista de inscripciones de una camada junto
  con su checklist de onboarding en una única pantalla accesible tanto por
  ventas/coordinación como por soporte.

**Roles y acceso**

- **FR-015**: El sistema MUST reconocer dos roles funcionales dentro de una
  organización: uno con acceso completo (ventas/coordinación) y otro restringido
  (soporte).
- **FR-016**: El sistema MUST impedir que el rol soporte acceda a datos financieros
  (montos, facturación, dashboard financiero), incluso por acceso directo a la URL.
- **FR-017**: El sistema MUST permitir que el rol soporte acceda a la vista de
  camada/checklist descrita en FR-014.

**Calendario y dashboard**

- **FR-018**: El sistema MUST ofrecer una vista de calendario que ubique cada
  camada en su rango de fecha de inicio/fin.
- **FR-019**: El sistema MUST mostrar en el home, para el rol con acceso completo,
  el total facturado (suma de montos de inscripción) del mes actual comparado con
  el mes anterior.

**Endpoint público**

- **FR-020**: El sistema MUST exponer un endpoint de lectura sin autenticación que
  liste los cursos de la organización con nombre, descripción y temario.
- **FR-021**: El sistema MUST exponer, por curso, la lista de camadas cuya fecha de
  inicio sea futura ("próximos comienzos"), con fecha de inicio; camadas ya
  iniciadas o finalizadas MUST quedar excluidas de esa lista.
- **FR-022**: El endpoint público MUST NOT incluir datos de alumnos, montos,
  checklist de soporte, ni ningún dato interno más allá de lo descrito en FR-020 y
  FR-021.

### Key Entities

- **Software**: programa con licencias limitadas (Revit, Civil3D, AutoCAD...);
  lleva un total de licencias disponibles por organización.
- **Profesor**: docente que dicta camadas; tiene nombre y las camadas que tiene
  asignadas (para detectar choques de horario).
- **Camada** *(existente, ampliada)*: agrega costo, horario, aula, URL de temario,
  y qué software(s) utiliza; referencia a profesor en vez de texto libre.
- **Inscripción** *(existente, ampliada)*: agrega monto, cantidad de cuotas,
  observaciones de pago, cédula, factura, recibo, vendedor, empresa opcional, y su
  checklist de onboarding de soporte.
- **Empresa**: razón social e identificación fiscal, para facturación B2B opcional
  de una inscripción.
- **Checklist de onboarding**: los cinco indicadores booleanos (con fecha) por
  inscripción descritos en FR-013.
- **Rol**: ventas/coordinación (completo) o soporte (restringido), por miembro de
  la organización.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Coordinación puede crear una camada completa (costo, horario, aula,
  temario, software, profesor, fechas) sin abrir ninguna planilla externa.
- **SC-002**: Ventas puede inscribir un alumno con todos sus datos comerciales sin
  abrir ninguna planilla externa, y el sistema rechaza el 100% de los intentos de
  duplicar email o celular.
- **SC-003**: Soporte puede completar el checklist de onboarding de una camada
  completa sin copiar/pegar datos entre planillas.
- **SC-004**: El sistema detecta y muestra el 100% de los casos donde una camada
  planificada supera las licencias disponibles de su software.
- **SC-005**: El sistema detecta y muestra el 100% de los casos de choque de
  horario de un mismo profesor entre dos camadas.
- **SC-006**: Un usuario con rol soporte no puede ver montos de facturación ni el
  dashboard financiero en ningún escenario probado.
- **SC-007**: El endpoint público responde sin autenticación y nunca incluye datos
  de alumnos.

## Assumptions

- El "monto total" y "cantidad de cuotas" de una inscripción no requieren en esta
  fase un desglose de cuotas individuales (fecha/monto por cuota); eso queda para
  una integración futura con un sistema contable, fuera de este alcance.
- El inventario de licencias es un contador total por software y organización, no
  licencias individuales con clave/serial propio.
- La detección de choque de horario de un profesor se basa en la superposición de
  los rangos de fecha de inicio/fin de sus camadas (no en el detalle de días de la
  semana/franja horaria dentro de esas fechas), dado que el horario se guarda como
  texto libre (FR-005) y no como estructura comparable.
- El rol "soporte" no necesita ver ni editar los datos comerciales de la
  inscripción (monto, factura, recibo, vendedor) — solo el checklist de onboarding
  y los datos de contacto necesarios para hacer seguimiento (nombre, email,
  teléfono).
- No hay lista de espera cuando una camada alcanza su capacidad configurada en esta
  fase (ver Edge Cases).
- El sitio web público que consumirá el endpoint es una aplicación externa a este
  CRM (WordPress hoy, Astro después); esta feature no construye páginas públicas,
  solo el endpoint de datos.
- La columna "Equipo" de la planilla actual de soporte no se migra: fue confirmada
  como dato en desuso.
