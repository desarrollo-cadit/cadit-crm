# 015 — Portal del alumno

**Estado**: implementada (solo lectura) · **Depende de**: 012, 013 ·
**Habilita**: 016, 017

**Qué quedó en pie**: `src/server/student-portal.ts` + `/api/portal/me/*` +
`src/app/(portal)/portal/{page,cursadas/[id],cuenta,certificados}`. US1–US7
están cubiertas; el aislamiento (FR-001/FR-002, SC-002/SC-003) lo conduce el
bloque 015 de `scripts/e2e-selftest.mjs` con dos alumnos reales cruzando ids, y
la forma del módulo la guarda `tests/unit/student-portal.test.ts`.

**Lo que sigue abierto**: FR-012 (los 6 contactos sin correo) es una pantalla
de la coordinación, no del portal, y vive en el flujo de invitación de 012.
DV-006 —a quién se invita primero— es una decisión de despliegue, no de código:
el sistema ya invita de a uno y no manda nada solo (FR-013).

## Por qué esta fase existe

El alumno es la audiencia más grande —340 personas— y la que hoy no tiene
ninguna forma de consultar su propia situación. Todo lo que quiere saber
existe en el sistema, pero solo lo puede responder alguien del staff por
WhatsApp:

> "¿cuándo es la próxima clase?" · "¿cuánto debo?" · "¿cuánto falté?" ·
> "¿aprobé?" · "¿dónde está mi certificado?" · "¿cuál era el link del Zoom?"

Cada una de esas preguntas es una interrupción evitable.

Esta fase es **solo lectura a propósito**. El alumno consulta; todavía no
entrega ni escribe. Entregar es 016, conversar es 017. Separarlo permite
validar el modelo de acceso con la audiencia grande antes de darle capacidad
de escritura.

## User Scenarios

### US1 — Mi cursada (Priority: P1)

Como alumno quiero ver mis cursos —los que estoy haciendo y los que hice— con
sus fechas, horarios y profesor.

### US2 — Mi próxima clase y su enlace (Priority: P1)

Como alumno quiero ver cuándo es mi próxima clase y entrar a la reunión desde
ahí, sin buscar el link en un chat viejo.

### US3 — Mi asistencia (Priority: P1)

Como alumno quiero ver cuántas clases asistí y cuánto me falta para el mínimo,
para saber si estoy en riesgo antes de que sea tarde.

### US4 — Mis resultados (Priority: P1)

Como alumno quiero ver qué evaluaciones aprobé y cuáles faltan corregir.

**Regla**: una evaluación sin corregir se muestra como **pendiente**, nunca
como desaprobada (FR-005 de [010](../010-evaluacion-y-certificados/spec.md)).

### US5 — Mi licencia de Autodesk (Priority: P1)

Como alumno quiero ver qué licencia me prestaron, hasta cuándo la tengo y
cómo instalarla, porque es lo primero que necesito para poder cursar.

**Por qué es P1 y no un extra**: CAD IT es un **Autodesk Training Center**.
La licencia educativa no es un accesorio del curso, es la herramienta con la
que se cursa. Ya existe la tabla `license`, el checklist de onboarding con
"software instalado" y el correo de términos que se construyó en el ciclo
007 — pero el alumno no tiene dónde consultarlo y hoy lo pregunta por
WhatsApp.

**Escenarios**:
- Licencia asignada → qué software, desde cuándo y hasta cuándo.
- Licencia todavía no asignada → "en trámite", sin fechas inventadas.
- El alumno declaró licencia propia → se dice, y no se le ofrece una.

### US6 — Mi certificado (Priority: P2)

Como egresado quiero descargar mi certificado y compartir el enlace de
verificación.

### US7 — Mi estado de cuenta (Priority: P2)

Como alumno quiero ver mis cuotas, qué pagué y qué debo, sin tener que
preguntarlo.

## Requirements

- **FR-001**: El alumno DEBE ver únicamente sus propias inscripciones.
- **FR-002**: El alumno NO DEBE ver a sus compañeros: ni nombres, ni notas, ni
  asistencia ajena.
- **FR-003**: El portal DEBE ser de SOLO LECTURA en esta fase.
- **FR-004**: DEBE vivir en su propia superficie (`/api/portal/...`), separada
  de la del staff y de la del profesor.
- **FR-005**: Una evaluación sin corregir se muestra como pendiente.
- **FR-006**: El estado de cuenta DEBE mostrar cuotas, pagos y saldo, en la
  moneda de la inscripción.
- **FR-007**: El portal DEBE funcionar en celular: es donde lo van a abrir.
- **FR-008**: Un alumno con más de una inscripción DEBE poder ver todas.
- **FR-009**: El certificado DEBE poder descargarse solo si está emitido y no
  anulado.
- **FR-010**: El alumno DEBE ver su licencia de Autodesk: software, período y
  estado. Si no tiene una asignada, se dice "en trámite" — nunca fechas
  inventadas.
- **FR-011**: Los horarios DEBEN mostrarse en la zona horaria del alumno.
  42 de los 340 están en Paraguay y 45 en otros países: mostrar la hora de
  Montevideo sin aclararlo hace que alguien se pierda una clase.
- **FR-012**: 6 contactos NO tienen correo cargado. Como el acceso se da SOLO
  por invitación por correo (012, DV-004), esos 6 quedan sin acceso hasta que
  alguien les cargue uno. La pantalla DEBE decirlo con ese motivo, no fallar
  en silencio.
- **FR-013**: El despliegue de esta fase NO DEBE invitar a nadie. Los 340
  alumnos actuales se invitan de a uno, cuando el staff lo decida (012, DV-004).

## Decisiones a verificar

- **DV-001**: ¿El alumno ve el nombre de sus compañeros? En una cohorte
  presencial ya se conocen; en una online, no necesariamente.
  *(propuesta: no, salvo que 017 habilite el canal de cohorte.)*
- **DV-002**: ¿Ve su deuda aunque esté vencida y en gestión de cobro?
  *(propuesta: sí — ocultarla no la hace desaparecer y genera más llamadas.)*
- **DV-003**: ¿Qué ve un alumno de una cohorte que ya terminó y que fue
  importada, sin asistencia ni notas cargadas? Es el caso de la mayoría de
  los 340. *(propuesta: su inscripción y su certificado si lo tiene; el resto
  con una leyenda clara de "sin registro en el sistema", nunca ceros que
  parezcan datos.)*
- **DV-004**: RESUELTA en 012 — invitación por correo, explícita y de a uno.
- **DV-006**: ¿A quién se invita primero? Con 340 alumnos y sin envío masivo,
  el despliegue necesita un criterio. *(propuesta: arrancar por UNA cohorte en
  curso, chica, y ver qué preguntan antes de abrir el resto.)*
- **DV-005**: ¿Ve el estado de cuenta si la inscripción la pagó una empresa?

## Success Criteria

- **SC-001**: Un alumno entra desde el celular y ve su próxima clase con el
  enlace.
- **SC-002**: Un alumno NO puede acceder a datos de otro alumno, verificado
  por test.
- **SC-003**: Un alumno NO puede alcanzar ningún endpoint del staff ni del
  profesor, verificado por test.
- **SC-004**: Un alumno de una cohorte importada sin datos ve una pantalla
  honesta, no ceros que parezcan reales.

## Out of Scope

- Entregar trabajos (es 016).
- Chat (es 017).
- Inscribirse o pagar desde el portal.
- Descargar material de compañeros.
