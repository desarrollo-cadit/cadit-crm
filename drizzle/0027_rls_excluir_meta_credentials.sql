-- 012 (T028) — `meta_credentials` es la QUINTA tabla de arranque.
--
-- Apareció al apuntar la app a `cadit_app` y correr el arnés: el webhook de
-- Meta resuelve a qué organización pertenece un mensaje leyendo
-- `meta_credentials` por `phone_number_id` — es decir, la consulta ANTES de
-- saber de qué organización es. Con la política puesta devuelve cero filas y
-- el webhook descarta TODOS los mensajes entrantes, en silencio y con un
-- warning que culpa a la configuración ("phone_number_id desconocido").
--
-- Mismo criterio que `member`, `account_link`, `role` e `invitation`: son las
-- tablas que responden "¿de quién es esto?", y por definición se leen sin
-- alcance declarado. Ponerles RLS no protege: rompe.
--
-- **Sigue protegida por otras dos vías**, que son las que importan acá:
--   * el token de WhatsApp está CIFRADO en reposo (AES-256-GCM, constitución I)
--     y nunca sale al cliente ni a los logs;
--   * toda consulta de la aplicación pasa por `scoped()`.
--
-- Se revierte lo de la migración 0025 para esta tabla, sin tocar las otras 30.

alter table "meta_credentials" disable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "meta_credentials";
