# 022 — Cobranza en bloque

**Estado**: propuesta · **Depende de**: 008 · **Habilita**: 015

## Por qué existe

El dueño eligió la cobranza antes que el portal del alumno, porque *"es lo
único que hoy está en cero y que el negocio necesita sí o sí, con portal o sin
él"*. Medir mostró que el problema no es el que parecía.

**La maquinaria de cobranza está completa** desde la [008](../008-cobranza/spec.md):
`generateInstallmentPlan`, `recordPayment`, `voidPayment`,
`replaceInstallmentPlan`, morosidad, refinanciación. Nada de eso hay que
construirlo.

**Lo que falta es poder usarla sobre 383 inscripciones.** Hoy se carga de a
una: abrir la cohorte, abrir el alumno, abrir el panel de cobranza, poner
cuántas cuotas y desde cuándo. Multiplicado por 192, no se hace nunca.

## Lo medido (2026-08-31)

| | |
|---|---|
| Inscripciones con cohorte | **383** |
| …con monto cargado | **192** (UYU 187 · PYG 5) |
| …con cantidad de cuotas | **0** |
| …**listas para generar plan** | **0** |
| …sin monto: no se pueden facturar | **191** |
| Cohortes con precio de lista (`cost`) | **0** |
| Cuotas generadas | **0** |
| Pagos registrados | **0** |

Facturado cargado: **UYU 3.331.676** y **PYG 33.142.900**.

### El dato que cambia el diseño

**152 inscripciones tienen número de factura y 236 tienen notas de pago** en
texto libre: *"transferencia"*, *"Tarjeta OCA"*, *"mercado pago enviar link"*,
*"estudiante - tarjeta de crédito"*.

O sea: **el cobro ya ocurrió en la vida real.** Lo que falta no es planificar
cuotas a futuro — es que lo ya cobrado quede REGISTRADO. Un sistema que
arranca generando planes de pago a gente que ya pagó le va a mandar avisos de
morosidad a sus mejores clientes.

## Requirements

- **FR-001**: DEBE existir una acción en BLOQUE sobre varias inscripciones a la
  vez. De a una no es una limitación de la interfaz: es lo que hace que el
  trabajo no se haga.
- **FR-002**: La acción DEBE ser **parametrizada, no adivinada**. El sistema no
  puede suponer si una inscripción ya se cobró o se cobra en cuotas: eso lo
  sabe el dueño, y lo dice al elegir el lote.
- **FR-003**: DEBE ser idempotente (constitución IV). Correrla dos veces sobre
  el mismo lote no puede duplicar cuotas ni pagos.
- **FR-004**: Una inscripción **sin monto** no se puede facturar, y eso se DICE
  con el número — son 191 — en vez de fallar en silencio o generar un plan de
  cero pesos.
- **FR-005**: El lote DEBE respetar la moneda de cada inscripción. Hay UYU y
  PYG conviviendo, y sumarlas es lo que la 007 ya prohibió.
- **FR-006**: Exige `cobranza.editar`. Es la acción con más alcance de todo el
  sistema: un lote mal armado toca la plata de decenas de personas.
- **FR-007**: DEBE informar qué hizo y qué NO hizo, por inscripción. Un "listo"
  sobre 192 registros no es información.

## Decisiones a verificar

- **DV-001** — Las 191 sin monto: ¿se cargan a mano, se derivan del precio de
  lista de la cohorte (hoy en 0 en las 41), o quedan fuera del alcance?
- **DV-002** — ¿Las cuotas se generan con vencimientos a futuro, o el caso
  dominante es registrar lo ya cobrado en una sola cuota saldada?

## Success Criteria

- **SC-001**: El dueño deja registrada la cobranza de una cohorte entera en una
  sola acción.
- **SC-002**: Repetir la acción sobre el mismo lote no duplica nada,
  verificado por test.
- **SC-003**: Las inscripciones sin monto se informan por separado y no
  generan basura.

## Out of Scope

- Pasarela de pago (constitución II; es la [019](../019-checkout-y-alta-automatica/spec.md)).
- Facturación electrónica.
- Importar el histórico desde otro sistema.

---

## Estado: IMPLEMENTADA (2026-09-01)

Gate: typecheck, lint, build, **671 tests en 71 archivos**.
**Verificado en vivo contra la base real: 15/15 + 8/8**, con respaldo previo en
`backups/vocero-pre-022-*.sql` y la base devuelta a como estaba.

| Criterio | Cómo se verificó |
|---|---|
| SC-001 | Una cohorte entera cargada en UNA acción: 2 cuotas + 2 pagos, saldo cero |
| SC-002 | Repetir el lote aplica **0** y la base queda igual |
| SC-003 | Las 191 sin monto se informan por separado y no generan nada |
| FR-006 | Soporte recibe **403** en el lote y en el dashboard financiero |

El preview, leído contra las 41 cohortes reales, coincide exactamente con lo
medido: **192 aplicables, 191 sin monto, 0 con plan**.

### Lo que quedó decidido en el código

**El modo se declara, no se deduce.** `ModoCobranza` es una unión cerrada de
dos variantes y el llamador elige. Hay un test que falla si alguien exporta una
función que intente adivinarlo: con 152 facturas ya cargadas, adivinar mal
significa reclamarle a alguien que ya pagó.

**El lote nunca falla entero.** Con 192 registros, cortar en el primer problema
dejaría todo a medias y sin saber dónde quedó. Cada inscripción se resuelve por
su cuenta y al final se informa qué se hizo y qué no, agrupado por motivo — 18
líneas iguales no informan más que una línea con el número.

**La idempotencia es por INSCRIPCIÓN, no por lote** (`bulk-cobrada-<id>`): si
dos lotes se pisan porque incluyen a la misma persona, el pago no se duplica.

**El modo "ya cobrada" usa las mismas funciones que la carga de a una**
(`generateInstallmentPlan` + `recordPayment`), no un insert propio. Así el
estado derivado —pagada, parcial, vencida— y la morosidad siguen saliendo de un
solo lugar.

### DV-001 sigue abierta

Las **191 inscripciones sin monto** no se pueden facturar, y no hay de dónde
derivarlo: **ninguna de las 41 cohortes tiene precio de lista**. Es una decisión
del dueño, no un problema técnico, y entra en la [011](../011-operativa-menor/spec.md).
