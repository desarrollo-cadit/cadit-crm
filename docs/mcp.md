# MCP remoto de CadIT

CadIT expone un servidor MCP (Model Context Protocol) en `POST /api/mcp`, para
que Claude consulte esta instancia en lenguaje natural. No confundir con
[`mcp-setup.md`](mcp-setup.md), que trata de los MCP que usa Claude Code para
DESARROLLAR el repo.

Es una superficie de **entrada**: Claude le habla al CRM. No agrega ningún
servicio externo (constitución II); la única dependencia nueva es el paquete
`@modelcontextprotocol/sdk`, fijado en versión exacta.

## Qué ofrece hoy

**Solo lectura.** Cada herramienta usa la misma puerta y la misma función de
servidor que la pantalla equivalente:

| Herramienta | Capacidad | Qué devuelve |
|---|---|---|
| `tareas_de_hoy` | `academico.ver` | La bandeja «Para resolver» del inicio (la misma función que `GET /api/hoy`), solo con las reglas que el rol de la persona puede ver. Sin montos. |
| `morosidad` | `cobranza.ver` | Quién debe cuotas vencidas (`listOverdue`, como `/finanzas/morosidad`), de mayor a menor atraso, con totales por moneda. Argumentos: `diasMinimos`, `limite`. Los montos van en centésimos con su moneda y el importe formateado. |
| `buscar_contactos` | `contactos.ver` | Búsqueda por texto (la regla de `GET /api/contacts`): id, nombre, tipo y empresa; sin teléfono ni correo. Argumentos: `texto`, `tipo`, `limite`. |
| `legajo_de_alumno` | `contactos.ver` | El legajo (`getStudentRecord`). El estado de cuenta solo se arma si el rol tiene `cobranza.ver`. Argumento: `contactoId`. |
| `recorrido_comercial` | `contactos.ver` | Qué cursó de verdad y qué le podría interesar (`recorridoComercialDelContacto`). Sin montos. Argumento: `contactoId`. |
| `estado_de_licencias` | `licencias.ver` | Stock por programa y equipo (`vistaDeLicencias`); con `detalle`, quién tiene cada una. El correo de la licencia solo viaja con `contactos.ver`. |

Cada herramienta declara su capacidad en `src/server/mcp/tools.ts`
(`HERRAMIENTAS`). A quien no la tiene, la herramienta ni se le ofrece ni se
ejecuta. Los argumentos se declaran en `entrada` (Zod): se validan al recibir el
pedido y otra vez antes de ejecutar, y los sobrantes se rechazan. Toda respuesta
está acotada por `TOPES` (filas máximas), con un aviso de cuánto se omitió.
Excepción: `buscar_contactos` arma su consulta en `src/server/mcp/consultas.ts`
con las mismas piezas que la ruta (`condicionDeBusqueda`, `condicionDeTipo`),
porque la ruta la tiene inline.

## Cómo se conecta

### 1. Emitir un token

Lo hace una persona del equipo con la capacidad `accesos.gestionar`, desde
**Configuración › Conexión con Claude** (`/settings/mcp`): se escribe un nombre,
se crea, y la pantalla muestra el token **una sola vez** junto con el comando
`claude mcp add` listo para pegar. Desde ahí también se ven los tokens (último
uso, estado) y se revocan, con confirmación.

La pantalla usa la API, que también sirve sola:

```bash
POST /api/settings/mcp-tokens        { "name": "Claude Code de Cristina" }
```

La respuesta trae `value` (`cadit_mcp_…`) **una sola vez**: en la base queda
solo su hash SHA-256 y los últimos cuatro caracteres. Si se pierde, se revoca y
se emite otro.

- El token **es quien lo emitió**: no se puede emitir uno para otra persona, así
  que nadie obtiene capacidades que no tiene.
- No lleva capacidades propias: se resuelven en cada pedido desde el rol de su
  dueña. Cambiarle el rol o sacarla del equipo se nota enseguida.
- `GET /api/settings/mcp-tokens` lista los de la organización (nunca el valor
  ni el hash). `DELETE /api/settings/mcp-tokens/[id]` lo revoca; rige desde el
  pedido siguiente.

### 2. Agregarlo en Claude Code

```bash
claude mcp add --transport http cadit https://<dominio>/api/mcp \
  --header "Authorization: Bearer <token>"
```

Después, en una sesión: `/mcp` muestra la conexión y las herramientas.

> Los conectores personalizados de claude.ai podrían exigir OAuth en lugar de un
> Bearer fijo; este corte no lo implementa. Verificarlo antes de prometerlo.

## Cómo funciona por dentro

- **Sin estado, respuesta JSON.** Cada pedido arma su servidor MCP y su
  transporte (`WebStandardStreamableHTTPServerTransport`) y los cierra al
  terminar. `GET` y `DELETE` responden 405.
- **Autenticación.** `Authorization: Bearer cadit_mcp_…` → `resolverToken`
  (`src/server/mcp/tokens.ts`): resuelve la organización única de la instancia
  (como `/api/bot/*`) y busca el hash DENTRO de su alcance. **`mcp_token`
  conserva su política `tenant_isolation`**; no es una de las excepciones a RLS.
- **Transacción por herramienta.** Cada llamada corre en
  `withTenantTransaction` con la organización y la persona como actor.
- **Límites.** 120 pedidos por minuto por token; los intentos con un token
  inválido se cuentan juntos (60 por minuto) y pasan a 429 sin bloquear a los
  tokens válidos.
- **Errores.** Un fallo interno responde un mensaje genérico, nunca el stack.

## Reglas para agregar herramientas

1. Declarar `capacidad` (lista cerrada de `src/lib/capabilities.ts`) y reusar la
   función de servidor que ya usa la pantalla; no reescribir la regla.
2. Empezar por solo lectura. Lo irreversible (enviar una campaña, dar acceso,
   unificar) tiene que pasar por una vista previa y una confirmación humana.
3. Lo que viaja en la respuesta sale de datos que cargó alguien (contactos,
   formularios públicos, mensajes): es **texto no confiable**. La descripción de
   la herramienta lo dice, y ninguna herramienta debe decidir una acción a
   partir de ese texto.
4. No importar correo, marketing, WhatsApp, Zoom ni el agente desde
   `src/server/mcp/`: `tests/unit/mcp-herramientas.test.ts` lo exige.
5. Ninguna herramienta nueva devuelve montos si la capacidad de cobranza no la
   abre.

## Archivos

- `src/lib/mcp-token.ts` — forma, hash y lectura del encabezado (puro).
- `src/server/mcp/tokens.ts` — emitir, listar, revocar y resolver.
- `src/server/mcp/tools.ts` — `HERRAMIENTAS` y `crearServidorMcp`.
- `src/app/api/mcp/route.ts` — el borde HTTP.
- `src/app/api/settings/mcp-tokens/` — administración de tokens (`accesos.gestionar`).
- `src/app/(app)/settings/mcp/page.tsx` + `src/components/settings/mcp-tokens-client.tsx`
  — la pantalla; `src/lib/mcp-token-ui.ts` — comando, estado y orden (puro, sin `node:crypto`).
- Tabla `mcp_token` (migración 0092, con RLS).
