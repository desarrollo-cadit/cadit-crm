# Feature Specification: Cobranza y cuotas

**Feature Branch**: `008-cobranza`

**Created**: 2026-08-21

**Status**: Draft

**Input**: El CRM registra cuánto se le vendió a cada alumno (`enrollment.amount`)
y en cuántas cuotas (`enrollment.installments`, un entero suelto), pero no
registra ni un solo pago. No hay vencimientos, no hay saldo, no hay estado de
cuenta y no hay forma de responder "¿quién me debe la cuota de marzo?" sin
abrir una planilla paralela. El dashboard financiero mide FACTURADO, no
COBRADO.

## Aclaraciones necesarias

Estas decisiones cambian el modelo de datos y no se pueden resolver leyendo el
código. Están detalladas en [research.md](research.md) como DV-001..DV-008 y
deben resolverse ANTES de implementar.

Las dos que más impactan:

- **DV-002** — ¿se admite el pago parcial de una cuota? (define si `payment`
  es 1:1 con `installment` o N:1)
- **DV-006** — el número de factura y de recibo hoy viven en `enrollment`.
  ¿Pasan a ser por pago? (una inscripción en 6 cuotas emite 6 recibos)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Armar el plan de cuotas al inscribir (Priority: P1) 🎯 MVP

Como ventas, cuando inscribo a un alumno que paga en cuotas necesito que el
sistema genere el calendario de vencimientos, para que después se pueda
controlar quién pagó y quién no.

**Why this priority**: Sin plan de cuotas no hay nada que cobrar ni contra qué
comparar un pago. Es el cimiento de todo el resto.

**Independent Test**: Inscribir a un alumno por 120.000 UYU en 6 cuotas y
verificar que quedan 6 vencimientos con su fecha y su monto, sumando
exactamente 120.000.

**Acceptance Scenarios**:

1. **Given** una inscripción con monto y cantidad de cuotas, **When** ventas
   confirma el plan, **Then** quedan generadas N cuotas con fecha de
   vencimiento y monto, y la suma de las cuotas es EXACTAMENTE el monto de la
   inscripción.
2. **Given** un monto que no se divide en partes iguales (100.000 en 3),
   **When** se genera el plan, **Then** el sistema reparte el resto sin perder
   ni un peso (33.334 + 33.333 + 33.333) y lo deja visible.
3. **Given** una inscripción al contado, **When** ventas la registra, **Then**
   queda una única cuota con vencimiento en la fecha de inscripción.
4. **Given** un plan ya generado, **When** coordinación corrige el monto o la
   fecha de una cuota puntual, **Then** el cambio queda registrado y la suma
   se vuelve a validar contra el total de la inscripción.

---

### User Story 2 - Registrar un pago y ver el saldo (Priority: P1)

Como administración, cuando un alumno paga necesito registrarlo contra su
cuota y ver al instante cuánto le queda debiendo.

**Why this priority**: Es la otra mitad del MVP. Sin registrar pagos, el plan
de cuotas es una lista de deseos.

**Independent Test**: Registrar un pago de 20.000 sobre una cuota de 20.000 y
verificar que la cuota queda saldada y el saldo de la inscripción baja en
20.000.

**Acceptance Scenarios**:

1. **Given** una cuota pendiente, **When** administración registra un pago por
   su monto exacto, **Then** la cuota queda saldada y el saldo total de la
   inscripción se reduce en ese importe.
2. **Given** una cuota de 20.000, **When** se registra un pago de 12.000,
   **Then** la cuota queda parcialmente pagada, con 8.000 de saldo visible.
   *(sujeto a DV-002)*
3. **Given** un pago registrado por error, **When** administración lo anula,
   **Then** el pago queda anulado con motivo y autor, el saldo vuelve atrás, y
   el registro NO se borra del historial.
4. **Given** una inscripción en guaraníes, **When** se intenta registrar un
   pago en dólares, **Then** el sistema lo rechaza con un mensaje explícito.
   Nunca se convierte entre monedas.

---

### User Story 3 - Ver quién debe (Priority: P1)

Como administración o coordinación, necesito una vista de morosidad: quiénes
tienen cuotas vencidas, cuánto y desde hace cuánto, para poder salir a
reclamar.

**Why this priority**: Es la razón de ser de la feature. Sin esta pantalla, el
resto es data entry sin retorno.

**Independent Test**: Con tres alumnos —uno al día, uno con una cuota vencida
ayer y uno con dos cuotas vencidas hace un mes— abrir la vista de morosidad y
verificar que aparecen solo los dos últimos, ordenados por antigüedad de deuda.

**Acceptance Scenarios**:

1. **Given** cuotas vencidas impagas, **When** se abre la vista de morosidad,
   **Then** se listan alumno, cohorte, cuotas vencidas, monto adeudado y días
   de atraso.
2. **Given** un alumno con cuotas vencidas, **When** se registra el pago,
   **Then** desaparece de la vista sin necesidad de recargar ni de correr
   ningún proceso.
3. **Given** la vista de morosidad, **When** entra un usuario con rol
   `soporte`, **Then** recibe 403: es información financiera (FR-016 de 005).

---

### User Story 4 - Dashboard que mide lo cobrado, no lo facturado (Priority: P2)

Como dueño, necesito ver en el home cuánto ENTRÓ este mes, no cuánto vendí,
y poder comparar ambas cifras.

**Why this priority**: El dashboard actual ya es honesto por moneda (ver
`17e4844`), pero mide `enrollment.amount` por fecha de inscripción. Eso es
facturación, no caja.

**Independent Test**: Con una inscripción de 120.000 en 6 cuotas hecha en
enero y una sola cuota cobrada en marzo, verificar que enero muestra 120.000
facturado y 20.000 cobrado en marzo.

**Acceptance Scenarios**:

1. **Given** inscripciones y pagos del mes, **When** se abre el home, **Then**
   se ven las dos cifras separadas y rotuladas: facturado y cobrado.
2. **Given** varias monedas activas, **When** se muestran ambas cifras,
   **Then** cada una se separa por moneda, igual que hoy. Nunca se suman.

---

### User Story 5 - Estado de cuenta del alumno (Priority: P3)

Como administración, cuando un alumno pregunta "¿cuánto debo?", necesito
abrir su ficha y ver el detalle: qué pagó, cuándo, y qué le falta.

**Independent Test**: Abrir una inscripción con 6 cuotas y 2 pagos y verificar
que se ve el detalle completo con el saldo.

**Acceptance Scenarios**:

1. **Given** una inscripción con pagos, **When** se abre su estado de cuenta,
   **Then** se ven las cuotas con su estado, los pagos con fecha y medio, y el
   saldo.
2. **Given** un estado de cuenta, **When** administración lo exporta,
   **Then** obtiene un archivo con ese detalle para mandarle al alumno.

---

## Requirements *(mandatory)*

### Functional

- **FR-001**: El sistema DEBE permitir generar un plan de cuotas para una
  inscripción, con fecha de vencimiento y monto por cuota.
- **FR-002**: La suma de las cuotas de una inscripción DEBE ser exactamente
  igual a `enrollment.amount`. El sistema DEBE rechazar un plan que no cierre.
- **FR-003**: El sistema DEBE registrar pagos con fecha, importe, moneda,
  medio de pago y quién lo registró.
- **FR-004**: Un pago DEBE estar en la MISMA moneda que la cuota que salda. El
  sistema NO DEBE convertir entre monedas bajo ninguna circunstancia.
- **FR-005**: El sistema DEBE calcular el saldo de una inscripción como el
  total de cuotas menos el total de pagos no anulados.
- **FR-006**: El sistema DEBE permitir anular un pago con motivo y autor,
  conservando el registro original (nunca borrado físico).
- **FR-007**: El sistema DEBE exponer una vista de morosidad con las cuotas
  vencidas impagas, ordenables por antigüedad y filtrables por cohorte.
- **FR-008**: El estado "vencida" DEBE derivarse de la fecha de vencimiento y
  el saldo al momento de consultar, NO persistirse. *(ver DV-003)*
- **FR-009**: Toda la superficie de cobranza DEBE responder 403 al rol
  `soporte`, igual que el resto de lo financiero (FR-016 de 005).
- **FR-010**: El dashboard DEBE mostrar facturado y cobrado como cifras
  separadas, cada una desagregada por moneda.
- **FR-011**: El registro de un pago DEBE ser idempotente ante un doble envío
  del mismo formulario (constitución IV).
- **FR-012**: El roster de la cohorte DEBE mostrar el saldo de cada alumno para
  quien tenga acceso financiero.

### Key Entities

Ver [data-model.md](data-model.md).

- **Cuota (`installment`)**: lo que el alumno DEBE. Fecha de vencimiento,
  monto, moneda, número de orden dentro del plan.
- **Pago (`payment`)**: lo que el alumno PAGÓ. Fecha, importe, medio,
  comprobante, autor, y la cuota que salda.

La separación entre las dos es deliberada: una cuota es una obligación futura
y un pago es un hecho consumado. Colapsarlas en una sola tabla haría imposible
responder "¿cuánto se venció este mes?" y "¿cuánto entró este mes?" con la
misma data.

## Success Criteria *(mandatory)*

- **SC-001**: Administración puede responder "¿quién debe?" sin abrir ninguna
  planilla externa.
- **SC-002**: El home muestra caja real del mes, separada de facturación.
- **SC-003**: Ningún importe de una moneda se suma con el de otra, en ninguna
  pantalla ni endpoint.
- **SC-004**: Registrar un pago no requiere corregir nada a mano después: el
  saldo, la morosidad y el dashboard se actualizan solos.

## Out of Scope

- Integración con pasarelas de pago o bancos (constitución II: sin Stripe ni
  servicios externos nuevos).
- Conversión entre monedas y cotizaciones.
- Facturación electrónica ante DGI.
- Recordatorios automáticos de vencimiento — **dependen del scheduler que hoy
  no existe**; se especifican en [011](../011-operativa-menor/spec.md).
- Intereses por mora y refinanciación.
