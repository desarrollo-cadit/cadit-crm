# Implementation Plan: Facturación

**Spec**: [spec.md](./spec.md) · **Migración**: `drizzle/0063_facturacion.sql`

## Constitución

- **I (seguridad)**: un dato que no se debe ver no viaja. La lista lleva
  montos y exige `cobranza.ver`; las respuestas de las dos escrituras no
  llevan plata. Ventas no alcanza ninguna de las tres rutas.
- **III (multi-tenancy)**: sin tablas nuevas; `enrollment` y `payment` ya
  tienen `tenant_isolation`. Toda consulta por `scoped()`; las rutas corren en
  la transacción de `requireCapability`.
- **IV (idempotencia)**: migración re-ejecutable (columnas `if not exists`,
  FKs contra `pg_constraint`, cada grant solo donde falta). Guardar el mismo
  número no escribe.
- Capacidades, no roles: ninguna comparación por nombre de rol; lista cerrada.

## Estructura

| Capa | Archivo | Qué hace |
|---|---|---|
| Regla hoja | `src/lib/facturacion-regla.ts` | `normalizarNumero`, `estaFacturada`, `pendienteDeFacturar` (sin imports: la usa `staff-notices.ts` sin cerrar un ciclo) |
| Reglas puras | `src/lib/facturacion.ts` | `enLaVista`, `filtrarFacturacion`, `totalesPorMoneda`, `condicionDePago`, `avisoDeFacturaRepetida`, `facturacionCsv` |
| CSV | `src/lib/csv.ts` | `csvField` (mudado de `server/enrollments.ts`, que lo re-exporta) |
| Aviso 039 | `src/lib/staff-notices.ts` | `sinFacturar = filter(pendienteDeFacturar)` |
| Servidor | `src/server/facturacion.ts` | `listarFacturacion`, `registrarFactura`, `registrarRecibo` |
| Rutas | `src/app/api/facturacion/route.ts`, `src/app/api/enrollments/[id]/invoice/route.ts`, `src/app/api/payments/[id]/receipt/route.ts` | Puertas y Zod estricto |
| Ruta comercial | `src/server/enrollments.ts`, `src/app/api/enrollments/[id]/route.ts` | Estampa el autor si el número cambia (`case` en el `UPDATE`) |
| Pantalla | `src/app/(app)/facturacion/page.tsx`, `src/components/facturacion/facturacion-client.tsx`, `src/lib/nav.ts` | Ítem «Facturación» (Gestión, `cobranza.ver`) |
| Recibo en el roster | `src/components/cohorts/billing-panel.tsx` (+ `roster-client`, `cohort-tabs`, `cohorts/[id]/page.tsx`) | «anotar / corregir recibo» con `facturacion.editar` |
| Permisos | `src/lib/capabilities.ts`, `src/components/settings/roles-client.tsx`, `src/lib/guia.ts` | Capacidad, `sinFacturacion`, etiqueta, guía |

## Decisiones

- **DV-001** Pantalla propia `/facturacion` y no una pestaña de Finanzas:
  Finanzas es el cierre de un PERÍODO (caja/devengado); facturar es una
  bandeja de trabajo diaria sin período. Mismo grupo del menú, al lado.
- **DV-002** Visible con `cobranza.ver` (no "cualquiera de las dos"): el ítem
  del menú declara una sola capacidad y las filas llevan montos. La acción
  pide además `facturacion.editar`.
- **DV-003** Número repetido: avisa, no bloquea (ver spec). Solo es
  sospechoso entre personas distintas sin empresa en común.
- **DV-004** Autor en vez de fecha de factura: `invoice_recorded_at/_by` y
  `receipt_recorded_at/_by`. Se estampan solo si el número cambia; en la ruta
  comercial con un `case` que lee la fila vieja (verificado en Postgres).
- **DV-005** La regla vive en un módulo hoja: `facturacion.ts` importa
  `billing-notices.ts`, que importa `staff-notices.ts`; si la regla viviera en
  `facturacion.ts`, el aviso cerraría un ciclo.
- **DV-006** Filtros y CSV en el cliente con funciones puras: el CSV es
  exactamente lo que se ve. El servidor acota por madre/cohorte y por
  pestaña; a la escala de una academia (cientos de ventas) no hace falta
  paginar. Si "Facturadas" crece mucho, el paso siguiente es acotar por
  rango de inicio en el servidor.
- **DV-007** Roles creados a mano no reciben la capacidad en la migración:
  no pierden nada (la ruta comercial sigue) y el dueño decide.
- **DV-008** `facturacion.editar` NO entra en `FINANCIAL_CAPABILITIES`: esa
  lista define el texto del 403 de las rutas de plata y lo que soporte no
  tiene "por ser financiero"; a soporte se la quita `sinFacturacion`.

## Verificación

- Unit (Vitest): `facturacion.test.ts` (capacidad, normalización, regla
  compartida con `sinFacturar`, vista, filtros, totales, aviso de repetido,
  CSV, puertas, migración), `facturacion-servidor.test.ts` (las columnas
  exactas de cada `set`, hija 422, anulado 409, 404, mismo número sin
  escritura). Ajustados: `finanzas-periodo` (Administración 7 capacidades),
  `seed-roles` (0063 en los grants; el regex ahora va sentencia por
  sentencia), `rol-ventas` (sin `facturacion.editar`; `@/server/facturacion`
  es módulo de plata).
- Migración 0000→0063 con el migrador de la app sobre un cluster
  PostgreSQL 18 descartable; roles sembrados sin la capacidad; 0063 aplicada
  dos veces con psql: dirección, coordinación y administración la reciben una
  sola vez; soporte, ventas y un rol a mano no.
- El `case` del autor y la búsqueda de repetidos (`lower(btrim(...))`)
  probados con parámetros reales de postgres-js: número igual conserva autor
  y fecha; cambio, alta desde NULL y borrado los estampan.
- E2E: fuera de esta entrega por decisión del dueño.
