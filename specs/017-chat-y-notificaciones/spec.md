# 017 — Chat y notificaciones

**Estado**: propuesta · **Depende de**: 014, 015 · **Habilita**: —

## Por qué esta fase existe

Hoy toda la comunicación de la academia pasa por WhatsApp: el grupo de la
cohorte, las dudas al profesor, los avisos de coordinación. Funciona, pero
nada de eso queda en el sistema: cuando un alumno dice "yo pregunté y nadie me
contestó", no hay forma de saberlo.

Esta fase trae la conversación adentro **sin intentar reemplazar WhatsApp**:
el grupo de la cohorte sigue existiendo allá, y el enlace de invitación ya se
carga en la cohorte desde el ciclo 007.

## Lo que ya existe y se reusa

**El tiempo real ya está construido.** `/api/events` es un stream SSE con
heartbeat cada ~25 s, cabeceras anti-buffering y catch-up por refetch, y
`use-events.ts` lo consume desde el cliente. La constitución dice
explícitamente "sin WebSockets, sin colas externas": esta fase respeta eso y
se monta sobre lo que hay.

## Lo que hay que arreglar ANTES de conectar a nadie

Una revisión del bus (`src/server/events/bus.ts`) encontró dos problemas que
la versión anterior de esta spec daba por resueltos:

### El canal es UNO por organización — hoy filtraría

```ts
publish(organizationId, event)    // un solo canal
subscribe(organizationId, cb)     // todos reciben TODO
```

Los eventos que viajan hoy son `message.new`, `message.status`,
`conversation.updated` y `lab.run`: **el tráfico de WhatsApp de la academia**.
Un alumno suscrito a `/api/events` recibiría las conversaciones de todos los
contactos.

- **FR-013**: El bus DEBE rutear por destinatario, no solo por organización.
  Un evento DEBE declarar a quién alcanza (organización, cohorte, o persona).
- **FR-014**: Un alumno o profesor NO DEBE recibir jamás eventos del módulo de
  WhatsApp ni del Laboratorio.
- **FR-015**: El ruteo DEBE estar resuelto y probado ANTES de que el primer
  portal se conecte al stream. No es trabajo de esta fase dejarlo para después.

### El tope de oyentes es 200, y hay 340 alumnos

`bus.setMaxListeners(200)`. La DV-005 preguntaba si el SSE aguanta: **así como
está, no**.

- **FR-016**: El bus DEBE sostener la cantidad de conexiones esperada, medida
  contra base efímera antes de construir la interfaz.

## Lo que NO se reusa, y por qué

Las tablas `conversation` y `message` son **de WhatsApp**: llevan
`wa_message_id` con dedup por webhook, ventana de 24 horas, plantillas
aprobadas por Meta y estados de entrega monotónicos.

Un hilo alumno↔profesor no tiene nada de eso. Meterlo en esas tablas
contaminaría el módulo que hoy funciona bien y obligaría a que cada query de
la bandeja filtre "esto es de WhatsApp, esto no". **El chat interno es una
entidad aparte** aunque comparta el transporte en tiempo real.

## User Scenarios

### US1 — Canal de la cohorte (Priority: P1)

Como alumno quiero un canal donde están mis compañeros y el profesor, para
consultas que le sirven a todos.

### US2 — Hilo privado con el profesor (Priority: P1)

Como alumno quiero preguntarle algo al profesor en privado, sin que lo lea el
resto de la cohorte.

### US3 — El profesor responde desde su portal (Priority: P1)

Como profesor quiero ver y contestar los mensajes de mis cohortes sin salir de
mi portal.

### US4 — Notificaciones (Priority: P1)

Como usuario quiero enterarme de lo que me involucra —un mensaje nuevo, una
entrega corregida, un anuncio, una cuota que vence— sin tener que entrar a
buscarlo.

### US5 — Elegir qué me llega (Priority: P2)

Como usuario quiero decidir qué avisos recibo por correo y cuáles solo dentro
de la plataforma, para que la herramienta no se vuelva otra fuente de ruido.

## Requirements

### Chat

- **FR-001**: DEBE existir un canal por cohorte con sus alumnos y su profesor.
- **FR-002**: DEBEN existir hilos privados alumno↔profesor dentro de una
  cohorte.
- **FR-003**: El chat interno NO DEBE usar las tablas de WhatsApp.
- **FR-004**: Los mensajes DEBEN llegar en tiempo real vía el SSE existente.
- **FR-005**: Un alumno NO DEBE poder leer un hilo privado ajeno.
- **FR-006**: Al terminar la cohorte el canal DEBE quedar en solo lectura, no
  borrarse.
- **FR-007**: El staff con la capacidad correspondiente DEBE poder leer los
  canales: es comunicación institucional, no privada entre particulares. Esto
  DEBE estar dicho en la interfaz, no ser un secreto.

### Notificaciones

- **FR-008**: DEBE existir una bandeja de notificaciones dentro de la
  plataforma.
- **FR-009**: Los avisos DEBEN poder salir también por correo, reusando
  `src/lib/m365` del ciclo 007.
- **FR-010**: Cada usuario DEBE poder configurar qué recibe por correo.
- **FR-011**: Una notificación DEBE llevar a la pantalla que la originó.
- **FR-012**: El correo NO DEBE mandarse dos veces por el mismo evento
  (constitución IV, mismo criterio que los correos de 007).

## Decisiones a verificar

- **DV-001**: ¿Se pueden adjuntar archivos al chat? *(propuesta: no —
  coherente con la decisión marco de archivos; se pega un enlace.)*
- **DV-002**: ¿El canal de cohorte reemplaza al grupo de WhatsApp o convive?
  *(propuesta: convive. El grupo de WhatsApp tiene una tasa de lectura que
  ningún portal iguala, y el enlace ya se carga en la cohorte.)*
- **DV-003**: ¿Se puede editar o borrar un mensaje enviado?
- **DV-004**: ¿Qué eventos notifican? Lista candidata: mensaje nuevo, entrega
  corregida, anuncio, cuota por vencer, certificado emitido, clase cancelada.
- **DV-005**: ¿El SSE aguanta 340 alumnos conectados? Hoy sirve a 4 usuarios
  de staff. **Hay que medirlo antes de asumirlo.**
- **DV-006**: ¿Las notificaciones por correo se agrupan en un resumen diario o
  salen de a una? *(propuesta: resumen para lo no urgente, inmediato para lo
  que sí.)*

## Success Criteria

- **SC-001**: Un mensaje aparece en la pantalla del otro sin recargar.
- **SC-002**: Un alumno no puede leer un hilo privado ajeno, verificado por
  test.
- **SC-003**: El SSE sostiene la cantidad de conexiones esperada, **medido**
  contra base efímera.
- **SC-004**: Ningún evento genera dos correos.

## Riesgos

| Riesgo | Por qué importa | Mitigación |
|---|---|---|
| Escala del SSE | Está probado con 4 usuarios; 340 es otro orden. Cada conexión abierta ocupa un proceso. | DV-005 medida antes de construir |
| Otra bandeja más | Si nadie la mira, los mensajes se pierden y es peor que no tenerla | Notificación por correo para lo que importa; WhatsApp sigue siendo el canal fuerte |
| Expectativa de privacidad | El alumno puede creer que el hilo privado es secreto | FR-007: decirlo en la interfaz |

## Out of Scope

- Videollamada dentro de la plataforma (se usa Zoom, ver 013).
- Mensajería entre alumnos sin el profesor.
- Reemplazar el grupo de WhatsApp.
- Notificaciones push al navegador o al celular.
