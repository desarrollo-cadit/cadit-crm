# Contrato — Rutas entre cursos

## GET `/api/course-routes`

**Capacidad**: `academico.ver`. Todas las rutas de la organización.

**200**
```ts
{ routes: { fromCourseId: string; toCourseIds: string[] }[] }   // toCourseIds en orden
```

## PUT `/api/courses/[id]/next-courses`

**Capacidad**: `academico.editar` (FR-006). Reemplaza la lista ordenada de
cursos siguientes de `[id]` (idempotente).

**Body** (Zod `.strict()`): `{ nextCourseIds: string[] }` (0..20; vacío = sin siguientes)

**200** `{ fromCourseId: string; toCourseIds: string[] }`

**404** `not_found` — el curso de origen no existe o es de otra organización.

**422** `invalid_body` con mensaje:
- `"Un curso no puede seguirse a sí mismo."` (FR-005)
- `"Hay un curso repetido en la lista."`
- `"Alguno de los cursos elegidos no existe."`
- `"Los talleres no forman parte de las rutas entre cursos."`
- más de 20 → error de Zod.
