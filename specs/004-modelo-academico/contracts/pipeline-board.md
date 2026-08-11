# Contrato modificado: `GET /api/pipeline/board` y `PATCH /api/pipeline/leads/[id]`

## `GET /api/pipeline/board` — antes

```
GET /api/pipeline/board
→ 200 { stages: StageDto[], leads: BoardLead[] }
```

Devuelve todas las etapas y todos los `lead` de la organización del usuario en sesión.

## `GET /api/pipeline/board` — después (Fase 1)

```
GET /api/pipeline/board                      (tablero GENERAL — CRM de ventas)
GET /api/pipeline/board?cohortId=<coh_...>    (tablero de UNA camada)
→ 200 { stages: StageDto[], enrollments: BoardEnrollment[] }
```

- **Sin `cohortId`**: devuelve las etapas (globales por organización) y solo los
  `enrollment` con `cohort_id IS NULL` — el tablero general de ventas de la academia.
  **Este es un cambio de comportamiento respecto al `lead` de hoy en la forma de
  filtrar, pero NO en el resultado observado hoy**: como hoy todo `lead` es,
  conceptualmente, un lead general (no existe `cohort_id` todavía), el tablero sin
  filtro sigue mostrando exactamente lo mismo que muestra hoy.
- **Con `cohortId`**: devuelve las mismas etapas pero solo las `enrollment` de esa
  camada.
- `cohortId` que no pertenece a la organización del usuario en sesión → tratado como
  "sin resultados" (vía `scoped()`), nunca como error que filtre datos de otro tenant.

`BoardEnrollment` reemplaza a `BoardLead` con el mismo shape más `cohortId`:

```ts
type BoardEnrollment = {
  id: string;
  stageId: string;
  cohortId: string | null;
  position: number;
  lastActivityAt: string | null;
  contact: { id: string; name: string; phone: string | null };
  conversationId: string | null;
};
```

## `PATCH /api/pipeline/leads/[id]` — antes

```
PATCH /api/pipeline/leads/[id]
Body: { stageId?: string, position?: number }
```

## `PATCH /api/pipeline/leads/[id]` — después (Fase 1)

```
PATCH /api/pipeline/leads/[id]
Body: { stageId?: string, position?: number, cohortId?: string | null }
```

- `cohortId` es el campo nuevo (FR-008/DV-007): asigna o reasigna la camada de un
  `enrollment` existente sin crear una fila nueva. `cohortId: null` explícito lo
  vuelve a lead general.
- Sigue operando sobre la misma fila (ahora `enrollment` en vez de `lead`); el resto
  del contrato (`stageId`, `position`) no cambia de forma.
- La ruta se mantiene en `/api/pipeline/leads/[id]` en esta fase (renombrarla a
  `/api/pipeline/enrollments/[id]` queda para cuando haya UI que lo consuma
  directamente — no bloquea Fase 1, no rompe nada con dejarlo así por ahora).

## Endpoints sin cambio de contrato en esta fase

- `POST/PATCH/DELETE /api/pipeline/stages` — sin cambios, `pipeline_stage` no se toca
  en su contrato.
- Ingesta de WhatsApp (`onLeadActivity` vía `ingest.ts`) — **sin cambios de
  comportamiento observable** (FR-010/SC-005): sigue creando automáticamente la
  tarjeta en la primera etapa abierta al primer mensaje de un contacto nuevo, ahora
  como `enrollment` con `cohort_id = NULL`.

## Fuera de esta fase

Cursos y camadas se crean por seed script / Drizzle Studio en Fase 1 (criterio de
aceptación del spec) — no hay endpoints CRUD públicos de `course`/`cohort` todavía;
esos llegan en Fase 3 junto con sus pantallas (incluido el selector de camada para
asignarla desde la UI).
