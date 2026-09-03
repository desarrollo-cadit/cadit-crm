# Roadmap — de CRM con módulo académico a plataforma académica

**Creado**: 2026-08-21 · **Reescrito**: 2026-08-26 · **012 implementada**: 2026-08-27

## Dónde estamos

Los ciclos 001-010 construyeron un CRM comercial competente **con gestión
académica adentro**: bandeja de WhatsApp, pipeline, agente de IA, catálogo de
cursos, cohortes, inscripciones, cobranza, clases, asistencia, evaluación y
certificados.

Todo eso está operativo y cargado con datos reales: 34 cursos, 41 cohortes,
340 alumnos, 383 inscripciones.

## El cambio de categoría

Hasta acá el producto piensa como un CRM: registra **prospectos que se
convierten en clientes**. Una academia es otra cosa: registra **personas que
se vuelven idóneas**. La unidad no es la venta, es el recorrido —se inscribe,
cursa, aprende, se evalúa, se recibe, y vuelve por el siguiente curso—.

Y tiene una consecuencia estructural que el CRM no tiene: **tres audiencias
que no deben verse entre sí**. Hoy el sistema tiene UNA sola audiencia (el
staff) y toda su seguridad se apoya en eso.

## El hueco, en una frase

*(Diagnóstico original, resuelto por la 012 el 2026-08-27.)*

Hoy el sistema asume que **quien está logueado es del staff y ve toda la
organización**. Los 340 alumnos y los 7 profesores no tienen cuenta, y los 56
endpoints protegidos con `withAuth` no saben distinguir a nadie.

**Estado tras la 012**: las 62 rutas declaran una capacidad nombrada, existe
una segunda audiencia (`account_link`) que NO satisface el gate del staff, y
el aislamiento entre organizaciones dejó de depender de que nadie se olvide de
`scoped()`. Lo que falta para que alumnos y profesores tengan algo que mirar
cuando entren es la **013**: legajo, material y calendario.

## Estado del aislamiento (medido, no supuesto)

| | Antes de la 012 | Hoy (2026-08-27) |
|---|---|---|
| Políticas RLS en Postgres | **0** | **31 tablas** con `tenant_isolation` |
| Aislamiento efectivo | `scoped()` en código | `scoped()` **+** RLS en la base |
| Usuario de conexión | `postgres` (dueño → **saltea RLS**) | `cadit_app` (sujeto a RLS) |
| Endpoints `withAuth` pelados | 56 — "cualquier miembro ve todo" | **0** |
| Endpoints `requireFullAccess` | 12 — "salvo soporte" | **0** (helper eliminado) |
| Endpoints con capacidad nombrada | 0 | **62** |
| Endpoints públicos | 5 | 5, con alcance declarado |
| Roles | `owner`, `member`, `soporte` en código | `direccion`, `coordinacion`, `soporte` en BASE, editables |
| Audiencias | una (staff) | dos: staff (`member`) y portal (`account_link`) |

El diagnóstico que abrió la fase sigue siendo cierto y por eso se resolvió:
`scoped()` es una convención, y si alguien escribe una query y se olvida de
usarlo no hay ninguna red que lo detenga. Ahora la red existe: la política de
Postgres no depende de que nadie se acuerde.

**Lo que RLS todavía NO cubre, a propósito**: cinco tablas quedan fuera
(`member`, `account_link`, `role`, `invitation`, `meta_credentials`). Son las
que responden "¿de quién es esto?" y se leen ANTES de que exista un alcance que
declarar — ponerles la política crea un huevo-y-gallina donde no entra nadie.
Siguen pasando por `scoped()`. El detalle está en `drizzle/0025` y `0027`.

## Choques detectados en la revisión (2026-08-26)

Revisión completa contra el código y los datos reales. Cada hallazgo quedó
incorporado a su spec:

| # | Hallazgo | Dónde se corrigió |
|---|---|---|
| 1 | `requireSession()` exige fila en `member`; los portales no la tendrían | 012 FR-016/017/018 |
| 2 | El bus SSE es UNO por organización: un alumno recibiría el tráfico de WhatsApp | 017 FR-013/014/015 |
| 3 | `bus.setMaxListeners(200)` con 340 alumnos | 017 FR-016 |
| 4 | La regla de grabaciones excluía 20 de 34 cursos por modalidad vacía | 013 US3 (regla invertida) |
| 5 | Las licencias ATC no aparecían en ningún portal | 015 US5, FR-010 |
| 6 | No había visibilidad para empresas | 013 FR-010c (reporte, no portal) |
| 7 | Zona horaria: 42 alumnos en Paraguay, 45 en otros países | 013 FR-010b · 015 FR-011 |

## La cadena

El orden es **de arriba hacia abajo por rol**: primero que dirección pueda
hacer todo desde el panel, después se va exponiendo cada porción a quien
corresponde. Así cada portal expone algo que ya existe y está probado, en vez
de construir la función y el permiso al mismo tiempo.

```
012 Identidad y permisos (RLS)     ← la fundación: sin esto, nada de lo de abajo es seguro
        │
013 Legajo académico y cursada     ← el contenido que después consumen los portales
        │
        ├──▶ 014 Portal del profesor ✅   (7 usuarios · validó el modelo con poca gente)
        │            │
        │    020 Identidad visual ✅      ← el cimiento: tokens, contraste, tema oscuro
        │            │
        │    021 Rediseño visual ✅       ← el salto estético, pantalla por pantalla
        │    022 Cobranza en bloque ✅    ← la plata deja de cargarse de a una
        │            │
        │    015 Portal del alumno ⏸      (en pausa: primero gestión y administración)
        │            │
        │    016 Entregas y corrección    (alumno entrega · profesor corrige)
        │            │
        └──▶ 017 Chat y notificaciones    (sobre el SSE que ya existe)
```

| # | Fase | Qué resuelve | Depende de |
|---|------|--------------|------------|
| [012](012-identidad-y-permisos/spec.md) ✅ | Identidad y permisos | **IMPLEMENTADA (2026-08-27).** Capacidades nombradas en las 62 rutas, roles editables desde `/settings/roles`, portal separado del panel por construcción, y RLS real con el rol de conexión `cadit_app`. | — |
| [013](013-legajo-y-cursada/spec.md) ✅ | Legajo y cursada | **IMPLEMENTADA (2026-08-27).** Material del curso, link de reunión por clase, calendario real, legajo del alumno, anuncios. | 012 |
| [014](014-portal-profesor/spec.md) ✅ | Portal del profesor | **IMPLEMENTADA (2026-08-28).** El profesor entra y ve SOLO lo suyo. Además: ABM de alumnos y profesores (con archivado), copiar evaluaciones entre cohortes, e invitación individual al portal. | 012, 013 |
| [020](020-identidad-visual/spec.md) ✅ | Identidad visual | **IMPLEMENTADA (2026-08-28).** El CIMIENTO: contraste que se calcula, tema claro/oscuro completo, estados vivos y todos los colores en tokens. **No es el salto estético** — eso queda para la 021. | 002 |
| [021](021-rediseno-visual/spec.md) ✅ | Rediseño visual | **IMPLEMENTADA (2026-09-01).** El salto estético, pantalla por pantalla y mirando entre una y otra. Inicio, académico, alumnos, calendario, bandeja, pipeline y configuración. | 020 |
| [022](022-cobranza-en-bloque/spec.md) ✅ | Cobranza en bloque | **IMPLEMENTADA (2026-09-01).** La maquinaria de la 008 estaba completa; faltaba poder usarla sobre 383 inscripciones. El modo se declara, no se deduce. | 008 |
| [015](015-portal-alumno/spec.md) ⏸ | Portal del alumno | **EN PAUSA por decisión del dueño (2026-09-01)**: primero completar gestión y administración. Cuando se retome: el alumno ve SOLO lo suyo, y le falta la **sensación de avance** — hoy la spec solo lista datos. | 012, 013, 020 |
| [016](016-entregas/spec.md) | Entregas y corrección | El alumno entrega (por enlace) y el profesor registra la corrección. | 014, 015 |
| [017](017-chat-y-notificaciones/spec.md) | Chat y notificaciones | Canal por cohorte + privado alumno↔profesor, sobre SSE. Avisos in-app y por correo. | 014, 015 |
| [023](023-aulas-virtuales/spec.md) | Aulas virtuales | Las 5 cuentas de Zoom como recurso, asignables por cohorte y por clase, con detector de choques de horario. **Sin integración**: el choque es un problema de calendario y se resuelve con `classInstant()`. Deja a la 018 como comodidad opcional, no como requisito. | 009, 013 |
| [024](024-recorrido-del-alumno/spec.md) | Recorrido del alumno | El portal deja de listar datos y muestra un CAMINO: dónde estoy, qué logré, qué falta. Sin puntos ni medallas — un hito solo se marca cumplido si el sistema puede probarlo. La cursada se separa en pestañas. | 015, 023 |
| [018](018-zoom-automatico/spec.md) | Zoom automático | *Idea, sin comprometer.* Crear reuniones y adjudicar grabaciones solo. Exigiría una CUARTA dependencia de runtime. **La 023 le sacó la urgencia**: qué aula usa cada clase y si se pisan ya se responde sin la API. | 013, 023 |
| [019](019-checkout-y-alta-automatica/spec.md) | Checkout y alta automática | *Idea a futuro.* Compra en la web → inscripción → cuenta, sin intervención. Exigiría una TERCERA enmienda constitucional (pasarela de pago). | 012, 015 |

[011](011-operativa-menor/spec.md) (lista de espera, scheduler, precio de
lista, encuesta) queda fuera de esta cadena: es ortogonal y se puede tomar
cuando convenga.

## Decisiones marco (2026-08-26, dueño del producto)

Estas atraviesan varias fases y ya están tomadas:

- **Archivos pesados: NO se suben.** Las entregas son por ENLACE (Drive,
  WeTransfer, Autodesk). Un modelo de Revit pesa entre 50 y 500 MB; con 340
  alumnos serían cientos de gigas en el VPS. La constitución (II) prohíbe
  S3/R2 y **no se enmienda**: se evita el problema en vez de sortearlo.
  *Consecuencia asumida*: la descarga ocurre FUERA de la plataforma. Adentro
  queda el registro de qué se entregó, cuándo y con qué corrección.
- **Chat**: canal por cohorte + hilos privados alumno↔profesor. No es una
  mensajería general.
- **El alumno nace de la inscripción, no del lead.** La cuenta de portal se
  habilita cuando la persona se inscribe a una cohorte, nunca antes. Un lead
  que pidió precio es un contacto, no un alumno. (012, FR-005b)
- **Las grabaciones van en la misma lista que las clases**, no en una pantalla
  aparte: cada clase muestra "entrar" o "ver grabación" según el momento.
  Son enlaces, no videos alojados. (013, US3)
- **Las empresas NO tienen login.** La visibilidad corporativa es un REPORTE
  por empresa que exporta coordinación (013, FR-010c), no una audiencia con
  acceso. Hay 14 inscripciones con empresa y 5 empresas reales.
- **Todo va DENTRO de esta aplicación**, no en una academia aparte que
  sincronice. Dos apps sobre la misma base no son más seguras que una con RLS,
  y dos apps con bases separadas compran un problema de sincronización que hoy
  no existe (¿cuál tiene razón sobre la asistencia?). La separación se logra
  con grupos de rutas, superficie de API propia, sesión propia y RLS.
- **Orden**: de arriba hacia abajo por rol.
- **El profesor SÍ tendrá acceso**: revierte la DV-005 de
  [009](009-clases-y-asistencia/spec.md), que en su momento resolvió que
  coordinación cargaba todo. Queda registrado como cambio de decisión.

## Principios que gobiernan la cadena

1. **Defensa en profundidad, no en su lugar.** RLS en Postgres se agrega
   SOBRE `scoped()`, no lo reemplaza. Dos redes independientes.
2. **El front oculta; el servidor prohíbe.** Esconder un botón no es un
   permiso. Toda regla visible en la interfaz tiene su contraparte dura en el
   endpoint, y se prueba con un test que verifique el 403.
3. **Cada audiencia con su superficie.** Los portales no reusan los endpoints
   del staff. Un alumno no debe poder ni *llamar* a `/api/enrollments`.
4. **Lo que ya funciona no se toca para que entre lo nuevo.** El módulo de
   WhatsApp tiene su propia semántica (ventana de 24 h, plantillas,
   `wa_message_id`); el chat interno es otra entidad aunque comparta el SSE.
