# Contrato — consultas del alumno/profesor (029)

Módulo: `src/server/ai/lookups.ts`. Firma:

```ts
runLookup(input: {
  organizationId: string;
  contactId: string;            // SIEMPRE conversation.contactId
  profile: ContactProfile;
  query: LookupQuery;
  classNumber?: number;
  courseHint?: string;
  now?: Date;
  fixture?: LabFixture;          // solo Laboratorio + is_test (research DV-009)
}): Promise<LookupResult>
```

Lista CERRADA (FR-012). Toda consulta es de solo lectura y **reusa** funciones
existentes; este módulo no calcula ni una fecha ni un saldo propio.

| `query` | Perfil permitido | Fuente (reuso) | Resultado |
|---|---|---|---|
| `next_class` | alumno | `studentOverview(org, contactId, now).nextClass` (sale de `class_session`; la proyección nunca entra) | `{kind:"next_class", cls: StudentNextClassDto \| null, timezone}` |
| `next_class` | profesor (o `alsoTeacher`) | `resolveTeacherScope()` + `listCohortClasses()` → la próxima clase no cancelada con `date >= now` entre todas sus cohortes (titular ∪ suplencia) | `{kind:"next_class_teacher", cls \| null}` |
| `balance` | alumno | `studentOverview(...).balances` (`StudentBalanceDto[]`, una por moneda) | `{kind:"balance", balances}` — **nunca se suman monedas** |
| `class_material` | alumno | inscripciones del contacto → `listClassResourcesOfCohort()` + `materialVisibleDeCohorte()`; elige cohorte por `courseHint` o la de la próxima clase | `{kind:"class_material", items: {title, url}[], classNumber}` |
| `offline_progress` | alumno | `effectiveCourseIdsForContact()` + `contactCourseProgress()` | `{kind:"offline_progress", courses: {name, done, total, completed}[]}` |
| cualquiera | lead / desconocido | — (no toca la base) | `{kind:"not_allowed"}` |

Resultados de borde (no inventar):

- Sin clase real programada → `cls: null` → "todavía no hay clases cargadas
  para tu curso" (US3-4). Una fila `projected` del calendario no es una clase.
- Varias cohortes → la próxima clase es la más cercana entre todas (ya lo
  hace `studentOverview`); el saldo lista cada moneda por separado.
- `meetingUrl` solo si `studentOverview` lo devolvió (ventana horaria de la
  organización, FR-003 de 013).
- Ambigüedad de material (dos cohortes y sin `courseHint`) → se responde con
  la lista de cursos para que elija; no se adivina.

## Formateo determinista (`factsText` + `tokens`)

`formatFacts(result, {timeZone})`:

- Fecha y hora: `Intl.DateTimeFormat("es-UY", {timeZone, weekday, day, month,
  hour, minute})` sobre el instante ya compuesto por `classInstant()`. Zona del
  alumno por `timeZoneForIdentity(contact.waIdentity, org.timezone)`
  (`src/lib/phone-timezone.ts`); el texto nombra la zona y, si difiere,
  agrega la de la academia.
- Montos: `formatAmount()` de `@/lib/utils` — el mismo formateador del portal.
- `tokens`: la lista de strings que la redacción del modelo DEBE contener
  (fecha, hora, cada monto, fecha de vencimiento). Ver contrato del agente.

## Bitácora

Cada ejecución: `recordActivity({kind: "agente.consulta", contactId,
metadata: {query, result: result.kind, conversationId}})`. **Sin** los datos
devueltos (no se copia deuda a una tabla de auditoría).

## Garantías verificadas por test

1. `runLookup` con perfil `lead`/`desconocido` no ejecuta ninguna consulta
   (spy sobre `getDb`) y devuelve `not_allowed`.
2. El esquema `lookup` no tiene campos de identidad; un JSON con `cedula`,
   `contactId` o `email` extra se descarta por Zod (`.strict()`).
3. `balance` coincide con `studentAccount()`/legajo para un alumno fixture
   con dos monedas.
4. `next_class` ignora filas proyectadas y canceladas.
