# Feature Specification: Operativa menor

**Feature Branch**: `011-operativa-menor`

**Created**: 2026-08-21

**Status**: Draft

**Input**: Cuatro huecos chicos, independientes entre sí, de alto retorno por
lo que cuestan. Se agrupan en una sola spec porque ninguno justifica un ciclo
propio, pero cada uno puede implementarse y entregarse por separado.

⚠️ **El orden importa**: US2 (scheduler) habilita comportamiento que hoy es
estructuralmente imposible, y US4 depende de él.

---

## US1 — Lista de espera (Priority: P1)

`cohort.capacity` existe desde el ciclo 005, pero cuando la cohorte se llena el
interesado se cae al vacío. Es plata que se va por el desagüe: gente que
quería pagar y nadie volvió a llamar.

**Independent Test**: Llenar una cohorte hasta su cupo, anotar a alguien más y
verificar que queda en lista de espera; liberar un lugar y verificar que el
sistema avisa que hay alguien esperando.

**Acceptance Scenarios**:

1. **Given** una cohorte en su cupo, **When** llega un interesado nuevo,
   **Then** queda en lista de espera con su fecha de anotación, no rechazado.
2. **Given** una lista de espera, **When** se libera un lugar, **Then** el
   sistema lo avisa indicando quién es el primero de la fila.
3. **Given** alguien en lista de espera, **When** se lo convierte en
   inscripción, **Then** sale de la lista y se le arma su plan de cuotas
   normalmente.
4. **Given** una cohorte sin `capacity` definida, **When** llega un interesado,
   **Then** se inscribe directo: sin cupo declarado no hay lista de espera.

**Requisitos**: la posición en la fila es por orden de llegada y debe ser
visible. Una lista de espera cuyo orden no se ve es una lista en la que nadie
confía.

---

## US2 — Scheduler y automatizaciones (Priority: P1)

**`automation_rule` es una tabla muerta.** Está en el schema desde el ciclo
004, con eventos `enrollment_created`, `license_assigned` y
`cohort_starts_soon`, y **no la referencia una sola línea de código** fuera de
`src/lib/db/ids.ts`.

El motivo de fondo: el CRM no tiene scheduler. No hay cron, no hay job runner
— el trabajo de fondo es in-process por request. Así que "avisale al alumno
que la cohorte arranca el lunes" es hoy imposible de construir, por más que la
tabla lo prometa desde hace tres ciclos.

**Why P1**: no por urgencia propia, sino porque **desbloquea** los
recordatorios de vencimiento de la [008](../008-cobranza/spec.md), el aviso de
inasistencia de la [009](../009-clases-y-asistencia/spec.md) y la encuesta de
US4. Es infraestructura, no feature.

**Independent Test**: configurar una regla que dispare 24 h antes del inicio
de una cohorte, adelantar el reloj y verificar que se envía exactamente una
vez.

**Acceptance Scenarios**:

1. **Given** una regla activa, **When** se cumple su condición, **Then** se
   dispara la acción por el canal configurado (WhatsApp o correo).
2. **Given** una regla que ya disparó para un destinatario, **When** el
   proceso corre de nuevo, **Then** NO vuelve a disparar (constitución IV).
3. **Given** el proveedor caído, **When** el disparo falla, **Then** queda
   registrado el fallo y se reintenta, sin tumbar el resto de la corrida.
4. **Given** una conversación con `ai_enabled: false` o en handoff, **When**
   corresponde un envío automático, **Then** se respeta el handoff igual que
   lo hace el agente.

**Decisiones a verificar**:

- **DV-001**: ¿el scheduler es in-process (un `setInterval` al arrancar) o un
  proceso aparte? In-process es más simple y no agrega dependencias
  (constitución II), pero con más de una réplica dispara N veces. Con una sola
  instancia por cliente —que es el modelo de despliegue— alcanza. **Requiere
  lock por organización si eso cambia.**
- **DV-002**: ¿qué pasa con los envíos de WhatsApp fuera de la ventana de 24 h?
  Solo se puede mandar plantilla aprobada. La regla tiene que saberlo o va a
  fallar sistemáticamente.
- **DV-003**: ¿la tabla `automation_rule` actual sirve, o se rediseña? Nunca
  se usó, así que no hay compatibilidad que preservar.

---

## US3 — Precio de lista vs. precio pagado (Priority: P2)

`enrollment.amount` es un entero suelto: es lo que el alumno pagó, sin memoria
de cuál era el precio de lista. Por eso hoy es imposible responder "¿cuánto
descuento estamos dando?" o "¿cuánto nos cuestan las becas?".

**Independent Test**: inscribir a alguien con precio de lista 120.000 y precio
pactado 90.000, y verificar que el descuento queda registrado y aparece en el
reporte.

**Acceptance Scenarios**:

1. **Given** una cohorte con `cost` definido, **When** se inscribe a alguien
   por menos, **Then** queda registrado el precio de lista, el pactado, la
   diferencia y el motivo (beca, convenio, promoción).
2. **Given** inscripciones con descuento, **When** se consulta el reporte del
   período, **Then** se ve el descuento total y promedio, **por moneda** —
   nunca sumando monedas distintas.
3. **Given** una inscripción sin descuento, **When** se registra, **Then** no
   hace falta cargar nada extra: el motivo solo se pide si hay diferencia.

---

## US4 — Encuesta de satisfacción por cohorte (Priority: P3)

No hay forma de saber si un curso salió bien. La coordinación se entera por
comentarios sueltos, y la decisión de repetir o no una cohorte se toma a ciegas.

**Depende de US2** para el envío automático al finalizar la cohorte.

**Independent Test**: finalizar una cohorte, verificar que se envía la encuesta
a sus alumnos, responder desde el link público y ver el resultado agregado.

**Acceptance Scenarios**:

1. **Given** una cohorte que finaliza, **When** se dispara la encuesta,
   **Then** cada alumno recibe un link único.
2. **Given** un link de encuesta, **When** el alumno responde, **Then** la
   respuesta queda asociada a la cohorte. **Anónima o no lo define DV-004.**
3. **Given** respuestas cargadas, **When** coordinación consulta la cohorte,
   **Then** ve el promedio y los comentarios.
4. **Given** un link ya usado, **When** se intenta responder de nuevo,
   **Then** se rechaza sin revelar la respuesta anterior.

**DV-004**: ¿la encuesta es anónima? Si lo es, no puede mostrarse quién
respondió qué —ni siquiera al dueño—, y eso cambia el modelo de datos. Si no
lo es, las respuestas van a ser más tibias. Es una decisión de producto, no
técnica.

---

## Out of Scope

- Motor de automatizaciones con condiciones compuestas o ramificaciones. Las
  reglas de US2 son evento → canal → plantilla, nada más.
- Encuesta con lógica condicional o preguntas dinámicas.
- Overbooking automático de la lista de espera.

## Dependencias

- US1, US3: ninguna.
- US2: ninguna, pero **habilita** los recordatorios de 008, 009 y US4.
- US4: depende de US2.

---

# Revisión de alcance (2026-09-01)

Antes de implementar se midió cada historia contra los datos reales, y tres de
las cuatro **serían código muerto hoy**:

| Historia | Lo medido | Consecuencia |
|---|---|---|
| US1 · Lista de espera | **0 de 41 cohortes** tienen cupo declarado | Nunca se dispararía |
| US2 · Scheduler | 0 reglas cargadas | Infraestructura sin uso todavía |
| US3 · Precio de lista | **0 de 41** cohortes con precio | Es el que sí destraba algo |
| US4 · Encuesta | depende de US2 | — |

Es el cuarto caso seguido del mismo patrón —`class_session` vacía en la 013,
`assessment` vacía en la 014, la cobranza en cero en la 022— y el diagnóstico
ya no admite dudas: **el código va muy por delante de los datos**, y cada
función nueva sobre ese hueco es más superficie que se ve vacía.

## Lo que se implementó (US3, ampliada)

**Estado: IMPLEMENTADA.** Gate: typecheck, lint, build, **678 tests en 72
archivos**. Verificado en vivo contra la base real: **8/9 + 3/3**, con respaldo
en `backups/vocero-pre-0032-*.sql` y la base devuelta a como estaba.

### El precio vive en el CURSO y la cohorte lo hereda

Migración **`0032`**: `course.list_price` y `course.list_currency`.

`resolveListPrice()` tiene deliberadamente la misma forma que
`resolveMinAttendance()` de la 009 — la cohorte pisa al curso. Dos reglas de
herencia que se leen distinto son dos oportunidades de equivocarse.

**El precio y su moneda viajan juntos.** Separarlos permite el estado imposible
"10.000 sin moneda", y con UYU y PYG conviviendo —montos reales de 250 a
10.000.000— esa confusión es una diferencia de mil veces.

**`null` no es cero.** Es la distinción que evita registrar como gratuita una
inscripción sin precio cargado. Con 191 así, el error no sería teórico.

### Una pantalla que es una lista de tareas, no un panel de ajustes

`Configuración → Lo que falta`. Muestra los pendientes **con su consecuencia**,
no solo el número:

```
34 de 34  cursos sin precio de lista   → cada inscripción se carga a mano
 7 de  7  profesores sin correo        → no pueden entrar a su portal
191       inscripciones sin monto      → no se pueden facturar
```

Todo se edita **en línea y se guarda junto**: es lo mismo que resolvió la 022
con la cobranza. La función no faltaba; faltaba poder usarla sobre muchos
registros.

Las listas se ordenan por **cuánto rinde cargar cada fila**: el curso con 5
cohortes antes que el de una, y Ovidio —con sus 18 cohortes— antes que el
profesor con una.

**Cargar el correo NO invita a nadie.** La separación viene de la 012 y se
mantiene: un correo no se puede desenviar.

## US1, US2 y US4 quedan POSTERGADAS

No por falta de valor, sino porque **no se pueden probar**: el dato que las
dispara no existe. US1 se vuelve construible en cuanto haya cohortes con cupo
declarado; US2 y US4 son una decisión de infraestructura aparte (ver DV-001
sobre el scheduler in-process).
