# Research — Cobranza y cuotas

Decisiones a verificar (DV) que NO se pueden resolver leyendo el código: son
decisiones de producto del dueño. Cada una está marcada con su impacto en el
modelo de datos, porque resolverlas después de implementar cuesta una
migración.

## DV-001 — ¿Cuotas iguales o montos libres?

**Pregunta**: ¿todas las cuotas de un plan tienen el mismo monto, o la
academia negocia planes con anticipo grande y cuotas chicas?

**Impacto**: si son siempre iguales, alcanza con `enrollment.installments` y
un monto derivado. Si son libres, hace falta la tabla `installment` con monto
por fila.

**Propuesta**: tabla con monto por fila. El costo de la tabla es el mismo y
cubre los dos casos; el generador ofrece "dividir en partes iguales" como
atajo. Un anticipo distinto es demasiado común como para no soportarlo.

**Resolución**: _pendiente_

---

## DV-002 — ¿Se admite pago parcial de una cuota?

**Pregunta**: si la cuota es de 20.000 y el alumno trae 12.000, ¿se registra
el pago parcial o se rechaza hasta que traiga el total?

**Impacto**: define la cardinalidad. Pago parcial ⇒ `payment` N:1 con
`installment` y saldo por cuota. Sin pago parcial ⇒ 1:1 y un simple booleano.

**Propuesta**: admitirlo. Es la realidad de la caja de una academia, y el
modelo N:1 también cubre el caso simple. Rechazar el parcial empuja al equipo
de vuelta al Excel justo en el caso incómodo, que es donde más importa.

**Resolución**: _pendiente_

---

## DV-003 — ¿El estado "vencida" se persiste o se deriva?

**Pregunta**: ¿guardamos una columna `status` que diga "vencida", o lo
calculamos al consultar?

**Impacto**: persistirlo exige un proceso que corra todos los días y marque
las cuotas que vencieron. **Ese proceso no existe: el CRM no tiene scheduler
ni cron** — el trabajo de fondo es in-process por request.

**Propuesta**: derivarlo. `vencida = fecha_vencimiento < hoy AND saldo > 0`.
Es correcto siempre, no necesita infraestructura y no puede quedar desfasado.
Persistir un estado que nadie actualiza es peor que no tenerlo: miente con
cara de verdad.

**Resolución**: _pendiente_ — recomendación fuerte a favor de derivar.

---

## DV-004 — ¿Un pago puede estar en otra moneda que su cuota?

**Pregunta**: la cuota es en UYU y el alumno paga en USD. ¿Se acepta?

**Impacto**: aceptarlo obliga a tener tipo de cambio, que es exactamente lo
que el fix `17e4844` decidió NO meter en el CRM.

**Propuesta**: rechazar. Si en la práctica pasa, se registra como un plan en
la moneda efectiva o como dos cuotas distintas. La alternativa es que el
sistema invente una cotización y todos los números pierdan sentido.

**Resolución**: _pendiente_

---

## DV-005 — ¿Quién puede registrar y anular pagos?

**Pregunta**: hoy los roles son acceso completo vs. `soporte`. ¿Alcanza, o
hace falta un rol de administración que cobre pero no edite precios?

**Impacto**: si alcanza con los dos roles actuales, no hay cambio de auth. Si
no, toca el modelo de permisos.

**Propuesta**: empezar con los roles actuales (`requireFullAccess` para toda
la cobranza) y ver si la separación hace falta en la práctica. Agregar un rol
es barato; sacarlo una vez que la gente lo usa, no.

**Resolución**: _pendiente_

---

## DV-006 — ¿Factura y recibo por pago o por inscripción?

**Pregunta**: hoy `enrollment.invoice_number` y `enrollment.receipt_number`
son uno por inscripción. Pero una inscripción en 6 cuotas emite 6 recibos.

**Impacto**: alto. Si el recibo es por pago, las columnas actuales quedan
como legado y el número se mueve a `payment`.

**Propuesta**: el recibo va al pago (es el comprobante de que entró plata) y
la factura queda en la inscripción (es el comprobante de la venta). Las
columnas actuales se conservan sin tocar para no romper lo ya cargado.

**Resolución**: _pendiente_ — es la decisión de mayor impacto de esta feature.

---

## DV-007 — ¿Qué pasa con los datos ya cargados?

**Pregunta**: hay 340 alumnos importados con `enrollment.amount`,
`installments` (entero) y `payment_notes` (texto libre). ¿Se les genera plan
de cuotas retroactivo?

**Impacto**: define la migración. Generar planes retroactivos inventa
vencimientos que nadie pactó; no generarlos deja a los alumnos viejos fuera de
la vista de morosidad.

**Propuesta**: NO generar nada automático. La migración solo crea las tablas.
Se ofrece una acción explícita "generar plan de cuotas" por inscripción, para
que alguien que sabe decida las fechas. `payment_notes` se conserva intacto
como registro histórico de lo que se cobró antes del sistema.

**Resolución**: _pendiente_

---

## DV-008 — ¿Medios de pago como enum cerrado o texto?

**Pregunta**: efectivo, transferencia, tarjeta, cheque… ¿lista cerrada o
libre?

**Impacto**: bajo, pero un enum permite agrupar la caja por medio.

**Propuesta**: enum cerrado (`efectivo`, `transferencia`, `tarjeta`, `otro`)
con un campo de nota libre al lado. Texto libre puro hace imposible el reporte
por medio y termina con "Transferencia", "transferencia" y "transf" como tres
categorías.

**Resolución**: _pendiente_

---

## Constitution Check

| Principio | Cumple | Nota |
|---|---|---|
| I — Seguridad | ✅ | Sin secretos nuevos. |
| II — Soberanía | ✅ | Sin dependencias de runtime nuevas. Sin pasarelas de pago. |
| III — Multi-tenancy | ✅ | `organization_id NOT NULL` en `installment` y `payment`; toda query por `scoped()`. |
| IV — Idempotencia | ⚠️ | FR-011 lo exige para el alta de pago. Definir la clave de deduplicación en `plan.md`. |
| IX — Verificación en vivo | ⚠️ | Hay pantallas nuevas: aplica el self-test E2E obligatorio. |
