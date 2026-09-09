-- 012 (T029, DV-006) — Las cuentas pasan a los roles nuevos.
--
--   owner   -> direccion       (todas las capacidades)
--   member  -> coordinacion    (todas menos configuracion.editar)
--   soporte -> soporte         (ya coincide; no se toca)
--
-- ============================================================
-- ESTE ES EL PRIMER CAMBIO REAL DE PERMISOS DE TODO EL CICLO
-- ============================================================
-- Las fases 1 a 5 fueron deliberadamente neutras: renombraron, explicitaron y
-- protegieron, sin quitarle nada a nadie. Acá **coordinación pierde
-- `configuracion.editar`**, que es exactamente lo que la fase 1 pospuso
-- (`capabilities.ts`: "aplicarlo le quitaría configuración a un usuario
-- existente en silencio... la distinción llega en la fase 4/6").
--
-- Contexto medido: 1 owner, 1 member, 2 soporte. La cuenta afectada es UNA, y
-- lo que pierde es la pestaña de configuración de la instancia — no el acceso
-- a cursos, cobranza, inbox ni alumnos.
--
-- Si mañana se decide que coordinación sí debe configurar, ya NO hace falta
-- una migración: se tilda la capacidad en /settings/roles. Ese es el punto de
-- toda la fase 4.
--
-- ============================================================
-- Por qué se puede correr sin miedo
-- ============================================================
-- 1. **El código ya no compara nombres de rol.** Antes de esta migración se
--    eliminaron los `session.role !== "owner"` de `settings/branding` y
--    `settings/team`: con ellos vivos, el dueño pasaba a `direccion` y quedaba
--    afuera de su propia configuración con un 403.
-- 2. **El alta de cuentas ya no usa un enum fijo.** `settings/team` validaba
--    `z.enum(["member","soporte"])`; después de esta migración `member` deja
--    de existir como llave, así que cada cuenta nueva habría nacido con un rol
--    sin mapear y —por el respaldo en código— con TODAS las capacidades.
-- 3. Solo toca filas cuyo rol coincide, y los roles destino ya están sembrados
--    (migración 0024).
--
-- Idempotente: correrla dos veces no encuentra nada que cambiar.

update "member" set "role" = 'direccion'
where "role" = 'owner'
  and exists (
    select 1 from "role" r
    where r."organization_id" = "member"."organization_id"
      and r."key" = 'direccion'
  );--> statement-breakpoint

update "member" set "role" = 'coordinacion'
where "role" = 'member'
  and exists (
    select 1 from "role" r
    where r."organization_id" = "member"."organization_id"
      and r."key" = 'coordinacion'
  );
