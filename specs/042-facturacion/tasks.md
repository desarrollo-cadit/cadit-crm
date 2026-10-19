# Tasks: Facturación

- [x] T001 Tests (`tests/unit/facturacion.test.ts`, `tests/unit/facturacion-servidor.test.ts`) y ajustes de `finanzas-periodo`, `seed-roles`, `rol-ventas` — rojo.
- [x] T002 `facturacion.editar` en `CAPABILITIES`; `sinFacturacion` para soporte (semilla y respaldo); administración la recibe.
- [x] T003 `src/lib/facturacion-regla.ts` (hoja) y `src/lib/facturacion.ts` (vista, filtros, totales, repetidos, CSV); `csvField` a `src/lib/csv.ts`.
- [x] T004 `sinFacturar` (039) usa `pendienteDeFacturar`.
- [x] T005 Schema (`invoice_recorded_*`, `receipt_recorded_*`) + `pnpm db:generate`; 0063 reescrita re-ejecutable con los grants.
- [x] T006 `src/server/facturacion.ts` + rutas `GET /api/facturacion`, `PATCH /api/enrollments/[id]/invoice`, `PATCH /api/payments/[id]/receipt` — verde.
- [x] T007 Ruta comercial: estampa el autor solo si el número cambia.
- [x] T008 Pantalla `/facturacion` + ítem del menú; «anotar recibo» en Cuotas y pagos del roster.
- [x] T009 Etiqueta en Ajustes → Roles, guía, CLAUDE.md.
- [x] T010 Gate: `pnpm typecheck && pnpm lint && pnpm test` y `NEXT_DIST_DIR=.next-build pnpm build`.
- [x] T011 Migración y SQL del autor contra una base descartable.
- [ ] T012 Aplicar 0063 en la base de desarrollo con respaldo previo `backups/vocero-pre-0063-*.sql` (no se tocó la base compartida).
- [ ] T013 (opcional) «anotar recibo» también en Cuotas y pagos del taller.
