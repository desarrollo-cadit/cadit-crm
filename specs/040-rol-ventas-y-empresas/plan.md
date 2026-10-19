# Implementation Plan: Rol Ventas y datos de facturación de las empresas

**Spec**: [spec.md](./spec.md) · **Migración**: `drizzle/0061_rol_ventas_y_empresas.sql`

## Constitución

- **I (seguridad)**: un dato que no se debe ver NO VIAJA. Ventas no recibe
  ninguna capacidad financiera, y la plata ya se arma solo con `cobranza.ver`
  en cada DTO; un test estructural lo fija (`rol-ventas.test.ts`).
- **III (multi-tenancy)**: sin tabla nueva. `company` ya tiene
  `tenant_isolation`; toda consulta nueva va por `scoped()`.
- **IV (idempotencia)**: migración re-ejecutable (`add column if not exists`,
  CHECKs dentro de `do $$` contra `pg_constraint`, `on conflict do nothing`
  para el rol, `update … where not (capabilities @> …)` para las capacidades).

## Estructura

| Capa | Archivo | Qué hace |
|---|---|---|
| Capacidades | `src/lib/capabilities.ts` | `empresas.editar`, `inscripciones.seguimiento`, rol `ventas` en `SYSTEM_ROLES`; soporte sin `empresas.editar` (también en el respaldo) |
| Reglas puras | `src/lib/company.ts` | Esquema Zod de la empresa, RUT por país, normalización del RUT, condición de pago |
| Servidor | `src/server/companies.ts` | `createCompany`, `updateCompany` (409 por RUT duplicado, 404), `serializeCompany` con todos los campos |
| API | `src/app/api/companies/route.ts`, `src/app/api/companies/[id]/route.ts` | POST/PATCH con `empresas.editar`; GET sigue con `contactos.ver` |
| Seguimiento | 4 rutas (DV-001) | `inscripciones.ver` → `inscripciones.seguimiento` |
| Vendedores | `src/server/team.ts` (`addTeamMember` devuelve `userId`), `src/server/sellers.ts` (`darCuentaAVendedor`), `src/app/api/sellers/[id]/account/route.ts` | Cuenta del panel con rol Ventas |
| UI | `src/components/companies/companies-client.tsx` (+ `company-form.tsx`), `src/components/settings/sellers-client.tsx`, `academic-client.tsx`, `roster-client.tsx`, `bulk-sends-panel.tsx`, `pipeline-client.tsx` | Alta/edición de empresas; cuenta del vendedor; pantallas en lectura |
| Textos | `src/lib/guia.ts`, `src/components/settings/roles-client.tsx` | Entradas de las dos capacidades; grupo "Comercial y financiero" incluye `empresas.` |
| Esquema | `src/lib/db/schema.ts` + `drizzle/0061_*.sql` | Columnas de `company`, rol, capacidades |

## Verificación

- Unit (Vitest), primero en rojo: `rol-ventas.test.ts` (rol, plata, rutas en
  lectura), `empresa.test.ts` (reglas puras de la empresa),
  `capabilities.test.ts`, `seed-roles.test.ts`, `finanzas-periodo.test.ts`,
  `bulk-sends-api.test.ts`; y los guards de siempre (`route-capabilities`,
  `rls-cobertura`, `tema-oscuro`).
- Migración aplicada (0000→0061) y re-ejecutada sobre un PostgreSQL
  descartable, si hay uno disponible.
- E2E: fuera de esta entrega por decisión del dueño.
