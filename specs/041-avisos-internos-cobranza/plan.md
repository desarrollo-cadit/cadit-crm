# Implementation Plan: Avisos internos de cobranza

**Spec**: [spec.md](./spec.md) · **Migración**: `drizzle/0062_avisos_internos_cobranza.sql`

## Constitución

- **II (soberanía)**: el correo sale por el adaptador M365 existente; sin
  colas ni cron externos (la periódica in-process de 039).
- **III (multi-tenancy)**: `staff_notice` conserva `organization_id` NOT NULL
  y su política `tenant_isolation` (re-declarada en la 0062); toda consulta
  por `scoped()`; la periódica y el envío abren `withOrganizationScope`.
- **IV (idempotencia)**: `dedup_key` UNIQUE por organización + reclamo
  compare-and-swap; migración re-ejecutable (verificada dos veces).

## Estructura

| Capa | Archivo | Qué hace |
|---|---|---|
| Reglas puras (039, extendidas) | `src/lib/staff-notices.ts` | Tipos nuevos, `SujetoDeAviso`, `claveDeAviso`, `columnasDelSujeto`, `sujetoDeRegistro`; helpers de HTML exportados; `puedeReclamar` con el encolado |
| Reglas puras (041) | `src/lib/billing-notices.ts` | `esVentaParaAviso`, `pasaAVenta`, `destinatariosDeVenta`, `semanaIso`, `resumenSemanalQueToca`, `reintentoDeEventoQueToca`, `saldoPorMoneda`, `resumirMorosidad`, armado de los tres correos |
| Motor (039, generalizado) | `src/server/staff-notices.ts` | `leerRegistroDeAviso`, `reclamarAviso`, `cerrarAviso`, `mandarAviso` por sujeto; la periódica llama a `runInternalNoticesForOrg` |
| Cola | `src/server/billing-notices-queue.ts` | `avisarAAdministracion`: encola en la transacción y manda con `onAfterCommit` (import dinámico) |
| Avisos (041) | `src/server/billing-notices.ts` | Lecturas, `enviarAvisoDeCobranza`, `avisosDeCobranzaPendientes`, `runBillingNoticesForOrg`, `runInternalNoticesForOrg` |
| Disparadores | `src/server/enrollments.ts`, `src/app/api/pipeline/leads/[id]/route.ts`, `src/server/billing.ts` | Venta nueva, lead convertido, pago |
| Exclusiones | `src/server/billing-bulk.ts`, `scripts/demo-camada.ts` | `avisoInterno: false` |
| Ayuda | `src/lib/area-config-form.ts`, `src/lib/guia.ts` | Lo que le llega a Administración |

## Decisiones

- **DV-001** `dedup_key` en vez de sumar columnas a la UNIQUE de 039: una
  sola llave para cuatro clases de sujeto; el backfill `kind:cohort_id` es
  exactamente `claveDeAviso` de 039, así que nada ya enviado se reabre.
- **DV-002** Encolar en la transacción (outbox) además de `onAfterCommit`:
  sin la fila, un proceso caído entre el commit y el envío perdería el aviso,
  y la periódica no puede "descubrir" ventas sin confundirlas con
  importaciones (que también tienen `created_at` reciente).
- **DV-003** `billing-notices-queue.ts` no importa nada de `src/server`:
  `billing.ts` lo importa, y `billing-notices.ts` importa `billing.ts`
  (`listInstallments`). `tests/unit/ciclos-import.test.ts` lo exige.
- **DV-004** El resumen tiene su propia agregación pura en vez de reusar
  `listOverdue`: aquel agrupa por inscripción y podría mezclar monedas si una
  inscripción tiene cuotas en dos. La regla de "qué está vencido" es la misma.
- **DV-005** Sin Administración configurada se omite el aviso de venta entero
  (no se le manda solo al vendedor un correo que es para facturar).
- **DV-006** Lunes desde las 08:00: el correo llega al empezar el día hábil.

## Verificación

- Unit (Vitest): `avisos-cobranza.test.ts` (reglas puras, 46 casos),
  `avisos-cobranza-servidor.test.ts` (estructura: cola, disparadores,
  exclusiones, migración), `avisos-internos*.test.ts` (039 sigue verde),
  `area-config-form.test.ts`, `vendedores.test.ts`, `enrollments.test.ts`,
  `ciclos-import.test.ts`.
- Migración 0000→0061 con el migrador de drizzle sobre un cluster
  PostgreSQL 18 descartable, fila de 039 sembrada, 0062 aplicada y
  re-aplicada (psql + migrador): backfill `facturacion_t7:coh_x`, índices,
  CHECKs y RLS correctos.
- Flujo completo contra esa base conectado como `cadit_app` (RLS) con un
  Graph falso: venta con empresa y vendedor con cuenta, taller y
  `avisoInterno: false` sin aviso, alta revertida sin aviso, pago con saldo,
  idempotencia, Graph caído + reintento, pago anulado, resumen semanal (antes
  de las 08:00 no; después sí; no se repite), organización sin morosos, RLS,
  área apagada. 23/23 OK.
- E2E: fuera de esta entrega por decisión del dueño.
