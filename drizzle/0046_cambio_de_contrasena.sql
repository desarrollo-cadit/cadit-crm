-- Cambio de contraseña forzado en el primer ingreso.
--
-- `must_change_password` dice que la contraseña vigente la eligió OTRA persona
-- (la invitación al portal, el alta del equipo, `reset-password`). Mientras
-- sea true, las pantallas mandan a `/cambiar-contrasena`.
--
-- Relleno (decisión del dueño): se marcan SOLO las cuentas de portal puras
-- —tienen al menos un `account_link` y ninguna fila en `member`—. Todas
-- recibieron una contraseña temporal por correo. Las del staff NO se marcan,
-- aunque además sean alumno o profesor: su contraseña la eligieron ellas.
--
-- RE-EJECUTABLE (constitución IV): un `update` suelto volvería a marcar a
-- quien ya eligió su contraseña. Por eso columna y relleno van juntos y solo
-- corren en la pasada que crea la columna; una segunda corrida no hace nada.
--
-- `user` no es tabla de dominio (no lleva organization_id): sin política RLS.
-- En producción se aplica a mano como `postgres` (cadit_app no tiene DDL).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'user'
      AND column_name = 'must_change_password'
  ) THEN
    ALTER TABLE "user" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;

    UPDATE "user" SET "must_change_password" = true
    WHERE EXISTS (SELECT 1 FROM "account_link" WHERE "account_link"."user_id" = "user"."id")
      AND NOT EXISTS (SELECT 1 FROM "member" WHERE "member"."user_id" = "user"."id");
  END IF;
END $$;
