# Contrato — Filtros de historial en audiencias (extiende 045)

No hay rutas nuevas: las de `specs/045-marketing-campaigns/contracts/audiences.md`
aceptan las claves nuevas de `AudienceFilters` ([data-model §3](../data-model.md)).

## `AudienceFilters` (claves nuevas, todas opcionales)

```ts
{
  historyTakenCourseIds?: string[];
  historyApprovedCourseIds?: string[];
  historyNotApprovedCourseIds?: string[];
  historyNotDoneCourseIds?: string[];
  historyRecent?: { months: number /* 1..120 */; courseIds?: string[]; categoryIds?: string[] };
  historyNextStepOfCourseId?: string;
}
```

- **422** `invalid_body` si `months` está fuera de rango, si una lista está
  vacía o si aparece una clave desconocida (el esquema sigue `.strict()`).
- Las audiencias guardadas sin estas claves siguen valiendo (`v: 1`).

## GET `/api/marketing/audiences/options` (ampliado)

Suma `categories: { id: string; name: string }[]` (vacía si el catálogo no
tiene categorías: el filtro "últimos N meses" se ofrece entonces solo por
cursos — spec, Assumptions).

## Semántica

- AND entre filtros (los nuevos y los de la 045); "alguno de" dentro de cada lista.
- Las exclusiones de la 045 (prueba > baja > archivado > sin correo >
  duplicado) se aplican igual, después de los filtros (FR-008, US4-Independent Test).
- "No hizo" alcanza también a contactos sin ninguna cursada.
- `historyNextStepOfCourseId: X` ≡ `historyTakenCourseIds: [X]` +
  `historyNotDoneCourseIds: siguientes(X)` (si X no tiene siguientes, solo la primera).
