# Tasks: Calendario por profesor

- [x] T001 Tests puros `tests/unit/carga-docente.test.ts` (filtro, profesor efectivo, carga: superposición, sin horario, canceladas, suplencia, proyectadas) — rojo.
- [x] T002 `src/lib/teacher-load.ts` — verde.
- [x] T003 Test de servidor en `calendario-rango.test.ts` (suplencia, proyección con profesor de cohorte, filtro, sin `hourlyRate`) — rojo.
- [x] T004 `listCalendarClasses` con `teacherId`/`teacherName` y filtro; `/api/calendar` con `teacherIds` (Zod) y `teachers`.
- [x] T005 UI: filtro múltiple, `?profesor=` en la URL, profesor en el bloque, panel de carga semanal.
- [x] T006 CLAUDE.md (mapa de código).
- [x] T007 Gate: `pnpm typecheck && pnpm lint && pnpm test` y `NEXT_DIST_DIR=.next-build pnpm build`.
