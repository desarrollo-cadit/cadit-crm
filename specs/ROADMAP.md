# Roadmap — de CRM con módulo académico a plataforma académica

**Creado**: 2026-08-21 · **Reescrito**: 2026-08-26 · **012 implementada**:
2026-08-27 · **Auditado contra el código**: 2026-09-07

> **Nota de método (2026-09-07)**: este documento se había desfasado tres
> ciclos —marcaba la 023 y la 024 como pendientes estando implementadas, y la
> 015 como "en pausa" teniendo el código entero—. Se reescribió después de una
> auditoría spec-por-spec contra el código, buscando el artefacto concreto que
> cada User Scenario implica. Lo que sigue está verificado con file paths, no
> recordado. Ver "Auditoría" al final.

## Dónde estamos

Los ciclos 001-010 construyeron un CRM comercial competente **con gestión
académica adentro**: bandeja de WhatsApp, pipeline, agente de IA, catálogo de
cursos, cohortes, inscripciones, cobranza, clases, asistencia, evaluación y
certificados.

Todo eso está operativo y cargado con datos reales: 34 cursos, 41 cohortes,
340 alumnos, 383 inscripciones.

Los ciclos 012-025 lo convirtieron en una plataforma académica de verdad:
permisos por capacidad con RLS en Postgres, dos audiencias con puerta propia
(profesor y alumno), identidad visual y rediseño, cobranza en bloque, aulas
virtuales con detector de choques, y el recorrido del alumno.

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

**Estado tras la 012**: las rutas declaran una capacidad nombrada, existe una
segunda audiencia (`account_link`) que NO satisface el gate del staff, y el
aislamiento entre organizaciones dejó de depender de que nadie se olvide de
`scoped()`. Alumnos y profesores ya tienen qué mirar cuando entran: la **013**
les dio legajo, material y calendario, y la 014/015 las puertas.

## Estado del aislamiento (medido, no supuesto)

| | Antes de la 012 | Hoy (2026-09-07) |
|---|---|---|
| Políticas RLS en Postgres | **0** | **31 tablas** con `tenant_isolation` |
| Aislamiento efectivo | `scoped()` en código | `scoped()` **+** RLS en la base |
| Usuario de conexión | `postgres` (dueño → **saltea RLS**) | `cadit_app` (sujeto a RLS) |
| Endpoints `withAuth` pelados | 56 — "cualquier miembro ve todo" | **0** |
| Endpoints `requireFullAccess` | 12 — "salvo soporte" | **0** (helper eliminado) |
| Archivos de ruta con capacidad nombrada | 0 | **83** (123 llamadas a `requireCapability`) |
| Endpoints públicos | 5 | 5, con alcance declarado |
| Roles | `owner`, `member`, `soporte` en código | `direccion`, `coordinacion`, `soporte` en BASE |
| Audiencias | una (staff) | dos: staff (`member`) y portal (`account_link`) |

El diagnóstico que abrió la fase sigue siendo cierto y por eso se resolvió:
`scoped()` es una convención, y si alguien escribe una query y se olvida de
usarlo no hay ninguna red que lo detecte. Ahora la red existe: la política de
Postgres no depende de que nadie se acuerde.

**Lo que RLS todavía NO cubre, a propósito**: cinco tablas quedan fuera
(`member`, `account_link`, `role`, `invitation`, `meta_credentials`). Son las
que responden "¿de quién es esto?" y se leen ANTES de que exista un alcance que
declarar — ponerles la política crea un huevo-y-gallina donde no entra nadie.
Siguen pasando por `scoped()`. El detalle está en `drizzle/0025` y `0027`.

## Las capacidades, hoy

La lista es **cerrada y tipada** (`src/lib/capabilities.ts`, DV-003): el
compilador rechaza una capacidad inventada. Son **17**:

| Grupo | Capacidades |
|---|---|
| Académico | `academico.ver` · `academico.editar` · `asistencia.ver` · `asistencia.editar` · `evaluacion.ver` · `evaluacion.editar` · `certificados.emitir` |
| Comercial y financiero | `contactos.ver` · `contactos.editar` · `inscripciones.ver` · `inscripciones.editar` · `cobranza.ver` · `cobranza.editar` |
| Conversaciones | `inbox.ver` · `inbox.responder` |
| Plataforma | `configuracion.editar` · `accesos.gestionar` |

Las tres marcadas como `FINANCIAL_CAPABILITIES` (`inscripciones.editar`,
`cobranza.ver`, `cobranza.editar`) son exactamente lo que hoy se le veda a
`soporte`.

**Límite conocido y relevante para la 026**: los roles se pueden **editar**
desde `/settings/roles`, pero **no se pueden crear**. No existe `createRole`
ni `POST /api/settings/roles` — la pantalla solo cambia el conjunto de
capacidades de los tres roles sembrados (`direccion`, `coordinacion`,
`soporte`). Un cuarto rol exige código: extender `SYSTEM_ROLES` más una
migración que lo siembre en las organizaciones ya existentes.

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
012 Identidad y permisos (RLS) ✅   ← la fundación
        │
013 Legajo académico y cursada ✅   ← el contenido que consumen los portales
        │
        ├──▶ 014 Portal del profesor ✅   (7 usuarios · validó el modelo)
        │            │
        │    020 Identidad visual ✅      ← el cimiento: tokens, contraste, tema oscuro
        │            │
        │    021 Rediseño visual ✅       ← el salto estético, pantalla por pantalla
        │    022 Cobranza en bloque ✅    ← la plata deja de cargarse de a una
        │            │
        │    015 Portal del alumno ✅     ← solo lectura: el alumno ve lo suyo
        │            │
        │    023 Aulas virtuales ✅  ──▶  025 Corrección del enlace ✅
        │            │
        │    024 Recorrido del alumno ✅  ← el portal muestra un CAMINO
        │            │
        │    026 Administración y finanzas ⚠  (código completo, falta cerrar)
        │    027 Guía por rol ⚠               (código completo, falta cerrar)
        │    028 Especializaciones multi-módulo (spec escrita)
        │            │
        │    016 Entregas y corrección       (alumno entrega · profesor corrige)
        │            │
        └──▶ 017 Chat y notificaciones       (sobre el SSE que ya existe)
```

| # | Fase | Qué resuelve | Depende de |
|---|------|--------------|------------|
| [012](012-identidad-y-permisos/spec.md) ✅ | Identidad y permisos | **IMPLEMENTADA (2026-08-27).** Capacidades nombradas en las rutas, roles editables desde `/settings/roles`, portal separado del panel por construcción, y RLS real con el rol de conexión `cadit_app`. | — |
| [013](013-legajo-y-cursada/spec.md) ✅ | Legajo y cursada | **IMPLEMENTADA (2026-08-27).** Material del curso, link de reunión por clase, calendario real, legajo del alumno, anuncios. | 012 |
| [014](014-portal-profesor/spec.md) ✅ | Portal del profesor | **IMPLEMENTADA (2026-08-28).** El profesor entra y ve SOLO lo suyo. Además: ABM de alumnos y profesores (con archivado), copiar evaluaciones entre cohortes, e invitación individual al portal. | 012, 013 |
| [020](020-identidad-visual/spec.md) ✅ | Identidad visual | **IMPLEMENTADA (2026-08-28).** El CIMIENTO: contraste que se calcula, tema claro/oscuro completo, estados vivos y todos los colores en tokens. **No es el salto estético** — eso es la 021. | 002 |
| [021](021-rediseno-visual/spec.md) ✅ | Rediseño visual | **IMPLEMENTADA (2026-09-01).** El salto estético, pantalla por pantalla y mirando entre una y otra. Inicio, académico, alumnos, calendario, bandeja, pipeline y configuración. | 020 |
| [022](022-cobranza-en-bloque/spec.md) ✅ | Cobranza en bloque | **IMPLEMENTADA (2026-09-01).** La maquinaria de la 008 estaba completa; faltaba poder usarla sobre 383 inscripciones. El modo se declara, no se deduce. | 008 |
| [015](015-portal-alumno/spec.md) ✅ | Portal del alumno | **IMPLEMENTADA (2026-09-03, commit `3934226`).** Solo lectura: el alumno ve sus cursadas, cuenta, certificados y licencias ATC. La "pausa" que este roadmap declaraba era sobre los ciclos que dependen de ella (016/017), no sobre la 015. | 012, 013, 020 |
| [023](023-aulas-virtuales/spec.md) ✅ | Aulas virtuales | **IMPLEMENTADA (2026-09-03, commit `4d62605`), CORREGIDA POR LA 025.** Las 5 cuentas de Zoom como recurso, asignables por cohorte y por clase, con detector de choques de horario. **Sin integración**: el choque es un problema de calendario y se resuelve con `classInstant()`. Deja a la 018 como comodidad opcional, no como requisito. | 009, 013 |
| [024](024-recorrido-del-alumno/spec.md) ✅ | Recorrido del alumno | **IMPLEMENTADA (2026-09-03, commit `97da733`).** El portal deja de listar datos y muestra un CAMINO: dónde estoy, qué logré, qué falta. Sin puntos ni medallas — un hito solo se marca cumplido si el sistema puede probarlo. La cursada se separa en pestañas. | 015, 023 |
| 025 ✅ | Corrección del enlace de clase | **IMPLEMENTADA (2026-09-04, commits `b5540ac`, `947581a`, `8f232ec`).** Sin spec propia: es una corrección de la 023, registrada dentro de su spec. La URL de la reunión sale de la COHORTE, no del aula — el aula es la *cuenta* que se ocupa. Cadena de dos escalones (`clase ?? cohorte ?? null`), sin tercer fallback: mejor no mostrar enlace que mostrar el equivocado. | 023 |
| [026](026-administracion-y-finanzas/spec.md) ⚠ | Administración y finanzas | **CÓDIGO COMPLETO (2026-09-07), NO CERRADA.** Rol `administracion` con 4 de las 17 capacidades, y la pantalla `/finanzas` con Caja y Devengado separadas, por moneda y por período. Falta: aplicar `drizzle/0036` y correr el e2e. Sin eso no está "Hecha" (Principio IX). | 012, 022 |
| [027](027-guia-por-rol/spec.md) ⚠ | Guía por rol | **CÓDIGO COMPLETO (2026-09-07), NO CERRADA.** La guía se deriva de `CAPABILITIES` + `NAV_GROUPS`: agregar una capacidad sin describirla rompe `pnpm typecheck` — verificado a mano. Falta correr el e2e. | 012 |
| [028](028-especializaciones/spec.md) | Especializaciones multi-módulo | **SPEC ESCRITA (2026-09-07), sin implementar.** El 26% de las inscripciones (100 de 384) está hoy en programas multi-módulo modelados como texto dentro de `course.name`. Dos auto-referencias: `cohort.parent_cohort_id` (la estructura) y `enrollment.parent_enrollment_id` (el recorrido de la persona). Certificado por módulo, asistencia y aprobación por módulo, recursada en una camada posterior, y dispensa de asistencia nombrada. | 013, 023 |
| [016](016-entregas/spec.md) | Entregas y corrección | El alumno entrega (por enlace) y el profesor registra la corrección. | 014, 015 |
| [017](017-chat-y-notificaciones/spec.md) | Chat y notificaciones | Canal por cohorte + privado alumno↔profesor, sobre SSE. Avisos in-app y por correo. **Fuera de alcance por ahora** (decisión del dueño). | 014, 015 |
| [018](018-zoom-automatico/spec.md) | Zoom automático | *Idea, sin comprometer.* Crear reuniones y adjudicar grabaciones solo. Exigiría una CUARTA dependencia de runtime. **La 023 le sacó la urgencia**: qué aula usa cada clase y si se pisan ya se responde sin la API. | 013, 023 |
| [019](019-checkout-y-alta-automatica/spec.md) | Checkout y alta automática | *Idea a futuro.* Compra en la web → inscripción → cuenta, sin intervención. Exigiría una TERCERA enmienda constitucional (pasarela de pago). | 012, 015 |

[011](011-operativa-menor/spec.md) queda fuera de esta cadena: es ortogonal y
se puede tomar cuando convenga. **Parcial**: US3 (precio de lista) está
implementada; US1 (lista de espera), US2 (scheduler) y US4 (encuesta) no se
empezaron, y la propia spec lo documenta en su "Revisión de alcance".

## Decisiones marco

Estas atraviesan varias fases y ya están tomadas.

### Del 2026-08-26

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

### Del 2026-09-04 (ciclo 025)

- **El enlace de la reunión pertenece a la COHORTE, no al aula.** La academia
  crea una reunión recurrente por camada. El aula (cuenta de Zoom) es el
  *recurso que se ocupa*, y su sala es compartida: usarla como fallback metía
  a un alumno en la clase de otra cohorte. La ventana horaria no tapaba esto
  —limita cuándo se MUESTRA el enlace, no a dónde lleva—.
- **Sin tercer fallback, a propósito**: mejor no mostrar enlace que mostrar el
  equivocado.

### Del 2026-09-07

- **Lo financiero para contabilidad se MIRA y se TRANSCRIBE; no se exporta con
  formato.** La academia usa **Bit**, un sistema contable uruguayo. Decisión
  del dueño. *Razón técnica que la respalda*: un export con formato es un
  contrato con un sistema que no controlamos — si Bit cambia su layout, el
  código se rompe y nos enteramos en cierre de mes. Además evita tocar el
  Principio II de la constitución.
- **Consecuencia dura para la 026**: la vista **no puede mezclar monedas**. Se
  cobra en pesos, guaraníes y dólares (`01a7e28`), y ya hubo un bug de totales
  mezclados corregido en `17e4844`. Un contador que transcribe un total de
  tres monedas carga basura en Bit y nadie se entera hasta el cierre. Va
  separado por moneda y por período.
- **La guía por rol se DERIVA, no se escribe a mano.** Un manual escrito a
  mano se desactualiza en un ciclo —este documento es la prueba—. La guía debe
  salir del mismo registro que usa el servidor para permitir o denegar
  (`CAPABILITIES` + `NAV_GROUPS`), de modo que agregar una capacidad la haga
  aparecer sola.

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

## Auditoría (2026-09-07)

Auditoría spec-por-spec contra el código. Cada veredicto se apoya en el
artefacto concreto que el User Scenario implica.

| Ciclo | Veredicto | Evidencia principal |
|---|---|---|
| 011 | **Parcial** (la spec lo dice) | US3: `course.list_price`, `src/server/carga-rapida.ts`. US1/US2/US4: sin rastro; `automation_rule` es tabla muerta |
| 015 | **Implementada** | `src/server/student-portal.ts` (1339 líneas), `src/app/api/portal/me/*`, `tests/unit/student-portal.test.ts` |
| 016 | **No empezada** (la spec lo dice) | Sin tabla `submission`, sin rutas |
| 017 | **No empezada** (la spec lo dice) | Sin tablas de chat/notificación; el bus SSE no recibió el arreglo de ruteo por destinatario |
| 018 | **No empezada** (la spec lo dice) | Sin cliente Zoom. Los "zoom" de `virtual-rooms.ts` son comentarios que dicen lo contrario |
| 019 | **No empezada** (la spec lo dice) | Sin pasarela de pago |
| 023 | **Implementada** | Tabla `virtual_room`, `drizzle/0034`, `src/server/virtual-rooms.ts` (584 líneas), `tests/unit/aulas-virtuales.test.ts` |
| 024 | **Implementada** | Máquina de hitos en `student-portal.ts:1170-1339`, `student-milestones.tsx`, `tests/unit/hitos-cursada.test.ts` |

### Deuda de verificación (hallazgo del auditor)

`scripts/e2e-selftest.mjs` tiene bloques etiquetados por ciclo hasta **020**.
Medido endpoint por endpoint, la cobertura real es despareja:

| Ciclo | Cobertura e2e | Evidencia |
|---|---|---|
| 008 Cobranza | **Sí** | Bloques `Cobranza (008): plan, pago parcial, anulación` y `dashboard/finance: los totales NO mezclan monedas` |
| 021 Rediseño visual | **Parcial** | Hereda el bloque `020: identidad visual en los dos temas` |
| 022 Cobranza en bloque | **No** | Cero referencias a `billing/bulk` en todo el script |
| 023 Aulas virtuales | **No** | Cero referencias a `virtual-rooms` |
| 024 Recorrido del alumno | **No** | Cero referencias a los hitos de cursada |

El Principio IX de la constitución (**Verificación de Comportamiento en Vivo,
NO NEGOCIABLE**) y la Definición de Hecho de `CLAUDE.md` piden una pasada de
comportamiento, no solo tests unitarios. Tres ciclos —022, 023 y 024— se
declararon "Hecho" sin ella.

**No invalida el código**: la verificación en vivo se hizo a mano y quedó
registrada en las notas de cada ciclo. Lo que significa es que hoy **ninguna
corrida automática detectaría una regresión** en cobranza en bloque, aulas
virtuales ni recorrido del alumno.

La maquinaria de cobranza de la 008 **sí** está cubierta, incluido el bug de
monedas mezcladas (`17e4844`). Por eso la 026, que lee esa misma maquinaria,
tiene de dónde agarrarse — pero la parte que la 026 más va a tocar, la
cobranza en bloque de la 022, es justamente la que no tiene red.

Es la primera deuda a saldar cuando se toque cualquiera de esos tres ciclos.
