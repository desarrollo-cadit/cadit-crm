-- 2026-10-26 — Avisos internos por correo, por persona.
--
--   `member.receives_internal_notices` (default true): quien la apaga deja de
--   recibir los avisos internos que se reparten por capacidad (hoy, "Grupo
--   sin confirmar"). Se cambia por persona desde /settings/team.
--
--   Decisión del dueño: quienes tienen el rol de sistema `direccion` arrancan
--   APAGADOS (tienen todas las capacidades y les llegaba todo). Es dato, por
--   llave, acá; el código nunca compara nombres de rol.
--
-- RE-EJECUTABLE (constitución IV) sin deshacer elecciones: la columna y el
-- apagado de `direccion` van en el MISMO paso, que solo corre si la columna
-- todavía no existe. Una segunda corrida no hace nada, así que quien después
-- la volvió a encender desde Equipo no queda apagado de nuevo.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'member'
      AND column_name = 'receives_internal_notices'
  ) THEN
    ALTER TABLE "member" ADD COLUMN "receives_internal_notices" boolean DEFAULT true NOT NULL;
    UPDATE "member" SET "receives_internal_notices" = false WHERE "role" = 'direccion';
  END IF;
END $$;
