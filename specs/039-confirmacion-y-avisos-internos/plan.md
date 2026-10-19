# Implementation Plan: Confirmación de cohortes y avisos internos

**Spec**: [spec.md](./spec.md) · **Migración**: `drizzle/0060_confirmacion_y_avisos.sql`

## Constitución

- **II (soberanía)**: el correo sale por el adaptador M365 existente
  (`src/lib/m365`). Sin colas ni cron externos: periódica in-process, mismo
  diseño que `workshop-reminders.ts`.
- **III (multi-tenancy)**: `staff_notice.organization_id` NOT NULL, RLS a mano
  en la migración, toda consulta por `scoped()`; la periódica abre
  `withOrganizationScope` por organización.
- **IV (idempotencia)**: UNIQUE `(organization_id, cohort_id, kind)` +
  reclamo compare-and-swap; migración re-ejecutable.

## Estructura

| Capa | Archivo | Qué hace |
|---|---|---|
| Reglas puras | `src/lib/staff-notices.ts` | Ventanas T-7/T-2, `puedeReclamar`, `avisosQueTocan`, destinatarios, `sinFacturar`, armado de los correos (HTML escapado), DTOs de la pantalla |
| Confirmación | `src/server/cohort-confirmation.ts` | `confirmarCohorte`, `quitarConfirmacion`, `estadoDeConfirmacion` (dentro de la transacción del pedido) |
| Avisos | `src/server/staff-notices.ts` | `enviarAviso` (reclamar → mandar fuera de transacción → registrar), `cancelarAvisosDeFacturacion`, `runStaffNoticesForOrg`, temporizador |
| Arranque | `src/instrumentation-node.ts` | `startStaffNoticesOnBoot` con `shouldStartScheduler` |
| API | `src/app/api/cohorts/[id]/confirmation/route.ts` | GET (`academico.ver`), POST/DELETE (`cohortes.confirmar`) |
| UI | `src/components/cohorts/cohort-confirmation.tsx` (+ `cohort-header.tsx`, `academic-client.tsx`) | Estado, botones, diálogo; insignia en el listado |
| Áreas | `src/lib/areas.ts` (`CONFIG_AREAS`), `src/server/areas/config.ts` (`getAllAreaConfigs`) | Administración configurable; `AREAS`/`getAreaConfigs` (agente) sin cambios |

## Decisiones

- **DV-001** Confirmación como columnas y no como `status`: `status` se
  calcula por fechas y lo tipan portales, perfil del agente y filtros.
- **DV-002** `CONFIG_AREAS` separado de `AREAS`: el agente elige de `AREAS`
  (`z.enum(AREAS)` en `derive_area`) y el prompt lee `getAreaConfigs`, que
  sigue devolviendo solo Ventas y Soporte. Hay test.
- **DV-003** El estado `pending` existe además de los cuatro pedidos: es el
  reclamo en vuelo y lo que "quitar la confirmación" cancela.
- **DV-004** M365 sin configurar → `skipped / correo_sin_configurar` (no
  `failed`): reintentar no lo arregla; volver a confirmar sí lo reintenta.
- **DV-005** Contenido del correo armado en código puro (no en
  `docs/email-templates/`): es interno, tabular y se prueba sin archivos.

## Verificación

- Unit (Vitest): `avisos-internos.test.ts` (reglas puras),
  `avisos-internos-servidor.test.ts` (temporizador y reglas estructurales),
  `area-administracion.test.ts`, `capabilities.test.ts`, `seed-roles.test.ts`,
  `rls-cobertura.test.ts`, `route-capabilities.test.ts`.
- Migración aplicada (0000→0060) y re-ejecutada sobre un cluster PostgreSQL 18
  descartable; flujo completo (confirmar, Soporte, T-2, T-7 tardío, fallo de
  Graph, cancelar, reconfirmar, 404, área apagada) contra esa base con un
  Graph falso.
- E2E: fuera de esta entrega por decisión del dueño.
