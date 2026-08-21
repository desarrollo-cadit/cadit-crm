# Tasks: Cobranza y cuotas

**Input**: `/specs/008-cobranza/` — spec.md, plan.md, research.md,
data-model.md, contracts/cobranza.md

**Tests**: TDD estricto. Toda regla de negocio nueva (suma del plan, estados
derivados, validación de moneda, idempotencia, saldo con anulaciones) lleva
test unitario ANTES del código.

**Verificación en vivo**: obligatoria (constitución IX) — hay pantallas
nuevas. Ver T028 y [quickstart.md](quickstart.md).

**Organización**: por user story de `spec.md`, en orden de prioridad.

---

## Phase 0: Bloqueante

- [ ] T001 Resolver DV-001..DV-008 con el dueño y registrar cada resolución en
      `research.md`. **Ninguna tarea siguiente puede empezar antes.** DV-002 y
      DV-006 cambian el modelo de datos.

---

## Phase 1: Setup

- [ ] T002 Agregar prefijos de ID en `src/lib/db/ids.ts`: `installment: "inst"`,
      `payment: "pay"`

---

## Phase 2: Foundational (bloquea todas las historias)

- [ ] T003 Agregar `installment` y `payment` a `src/lib/db/schema.ts` per
      `data-model.md`, con `organization_id NOT NULL` e índices. Marcar
      `enrollment.installments` y `payment_notes` como legado en comentario
      (no borrar: son la memoria de cómo se cobró a los 340 importados).
- [ ] T004 `pnpm db:generate` y revisar la migración A MANO. Debe ser
      puramente aditiva, sin backfill (DV-007).
- [ ] T005 [P] Aplicar la migración contra una base efímera y verificar que
      corre limpia y es re-ejecutable (constitución IV). Receta en
      `quickstart.md`.
- [ ] T006 Crear `src/server/billing.ts` con las funciones puras y sus firmas,
      sin implementación todavía.

---

## Phase 3: US1 — Plan de cuotas (P1) 🎯 MVP

- [ ] T007 [TEST] `tests/unit/billing-plan.test.ts`: la suma del plan debe
      igualar `enrollment.amount`; división inexacta reparte el resto en la
      primera cuota sin perder un peso; plan que no cierra se rechaza.
- [ ] T008 Implementar `buildInstallmentPlan(amount, count, firstDueDate,
      everyMonths)` — función PURA, sin base, sin reloj propio.
- [ ] T009 Implementar `createInstallmentPlan` y `replaceInstallmentPlan` en
      `billing.ts`, con validación FR-002 y `409` si ya hay pagos.
- [ ] T010 `POST` y `GET /api/enrollments/[id]/installments` per el contrato,
      con `requireFullAccess`.
- [ ] T011 [TEST] `tests/unit/billing-api.test.ts`: `soporte` recibe 403 sin
      tocar la base (mismo patrón que el test de `/api/dashboard/finance`).
- [ ] T012 UI: sección "Plan de cuotas" en la ficha de inscripción, con el
      atajo de partes iguales y la edición cuota por cuota.

---

## Phase 4: US2 — Registrar pagos (P1)

- [ ] T013 [TEST] `tests/unit/billing-payments.test.ts`: moneda distinta a la
      de la cuota se rechaza; pago parcial deja saldo (DV-002); pago anulado
      no cuenta para el saldo; doble POST con la misma `idempotencyKey` no
      duplica.
- [ ] T014 Implementar `recordPayment` con validación de moneda (FR-004),
      validación de FK contra la organización e idempotencia (FR-011).
- [ ] T015 Implementar `voidPayment` con motivo y autor obligatorios; nunca
      borrado físico (FR-006).
- [ ] T016 `POST /api/payments` y `POST /api/payments/[id]/void` per contrato.
- [ ] T017 UI: registrar pago desde el estado de cuenta y desde el roster;
      anular con motivo, con confirmación previa (el pago no es reversible con
      un click, mismo criterio que el checklist de onboarding).

---

## Phase 5: US3 — Morosidad (P1)

- [ ] T018 [TEST] `tests/unit/billing-status.test.ts`: estados derivados con
      `hoy` inyectado — pendiente, parcial, pagada, vencida y el borde exacto
      del día de vencimiento.
- [ ] T019 Implementar `installmentStatus(cuota, pagos, hoy)` — función pura.
- [ ] T020 Implementar `listOverdue(organizationId, filtros, hoy)` con totales
      por moneda, nunca sumados entre sí.
- [ ] T021 `GET /api/dashboard/overdue` per contrato, con `requireFullAccess`.
- [ ] T022 UI: vista de morosidad, ordenada por días de atraso, filtrable por
      camada.

---

## Phase 6: US4 — Facturado vs. cobrado (P2)

- [ ] T023 [TEST] extender `tests/unit/finance.test.ts`: `collected` agrupa por
      moneda igual que lo facturado y excluye los pagos anulados.
- [ ] T024 Implementar `collectedByCurrency` en `billing.ts`, reusando el
      criterio de rango de `sumByCurrencyInRange`.
- [ ] T025 Extender `GET /api/dashboard/finance` con `collected` SIN cambiar la
      forma actual de la respuesta.
- [ ] T026 UI: el panel del home muestra facturado y cobrado rotulados, por
      moneda, con las pestañas que ya existen.

---

## Phase 7: US5 — Estado de cuenta (P3)

- [ ] T027 UI: estado de cuenta imprimible/exportable desde la ficha del
      alumno, con cuotas, pagos y saldo.

---

## Phase 8: Verificación

- [ ] T028 Extender `scripts/e2e-selftest.mjs` con el escenario de cobranza:
      inscribir → generar plan de 3 cuotas → pagar una → verificar saldo →
      anular el pago → verificar que el saldo vuelve → intentar un pago en
      otra moneda y verificar el rechazo. Contra una **base efímera**, nunca
      contra la base con datos reales (ver `quickstart.md`).
- [ ] T029 Gate técnico completo: `pnpm typecheck && pnpm lint && pnpm build &&
      pnpm test`, más `pnpm test:e2e` en verde.
- [ ] T030 Actualizar `CLAUDE.md` (mapa del código: dónde se toca la cobranza)
      y el README si la feature cambia lo que el producto promete.

---

## Rollback

La feature es aditiva: dos tablas nuevas y campos nuevos en respuestas
existentes. Mientras no haya pagos cargados, revertir es tirar las tablas.
Con pagos cargados, el rollback exige exportarlos primero — a partir de ese
momento son el registro contable de la academia.
