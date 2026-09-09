# Data Model — Cobranza y cuotas

Todo lo de acá abajo asume las propuestas de [research.md](research.md). Si el
dueño resuelve distinto una DV, este documento se corrige ANTES de generar la
migración.

## Entidades nuevas

### `installment` — la cuota (lo que se debe)

| Columna | Tipo | Nota |
|---|---|---|
| `id` | text PK | prefijo `inst_` |
| `organization_id` | text NOT NULL FK→organization | constitución III |
| `enrollment_id` | text NOT NULL FK→enrollment ON DELETE cascade | |
| `number` | integer NOT NULL | orden dentro del plan, 1..N |
| `due_date` | timestamp NOT NULL | vencimiento pactado |
| `amount` | integer NOT NULL | entero sin centavos, igual que `enrollment.amount` |
| `currency` | text NOT NULL | hereda de `enrollment.currency` al generar |
| `canceled_at` | timestamp NULL | cuota anulada (plan rearmado); no se borra |
| `notes` | text NULL | |
| `created_at` / `updated_at` | timestamp NOT NULL | |

**Índices**: `(organization_id, enrollment_id, number)` único;
`(organization_id, due_date)` para la vista de morosidad.

**No lleva columna de estado.** El estado se deriva (DV-003):

- `pagada` — suma de pagos no anulados ≥ `amount`
- `parcial` — hay pagos pero no alcanzan
- `vencida` — `due_date < hoy` y saldo > 0
- `pendiente` — el resto

### `payment` — el pago (lo que entró)

| Columna | Tipo | Nota |
|---|---|---|
| `id` | text PK | prefijo `pay_` |
| `organization_id` | text NOT NULL FK→organization | |
| `enrollment_id` | text NOT NULL FK→enrollment | denormalizado desde la cuota, para consultar caja sin join |
| `installment_id` | text NULL FK→installment | NULL = pago a cuenta, sin cuota asignada |
| `amount` | integer NOT NULL | |
| `currency` | text NOT NULL | DEBE coincidir con la de la cuota (FR-004) |
| `paid_at` | timestamp NOT NULL | fecha real del pago, no la de carga |
| `method` | text NOT NULL | enum: `efectivo`, `transferencia`, `tarjeta`, `otro` |
| `receipt_number` | text NULL | ver DV-006 |
| `notes` | text NULL | |
| `recorded_by` | text NULL FK→user ON DELETE set null | quién lo cargó |
| `voided_at` | timestamp NULL | anulación; el registro NO se borra (FR-006) |
| `voided_by` | text NULL FK→user | |
| `void_reason` | text NULL | |
| `idempotency_key` | text NULL | ver abajo |
| `created_at` | timestamp NOT NULL | |

**Índices**: `(organization_id, paid_at)` para la caja del mes;
`(organization_id, enrollment_id)` para el estado de cuenta;
`(organization_id, idempotency_key)` único parcial donde no sea NULL.

## Por qué dos tablas y no una

Una cuota es una **obligación futura**; un pago es un **hecho consumado**.
Colapsarlas impide responder con la misma data dos preguntas distintas que la
administración hace todos los meses:

- "¿cuánto se venció este mes?" → mira `installment.due_date`
- "¿cuánto entró este mes?" → mira `payment.paid_at`

Y hay un caso que sin la separación no se puede representar: la cuota que
vence y nadie paga. Si el pago fuera la única fila, esa deuda simplemente no
existiría en la base — que es exactamente el problema de hoy.

## Idempotencia (FR-011, constitución IV)

El alta de pago acepta un `idempotency_key` opcional que el formulario genera
por intento. Un segundo POST con la misma clave devuelve el pago ya creado en
vez de duplicarlo. Sin clave, el comportamiento es el actual (crea siempre):
la deduplicación es una garantía que ofrece el cliente, no una adivinanza del
servidor.

## Reglas de integridad

1. `sum(installment.amount WHERE canceled_at IS NULL) == enrollment.amount`
   — validado en servidor al generar o editar el plan (FR-002).
2. `payment.currency == installment.currency` cuando hay cuota asignada
   (FR-004). Sin cuota, debe coincidir con `enrollment.currency`.
3. `payment.organization_id == installment.organization_id ==
   enrollment.organization_id` — verificado con `scoped()` antes de insertar,
   igual que `validateCohortForeignKeys` en `src/server/courses.ts`.
4. Un pago anulado no cuenta para ningún saldo ni para ninguna cifra de caja.

## Qué NO se toca

- `enrollment.amount` sigue siendo el total pactado. No se recalcula.
- `enrollment.installments` (entero) y `enrollment.payment_notes` quedan
  intactos como registro histórico de lo cargado antes del sistema (DV-007).
  Se marcan como legado en un comentario del schema, no se borran: son la
  única memoria de cómo se cobró a los 340 alumnos importados.
- `enrollment.invoice_number` queda como el comprobante de la VENTA.

## Migración

Una sola migración aditiva: crea las dos tablas y sus índices. Sin backfill,
sin generación retroactiva de planes (DV-007), sin tocar columnas existentes.

Es re-ejecutable (constitución IV) y reversible sin pérdida: mientras nadie
cargue pagos, tirar las tablas devuelve el sistema al estado anterior.
