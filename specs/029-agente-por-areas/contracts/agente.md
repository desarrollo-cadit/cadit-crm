# Contrato — salida JSON del agente (029)

Extiende `AgentAction` de `src/server/ai/actions.ts` (contrato base:
`specs/001-vocero-core/contracts/ai.md`). Se sigue validando con Zod dentro de
`chatJson<T>` (extracción robusta + 3 intentos). UNA acción por turno.

## Campo común

Toda variante acepta:

```ts
topic?: "ventas" | "soporte" | "academia" | "sin_determinar"  // default "sin_determinar"
```

Se persiste en `message.ai_topic` del saliente que produzca el turno (si no hay
saliente, solo en la bitácora del Laboratorio).

## Variantes

Las cinco actuales sin cambios de forma (`none`, `reply`, `update_lead`,
`move_stage`, `handoff`) + dos nuevas, **solo ofrecidas en el prompt y solo
aceptadas** cuando `agent_profile.area_routing_enabled = true`. Con el ruteo
apagado, una `derive_area`/`lookup` recibida se degrada a `reply` (si trae
texto) o `none`.

### `derive_area`

```ts
{
  action: "derive_area",
  topic: "ventas" | "soporte",
  area: "ventas" | "soporte",
  summary: string,              // 1..200, una línea; se usa en el asunto (recortado a 80)
  collected: {
    name?: string, company?: string, product?: string, quantity?: string,
    email?: string, phone?: string,          // ventas
    problem?: string, since?: string,         // soporte (product compartido)
  },
  missing: string[],            // claves de `collected` que el cliente no dio
  reply?: string                // IGNORADO como cierre: el cierre lo arma el servidor
}
```

Reglas del servidor (en este orden):

| Condición | Resultado |
|---|---|
| ruteo apagado | degradar a `reply`/`none` |
| `topic` ≠ `area` o `topic = sin_determinar` | degradar a `reply` de aclaración (FR-003) |
| `summary` vacío tras `trim` | degradar; nunca se crea un caso sin resumen |
| sin motivo (`ventas`: ni `product` ni `summary` útil; `soporte`: sin `problem`) | degradar a `reply` (el modelo debe seguir preguntando) |
| `collected.email` inválido (Zod `email()`) | se descarta como Reply-To; se agrega `"email"` a `missing` y el correo lo dice |
| caso abierto (≤7 días) y sin datos nuevos | sin correo; respuesta fija "el área X ya tiene tu consulta (caso AH-…)" |
| caso abierto con datos nuevos | correo `seguimiento` |
| sin caso abierto | caso nuevo + correo `apertura` |

La forma de contacto mínima siempre existe: la identidad de WhatsApp del
contacto cuenta como contacto (US1-3).

Cierre al cliente (servidor, siempre, haya salido el correo o no — FR-007):
`area_config.contact_text` ?? texto genérico del área + línea de horario si
`now` cae fuera de `office_hours` ("El equipo responde de lunes a viernes de
9:00 a 18:00 (hora de Montevideo)").

**No** setea `conversation.handoffAt`: la IA sigue atendiendo Academia
(FR-011).

### `lookup`

```ts
{
  action: "lookup",
  topic: "academia",
  query: "next_class" | "balance" | "class_material" | "offline_progress",
  classNumber?: number,   // solo class_material (entero 1..500)
  courseHint?: string     // texto libre para elegir entre cohortes/cursos DEL contacto; nunca identifica personas
}
```

No existe ningún campo que identifique a la persona consultada: se consulta
SIEMPRE `conversation.contactId` (FR-013). Un `query` fuera del enum falla Zod →
reintento de `chatJson` → si persiste, degradación como cualquier salida
inválida (hoy: handoff `error`).

Ver [consultas.md](consultas.md) para la ejecución y la segunda llamada.

## Segunda llamada (solo tras `lookup`)

```ts
LookupReply = z.object({ text: z.string().min(1).max(1200) })
```

- System prompt con marcador `[REDACCION]`, los HECHOS (`factsText`) y la regla
  "incluí literalmente cada dato entre ⟦ ⟧".
- `timeoutMs: 20_000`. Una sola invocación de `chatJson` (sus reintentos
  internos incluidos).
- Validación: cada token crítico de `facts.tokens` aparece en `text`. Si no →
  se envía `factsText`.

## Degradaciones (resumen)

| Falla | Qué pasa |
|---|---|
| Proveedor caído en la 1.ª llamada | Igual que hoy (`handoff` `error`) |
| Proveedor caído en la 2.ª llamada | Se envía `factsText` |
| `sendMail` falla | Caso `fallido` visible; el cliente igual recibe el cierre |
| Entrega del cierre falla (no `window_closed`) | Se loguea; el caso NO se revierte |
