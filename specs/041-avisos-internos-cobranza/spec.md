# Feature Specification: Avisos internos de cobranza a Administración

**Feature Branch**: `041-avisos-internos-cobranza`

**Created**: 2026-10-19

**Status**: Implementada (primera entrega)

**Depende de**: 005 (inscripciones, empresas), 008 (cobranza: cuotas, pagos, morosidad), 012 (RLS, `onAfterCommit`), 033 (talleres no son cursadas), 2026-10-06 (vendedores y regla de venta), 039 (`staff_notice`, motor de avisos, área Administración, periódica), 040 (`seller.user_id`, datos de facturación de la empresa)

**Input**: Decisiones del dueño (2026-10-19), no se reabren:

| Aviso | Destinatarios | Cuándo |
|---|---|---|
| Nueva inscripción | Área Administración (para facturar) + el vendedor de esa venta (`seller.email`, o el correo de su cuenta si está vacío; vendedor archivado o sin correo → solo Administración) | Al crearse la inscripción |
| Pago registrado | Área Administración | Al registrarse un pago |
| Resumen de morosidad | Área Administración | Semanal, los lunes (zona de la academia), con las cuotas vencidas e impagas |

## Por qué esta fase existe

Administración se entera de una venta cuando alguien se acuerda de avisarle,
y de un pago cuando revisa la cobranza a mano. Con 039 ya existe el motor de
avisos internos (registro idempotente, reclamo compare-and-swap, envío fuera
de la transacción, periódica in-process) y la casilla del área
Administración. Esta fase le suma los tres avisos de cobranza.

## User Scenarios & Testing

### US1 — Administración recibe cada venta nueva para facturarla (P1)

Valeria (Ventas) inscribe a Ana en Revit, Octubre, por una empresa. Al
guardar, la casilla de Administración (+ copias) recibe un correo con copia a
Valeria: alumno (documento, correo, teléfono), curso y cohorte, inicio (fecha
y hora de la academia), vendedor, monto con su moneda, cuotas pactadas, si ya
tiene número de factura y los datos de facturación de la empresa (razón
social, nombre comercial, RUT, dirección fiscal, contacto, correo y teléfono
de facturación, condición de pago).

1. **Given** una venta, **When** el vendedor tiene `email`, **Then** va en CC;
   si está vacío, va el correo de su cuenta del panel (`seller.user_id`).
2. **Given** un vendedor archivado o sin ningún correo, **Then** solo
   Administración.
3. **Given** un lead (sin cohorte), una inscripción hija de un módulo o una
   inscripción a un taller, **Then** no sale ningún aviso.
4. **Given** un alta que revierte (el pedido falla después), **Then** no queda
   aviso encolado ni sale correo.

### US2 — Administración recibe cada pago registrado (P1)

Al registrar un pago, la casilla de Administración recibe: alumno, curso y
cohorte (o taller), monto con moneda, método, fecha del pago, recibo, a qué
cuota se imputó (o "a cuenta") y el saldo de esa inscripción **por moneda**.

1. **Given** el mismo pago reenviado con la misma llave de idempotencia,
   **Then** no sale un segundo aviso.
2. **Given** Graph caído, **Then** el pago queda registrado y el aviso
   `failed`; la periódica lo reintenta.

### US3 — Administración recibe la morosidad de la semana (P1)

Cada lunes desde las 08:00 (zona de la academia) la casilla recibe las cuotas
vencidas e impagas, agrupadas por cohorte y alumno, con totales por moneda y
días de atraso.

1. **Given** nadie debe, **Then** no se manda nada; queda
   `skipped / nada_que_enviar` y no se reintenta esa semana.
2. **Given** el servidor apagado el lunes, **Then** sale en la primera pasada
   de esa misma semana (hasta el domingo); nunca la semana siguiente.

## Reglas (decididas y documentadas)

### Qué es una venta (aviso `inscripcion_nueva`)

Una inscripción **madre con cohorte** cuyo curso no es un taller
(`esVentaParaAviso`, idéntica a `exigeVendedor` — hay test que las compara —
y a `ventas-por-vendedor.ts`).

| Camino de alta | ¿Avisa? | Por qué |
|---|---|---|
| `createEnrollment` (formulario de inscripción, `/api/enrollments`) | Sí, si es venta | El alta comercial. |
| Lead del tablero que recibe cohorte (`PATCH /api/pipeline/leads/[id]`, de `cohort_id` NULL a una cohorte) | Sí, si es venta | Convertir un lead ES vender. |
| Mudar de una cohorte a otra (`program-staff.ts`, o el PATCH de cohorte a cohorte) | No | No es una venta nueva. |
| Lead creado por el inbox (`lead-activity.ts`, sin cohorte) | No | Es interés. |
| Hijas de módulos (`module-enrollment.ts`, recursada con madre) | No | La venta es la madre. |
| Talleres (`workshops.ts`) | No | 033: no son cursadas y tienen sus propios avisos. |
| Semillas (`src/server/seed/*`) e importación (`scripts/import/*`) | No | Insertan directo, no pasan por `createEnrollment`. |
| `scripts/demo-camada.ts` | No | Pasa `{ avisoInterno: false }`. |

La llave es por inscripción: si un lead vuelve a "sin cohorte" y otra vez a
una cohorte, no sale un segundo aviso. Si la venta deja de serlo antes de que
el aviso salga, queda `skipped / ya_no_es_venta`.

### Pagos (aviso `pago_registrado`)

- Todo pago que pasa por `recordPayment` (incluidos los de talleres: la
  cobranza no filtra talleres, 033 FR-016). La carga en bloque "ya cobrada"
  (`billing-bulk.ts`) **no** avisa (`avisoInterno: false`): es plata que ya
  entró antes.
- **Anular un pago no avisa.** Si se anula antes de que su aviso salga, el
  aviso queda `skipped / pago_anulado`.
- El saldo es `saldoPorMoneda(listInstallments(...))`: cuotas vigentes menos
  lo pagado a cada una, por moneda, **nunca sumadas**. Un pago a cuenta (sin
  cuota) no descuenta de ninguna, igual que el estado de cuenta. Sin plan:
  "Sin plan de cuotas: no hay saldo calculado".

### Morosidad semanal (aviso `morosidad_semanal`)

- **Definición**: la del panel de cobranza (`listOverdue`, 008): cuota
  vigente (no anulada), `due_date` < ahora, saldo > 0 tras los pagos no
  anulados; días de atraso desde la cuota vencida más vieja,
  `floor((ahora − vencimiento) / 24 h)`. Incluye talleres y alumnos de baja
  (marcados "(de baja)").
- **Diferencia a propósito**: una fila por inscripción **y moneda**; los
  totales van por moneda en el orden de `CURRENCIES`.
- **Cuándo**: lunes desde las 08:00 de la zona de la organización; cualquier
  pasada posterior de esa semana ISO la recupera. Llave
  `morosidad_semanal:<YYYY-Www>`.
- **Vacío**: `skipped / nada_que_enviar`; no se reintenta esa semana.

### Idempotencia (`staff_notice`, generalizada)

`dedup_key` UNIQUE por organización (`claveDeAviso`):

| Aviso | Llave | Columnas |
|---|---|---|
| 039 (`cohorte_confirmada`, `facturacion_t7/t2`) | `kind:cohortId` | `cohort_id` |
| `inscripcion_nueva` | `inscripcion_nueva:enrollmentId` | `enrollment_id` |
| `pago_registrado` | `pago_registrado:paymentId` | `enrollment_id`, `payment_id` |
| `morosidad_semanal` | `morosidad_semanal:YYYY-Www` | `period_key` |

La migración rellena `dedup_key` de las filas de 039 con `kind:cohort_id`:
lo enviado sigue enviado. Estados y reintentos, los de 039: `sent` nunca se
repite; `failed` hasta 3 intentos; `pending` reclamado se retoma pasados 30
min; M365 sin configurar → `skipped / correo_sin_configurar`; área apagada o
sin casilla → `skipped / area_sin_configurar` (nunca lanza). Además:

- **Encolado**: los avisos de inscripción y de pago se insertan `pending`, 0
  intentos, sin `claimed_at`, DENTRO de la transacción del alta o del pago
  (revierten con ella) y se mandan con `onAfterCommit()`. Si el proceso se cae
  entre el commit y el envío, la periódica los encuentra.
- **Horizonte**: la periódica reintenta avisos de inscripción y de pago de la
  última semana; más viejos quedan como están.
- Un fallo del correo nunca deshace el alta ni el pago.

### Periódica

La misma de 039 (`STAFF_NOTICES_INTERVAL_MIN`, default 0 = apagada; nunca en
tests ni en `next build`). Sin variable nueva. Con la periódica apagada, los
avisos de inscripción y de pago igual salen después del commit; lo que no
ocurre es el reintento ni el resumen semanal.

## Requisitos funcionales

- **FR-001** Aviso `inscripcion_nueva` a Administración + vendedor, encolado
  en `createEnrollment` y en la conversión de lead, solo si es venta.
- **FR-002** Aviso `pago_registrado` a Administración, encolado en
  `recordPayment` (salvo `avisoInterno: false`).
- **FR-003** Aviso `morosidad_semanal` por la periódica.
- **FR-004** `staff_notice`: `cohort_id` NULL-able, `enrollment_id`,
  `payment_id`, `period_key`, `dedup_key` NOT NULL UNIQUE por organización,
  CHECK de sujeto por tipo; RLS `tenant_isolation` intacta (migración 0062).
- **FR-005** Textos de ayuda: Configuración › Áreas (Administración) y guía.

## Fuera de alcance

- Aviso por anulación de pago o por refinanciación.
- Elegir la hora o el día del resumen desde la pantalla (constante
  `HORA_DEL_RESUMEN`).
- Mostrar estos avisos en una pantalla (quedan registrados en
  `staff_notice`).
- Prueba E2E (decisión del dueño): se valida con unit tests y con una base
  descartable.
