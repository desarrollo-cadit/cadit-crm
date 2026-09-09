# Plan — Cobranza y cuotas

**Prerequisito bloqueante**: resolver DV-001..DV-008 de
[research.md](research.md). DV-002 y DV-006 cambian el modelo de datos; el
resto cambia comportamiento pero no tablas.

## Decisiones técnicas

### Dónde vive la lógica

Archivo plano nuevo `src/server/billing.ts`, siguiendo la convención del repo
(un archivo por dominio bajo `src/server/*.ts`, no carpetas). Concentra:

- generación y validación del plan de cuotas
- alta y anulación de pagos
- cálculo de saldos y estados derivados
- consultas de morosidad y de caja

`src/server/finance.ts` NO se fusiona: hoy responde "cuánto se facturó" y
seguirá haciéndolo. `billing.ts` responde "cuánto se debe y cuánto entró".
Son dos preguntas distintas y mezclarlas fue justamente el origen del bug que
arregló `17e4844`.

### Estados derivados, no persistidos

Los estados de cuota (`pendiente` / `parcial` / `pagada` / `vencida`) se
calculan en una función pura sobre `(cuota, pagos, hoy)`, testeable sin base.
Esto es lo que permite cumplir FR-008 sin scheduler.

La función pura recibe `hoy` como parámetro en vez de leer el reloj adentro:
un test que dependa de la fecha real del sistema es un test que rompe solo
algún martes.

### Saldos: calculados, no cacheados

El saldo NO se guarda en `enrollment`. Se calcula agregando pagos. Una columna
`balance` desnormalizada se desincroniza a la primera anulación que falle a
mitad de camino, y entonces el número que el equipo usa para reclamar plata
es un número inventado.

Si el volumen lo exige (hoy: 340 alumnos, no lo exige), la optimización es una
vista materializada, no una columna a mano.

### Idempotencia

`idempotency_key` con índice único parcial por organización. El alta de pago
hace `INSERT ... ON CONFLICT DO NOTHING` y, si no insertó, devuelve el
existente. Mismo criterio que la deduplicación por `wa_message_id` del webhook
(constitución IV).

### Multi-tenancy

`organization_id NOT NULL` en ambas tablas, y toda query por `scoped()`. Las
FK que llegan del cliente (`installmentId`, `enrollmentId`) se validan contra
la organización ANTES de insertar, con el mismo patrón que
`validateCohortForeignKeys` — no alcanza con validar el id principal.

### Moneda

`payment.currency` se valida contra la cuota en el servidor, no en el
formulario. La regla es de negocio y tiene que vivir donde no se pueda
esquivar con un curl.

## Constitution Check

| Principio | Estado |
|---|---|
| I — Seguridad | ✅ sin secretos nuevos |
| II — Soberanía | ✅ sin dependencias de runtime nuevas |
| III — Multi-tenancy | ✅ `organization_id` + `scoped()` en todo |
| IV — Idempotencia | ✅ `idempotency_key` + migración aditiva re-ejecutable |
| IX — Verificación en vivo | ✅ obligatorio: hay pantallas nuevas (ver quickstart) |

## Riesgos

| Riesgo | Mitigación |
|---|---|
| DV-006 (recibo por pago) se resuelve tarde y obliga a migrar | Bloquear el inicio hasta resolverla; está marcada como la de mayor impacto |
| Los 340 alumnos importados quedan fuera de morosidad | Decisión explícita (DV-007): planes retroactivos solo a pedido, nunca automáticos |
| Alguien suma monedas en una pantalla nueva | El tipo devuelve `CurrencyTotal[]`, no `number`; la suma cruzada no compila |
| El plan se rearma con pagos ya cargados | `409 plan_has_payments`; hay que anular primero |
