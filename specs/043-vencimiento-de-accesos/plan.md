# Implementation Plan: Vencimiento de accesos

**Spec**: [spec.md](./spec.md) · **Migración**: `drizzle/0064_vencimiento_de_accesos.sql`

## Constitución

- **I (seguridad)**: un dato que no se debe ver no viaja. El corte está en el
  servidor (`student-portal.ts`, `offline-courses/{access,student,submit}.ts`):
  vencido, el material y los avisos ni se consultan, la grabación y el enlace
  salen `null`, y un curso offline vencido responde 404 (nunca 403).
- **II (soberanía)**: sin dependencias nuevas; `Intl` para la zona.
- **III (multi-tenancy)**: tabla nueva `offline_course_grant` con
  `organization_id` NOT NULL, RLS y `tenant_isolation` escritas a mano en la
  0064; toda consulta por `scoped()`. Las rutas corren en la transacción de
  `requireCapability`.
- **IV (idempotencia)**: 0064 re-ejecutable (tabla, columnas e índices
  `if not exists`; FKs/CHECK contra `pg_constraint`; backfill solo sobre
  vacías). Asignar a una empresa es idempotente y nunca acorta.
- Capacidades, no roles: sin capacidades nuevas; ninguna comparación por rol.
- Tres puertas: las rutas de staff usan `requireCapability`; el portal del
  alumno no ganó rutas (FR-025 de 030 sigue valiendo).

## Estructura

| Capa | Archivo | Qué hace |
|---|---|---|
| Reglas puras | `src/lib/access-expiry.ts` | Día de calendario, `sumarMeses` (fin de mes), referencia de cohorte y de recorrido, `estadoDeAcceso`, `avisoDeAcceso`, `formatearDia`, `hoyEnZona` |
| Reglas puras | `src/lib/offline-grants.ts` | `diaDeAccesoSchema` (Zod), `planAsignacionIndividual`, `planAsignacionPorEmpresa` |
| Reglas puras | `src/server/offline-courses/logic.ts` | `pickVigentes`, `accesoOfflineDeContacto` (unión con la fecha más tarde) |
| Servidor | `src/server/access-expiry.ts` | `estadosDeAcceso` (madre/hijas/módulos/última clase), por contacto y por cohorte; `fijarAccesoHasta` |
| Servidor | `src/server/offline-courses/access.ts` | `offlineAccessForContact`, `effectiveAccessByEnrollment` (vigentes + directos), `everCourseIdsForContact` (staff) |
| Servidor | `src/server/offline-courses/grants.ts` | Quiénes tienen acceso, accesos de una persona, dar/cambiar/quitar, empresa (vista previa y aplicar) |
| Servidor | `src/server/student-portal.ts` | `access` en cada cursada, corte en el detalle y en la próxima clase |
| Servidor | `src/server/offline-courses/{student,submit}.ts` | Lecturas con fecha; intento sin inscripción si llega por acceso directo |
| Servidor | `src/server/access.ts` | Portal por persona (`grantPortalAccessToContact`, `portalAccessStateForContact`); `validateAccountLink` acepta acceso directo |
| Servidor | `src/server/contact-company.ts`, `src/server/enrollments.ts`, `src/server/contacts.ts` | Empresa del contacto: completa, nunca pisa; DTO |
| Rutas | `api/enrollments/[id]/access-until`, `api/cohorts/[id]/content-access`, `api/contacts/[id]/{content-access,portal-access}`, `api/offline-courses/[id]/{access,grants,grants/company}`, `api/offline-course-grants/[id]`, `api/contacts/[id]` (PATCH `companyId`) | Puertas y Zod estricto |
| UI alumno | `src/components/portal/access-notice.tsx`, `student-course-client.tsx`, `student-dashboard.tsx`, `student-offline-courses.tsx` | Carteles, pestañas vencidas, "Disponible hasta el …", inicio sin inscripciones |
| UI staff | `src/components/access/{content-access,direct-grants}.tsx`, `cohorts/roster-client.tsx`, `contacts/{student-record-client,student-tabs,contacts-client}.tsx`, `offline-courses/course-access-panel.tsx`, `cursos-offline/[id]/page.tsx`, `contacts/[id]/legajo/page.tsx` | Fecha por alumno, cohorte sin fecha, accesos directos, portal sin inscripción, empresa del contacto, "Quiénes tienen acceso" |
| Ops | `scripts/accesos-que-vencen.sql` | Quién pierde el acceso a una fecha (solo lectura) |
| Docs | `CLAUDE.md`, `src/lib/guia.ts` | Mapa del código, sección 043, guía de `academico.editar` y `contactos.editar` |

## Decisiones

- **DV-001 Derivado, no guardado.** El vencimiento sale de comparar fechas al
  leer. No hay columna `vencido`, ni cron, ni revocación: nada que se olvide
  de correr ni que quede desincronizado. Lo único guardado es la excepción
  (`access_until`) y los accesos directos (que son decisiones, no estado).
- **DV-002 Un mes calendario, inclusive, en la zona de la organización.**
  `referencia + 1 mes` recortado a fin de mes; el corte es el fin de ese día
  (`classEndsAt(hasta, null, tz)`), así no hay segunda fórmula de zona.
- **DV-003 Sin referencia, no vence.** Una cohorte sin fin ni clases no tiene
  cuándo vencer; inventar una fecha le quitaría el acceso a alguien por un
  dato que falta. El roster lo avisa para que se cargue.
- **DV-004 Especialización: un vencimiento por recorrido**, el del último
  módulo, y "sin fecha" si un módulo no la tiene (US3). La fecha manual vive
  en la madre (422 en la hija), igual que la factura en 042.
- **DV-005 El aviso al alumno**: los últimos 31 días y una vez vencido. Un
  "hasta el" permanente sobre una fecha lejana es ruido.
- **DV-006 Profesor sin cambios.** El vencimiento es sobre lo que el alumno
  compró; el profesor necesita sus cohortes para corregir y contestar.
- **DV-007 `academico.editar`** para fechas y accesos directos (no
  `inscripciones.editar`, que también cambia montos; no una capacidad nueva:
  es exactamente quien ya asigna cursos offline a cohortes e inscripciones).
- **DV-008 Acceso directo = de la persona, en tabla propia.** No se reusa
  `offline_course_access` (su CHECK exige cohorte o inscripción y su modo
  `grant/revoke` es una excepción dentro de la cohorte). Así 035 no lo bloquea
  ni lo borra, y un acceso directo gana sobre una quita de cohorte.
- **DV-009 Fecha obligatoria** en el acceso directo, y no puede haber pasado al
  crearlo. Cambiarla después sí puede acortarlo (decisión de a una persona).
- **DV-010 Empresa en bloque = accesos individuales**, re-planeados en el
  servidor al confirmar; nunca acorta (también en el `UPDATE`). Quien entra a
  la empresa después no hereda nada: no hay "acceso de empresa" vivo.
- **DV-011 Intento sin inscripción.** `offline_quiz_attempt.enrollment_id`
  pasa a NULL-able: un acceso directo no cuelga de una inscripción y los
  intentos ya se contaban por persona. Las vistas de intentos por cohorte o
  inscripción siguen igual (el `inner join` deja afuera los directos).
- **DV-012 Empresa del contacto: completa, nunca pisa.** Al inscribir (y al
  cambiar la empresa de una venta) solo si estaba vacía; se corrige en el
  contacto con `contactos.editar`.
- **DV-013 Ruta aparte para las fechas del roster y del legajo**
  (`content-access`): no engorda el roster ni el legajo, y responde con
  `academico.ver` (Ventas ve, no cambia).
- **DV-014 La actividad del staff** usa `everCourseIdsForContact`: lo que la
  persona tuvo, no lo que hoy puede abrir.
- **DV-015 Script en SQL** (no TS): se corre antes de desplegar, cuando la
  0064 todavía no está; por eso no lee `access_until` (que no existe aún y
  estaría vacía). Vistas temporales + ROLLBACK (Postgres no permite crear ni
  vistas temporales en una transacción `read only`).

## Verificación

- Unit (Vitest), TDD en lo puro (rojo primero):
  `vencimiento-de-accesos.test.ts` (23: fin de mes 31/01→28/02, bisiesto,
  zona, referencia, especialización, manual más tarde y más temprano, aviso),
  `accesos-directos.test.ts` (14: unión con vencimiento, 035, fecha más tarde,
  planes individual y de empresa, idempotencia, Zod).
- Servidor con dobles de base: `vencimiento-de-accesos-servidor.test.ts` (9:
  detalle vigente/vencido —sin material ni avisos, ni consultados—, inicio,
  portal sin inscripciones, unión offline, intento 404 vencido y sin
  inscripción por acceso directo), `vencimiento-de-accesos-calculo.test.ts`
  (7: madre/hijas, módulo sin fecha, manual con autor, 422 en hija, columnas
  exactas del `set`).
- Estructural: `vencimiento-de-accesos-estructura.test.ts` (14: toda ruta de
  `api/portal/me` clasificada como CONTENIDO o LOGRO y cada CONTENIDO pasa por
  el corte; el profesor no lo lee).
- Ajustados: `especializaciones-portales` (doble de `access-expiry`: no es lo
  que prueba), `refresco-de-clases` (la próxima clase del detalle ahora es
  `vencida ? null : pickNextClass(...)`).
- PostgreSQL 18 descartable (scratchpad, puerto 5499): migraciones
  0000→0063 con el migrador de la app, datos de prueba, el script
  `accesos-que-vencen.sql` antes de la 0064 (a 2026-10-20: 1 persona, Revit
  Julio hasta 2026-09-30, "Revit Sin Fecha" no vence; a 2026-10-26 se suma
  EBIM 13 hasta 2026-10-25), 0064 con psql y DESPUÉS con el migrador (dos
  veces, sin error), backfill (`ct1=cx`, la empresa más reciente), RLS
  habilitada con `tenant_isolation`, `enrollment_id` NULL-able. Las funciones
  del servidor contra esa base (30 comprobaciones, "TODO OK"): fechas de
  cohorte simple, sin fin (última clase no cancelada), sin fecha,
  especialización y herencia, fecha manual y 422 en hija, acceso directo y
  `fecha_pasada`, empresa (2 creados → idempotente → extiende 2 → no acorta),
  quiénes tienen acceso, quitar dos veces (404), portal vencido y sin
  inscripciones.
- Gate: `pnpm typecheck && pnpm lint && pnpm test` (217 archivos, 3085
  tests) y `NEXT_DIST_DIR=.next-build pnpm build`, verdes.
- E2E: fuera de esta entrega por decisión del dueño.
