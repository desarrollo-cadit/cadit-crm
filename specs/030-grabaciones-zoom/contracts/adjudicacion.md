# Contrato — adjudicación de grabaciones a clases

Módulo: `src/server/zoom/matching.ts`. Núcleo PURO (`matchRecording`) + capa
de persistencia (`applyMatch`, `assignManually`, `unassign`, `resetToAuto`) en
`src/server/zoom/assignment.ts`. Research DV-006/DV-007.

## Entrada pura

```ts
export type MatchableClass = {
  classSessionId: string;
  cohortId: string;
  startsAt: Date;            // classInstant(date, start_time, org.timezone) — NUNCA armado a mano
  endsAt: Date | null;       // classInstant(date, end_time, org.timezone)
  meetingId: string | null;  // extractMeetingId(resolveMeetingUrl({classMeetingUrl, cohortMeetingUrl}))
  roomId: string | null;     // class.virtual_room_id ?? cohort.virtual_room_id
};

export type MatchableRoom = {
  roomId: string;
  zoomConnectionId: string;
  zoomUserId: string;
  pmiMeetingId: string | null; // extractMeetingId(virtual_room.url)
};

export type MatchInput = {
  recording: { zoomConnectionId: string; meetingId: string; hostZoomUserId: string; startTime: Date };
  classes: MatchableClass[];   // ya filtradas: reales, no canceladas, con startsAt
  rooms: MatchableRoom[];      // aulas activas vinculadas
  tolerance: { beforeMin: number; afterFallbackMin: number };
};

export type MatchResult =
  | { kind: "unica"; classSessionId: string; signal: "reunion" | "aula" }
  | { kind: "ambigua"; candidateIds: string[]; signal: "reunion" | "aula" }
  | { kind: "ninguna" };

export function matchRecording(input: MatchInput): MatchResult;
```

## Algoritmo

```text
compatible(c) := c.startsAt − beforeMin ≤ r.startTime ≤ (c.endsAt ?? c.startsAt + afterFallbackMin)

A := { c ∈ classes | compatible(c) ∧ c.meetingId ≠ null ∧ c.meetingId = r.meetingId }
si |A| = 1 → unica(A, "reunion");  si |A| ≥ 2 → ambigua(A, "reunion")

roomsDelHost := { room | room.zoomConnectionId = r.zoomConnectionId ∧ room.zoomUserId = r.hostZoomUserId }
              ∪ { room | room.pmiMeetingId ≠ null ∧ room.pmiMeetingId = r.meetingId }
B := { c ∈ classes | compatible(c) ∧ c.roomId ∈ roomsDelHost.roomId }
si |B| = 1 → unica(B, "aula");  si |B| ≥ 2 → ambigua(B, "aula")
si no → ninguna
```

Invariantes (cada uno con test en `tests/unit/zoom-matching.test.ts`):

1. La señal A gana sobre B: si A tiene exactamente una, B no se mira (la cuenta
   prestada a otra cohorte no confunde).
2. Nunca devuelve `unica` con dos candidatas igual de válidas (choque de aulas
   → `ambigua`). Nunca elige "la más cercana".
3. Una clase sin `startsAt` no llega al núcleo (filtrada antes) — test del
   cargador, no del núcleo.
4. Bordes de ventana inclusive; prueba explícita con la semana del cambio de
   hora de una zona que lo tiene (p. ej. `America/Santiago`) y con la de la
   academia (`America/Montevideo`), con instantes
   generados por `classInstant`.
5. Determinismo: mismas entradas → mismo resultado, independiente del orden
   de `classes`.

## Cargador de candidatas

`loadMatchContext(orgId, window: {from: Date; to: Date})`:
- Clases con `date` en `[from − 1 día, to + 1 día]` (margen de zona), unidas a
  cohorte (`meeting_url`, `virtual_room_id`), `canceled_at IS NULL`, con
  `start_time`. `startsAt/endsAt` vía `classInstant(..., organization.timezone)`.
- Las PROYECCIONES (`buildClassSchedule` sin filas) no se cargan: no existen.
- Aulas activas con vínculo de Zoom.
- Una sola carga por página de grabaciones (no N+1).

## Persistencia (`applyMatch`)

Dentro de `withOrganizationScope(org, "system:zoom-sync")` corto, por grabación:

```text
si rec.assignment_mode = 'manual' → no tocar
si rec.assignment_state = 'asignada' → no tocar (estable)
match := matchRecording(...)
ninguna  → state='sin_clase', candidates={}, conflict=null
ambigua  → state='ambigua',  candidates=ids
unica(c) →
  pg_advisory_xact_lock(hashtext('rec:' || c))
  cls := select recording_url, recording_source from class_session where id=c for update
  otra := exists zoom_recording where class_session_id = c
  si (cls.recording_source='manual' ∧ cls.recording_url≠null) ∨ otra
     → state='conflicto', conflict_class_session_id=c
  si rec.play_url = null → state='pendiente' (sin enlace todavía; se reintenta)
  si no → rec.class_session_id=c, state='asignada', assigned_at=now()
          class_session.recording_url=rec.play_url, recording_source='zoom'
```

## Operaciones manuales (`assignment.ts`)

| Función | Precondiciones | Efecto |
|---|---|---|
| `assignManually(org, recId, classId, {replace, userId})` | Clase existe en la org, real, NO cancelada; `play_url` no nula | Si la clase tiene enlace manual u otra grabación y `replace` ≠ true → `{ok:false, reason:"requiere_reemplazo", current:{kind:"manual"\|"zoom", recordingId?}}`. Con `replace`: la otra grabación → `manual/sin_clase`; la anterior clase de ESTA grabación se limpia (si era `zoom` con su enlace); `rec` → `manual/asignada`, `assigned_by`, `assigned_at`; clase ← `play_url`, `'zoom'` |
| `unassign(org, recId, userId)` | — | Clase limpiada si `recording_source='zoom'` y `recording_url = play_url`; `rec` → `manual/sin_clase`, `class_session_id=null` |
| `resetToAuto(org, recId)` | `assignment_mode='manual'` | Limpia la clase como `unassign`; `rec` → `auto/pendiente`; corre `applyMatch` en el acto para esa grabación |

Todas con `pg_advisory_xact_lock` sobre la(s) clase(s) involucrada(s), en orden
de id para no interbloquear. Ninguna devuelve 403/404 desde el módulo: devuelven
resultados tipados (`"no_existe"`, `"clase_cancelada"`, `"sin_enlace"`,
`"requiere_reemplazo"`) y la ruta elige el código.

## Lo que el matcher NUNCA hace

- Pisar `recording_source = 'manual'`.
- Tocar una grabación `manual`.
- Mover una `auto/asignada` a otra clase.
- Adjudicar a clase cancelada o sin horario.
- Escribir `recording_url` de una clase de otra organización (RLS + `scoped()`).
