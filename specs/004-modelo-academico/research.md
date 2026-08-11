# Phase 0 Research: Modelo académico + CRM de ventas (Fase 1)

Sin dependencias externas nuevas que investigar (todo vive dentro de Postgres/Drizzle,
ya en uso). Las decisiones abajo resuelven los puntos técnicos que el spec dejó a
criterio de implementación.

## DV-001: ¿Cómo se relaciona `enrollment` con la etapa académica?

**Decision**: `enrollment.stageId` sigue siendo FK a `pipeline_stage`, exactamente
como hoy lo es `lead.stageId`. Las 7 etapas académicas (lead, contactado, inscripto,
con_licencia, cursando, finalizado, abandonó) se siembran como filas de
`pipeline_stage` por organización, con `kind: "open"` para las primeras 5 y
`kind: "won" | "lost"` para `finalizado`/`abandonó` respectivamente. Se usan tanto
para el tablero general (sin camada) como para cada tablero de camada.

**Rationale**: Es la Opción A ya acordada con el dueño del producto — cero cambios en
`PipelineClient`/`StageManager`, que ya saben renderizar/mover/gestionar etapas por
`kind`.

**Alternatives considered**: columna `enum` fija en `enrollment` (descartada porque
duplica el concepto de "etapa" y obliga a tocar la UI del kanban).

## DV-002: ¿`cohort_id` es obligatorio u opcional en `enrollment`?

**Decision**: **Opcional (nullable)**. Un `enrollment` con `cohort_id = NULL` es el
lead general de ventas de la academia (equivalente exacto al `lead` de hoy, sin
cambio de comportamiento). Con `cohort_id` asignado, es la inscripción a esa camada
puntual. Este fue un ajuste sobre el plan original (que lo tenía `NOT NULL`) al
confirmar con el dueño del producto que la instancia necesita seguir sirviendo como
CRM de ventas general de la academia, no solo gestión por camada.

**Rationale**: Sin esto, `onLeadActivity` (auto-creación de tarjeta al primer mensaje
de WhatsApp) dejaría de poder funcionar, porque no hay forma de saber a qué camada
pertenece un contacto recién llegado. Con `cohort_id` nullable, esa función no cambia
en absoluto — sigue creando el mismo tipo de fila que hoy, sin lógica nueva.

**Alternatives considered**: `cohort_id NOT NULL` + camada "placeholder" por
organización — descartada por agregar un concepto ficticio (una camada que no es una
camada real) que ninguna parte del dominio necesita y que complica el modelo sin
beneficio.

## DV-003: ¿Cómo se garantiza "sin duplicados" con `cohort_id` opcional?

**Decision**: dos índices únicos parciales en vez de uno solo:

```sql
CREATE UNIQUE INDEX enrollment_contact_cohort_uq
  ON enrollment (contact_id, cohort_id) WHERE cohort_id IS NOT NULL;

CREATE UNIQUE INDEX enrollment_contact_general_uq
  ON enrollment (contact_id) WHERE cohort_id IS NULL;
```

**Rationale**: Postgres no aplica un `UNIQUE (a, b)` normal entre filas donde `b` es
NULL (NULL nunca es igual a NULL), así que un unique compuesto simple NO bloquearía
dos leads generales del mismo contacto. El primer índice (parcial, "camada
asignada") impide duplicar la inscripción a una misma camada; el segundo (parcial,
"sin camada") impide duplicar el lead general — es exactamente el mismo constraint
que ya existe hoy como `lead_contact_uq`, solo acotado al caso `cohort_id IS NULL`.
Drizzle soporta índices parciales vía `.where()` en `uniqueIndex(...)`.

## DV-004: ¿Se migra `lead`→`enrollment` con `ALTER TABLE RENAME` o se crea una tabla nueva?

**Decision**: `ALTER TABLE lead RENAME TO enrollment`, seguido de `ADD COLUMN
cohort_id ... NULL` (nullable — sin necesidad de default ni backfill, ver DV-002),
`ADD COLUMN enrolled_at`, `DROP INDEX lead_contact_uq`, y creación de los dos índices
parciales de DV-003.

**Rationale**: Preserva el historial de la tabla; al ser `cohort_id` nullable, incluso
si hubiera filas `lead` reales hoy, la migración las deja funcionando igual (como
leads generales) sin backfill — más simple todavía que la versión anterior de esta
decisión (que asumía `NOT NULL`).

**Alternatives considered**: crear `enrollment` desde cero y dropear `lead` —
descartada, estrictamente más destructiva sin ganar nada.

## DV-005: ¿`onLeadActivity` (auto-creación al primer mensaje) cambia?

**Decision**: **No cambia su lógica**, solo su target de tabla/conflicto: sigue
insertando en la primera etapa abierta con `contactId` + `organizationId`, sin
`cohortId` (queda NULL), y el `onConflictDoNothing({ target: [contactId] })` pasa a
apuntar al índice parcial `enrollment_contact_general_uq` de DV-003.

**Rationale**: Es exactamente el comportamiento de hoy (FR-010/SC-005) — el dueño del
producto confirmó que perder esto rompería el uso del CRM para "charlar con
interesados" sin que tengan que estar en una camada para figurar.

## DV-006: ¿Qué le pasa al endpoint `/api/pipeline/board` con `cohortId`?

**Decision**: `cohortId` se agrega como query param **opcional**, pero su ausencia ya
NO significa "todas las inscripciones de la organización" (como se había planteado
antes) sino **"tablero general de ventas"**: solo `enrollment` con `cohort_id IS
NULL`. Con el param, filtra por esa camada. Ver `contracts/pipeline-board.md`.

**Rationale**: Es el comportamiento que el dueño del producto pidió explícitamente —
el tablero general (sin filtro) ES el CRM de ventas de la academia, y cada camada
tiene su propio tablero aparte.

## DV-007: ¿Cómo se asigna una camada a un lead general existente?

**Decision**: se extiende el mismo endpoint que ya actualiza `stageId`/`position`
(`PATCH /api/pipeline/leads/[id]`) para aceptar también `cohortId` en el body. No se
crea un endpoint nuevo para esto en esta fase.

**Rationale**: Es una actualización de campo sobre la misma fila (FR-008), coherente
con lo que ese endpoint ya hace; no amerita superficie nueva todavía (la UI para
elegirlo desde un selector es Fase 3).

## DV-008: Prefijos de ID nuevos

**Decision**: agregar a `src/lib/db/ids.ts`: `course: "crs"`, `cohort: "coh"`,
`enrollment: "enr"` (reemplaza a `lead: "ld"`, que se elimina del mapa —no hay IDs
`ld_` existentes que preservar), `license: "lic"`, `automationRule: "arule"`.

**Rationale**: Sigue el patrón de prefijos cortos ya usado (`ct`, `cv`, `msg`, `stg`).
