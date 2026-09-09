# Contratos — Cobranza

Todos los endpoints usan `requireFullAccess` (FR-009): el rol `soporte`
recibe 403 sin llegar a consultar la base, igual que
`/api/dashboard/finance`.

Errores de negocio via `apiError(status, code, message)` con mensaje
accionable — nunca genéricos.

---

## `GET /api/enrollments/[id]/installments`

Plan de cuotas y estado de cuenta de una inscripción.

```jsonc
{
  "enrollment": { "id": "enr_x", "amount": 120000, "currency": "UYU" },
  "totals": { "billed": 120000, "paid": 40000, "balance": 80000 },
  "installments": [
    {
      "id": "inst_1",
      "number": 1,
      "dueDate": "2026-03-10T00:00:00.000Z",
      "amount": 20000,
      "currency": "UYU",
      "paid": 20000,
      "balance": 0,
      "status": "pagada"          // derivado, nunca persistido
    },
    {
      "id": "inst_2",
      "number": 2,
      "dueDate": "2026-04-10T00:00:00.000Z",
      "amount": 20000,
      "currency": "UYU",
      "paid": 0,
      "balance": 20000,
      "status": "vencida",
      "daysOverdue": 12
    }
  ],
  "payments": [
    {
      "id": "pay_1",
      "installmentId": "inst_1",
      "amount": 20000,
      "currency": "UYU",
      "paidAt": "2026-03-08T00:00:00.000Z",
      "method": "transferencia",
      "receiptNumber": "A-0012",
      "recordedBy": { "id": "usr_1", "name": "Ale" },
      "voidedAt": null
    }
  ]
}
```

`404 not_found` si la inscripción no es de la organización de la sesión.

---

## `POST /api/enrollments/[id]/installments`

Genera o reemplaza el plan de cuotas.

```jsonc
// Atajo: partes iguales desde una fecha
{ "mode": "equal", "count": 6, "firstDueDate": "2026-03-10", "everyMonths": 1 }

// Explícito: monto y fecha por cuota
{ "mode": "explicit", "installments": [
  { "dueDate": "2026-03-10", "amount": 40000 },
  { "dueDate": "2026-04-10", "amount": 20000 }
]}
```

**Reglas**:

- `422 plan_mismatch` si la suma no es exactamente `enrollment.amount`, con el
  mensaje diciendo cuánto falta o sobra.
- En `mode: "equal"` con división inexacta, el resto se suma a la PRIMERA
  cuota. La respuesta lo explicita para que el operador lo vea.
- `409 plan_has_payments` si ya hay pagos registrados: el plan no se
  reemplaza a ciegas. Hay que anular los pagos primero o editar cuota por
  cuota.

---

## `PATCH /api/installments/[id]`

Corrige una cuota puntual (`dueDate`, `amount`, `notes`).

- `422 plan_mismatch` si el cambio rompe la suma contra `enrollment.amount`.
- `409 installment_paid` si la cuota ya está saldada.

---

## `POST /api/payments`

Registra un pago.

```jsonc
{
  "installmentId": "inst_2",       // opcional: sin él es pago a cuenta
  "enrollmentId": "enr_x",         // requerido si no hay installmentId
  "amount": 20000,
  "currency": "UYU",
  "paidAt": "2026-04-09",
  "method": "transferencia",
  "receiptNumber": "A-0013",
  "notes": null,
  "idempotencyKey": "form-abc123"  // opcional (FR-011)
}
```

**Reglas**:

- `422 currency_mismatch` si la moneda no coincide con la de la cuota o la
  inscripción. **Nunca se convierte** (FR-004).
- `422 amount_exceeds_balance` si el pago supera el saldo de la cuota — salvo
  que DV-002 resuelva permitir sobrepago a cuenta.
- Un POST repetido con el mismo `idempotencyKey` devuelve `200` con el pago
  existente, no `201` ni un duplicado.

Respuesta `201` con el pago y los totales recalculados de la inscripción, para
que la UI no tenga que pedir el estado de cuenta de nuevo.

---

## `POST /api/payments/[id]/void`

Anula un pago.

```jsonc
{ "reason": "Cargado en la inscripción equivocada" }
```

- `reason` es obligatorio: una anulación sin motivo es un agujero en la
  auditoría.
- `409 already_voided` si ya estaba anulado.
- El registro se conserva (FR-006). Nunca hay borrado físico.

---

## `GET /api/dashboard/overdue`

Vista de morosidad.

Query: `?cohortId=` (opcional), `?minDaysOverdue=` (opcional).

```jsonc
{
  "asOf": "2026-08-21T00:00:00.000Z",
  "byCurrency": [
    { "currency": "UYU", "overdueTotal": 180000, "enrollments": 7 }
  ],
  "rows": [
    {
      "enrollmentId": "enr_x",
      "contact": { "id": "ct_1", "name": "Ana Pérez" },
      "cohort": { "id": "coh_1", "name": "Revit — Marzo 2026" },
      "overdueCount": 2,
      "overdueAmount": 40000,
      "currency": "UYU",
      "oldestDueDate": "2026-04-10T00:00:00.000Z",
      "daysOverdue": 133
    }
  ]
}
```

Ordenado por `daysOverdue` descendente. Totales **siempre separados por
moneda**.

---

## `GET /api/dashboard/finance` *(extiende el existente)*

Se agrega `collected` junto a lo que ya devuelve. La forma actual
(`currentMonth`, `previousMonth`, `trend`, `currencies`, todo por moneda) NO
cambia: los consumidores existentes siguen funcionando.

```jsonc
{
  "currentMonth": { "month": "2026-08", "totals": [ { "currency": "UYU", "total": 150000 } ] },
  "previousMonth": { "...": "..." },
  "trend": [ "..." ],
  "currencies": ["UYU"],
  "collected": {
    "currentMonth": { "month": "2026-08", "totals": [ { "currency": "UYU", "total": 90000 } ] },
    "previousMonth": { "...": "..." },
    "trend": [ "..." ]
  }
}
```

`collected` suma `payment.amount` no anulados por `paid_at`, agrupado por
moneda — el mismo criterio que `sumByCurrencyInRange` usa hoy para lo
facturado.

---

## `GET /api/cohorts/[id]/roster` *(extiende el existente)*

Cada entrada suma `balance` y `currency` para quien tenga acceso financiero.
Para `soporte`, esos campos NO viajan — misma regla de servidor que ya aplica
`buildRosterEntry`, no un filtro de UI.
