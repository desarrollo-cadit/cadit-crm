-- cursos-offline T11 — El contenido se crea y se edita desde el panel.
--
-- Qué cambia y por qué:
--
--   `legacy_ref` deja de ser obligatorio en las seis tablas de contenido
--   (curso, lección, tema, cuestionario, pregunta, respuesta).
--     Hasta ahora toda fila venía del import de LearnDash y llevaba su id de
--     origen (`quiz:1281`). Una fila creada desde la UI no tiene origen: se
--     guarda con `legacy_ref` NULL en vez de inventarle uno.
--
--   Los índices únicos `(organization_id, legacy_ref)` NO se tocan: en
--   PostgreSQL dos NULL no chocan, así que la unicidad sigue valiendo para
--   las filas importadas y el importador sigue encontrando las suyas.
--
-- ============================================================
-- RLS
-- ============================================================
-- Solo se relaja una restricción de columna en tablas que ya tienen
-- `tenant_isolation` (0042): no hay política nueva que escribir.
--
-- ============================================================
-- RE-EJECUTABLE (constitución IV)
-- ============================================================
-- `alter column ... drop not null` sobre una columna que ya admite NULL no
-- hace nada ni falla.
--
-- ============================================================
-- SIN REGRESIÓN
-- ============================================================
-- Las filas existentes conservan su `legacy_ref`.

ALTER TABLE "offline_answer" ALTER COLUMN "legacy_ref" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "offline_course" ALTER COLUMN "legacy_ref" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "offline_lesson" ALTER COLUMN "legacy_ref" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "offline_question" ALTER COLUMN "legacy_ref" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "offline_quiz" ALTER COLUMN "legacy_ref" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "offline_topic" ALTER COLUMN "legacy_ref" DROP NOT NULL;
