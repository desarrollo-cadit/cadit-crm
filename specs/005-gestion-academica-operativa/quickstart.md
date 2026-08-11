# Quickstart: probar la Fase 2 (gestión académica operativa)

1. Generar y aplicar la migración:

   ```bash
   pnpm db:generate
   pnpm db:migrate
   ```

   Al generar, `drizzle-kit` va a preguntar por el drop de la columna
   `cohort.professor` (reemplazada por `teacher_id`, DV-005) — confirmar, sin
   backfill (arranque en limpio, mismo criterio que la Fase 1).

2. Catálogos base — crear al menos:
   - Un software con licencias (`POST /api/software`, ej. "Revit", 5 licencias).
   - Un profesor (`POST /api/teachers`).
   - Un curso + una camada que declare ese software y ese profesor, con costo,
     horario, aula y temario (`POST /api/courses`, `POST /api/cohorts`).

3. Probar la alerta de licencias (US4):
   - Crear una segunda camada del mismo software con más cupo que licencias
     disponibles → confirmar que la respuesta incluye la advertencia.
   - Asignar licencias a inscripciones hasta agotar el pool → confirmar que la
     siguiente asignación devuelve 409/422 explicando que no hay stock.

4. Probar el choque de horario (US5):
   - Asignar al mismo profesor dos camadas con fechas superpuestas → confirmar
     que la respuesta trae la advertencia con la camada en conflicto; confirmar
     que la creación NO se bloquea.

5. Inscribir un alumno (US2, `POST /api/enrollments`):
   - Con un contacto nuevo, monto, cuotas, cédula, factura, recibo y vendedor →
     confirmar 201 y que los datos quedan en la inscripción.
   - Repetir con el mismo email o el mismo celular de otro contacto ya
     existente → confirmar 409 con mensaje explícito (DV-002/DV-003).
   - Con una empresa asociada (`companyId`) → confirmar que queda vinculada sin
     tocar los datos personales del contacto.

6. Checklist compartido (US3):
   - Con un usuario de rol por defecto (ventas/coordinación), abrir `GET
     /api/cohorts/:id/roster` → confirmar que trae montos/factura/vendedor.
   - Crear/asignar un miembro con `role = "soporte"` (vía `member.role`
     directamente o el flujo de invitación que corresponda) e iniciar sesión
     como ese usuario → repetir el mismo `GET .../roster` → confirmar que NO
     trae `amount`/`invoiceNumber`/`sellerId`/`companyId`, pero SÍ trae el
     checklist y los datos de contacto.
   - Marcar un ítem del checklist (`PATCH /api/enrollments/:id/checklist`) como
     soporte → confirmar que ventas/coordinación lo ve reflejado en la misma
     pantalla.

7. Rol restringido a finanzas (FR-016):
   - Como usuario `soporte`, pedir `GET /api/dashboard/finance` → confirmar 403.
   - Como usuario con acceso completo, pedir lo mismo → confirmar que trae el
     total facturado del mes actual vs. el anterior.

8. Endpoint público (US7):
   - Sin ninguna cookie/sesión, `GET /api/public/courses` → confirmar 200 con
     los cursos y sus próximos comienzos.
   - Confirmar que una camada ya iniciada NO aparece en `nextCohorts`.
   - Confirmar que la respuesta no contiene ningún campo de alumno/monto.

9. Calendario (US6):
   - Con varias camadas de fechas distintas cargadas, abrir la vista de
     calendario y confirmar que cada una aparece ubicada en su rango de fechas.

10. Gate técnico de cierre de fase:

    ```bash
    pnpm typecheck && pnpm lint && pnpm build && pnpm test
    ```

    Esta vez SÍ aplica el self-test de comportamiento en vivo del Principio IX
    (hay pantallas nuevas: roster, calendario, dashboard) — se define el guion
    E2E puntual en `tasks.md` cuando se genere.
