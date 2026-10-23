# Contrato — Tipo de contacto (US7)

## GET `/api/contacts` (ampliado)

**Capacidad**: `contactos.ver` (sin cambios).

**Query nueva**: `tipo=lead|alumno_activo|exalumno` (opcional; otro valor = todos).

**200** (claves nuevas):
```ts
{
  contacts: (ContactDto & { tipo: "lead" | "alumno_activo" | "exalumno" })[];
  total: number;              // con el filtro de tipo aplicado
  page: number; pageSize: number;
  tipos: { todos: number; lead: number; alumno_activo: number; exalumno: number }; // misma búsqueda y archivados
}
```

## Audiencias (extiende 045)

`AudienceFilters.contactTypes?: ("lead" | "alumno_activo" | "exalumno")[]` (1..3,
"alguno de"). Se combina con los demás filtros y mantiene las exclusiones.
