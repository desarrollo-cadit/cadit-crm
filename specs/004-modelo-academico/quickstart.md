# Quickstart: probar la Fase 1 (modelo académico + CRM de ventas)

Sin UI nueva en esta fase — se prueba por seed script + Drizzle Studio + el tablero
kanban existente.

1. Generar y aplicar la migración:

   ```bash
   pnpm db:generate
   pnpm db:migrate
   ```

   Al generar, `drizzle-kit` va a preguntar si `lead` se renombra a `enrollment`
   (en vez de dropear+crear) — confirmar el rename (ver `research.md` DV-004).

2. Extender `scripts/seed/demo.ts` con: un contacto SIN cohorte (lead general), un
   curso, una cohorte, y una inscripción con cohorte — y ejecutar:

   ```bash
   pnpm seed:demo
   ```

3. Abrir Drizzle Studio y verificar:
   - `course` tiene al menos una fila.
   - `cohort` referencia ese `course_id`.
   - `pipeline_stage` tiene las 7 etapas académicas sembradas para la organización.
   - `enrollment` tiene al menos una fila con `cohort_id NULL` (lead general) y otra
     con `cohort_id` asignado.

4. Verificar las reglas de duplicados (FR-004):
   - Insertar una segunda `enrollment` para el MISMO `contact_id` en una `cohort_id`
     distinta → debe insertar sin error.
   - Insertar una segunda `enrollment` para el mismo par `(contact_id, cohort_id)` →
     debe fallar por `enrollment_contact_cohort_uq`.
   - Insertar una segunda `enrollment` sin cohorte para un contacto que ya tiene un
     lead general → debe fallar por `enrollment_contact_general_uq`.

5. Verificar que la auto-creación de WhatsApp sigue igual (FR-010/SC-005): con los
   mocks de dev encendidos (`WA_MOCK_ENABLED=true`), simular un mensaje entrante de un
   contacto nuevo y confirmar que aparece un `enrollment` con `cohort_id NULL` en la
   primera etapa abierta — mismo comportamiento que hoy tiene `onLeadActivity` con
   `lead`.

6. Con la app corriendo, abrir el pipeline (`/pipeline`):
   - Sin filtro: ver el tablero general con los leads sin cohorte.
   - Confirmar que se pueden arrastrar tarjetas entre columnas (drag & drop existente,
     ahora sobre `enrollment`).
   - Vía `PATCH /api/pipeline/leads/[id]` con `{ cohortId: "coh_..." }` (curl o script),
     confirmar que la tarjeta asignada desaparece del tablero general.
   - Consultar `/api/pipeline/board?cohortId=coh_...` y confirmar que esa misma
     tarjeta aparece ahí, con su misma etapa.

7. Gate técnico de cierre de fase:

   ```bash
   pnpm typecheck && pnpm lint && pnpm build && pnpm test
   ```

   (Principio IX de verificación en vivo no aplica todavía como self-test E2E
   completo — no hay pantalla nueva de cara al usuario en esta fase, más allá del
   tablero ya existente re-apuntado y verificado manualmente en el paso 6.)
