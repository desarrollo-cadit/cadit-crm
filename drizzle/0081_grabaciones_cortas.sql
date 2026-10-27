-- 2026-10-27 — Las grabaciones de Zoom de menos de 15 minutos no se guardan
-- (`ZOOM_MIN_RECORDING_MIN`, `seGuardaLaGrabacion`): una clase real nunca dura
-- 15 minutos. Esta migración limpia las que ya estaban guardadas.
--
-- 15 FIJO: en SQL no hay entorno. Si alguien sube `ZOOM_MIN_RECORDING_MIN`,
-- las nuevas se filtran con el valor nuevo pero esta limpieza no se repite;
-- si lo baja o lo apaga (0), lo ya borrado no vuelve solo (la próxima
-- sincronización lo vuelve a traer si cae en su ventana).
--
-- NUNCA borra:
--   · una de duración desconocida (`duration_min` NULL);
--   · una asignada a mano (`assignment_mode = 'manual'`): la decidió una persona;
--   · una que tiene clase (`class_session_id`) o que es el enlace de una clase
--     (`recording_source = 'zoom'` y su `play_url`).
-- Nada referencia a `zoom_recording`, así que se borra sin cascadas.
--
-- Migración y no un paso de la sincronización: el problema es lo guardado
-- ANTES del filtro y no se repite (lo nuevo ya no entra), así que alcanza con
-- hacerlo una vez, en un lugar que se puede leer y auditar, en lugar de un
-- DELETE que correría en cada sincronización para siempre.
--
-- RE-EJECUTABLE (constitución IV): un DELETE con condición; la segunda vez no
-- encuentra nada.

delete from "zoom_recording" zr
where zr."duration_min" is not null
  and zr."duration_min" < 15
  and zr."assignment_mode" <> 'manual'
  and zr."class_session_id" is null
  and not exists (
    select 1 from "class_session" cs
    where cs."organization_id" = zr."organization_id"
      and cs."recording_source" = 'zoom'
      and cs."recording_url" = zr."play_url"
  );
