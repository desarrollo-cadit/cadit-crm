# Tasks: Avisos internos de cobranza

- [x] T001 Tests de las reglas puras (`tests/unit/avisos-cobranza.test.ts`) — rojo.
- [x] T002 `src/lib/staff-notices.ts`: tipos nuevos, `SujetoDeAviso`, `claveDeAviso`, encolado en `puedeReclamar`, helpers de HTML exportados.
- [x] T003 `src/lib/billing-notices.ts`: venta, destinatarios, semana ISO, reintentos, saldo, morosidad, correos — verde.
- [x] T004 Schema `staff_notice` (sujetos + `dedup_key`) y `pnpm db:generate`.
- [x] T005 Migración 0062 re-ejecutable: backfill, NOT NULL, índice único nuevo antes de soltar el viejo, CHECKs, FKs, RLS.
- [x] T006 Motor de 039 generalizado por sujeto (`reclamarAviso`, `cerrarAviso`, `mandarAviso`).
- [x] T007 `src/server/billing-notices-queue.ts` (encolar + `onAfterCommit`) y `src/server/billing-notices.ts` (envío, periódica).
- [x] T008 Disparadores: `createEnrollment`, conversión de lead, `recordPayment`; exclusiones: carga en bloque, demo.
- [x] T009 Una sola periódica (`runInternalNoticesForOrg`), sin variable nueva.
- [x] T010 Tests estructurales (`avisos-cobranza-servidor.test.ts`); mocks de la cola en `vendedores`/`enrollments`; 039 ajustado a `mandarAviso`.
- [x] T011 Textos: Configuración › Áreas (Administración), guía (`areas.configurar`, `cobranza.editar`), CLAUDE.md.
- [x] T012 Gate: `pnpm typecheck && pnpm lint && pnpm test` y `NEXT_DIST_DIR=.next-build pnpm build`.
- [x] T013 Migración + flujo contra una base descartable (como `cadit_app`, Graph falso).
- [ ] T014 Aplicar 0062 en la base de desarrollo con respaldo previo `backups/vocero-pre-0062-*.sql` (no se tocó la base compartida).
- [ ] T015 Producción: `STAFF_NOTICES_INTERVAL_MIN` > 0 para el reintento y el resumen semanal (sin ella, los avisos de venta y pago igual salen tras el commit).
