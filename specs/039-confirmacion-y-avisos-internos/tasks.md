# Tasks: Confirmación de cohortes y avisos internos

- [x] T001 Tests de las reglas puras (`tests/unit/avisos-internos.test.ts`) — rojo.
- [x] T002 `src/lib/staff-notices.ts`: ventanas, idempotencia, destinatarios, sin facturar, correos — verde.
- [x] T003 Tests de `cohortes.confirmar` (capabilities, seed-roles, finanzas-periodo) — rojo.
- [x] T004 `cohortes.confirmar` en `capabilities.ts` (dirección, coordinación), etiqueta en `/settings/roles`, guía.
- [x] T005 Test del área Administración (`area-administracion.test.ts`) — rojo.
- [x] T006 `CONFIG_AREAS`, `getAllAreaConfigs`, `PUT /api/settings/areas/administracion`; agente sin cambios.
- [x] T007 Schema: `cohort.confirmed_at/by`, `area_config` con `administracion`, `staff_notice`; `pnpm db:generate`.
- [x] T008 Migración 0060 re-ejecutable + RLS + backfill de la capacidad.
- [x] T009 `src/server/staff-notices.ts` (reclamo CAS, envío fuera de transacción, periódica) y `STAFF_NOTICES_INTERVAL_MIN`.
- [x] T010 `src/server/cohort-confirmation.ts` + `/api/cohorts/[id]/confirmation`.
- [x] T011 UI: `cohort-confirmation.tsx` en el encabezado; insignia en Académico.
- [x] T012 Tests del temporizador y reglas estructurales (`avisos-internos-servidor.test.ts`).
- [x] T013 Gate: `pnpm typecheck && pnpm lint && pnpm build && pnpm test`.
- [x] T014 Migración + flujo contra una base descartable.
- [ ] T015 `.env.example`: agregar `STAFF_NOTICES_INTERVAL_MIN` (el archivo está bloqueado para el asistente; texto en el reporte).
- [ ] T016 Aplicar 0060 en la base de desarrollo (Docker apagado al implementar) con respaldo previo `backups/vocero-pre-0060-*.sql`.
- [x] T017 Pantalla Configuración › Áreas (`/settings/areas`, sin E2E por decisión del dueño).
