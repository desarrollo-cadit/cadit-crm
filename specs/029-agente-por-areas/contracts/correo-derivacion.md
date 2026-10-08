# Contrato — correo de derivación a un área (029)

Lo arma `src/server/areas/email.ts`; lo envía el adaptador `src/lib/m365`
(única frontera con Graph). Plantilla: `docs/email-templates/derivacion-area.html`
(archivo suelto, editable por el dueño, como las de 007).

## Sobre (envelope)

| Campo | Valor |
|---|---|
| From | `M365_SENDER` (buzón ya acotado por `ApplicationAccessPolicy`; no hay buzón por área) |
| To | `area_config.mailbox` |
| Cc | `cc_emails` ∪ correos de `cc_seller_ids` activos con correo — sin duplicados, sin el `To`. Omitidos se registran en `recipients.omitted` |
| Reply-To | `collected.email` si valida como correo; si no, ausente |
| Bcc | ninguno (`M365_BCC` NO aplica a derivaciones: es registro de correos a alumnos) |
| `saveToSentItems` | `true` |

## Asunto

Apertura: `[<Área>] <resumen> — <nombre> (<empresa>)`

- `<Área>`: `Ventas` | `Soporte`.
- `<resumen>`: `summary` en una línea, recortado a 80 caracteres con `…`.
- `<nombre>`: `collected.name` ?? nombre del contacto ?? `Contacto de WhatsApp`.
- `(<empresa>)`: solo si hay `collected.company`; si no, se omite con el
  espacio y los paréntesis.
- Se quitan saltos de línea y caracteres de control (anti header-injection;
  Graph lo serializa en JSON pero el asunto se ve en clientes de correo).

Seguimiento: `RE: <asunto de apertura>` (idéntico; research DV-005).

## Cuerpo (HTML, todo valor escapado)

1. Encabezado: área, `case_ref` ("Caso AH-7K3Q2M"), tipo (Nueva consulta /
   Seguimiento), fecha en la zona de la organización.
2. **Resumen** (`summary`).
3. **Datos de contacto**: tabla clave/valor de `collected`; el correo con la
   nota "declarado por el cliente, no verificado". **Teléfono**: `contact.phone`
   si existe; si el contacto es BSUID, NO se muestra teléfono y se indica
   "Contacto sin número visible — responder por WhatsApp desde la academia".
4. **Datos faltantes**: lista de `missing` con rótulos humanos ("Cantidad",
   "Desde cuándo"), o "Ninguno".
5. **Identidad de WhatsApp**: `contact.wa_identity` + nombre de perfil.
6. En seguimiento: **Qué hay de nuevo** (`collected_delta`) arriba de todo.
7. **Transcripción**: mensajes de la conversación en curso, en orden, con
   hora y autor (Cliente / Asistente / Operador). Adjuntos como
   `[adjunto: imagen]` (no se reenvían). Tope: últimos 100 mensajes con la
   nota "(se omiten N mensajes anteriores)".
8. Pie: "Este correo lo envió el asistente de WhatsApp de <organización>. Para
   responderle al cliente, respondé a este correo (va a <Reply-To>) o
   contactalo por <canal>."

## Escapado

`renderTemplate` escapa todo valor `{{x}}` con `escapeHtml` (`@/lib/utils`).
La transcripción y las tablas son bloques de varias filas: se agrega a
`templates.ts` el marcador `{{{x}}}` que **solo** acepta un `SafeHtml` (tipo
marcado que únicamente produce `htmlRows()` en `email.ts`, escapando cada
celda). Pasar un `string` crudo a `{{{x}}}` no compila. El texto de los
clientes es entrada hostil: `<script>`, `<a href>` y comillas quedan como
texto (test).

## Sandbox

- `conversation.is_test` → no se llama a `sendMail`; `status = simulado`.
  Guard en `src/server/areas/handoff.ts` + test estructural (como
  `tests/unit/send-sandbox.test.ts`): el único import de `sendMail` en
  `src/server/areas/` es `email.ts`, y `email.ts` solo es invocado desde la
  tarea `onAfterCommit` que lee `is_test=false`.
- E2E: `M365_GRAPH_BASE_URL`/`M365_LOGIN_BASE_URL` → m365-mock.
