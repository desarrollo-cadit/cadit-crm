# Research: Gestión académica operativa (Fase 2)

Decisiones técnicas (DV = Decisión de Verificación/diseño), en el mismo formato
que `specs/004-modelo-academico/research.md`.

## DV-001: Rol "soporte" sobre el sistema de roles existente

**Decision**: Extender `member.role` (columna `text`, sin enum rígido — Better
Auth org plugin, ya usado con `"owner"`/`"member"`) con el valor `"soporte"`.
Nuevo helper `requireFullAccess()` en `src/lib/api.ts`, variante de `withAuth`
que además exige `session.role !== "soporte"` y responde 403 si no cumple.

**Rationale**: `member.role` ya es texto libre (`src/lib/db/schema.ts:85`, sin
`enum: [...]` como sí tiene `pipelineStage.kind`) — no hace falta migración de
esquema, solo lógica de aplicación. `requireSession()` (`src/lib/auth/session.ts`)
ya expone `role` en cada request autenticado.

**Alternatives considered**: Tabla de permisos granular (RBAC completo) —
descartada: el spec solo pide 2 roles funcionales, sobre-ingeniería para el
alcance actual.

## DV-002: Errores de duplicado amigables (409, no 500 genérico)

**Decision**: En el catch de `withAuth` (`src/lib/api.ts`), si el error tiene
`code === "23505"` (unique_violation de Postgres), responder
`apiError(409, "duplicate", ...)` en vez de caer al 500 genérico actual.

**Rationale**: Verificado en vivo durante la Fase 1 (`specs/004-modelo-academico`):
un intento de duplicar `(contact_id, cohort_id)` vía `PATCH
/api/pipeline/leads/[id]` devolvió `{"error":{"code":"internal","message":"Error
interno"}}` (500) en vez de un 409 explicable — la constraint funcionó, pero el
mensaje no. FR-010/FR-011 (email/celular únicos) piden explícitamente "rechaza
... con un mensaje explícito", así que corregirlo en el punto central beneficia
a toda ruta futura, no solo a las nuevas.

**Alternatives considered**: Pre-`SELECT` antes de cada `INSERT` para detectar el
duplicado a mano — descartado: duplica la lógica de la constraint (race
condition entre el SELECT y el INSERT bajo concurrencia) y hay que repetirlo en
cada endpoint nuevo; el mapeo central es una sola vez.

## DV-003: Unicidad de email y celular de contacto

**Decision**: Agregar `email` (nullable) y `cedula` (nullable) a `contact`. Dos
índices únicos parciales nuevos: `contact_org_email_uq` (`organization_id,
email`) `WHERE email IS NOT NULL`, y `contact_org_phone_uq` (`organization_id,
phone`) `WHERE phone IS NOT NULL`.

**Rationale**: Hoy `contact` no tiene columna `email`. La unicidad de `phone` NO
puede apoyarse solo en `contact_org_wa_identity_uq` existente: esa unicidad cubre
`wa_identity`, que para contactos de alta manual (`POST /api/contacts`) coincide
con el teléfono normalizado, pero para contactos de origen WhatsApp con BSUID
(`bsuid:<id>`) el teléfono es un atributo aparte sin constraint propio — dos
contactos BSUID distintos podrían terminar con el mismo `phone` sin que nada lo
impida hoy. Un índice parcial dedicado cubre ambos orígenes por igual.

**Alternatives considered**: Confiar en `wa_identity` para la unicidad de
teléfono — descartado por el gap de BSUID recién descrito.

## DV-004: Inventario de licencias por software

**Decision**: Nueva tabla `software` (`id`, `organization_id`, `name`,
`total_licenses`). La tabla `license` (Fase 1) gana `software_id` (FK NOT NULL a
`software`). Disponibles = `software.total_licenses - count(license WHERE
software_id = X AND assigned = true)`. Nueva tabla puente `cohort_software`
(`cohort_id`, `software_id`) para que una cohorte declare qué software(s) usa
(N:N — ej. una cohorte "Revit Arq + Estructura + MEP" podría declarar solo
"Revit", o varias si en el futuro se separan por versión).

**Rationale**: `license` ya existía desde la Fase 1 como un booleano por
inscripción (`assigned`), pero sin saber DE QUÉ software — no alcanzaba para un
pool. Agregarle `software_id` la convierte en la fila de asignación real contra
el catálogo, sin crear una tabla paralela de "licencias por inscripción". El
ítem "licencia asignada" del checklist de soporte (FR-013) se resuelve leyendo
este mismo `license.assigned`/`assigned_at` — no se duplica un booleano en
`enrollment`.

**Alternatives considered**: Licencias individuales con clave/serial propio —
explícitamente fuera de alcance (ver spec.md, Assumptions).

## DV-005: Profesor como entidad propia

**Decision**: Nueva tabla `teacher` (`id`, `organization_id`, `name`).
`cohort.professor` (texto libre, Fase 1) se reemplaza por `cohort.teacher_id`
(FK nullable a `teacher`).

**Rationale**: Detectar choques de horario (FR-008) requiere poder agrupar
cohortes por el MISMO profesor de forma confiable — comparar strings ("Juan
Pérez" vs "juan perez" vs "Juan P.") no es confiable. Sin datos de producción
reales todavía (mismo criterio que Fase 1: arranque en limpio, sin backfill).

**Alternatives considered**: Mantener texto libre + normalización de string para
comparar — descartado, frágil y no evita altas duplicadas del mismo profesor con
variaciones de escritura.

## DV-006: Detección de choque de horario

**Decision**: Al crear/editar una cohorte con `teacher_id`, comparar el rango
`[start_date, end_date]` contra las demás cohortes del mismo profesor en la
organización. Superposición = `existing.start_date <= new.end_date AND
(existing.end_date IS NULL OR existing.end_date >= new.start_date)` (si
`end_date` es NULL se trata como "sigue en curso" a efectos de la comparación).
Devuelve la lista de cohortes en conflicto en la respuesta; NO bloquea la
creación/edición (FR-008 es una advertencia).

**Rationale**: El horario detallado (día de semana + franja) se guarda como
texto libre (`frequency`, ver `data-model.md`) porque el negocio lo escribe así
hoy ("lunes y miércoles 18:30-20:30") y no hay tiempo para modelarlo
estructurado en esta fase — comparar por rango de fechas es la señal disponible
sin ese modelado adicional, documentado como asunción en `spec.md`.

**Alternatives considered**: Modelar horario estructurado (días + franja horaria)
para detectar choques exactos dentro de la semana — descartado por alcance: el
spec explícitamente deja el horario como texto libre.

## DV-007: Checklist de onboarding sobre `enrollment`, sin tabla aparte

**Decision**: Agregar columnas directamente a `enrollment`:
`terms_email_sent_at`, `software_installed_at`, `had_own_license` (boolean),
`academia_online_access_at` (timestamps nullable = booleano + fecha, mismo
patrón que `license.assigned_at` de la Fase 1).

**Rationale**: Relación 1:1 con `enrollment` — una tabla aparte solo agregaría un
join sin beneficio (no hay historial ni multiplicidad que gestionar). "Licencia
asignada" NO se repite acá (ver DV-004).

**Alternatives considered**: Tabla `onboarding_checklist` separada — descartada,
sin necesidad de esa indirección para datos 1:1 sin historial.

## DV-008: Datos comerciales de la inscripción

**Decision**: Agregar a `enrollment`: `amount` (integer — moneda entera sin
decimales, así se cargan los montos hoy: $76.000, $57.000...), `installments`
(integer nullable), `payment_notes` (text), `national_id` (cédula),
`invoice_number`, `receipt_number`, `seller_id` (referencia a `user.id`,
validado en servidor como miembro de `session.organizationId` — Better Auth no
tiene una FK compuesta con organización para esto), `company_id` (FK nullable a
`company`).

**Rationale**: Son exactamente los campos hoy presentes en la planilla de ventas
sin equivalente en el modelo (spec.md FR-009). `amount` como entero evita la
complejidad de precisión decimal que el negocio no usa en la práctica (sus
propios montos en la planilla no tienen centavos).

**Alternatives considered**: Desglose de cuotas individuales (tabla `payment` con
fecha/monto por cuota) — explícitamente fuera de alcance (spec.md, Assumptions:
"se prevé integrar a futuro con un sistema contable, no ahora").

## DV-009: Empresa (facturación B2B)

**Decision**: Nueva tabla `company` (`id`, `organization_id`, `legal_name`,
`tax_id` nullable). `enrollment.company_id` (FK nullable).

**Rationale**: Confirmado en conversación con el dueño: "a veces sí" se factura
a una empresa en vez de a la persona (columna "Empresa" en la planilla de
soporte). Entidad simple, sin relación con `contact` (el alumno sigue siendo la
persona; la empresa es solo el dato de facturación de esa inscripción puntual).

## DV-010: Endpoint público — una sola organización por instancia

**Decision**: El endpoint público (`GET /api/public/courses[/:id]`) no recibe
`organizationId` del caller: resuelve la única organización de la instalación,
igual que ya hace `isPublicSignupAllowed()`
(`src/server/auth/registration.ts:9-14`, que cuenta `organization` para decidir
si el registro sigue abierto). Sin `withAuth`; DTO propio y reducido (nombre,
descripción, temario, próximos comienzos con fecha de inicio) que nunca
consulta `contact` ni `enrollment`.

**Rationale**: "Una instancia = un negocio" es una regla de producto ya
establecida (CLAUDE.md, constitución) — CadIT nunca sirve a más de una
organización real por instalación, así que no hace falta (ni sería seguro)
aceptar un identificador de organización desde un caller no autenticado.

**Alternatives considered**: Requerir un slug/subdominio por organización en la
URL pública — innecesario mientras el producto siga siendo mono-tenant por
instancia; se reconsideraría solo si esa premisa cambia.

## DV-011: Prefijos de ID nuevos

**Decision**: `src/lib/db/ids.ts` gana `software: "sw"`, `teacher: "tch"`,
`company: "cia"`.

**Rationale**: Mismo patrón de prefijos cortos ya usado (`course: "crs"`,
`cohort: "coh"`...).
