-- 012 (T022, FR-015) — Row-Level Security: la segunda red del aislamiento
-- entre organizaciones.
--
-- Hoy el aislamiento depende de que TODA consulta pase por `scoped()`. Si
-- alguien escribe una y se olvida, no falla nada: devuelve filas de todas las
-- organizaciones. RLS mueve esa garantía a la base, donde olvidarse no es una
-- opción.
--
-- ============================================================
-- ESTA MIGRACIÓN, POR SÍ SOLA, NO PROTEGE NADA. Y es a propósito.
-- ============================================================
-- Postgres SALTEA RLS para el dueño de la tabla y para los superusuarios, sin
-- avisar y sin error. La aplicación se conecta hoy como `postgres`, que es
-- dueño de las 35 tablas, `rolsuper` y además `rolbypassrls`. Verificado:
--
--     select tableowner from pg_tables where tablename='contact';  -> postgres
--     select rolsuper, rolbypassrls from pg_roles
--       where rolname='postgres';                                  -> t, t
--
-- Habilitar las políticas ahora deja el sistema EXACTAMENTE igual que antes.
-- Eso es lo buscado en este paso: la fase avanza sin riesgo de cortar el
-- servicio. Las políticas recién empiezan a filtrar en T027/T028, cuando la
-- app pase a conectarse como `cadit_app` —un rol sin privilegios especiales—.
--
-- Si alguien lee esta migración y concluye "ya tenemos RLS", se equivoca: eso
-- es peor que no tenerlo, porque es creerse cubierto sin estarlo.
--
-- ============================================================
-- LAS CUATRO TABLAS EXCLUIDAS, y por qué cada una
-- ============================================================
-- No es una lista de conveniencia: son las tablas que responden "¿de qué
-- organización es este usuario?", y por lo tanto se leen ANTES de que exista
-- una organización que declarar. Ponerles la política crea un huevo-y-gallina
-- del que no se sale: la sesión no resuelve y NADIE entra.
--
--   * `member`       — `resolveMembership()` la consulta por `user_id` para
--                      AVERIGUAR el `organization_id`. Es la raíz del arranque.
--   * `account_link` — `resolvePortalSession()` hace lo mismo para alumnos y
--                      profesores (012 fase 3).
--   * `role`         — viaja en el mismo `leftJoin` que `member`, antes de que
--                      se sepa la organización. Con la política puesta, el join
--                      no traería nada y cada sesión caería al mapeo de código
--                      EN SILENCIO, deshaciendo la fase 4 sin que nadie lo note.
--   * `invitation`   — la maneja Better Auth por token, fuera de nuestro
--                      control y sin contexto de organización.
--
-- Las cuatro siguen pasando por `scoped()` en el código, y ninguna guarda
-- datos personales ni de negocio: son permisos y vínculos.
--
-- ============================================================
-- Idempotente (constitución IV): `enable row level security` ya lo es, y la
-- política se borra antes de crearse porque `create policy` no admite
-- `if not exists`.

do $$
declare
  t text;
  -- Las 31 tablas de dominio. El alcance se midió, no se estimó:
  --   select table_name from information_schema.columns
  --   where column_name='organization_id' and table_schema='public';
  -- devuelve 35; estas son esas 35 menos las cuatro de arranque.
  tablas text[] := array[
    'agent_profile', 'agent_test_case', 'agent_test_run', 'assessment',
    'assessment_result', 'attendance', 'automation_rule', 'certificate',
    'class_session', 'cohort', 'cohort_software', 'company', 'contact',
    'conversation', 'course', 'course_category', 'course_module',
    'enrollment', 'installment', 'intake_form', 'kb_entry', 'license',
    'media_asset', 'message', 'meta_credentials', 'payment',
    'pipeline_stage', 'software', 'teacher', 'teacher_course', 'template'
  ];
begin
  foreach t in array tablas loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    -- `current_setting(..., true)` devuelve NULL si nadie la fijó, y comparar
    -- contra NULL da falso: una conexión que no declaró organización no ve
    -- NINGUNA fila. Ese es justamente el comportamiento buscado (FR-015) —
    -- fallar cerrado, no abierto.
    --
    -- `with check` va explícito aunque Postgres reusaría `using` si se omite:
    -- en una política de seguridad, entender qué protege no puede depender de
    -- recordar una regla del manual. Sin él, un INSERT podría escribir filas
    -- de otra organización.
    execute format(
      'create policy tenant_isolation on %I
         using (organization_id = current_setting(''app.current_org'', true))
         with check (organization_id = current_setting(''app.current_org'', true))',
      t
    );
  end loop;
end $$;
