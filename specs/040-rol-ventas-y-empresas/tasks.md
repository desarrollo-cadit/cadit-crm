# Tasks: Rol Ventas y datos de facturación de las empresas

- [x] T001 Tests del rol y de las capacidades (`rol-ventas.test.ts`, `capabilities.test.ts`, `seed-roles.test.ts`, `finanzas-periodo.test.ts`) — rojo.
- [x] T002 `empresas.editar`, `inscripciones.seguimiento` y el rol `ventas` en `capabilities.ts`; textos en la guía y en `/settings/roles` — verde.
- [x] T003 Las cuatro escrituras de seguimiento pasan a `inscripciones.seguimiento` (+ `bulk-sends-api.test.ts`).
- [x] T004 Tests de las reglas puras de la empresa (`empresa.test.ts`) — rojo.
- [x] T005 `src/lib/company.ts` — verde.
- [x] T006 Schema `company` + `pnpm db:generate` + migración 0061 a mano (columnas, CHECKs, rol, capacidades).
- [x] T007 `src/server/companies.ts` (alta, edición, duplicado) + `POST /api/companies` y `PATCH /api/companies/[id]` con `empresas.editar`.
- [x] T008 UI de Empresas: alta, edición y datos de facturación.
- [x] T009 `addTeamMember` devuelve `userId`; `POST /api/sellers/[id]/account`; vincular al editar en Ajustes → Vendedores.
- [x] T010 Pantallas en lectura: Académico (`canEdit`), aulas, roster, envíos masivos, Pipeline.
- [x] T010b DV-009: `hourlyRate` del profesor solo con `academico.editar` o `cobranza.ver` (test primero en `rol-ventas.test.ts`).
- [x] T011 CLAUDE.md (mapa del código).
- [x] T012 Gate: `pnpm typecheck && pnpm lint && pnpm test` y `NEXT_DIST_DIR=.next-build pnpm build`.
- [x] T013 Migración 0000→0061 (drizzle-kit) sobre un PostgreSQL 18 descartable; 0061 corrida tres veces: roles de sistema, rol creado a mano con y sin `inscripciones.ver`, `ventas` sembrado, CHECK de plazo con contado rechazado.
- [ ] T014 Aplicar 0061 en la base de desarrollo con respaldo previo (no lo hace el asistente).
