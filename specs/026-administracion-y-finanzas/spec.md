# 026 — Administración y finanzas

**Estado**: propuesta · **Depende de**: 012, 022 · **Habilita**: —

## Por qué esta fase existe

**No existe ninguna pantalla de finanzas agregada.** La cobranza se opera
DENTRO del roster de cada cohorte: `billing-panel.tsx` (una inscripción) y
`billing-bulk-panel.tsx` (el lote), los dos montados desde `roster-client.tsx`.
Para armar el cierre de un mes, administración tendría que abrir **las 41
cohortes de a una** y anotar a mano lo que encuentre en cada una.

El dashboard tiene dos paneles financieros —`FinancePanel` sobre
`/api/dashboard/finance`, y `OverduePanel` sobre `/api/dashboard/overdue`—,
pero contestan otra pregunta: **cuánto se facturó** y **quién debe**. Son
números de conducción. Ninguno da la LISTA de movimientos, fila por fila, que
es lo único que sirve para cargar un mes en un sistema contable.

Y hay un segundo hueco, más duro que el primero: **el rol de administración no
existe, y hoy no se puede crear.** `/settings/roles` edita las capacidades de
los tres roles sembrados (`direccion`, `coordinacion`, `soporte`) y nada más:
`src/server/roles.ts` exporta exactamente dos funciones, `listRoles` y
`updateRoleCapabilities`. No hay `createRole` ni `POST /api/settings/roles`.
Un cuarto rol es **código**, no configuración.

Peor: `capabilitiesFor()` **falla cerrado** (012/FR-008), así que un rol
insertado a mano por SQL no recibe ninguna capacidad y su usuario entra a un
panel vacío. Eso es deliberado y esta fase lo respeta: la salida no es
ablandar el fallo, es sembrar el rol como corresponde.

## Las decisiones que definen la fase

Las tres están tomadas por el dueño el 2026-09-07 y quedan registradas en
`specs/ROADMAP.md`. No se reabren.

### 1. Se MIRA y se TRANSCRIBE. No hay export con formato.

La academia lleva la contabilidad en **Bit**, un sistema contable uruguayo.
Esta fase produce una **pantalla para leer y copiar**, no un archivo.

La razón técnica que respalda la decisión del dueño: un export con formato es
un **contrato con un sistema que no controlamos**. El día que Bit cambie el
layout de su importador, el código se rompe y nos enteramos en cierre de mes,
que es exactamente el peor momento. Una pantalla no se rompe: si Bit cambia,
cambia lo que el contador escribe, no lo que el sistema emite.

Consecuencia asumida: transcribir cuesta tiempo humano. Es un costo conocido y
acotado, contra un riesgo desconocido y periódico.

### 2. Dos vistas separadas: Caja y Devengado. Nunca sumadas entre sí.

- **Caja**: la plata que efectivamente ENTRÓ en el período. Mira
  `payment.paid_at`.
- **Devengado**: las cuotas que se EMITIERON para el período, cobradas o no.
  Mira `installment.due_date`.

Son dos preguntas contables distintas y el sistema no las mezcla en ningún
lado. Una cuota de agosto cobrada en septiembre está en el devengado de agosto
**y** en la caja de septiembre: eso no es una inconsistencia, es la definición.
La pantalla no ofrece ninguna operación que combine las dos —ni suma, ni resta,
ni "diferencia"—, porque cualquier número así necesita un criterio contable que
el CRM no tiene y que no debe inventar.

### 3. Nunca se mezclan monedas.

Se cobra en las tres monedas de `CURRENCIES`: **UYU, PYG y USD**. La regla ya
está escrita en el código —`listOverdue` y `collectedByCurrency` agrupan por
moneda a propósito, y `finance.ts` lo argumenta en la corrección del ciclo
007— y **ya hubo un bug real de totales mezclados, corregido en `17e4844`**
(las monedas se habían cargado en `01a7e28`).

Acá pesa más que en el dashboard: un contador que transcribe un total de tres
monedas carga basura en Bit, y nadie se entera hasta el cierre del ejercicio.
Cada total se declara CON su moneda, las monedas van en bloques separados, y
**no existe un "total general"**. No es que se muestre en cero: no es
representable.

## User Scenarios

### US1 — El rol de administración existe y ve sólo lo suyo (Priority: P1)

Como dueño quiero darle acceso a administración sin darle el panel entero,
para que pueda cerrar el mes sin poder tocar la operación.

**El rol `administracion` lleva 4 de las 17 capacidades.** Cada inclusión y
cada exclusión tiene motivo:

| Capacidad | | Por qué |
|---|---|---|
| `cobranza.ver` | **sí** | Es el dato. Sin ella no hay pantalla. |
| `inscripciones.ver` | **sí** | Una cuota no significa nada sin la inscripción que la originó: monto pactado, moneda, plan. |
| `academico.ver` | **sí** | La fila dice "Revit — Camada Marzo". Sin esta capacidad el nombre de la cohorte no puede viajar y la fila queda con un id. |
| `contactos.ver` | **sí** | Mismo motivo con el alumno: sin ella la fila dice `ct_…`, que no se transcribe a ningún lado. |
| `cobranza.editar` | no | Administración **transcribe, no cobra**. Quien registra o anula un pago es coordinación, en el roster, donde está el contexto. Un rol que puede editar la plata "por las dudas" es exactamente el que anula un pago para que cuadre un total. |
| `inscripciones.editar` | no | Es una de las tres `FINANCIAL_CAPABILITIES`, y cambiar el monto de una inscripción **reescribe el devengado del período que se está transcribiendo**. Reescribir el pasado mientras se lo copia es la peor combinación posible. |
| `inbox.ver` / `inbox.responder` | no | Las conversaciones de WhatsApp son datos personales de 340 alumnos que no aportan nada a un asiento contable. |
| `configuracion.editar` | no | Abre `/settings`: credenciales de Meta, marca, instancia. Nada de eso es contabilidad. |
| `accesos.gestionar` | no | Le permitiría a administración **concederse a sí misma** cualquier otra capacidad. Un rol que puede reescribir su propio permiso no tiene un permiso: los tiene todos. |
| `asistencia.*`, `evaluacion.*`, `certificados.emitir` | no | No participan de ningún asiento. |

Es el principio de menor privilegio aplicado con una regla concreta: **entra la
capacidad sin la cual la fila no se puede leer, y ninguna más**.

**El costo honesto de `academico.ver` y `contactos.ver`**: abren también
`/academico`, `/calendar`, `/contacts` y `/empresas` en modo lectura. Es más de
lo que la pantalla necesita. La alternativa —un DTO de finanzas que lleve los
nombres sin exigir la capacidad— es peor, y este repositorio ya la rechazó dos
veces (014/FR-008, 015): **un dato que se muestra sin una capacidad que lo
autorice es un dato que se filtró**. Se paga la lectura de más y se gana que el
permiso siga diciendo la verdad.

### US2 — La vista de Caja (Priority: P1)

Como administración quiero ver todos los cobros recibidos en un período,
separados por moneda, con las columnas que necesito para cargarlos en Bit.

**Escenarios**:
- Elijo un período → veo un bloque por moneda; dentro de cada bloque, una fila
  por pago, y al pie el total **de esa moneda**.
- Un período sin movimiento en una moneda → el bloque no se dibuja. Una tabla
  vacía con un total en cero se transcribe igual de mal que un número errado.
- Un pago anulado no aparece: no entró.
- Vuelvo a abrir la misma pantalla con el mismo período → **las filas salen en
  el mismo orden**. Es el requisito silencioso de toda pantalla de
  transcripción, y el que nadie escribe hasta que falla.

### US3 — La vista de Devengado (Priority: P1)

Como administración quiero ver las cuotas emitidas para el período con su
estado, para saber qué se devengó independientemente de qué se cobró.

**Escenarios**:
- Elijo un período → una fila por cuota con vencimiento en ese período, con su
  estado, agrupadas por moneda.
- Una cuota cobrada a medias figura como `parcial`, con lo pagado y el saldo.
  Es el caso que hace que caja y devengado no coincidan, y esconderlo obliga a
  reconstruirlo a mano.
- Una cuota anulada no figura: no se devengó.

### US4 — Dónde me quedé (Priority: P2)

Como administración quiero saber qué filas ya transcribí, para no cargar dos
veces ni saltear ninguna.

Este es el problema real de una pantalla de transcripción, y no lo resuelve la
prolijidad: el contador copia cien filas, lo interrumpe una llamada, vuelve al
día siguiente y **no tiene forma de saber dónde cortó**. Duplicar un asiento y
omitir uno cuestan lo mismo, y los dos aparecen semanas después.

La propuesta —marcar cada fila como transcrita, con quién y cuándo— agrega una
tabla y no es gratis. Va como **DV-001**, con su costo y su alternativa barata.

## Requirements

### El rol

- **FR-001**: DEBE existir un rol `administracion` en `SYSTEM_ROLES`
  (`src/lib/capabilities.ts`) con **exactamente** `cobranza.ver`,
  `inscripciones.ver`, `academico.ver` y `contactos.ver`.
- **FR-002**: Una migración DEBE sembrar el rol en **las organizaciones que ya
  existen**, no sólo en las nuevas. `src/server/auth/on-signup.ts` siembra
  `SYSTEM_ROLES` **al crear la organización**: sin migración, la organización
  real —la de los 340 alumnos y las 41 cohortes— nunca lo tendría, y
  `/settings/roles` seguiría mostrando tres roles.
- **FR-003**: Esa migración DEBE ser re-ejecutable (Principio IV): inserta el
  rol sólo donde falte y no pisa capacidades ya editadas por el dueño. Una
  migración que reescriba el rol en cada corrida deshace configuración humana.
- **FR-004**: NO se extiende `ROLE_CAPABILITIES`. Ese mapa hoy tiene `owner`,
  `member` y `soporte` — **ni siquiera `direccion` ni `coordinacion`**, que
  funcionan por su fila sembrada en la base. Agregar `administracion` ahí
  crearía una cuarta fuente de verdad, capaz de divergir de la base sin que
  nadie lo note. `capabilitiesFor()` sigue devolviendo `[]` para lo que no
  conoce, y está bien que así sea.
- **FR-005**: El rol nuevo DEBE ser editable desde `/settings/roles` como los
  otros tres, incluido el guardarraíl de auto-bloqueo que ya existe. No se
  crea una excepción para él.

### La pantalla

- **FR-006**: La vista DEBE vivir en una ruta nueva bajo `src/app/(app)/`, y
  todos sus endpoints DEBEN declarar capacidad con `requireCapability`.
  **Nada de `withAuth` pelado**: hoy hay 0 en el repositorio y así queda.
- **FR-007**: La capacidad que gobierna la vista es `cobranza.ver`. **NO se
  agrega una capacidad nueva a la lista cerrada.** La pantalla agrega
  exactamente lo que `cobranza.ver` ya gobierna; una `finanzas.ver` aparte
  permitiría concederle a alguien el agregado negándole el detalle, siendo el
  mismo dato, y la primera vez que esas dos reglas se contradigan gana la que
  nadie miró.
- **FR-008**: El ítem de navegación DEBE declararse en `NAV_GROUPS`
  (`src/components/app-nav.tsx`) con `capability: "cobranza.ver"`, como todos
  los demás. Un ítem que lleva a un 403 no es información.
- **FR-009**: Toda la superficie es de STAFF. No aparece en ningún portal ni
  se expone bajo `/api/portal/`.

### Caja

- **FR-010**: Caja DEBE listar los pagos **no anulados** (`voided_at is null`)
  cuyo `paid_at` cae dentro del período. `paid_at` y no `created_at`: la caja
  de agosto es la plata que entró en agosto, aunque se haya cargado en
  septiembre.
- **FR-011**: Cada fila DEBE traer **fecha del cobro, alumno, cohorte/curso,
  medio de pago, importe y moneda**. El medio sale de `payment.method`
  (`efectivo`, `transferencia`, `tarjeta`, `otro`), que ya existe.
- **FR-012**: El orden DEBE ser estable y determinista: `paid_at` ascendente,
  **con desempate explícito por `id`**. Sin desempate, dos pagos del mismo
  instante pueden salir en distinto orden entre dos cargas, y el contador que
  volvió a la pantalla saltea una fila o transcribe otra dos veces. El orden no
  es una preferencia estética acá: es parte del contrato.

### Devengado

- **FR-013**: Devengado DEBE listar las cuotas **no anuladas** (`canceled_at is
  null`) cuyo `due_date` cae dentro del período.
- **FR-014**: Cada cuota DEBE mostrarse con el estado que ya calcula
  `installmentStatus`: `pagada`, `parcial`, `vencida`, `pendiente`. **No se
  inventa un vocabulario paralelo.** Un modelo de tres valores pierde
  `parcial`, que es justamente el caso donde caja y devengado divergen, y dos
  vocabularios para el mismo estado terminan divergiendo entre sí.
- **FR-015**: Cada fila DEBE traer importe, pagado y saldo, con su moneda.

### Monedas y período

- **FR-016**: Cada total DEBE declararse **con su moneda**, y las monedas van
  en bloques separados. **No existe un total general** y ninguna celda suma dos
  monedas. El orden de las monedas es el de `CURRENCIES`, fijo, para que la
  pantalla no se reordene mes a mes según qué moneda vendió.
- **FR-017**: Caja y devengado NUNCA se suman ni se restan entre sí en la
  pantalla, ni se presentan como una diferencia.
- **FR-018**: El período DEBE declararse con fecha de inicio y fin, y sus
  límites resolverse en la **zona horaria de la organización**. "Agosto" en UTC
  empieza el 31 de julio a las 21:00 en Montevideo: la diferencia son los pagos
  de la última noche del mes, que es cuando más se paga.

### Lo que no hace

- **FR-019**: Ningún endpoint de esta fase devuelve `text/csv` ni ningún otro
  formato de archivo. Los dos CSV que existen —`/api/cohorts/[id]/export` y
  `/api/companies/[id]/report`— no se tocan y **siguen sin datos financieros**,
  que es a propósito.
- **FR-020**: Sin dependencias de runtime nuevas. El proyecto tiene **15
  dependencias de runtime** y esta fase no agrega ninguna: el Principio II de
  la constitución no se toca ni se enmienda.

### Verificación

- **FR-021**: Cada regla visible en la interfaz DEBE tener su 403 probado con
  test (Principio 2 del roadmap: *el front oculta, el servidor prohíbe*). Una
  sesión sin `cobranza.ver` recibe 403 de los endpoints nuevos, y
  `tests/unit/route-capabilities.test.ts` falla si alguna ruta nueva no declara
  capacidad.
- **FR-022**: DEBE haber un test que verifique que un total de una moneda nunca
  incluye importes de otra. El precedente exacto ya vive en el arnés E2E
  (`== dashboard/finance: los totales NO mezclan monedas ==`); acá se ejerce
  sobre las filas, no sólo sobre los agregados.

## Decisiones a verificar

- **DV-001** *(la que hay que resolver con el dueño)*: **¿se persiste una marca
  de "transcrito" por fila?**
  *Propuesta*: sí — una tabla nueva que guarde qué fila se marcó, **quién** la
  marcó y **cuándo**, reversible (se puede desmarcar).
  *Costo honesto*: es una tabla de dominio, así que arrastra `organization_id`
  NOT NULL, política `tenant_isolation` escrita **a mano** en la migración
  —`db:generate` no la genera, y `tests/unit/rls-cobertura.test.ts` falla si se
  olvida—, más endpoints de marcar y desmarcar con su capacidad y su 403. No es
  una casilla: es media fase.
  *Alternativa barata, y es real*: no se marca nada, y el contador acota el
  período por rango de fechas (del 1 al 15, después del 16 al 31). Cuesta cero
  código y resuelve la mayor parte del problema; falla cuando la interrupción
  cae **dentro** de un día con muchos movimientos.
  Se implementa la alternativa barata salvo que el dueño pida la marca.
- **DV-002**: ¿el período por defecto es el mes en curso o el anterior?
  *(propuesta: el anterior, que es el que se cierra. Abrir en el mes en curso
  invita a transcribir un período que todavía se está moviendo.)*
- **DV-003**: ¿el devengado se ordena por vencimiento o por alumno?
  *(propuesta: por vencimiento, con desempate por alumno. La transcripción es
  cronológica.)*
- **DV-004**: ¿dónde quedan los pagos ANULADOS del período? No van en Caja
  (FR-010), pero un pago que se transcribió y después se anuló hay que poder
  encontrarlo.
  *(propuesta: un tercer listado, chico y explícitamente aparte, con las
  anulaciones del período y su motivo. Nunca mezclado con Caja.)*
- **DV-005**: ¿la vista se filtra por cohorte, además de por período?
  *(propuesta: sí, filtro opcional. El cierre es por período, pero cuando algo
  no cuadra la pregunta siguiente siempre es "¿de qué camada era?".)*

## Definición de Hecho

El gate técnico (`pnpm typecheck && pnpm lint && pnpm build && pnpm test`) es
el piso. El Principio IX de la constitución —**Verificación de Comportamiento
en Vivo, NO NEGOCIABLE**— pide ejercer el comportamiento como lo haría un
usuario real, y acá hay una deuda concreta que esta fase tiene que empezar a
saldar.

`scripts/e2e-selftest.mjs` tiene bloques hasta **020**. **No hay bloque para
021, 022, 023 ni 024**: cuatro ciclos probados sólo a nivel unitario, y entre
ellos la **022 (cobranza en bloque)**, que es la maquinaria que esta fase lee.

Por eso:

- **DoD-1**: la 026 DEBE agregar su propio bloque a `scripts/e2e-selftest.mjs`:
  entrar con una cuenta del rol `administracion`, abrir la vista, verificar que
  las filas del período aparecen, que hay un bloque por moneda, que **ninguna
  celda suma dos monedas**, y que la misma consulta dos veces devuelve el mismo
  orden.
- **DoD-2**: el camino infeliz también: una sesión **sin** `cobranza.ver`
  recibe 403 del endpoint y no ve el ítem en el menú.
- **DoD-3**: esta es **la ocasión para saldar el bloque de la 022**. La 026 lee
  las cuotas y los pagos que la 022 genera en lote; si la generación en bloque
  se rompe, la 026 muestra un mes incompleto y **hoy ninguna corrida automática
  lo detectaría**. Cubrir la 022 no es alcance extra: es la única forma de que
  el verde de la 026 signifique algo.

## Success Criteria

- **SC-001**: Se crea una cuenta con rol `administracion`, entra al panel y ve
  la vista de finanzas; no ve la bandeja, ni configuración, ni ningún control
  de edición de cobranza. Verificado en vivo.
- **SC-002**: Administración arma el cierre de un mes **sin abrir ninguna
  cohorte**.
- **SC-003**: Un período con cobros en las tres monedas muestra tres bloques
  con tres totales y **ningún número que los sume**, verificado por test.
- **SC-004**: La misma consulta ejecutada dos veces devuelve las filas en el
  mismo orden, verificado por test.
- **SC-005**: Una cuota de agosto cobrada en septiembre aparece en el devengado
  de agosto **y** en la caja de septiembre, y en ningún otro lado.
- **SC-006**: Un pago anulado no figura en Caja ni afecta ningún total.
- **SC-007**: Una sesión sin `cobranza.ver` recibe 403 de todos los endpoints
  de la fase, verificado por test.
- **SC-008**: `scripts/e2e-selftest.mjs` corre verde con bloque propio para la
  026 y con el de la 022 saldado.

## Out of Scope

- **Cualquier archivo de salida**: CSV, XLSX, PDF o layout de importación de
  Bit. Es la decisión 1 de esta fase, no un pendiente.
- **Integrar con Bit** o con cualquier sistema contable. Sería una cuarta
  dependencia de runtime y el Principio II está cerrado.
- **Conversión entre monedas.** Exigiría un tipo de cambio que el CRM no tiene
  y no debe inventar. Ya se resolvió así en 007 y en 008.
- **Facturación electrónica, CFE, DGI.** Otro dominio, con normativa propia.
- **Registrar o anular pagos desde esta pantalla.** Eso vive en el roster, con
  el contexto del alumno, y administración no lleva `cobranza.editar`.
- **Crear roles desde la interfaz.** Esta fase agrega UN rol por código porque
  hace falta uno; un ABM de roles es otra fase y otra discusión.
- **Comisiones, sueldos de profesores y egresos.** El sistema registra
  ingresos; los egresos no tienen modelo, y no se improvisa uno para que la
  pantalla parezca completa.
