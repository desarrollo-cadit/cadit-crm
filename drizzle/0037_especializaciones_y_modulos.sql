-- 028 fase 1 — Especializaciones y módulos: las dos auto-referencias y la
-- dispensa de asistencia.
--
-- Nueve columnas, dos índices y dos CHECK. Ninguna tabla.
--
-- Qué agrega y por qué:
--
--   `cohort.parent_cohort_id` + `cohort.position` (FR-001, FR-002)
--     La ESTRUCTURA del programa. La camada de la especialización es el padre;
--     cada módulo es una cohorte hija, porque un módulo tiene profesor,
--     fechas, clases, evaluaciones y asistencia propias — que es exactamente
--     lo que una cohorte ya sabe llevar desde el ciclo 004. `position` es el
--     orden pedagógico y NO se deduce de `start_date`: dos módulos pueden
--     solaparse en el calendario.
--
--   `enrollment.parent_enrollment_id` (FR-006, FR-008)
--     El RECORRIDO de la persona. La madre lleva el paquete cerrado (monto,
--     moneda, plan de cuotas); hay una hija por módulo cursado, y el
--     `cohort_id` de esa hija apunta a la corrida que la persona REALMENTE
--     cursó — que puede pertenecer a otra especialización. Esa separación es
--     lo que vuelve representables la baja voluntaria y la recursada.
--
--   `enrollment.attendance_waiver_*` (FR-022, FR-023, DV-003, DV-004)
--     La dispensa de asistencia: habilita la aprobación de UN módulo pese a
--     no alcanzar el mínimo. Nunca un booleano suelto — quién, cuándo y por
--     qué—, con el trío de revocación que el ciclo 010 le dio al certificado.
--     Sin autor ni motivo, una dispensa es indistinguible de un error de
--     cálculo.
--
-- ============================================================
-- RLS: NO hay nada que escribir a mano, y por qué se dice igual (FR-034)
-- ============================================================
-- **Esta migración no crea ninguna tabla.** Por lo tanto NO lleva
-- `enable row level security` ni política `tenant_isolation`.
--
-- Queda escrito porque la regla es la que todo el mundo olvida:
-- `pnpm db:generate` produce tablas, columnas e índices y deja las políticas
-- AFUERA. Al agregar una tabla de dominio hay que sumarlas a mano acá, y
-- `tests/unit/rls-cobertura.test.ts` falla si alguien no lo hace. El próximo
-- que copie este archivo como plantilla para agregar una tabla tiene que
-- tropezarse con el párrafo, no enterarse por el test en rojo.
--
-- El aislamiento de `cohort` y de `enrollment` ya existe desde la 0025, y las
-- nueve columnas nuevas viven adentro de él: son columnas de filas que la
-- política ya filtra por `organization_id`.
--
-- ============================================================
-- RE-EJECUTABLE (constitución IV, Principio IV — FR-035)
-- ============================================================
-- Correrla dos veces no puede fallar ni pisar datos:
--   * cada columna con `add column if not exists`;
--   * cada índice con `create index if not exists`;
--   * cada FK y cada CHECK dentro de un `do $$` que consulta `pg_constraint`
--     antes de agregar — `alter table ... add constraint` no acepta
--     `if not exists` en PostgreSQL.
-- El SQL que emitió `db:generate` no tenía ninguna de las tres cosas; se
-- agregaron a mano, como en la 0036.
--
-- ============================================================
-- SIN REGRESIÓN (FR-032)
-- ============================================================
-- Las nueve columnas son NULLABLE y sin DEFAULT. Una fila existente las
-- satisface sin que esta migración la toque: no hay UPDATE, no hay backfill y
-- no hay valor inventado para las 41 cohortes y las 384 inscripciones reales.
-- Con las dos auto-referencias en NULL —que es como nacen— el comportamiento
-- es idéntico al de antes de este archivo (FR-033: la condición es un dato
-- ausente, no una bandera que alguien pueda encender por error).
--
-- Los dos CHECK sólo prohíben `parent = id`, que ninguna fila existente
-- cumple: no pueden hacer fallar el `alter table` sobre los datos reales.

alter table "cohort" add column if not exists "parent_cohort_id" text;--> statement-breakpoint
alter table "cohort" add column if not exists "position" integer;--> statement-breakpoint
alter table "enrollment" add column if not exists "parent_enrollment_id" text;--> statement-breakpoint
alter table "enrollment" add column if not exists "attendance_waiver_at" timestamp;--> statement-breakpoint
alter table "enrollment" add column if not exists "attendance_waiver_by" text;--> statement-breakpoint
alter table "enrollment" add column if not exists "attendance_waiver_reason" text;--> statement-breakpoint
alter table "enrollment" add column if not exists "attendance_waiver_revoked_at" timestamp;--> statement-breakpoint
alter table "enrollment" add column if not exists "attendance_waiver_revoked_by" text;--> statement-breakpoint
alter table "enrollment" add column if not exists "attendance_waiver_revoke_reason" text;--> statement-breakpoint

-- Las cuatro claves foráneas. `restrict` en las auto-referencias: borrar una
-- camada padre con módulos colgando, o una madre con hijas, dejaría huérfano
-- el programa o el recorrido entero. `set null` en el autor de la dispensa,
-- igual que en `certificate.issued_by`: que alguien deje la academia no borra
-- el acto que firmó.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cohort_parent_cohort_id_cohort_id_fk') then
    alter table "cohort" add constraint "cohort_parent_cohort_id_cohort_id_fk"
      foreign key ("parent_cohort_id") references "public"."cohort"("id")
      on delete restrict on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'enrollment_parent_enrollment_id_enrollment_id_fk') then
    alter table "enrollment" add constraint "enrollment_parent_enrollment_id_enrollment_id_fk"
      foreign key ("parent_enrollment_id") references "public"."enrollment"("id")
      on delete restrict on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'enrollment_attendance_waiver_by_user_id_fk') then
    alter table "enrollment" add constraint "enrollment_attendance_waiver_by_user_id_fk"
      foreign key ("attendance_waiver_by") references "public"."user"("id")
      on delete set null on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'enrollment_attendance_waiver_revoked_by_user_id_fk') then
    alter table "enrollment" add constraint "enrollment_attendance_waiver_revoked_by_user_id_fk"
      foreign key ("attendance_waiver_revoked_by") references "public"."user"("id")
      on delete set null on update no action;
  end if;
end $$;--> statement-breakpoint

-- Por acá se camina el árbol: "los módulos de esta camada, en orden" y "las
-- hijas de este recorrido". Org primero, como el resto de las tablas de
-- dominio: toda lectura filtra por organización antes que nada.
create index if not exists "cohort_org_parent_idx" on "cohort" using btree ("organization_id","parent_cohort_id","position");--> statement-breakpoint
create index if not exists "enrollment_org_parent_idx" on "enrollment" using btree ("organization_id","parent_enrollment_id");--> statement-breakpoint

-- Los dos CHECK: nadie es su propio padre (FR-004, FR-009).
--
-- Van a la base porque miran UNA sola fila, cuestan una línea y cubren el
-- error más tonto. No inauguran ningún mecanismo: el repositorio ya tiene
-- `account_link_kind_coherente` (0023) y `resource_contenedor_unico`
-- (0030/0035).
--
-- Lo que NO está acá es "un solo nivel de anidamiento": exige mirar OTRA fila
-- y no es expresable en un CHECK. Vive en `src/server/program-modules.ts`,
-- con test. Un trigger sería el primero del proyecto —hoy hay 0—, quedaría
-- fuera de Drizzle y de los tests de TypeScript, y nadie recordaría que
-- existe hasta el día que rechace algo sin explicar qué.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cohort_padre_distinto_de_si') then
    alter table "cohort" add constraint "cohort_padre_distinto_de_si"
      check ("cohort"."parent_cohort_id" is null or "cohort"."parent_cohort_id" <> "cohort"."id");
  end if;
  if not exists (select 1 from pg_constraint where conname = 'enrollment_madre_distinta_de_si') then
    alter table "enrollment" add constraint "enrollment_madre_distinta_de_si"
      check ("enrollment"."parent_enrollment_id" is null or "enrollment"."parent_enrollment_id" <> "enrollment"."id");
  end if;
end $$;
