# Tasks: Vencimiento de accesos

- [x] T001 Tests puros (`vencimiento-de-accesos.test.ts`, `accesos-directos.test.ts`) — rojo.
- [x] T002 `src/lib/access-expiry.ts` (fechas, referencia, recorrido, estado, aviso) y `src/lib/offline-grants.ts` (planes, Zod); `pickVigentes` y `accesoOfflineDeContacto` en `offline-courses/logic.ts` — verde.
- [x] T003 Schema (`offline_course_grant`, `enrollment.access_until/_set_at/_set_by`, `contact.company_id`, `offline_quiz_attempt.enrollment_id` NULL-able) + `pnpm db:generate`; 0064 reescrita re-ejecutable con RLS y backfill.
- [x] T004 `src/server/access-expiry.ts` (`estadosDeAcceso`, por contacto y cohorte, `fijarAccesoHasta`).
- [x] T005 Corte en el alumno: `student-portal.ts` (detalle y próxima clase), `offline-courses/{access,student,submit}.ts`; actividad del staff con `everCourseIdsForContact`.
- [x] T006 Accesos directos (`offline-courses/grants.ts`) y portal por persona (`access.ts`); empresa del contacto (`contact-company.ts`, inscripción, `PATCH /api/contacts/[id]`).
- [x] T007 Rutas de staff con Zod estricto (`access-until`, `content-access` x2, `portal-access`, `offline-courses/[id]/{access,grants,grants/company}`, `offline-course-grants/[id]`).
- [x] T008 Tests de servidor y estructural (`vencimiento-de-accesos-{servidor,calculo,estructura}.test.ts`); ajustes de `especializaciones-portales` y `refresco-de-clases`.
- [x] T009 UI alumno: carteles, pestañas vencidas, "Disponible hasta el …", inicio sin inscripciones.
- [x] T010 UI staff: fecha por alumno en roster (+ aviso de cohorte sin fecha) y legajo, accesos directos y portal sin inscripción en el legajo, "Quiénes tienen acceso" con persona y empresa en el curso offline, empresa en el contacto.
- [x] T011 `scripts/accesos-que-vencen.sql` (solo lectura) probado antes de la 0064.
- [x] T012 Guía (`academico.editar`, `contactos.editar`) y CLAUDE.md (mapa + sección 043).
- [x] T013 Gate: `pnpm typecheck && pnpm lint && pnpm test` y `NEXT_DIST_DIR=.next-build pnpm build`.
- [x] T014 Migración, script y funciones del servidor contra un PostgreSQL 18 descartable.
- [ ] T015 ANTES de desplegar: correr `scripts/accesos-que-vencen.sql` contra producción con la fecha del deploy y revisar la lista con el dueño.
- [ ] T016 Aplicar 0064 en la base de desarrollo con respaldo previo `backups/vocero-pre-0064-*.sql` (no se tocó la base compartida).
- [ ] T017 (opcional) "Asignar a toda la empresa" también desde `/empresas`.
- [ ] T018 (opcional) Avisar por WhatsApp/correo unos días antes de que venza el acceso.
