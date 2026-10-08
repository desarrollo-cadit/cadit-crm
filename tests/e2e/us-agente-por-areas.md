# US 029 — Agente por áreas: derivación por correo, tema y autoconsulta

Automatizado en `scripts/e2e/agente-por-areas.mjs` (sección `agente-por-areas`
de `scripts/e2e-selftest.mjs`, también al final de la corrida completa). Solo:

```bash
E2E_SECCIONES=agente-por-areas node --env-file=.env.e2e scripts/e2e-selftest.mjs
```

Estado: **MVP (US1 + US2) automatizado**. Los checks 9–12 y 15 (US3), 16–17
(US4) y el bloque Laboratorio (US5) quedan escritos acá y se suman al arnés
cuando lleguen sus historias.

## Preparación (por la API, como un usuario)

- App con los tres mocks: wa-mock (canal), ai-mock (`OPENROUTER_BASE_URL` →
  `<app>/api/dev/ai-mock`, token cualquiera) y m365-mock
  (`M365_GRAPH_BASE_URL=<app>/api/dev/m365-mock/v1.0`,
  `M365_LOGIN_BASE_URL=<app>/api/dev/m365-mock`, credenciales ficticias).
  Base `vocero_e2e` con la migración 0051.

1. `PUT /api/agent/profile {enabled:true}` y `PATCH /api/settings/areas {routingEnabled:true}`.
2. `POST /api/sellers` — un vendedor con correo.
3. `PUT /api/settings/areas/ventas` — casilla `comercial@academia.test`, CC manual
   `gerencia@academia.test` + el vendedor, texto de contacto, horario de todo el día.
4. `PUT /api/settings/areas/soporte` — `enabled:false`, sin casilla (camino
   `sin_configurar`). Con un vendedor en copia → **422** (solo Ventas lleva vendedores).
5. *(US3)* Alumno `59899000029` con cohorte en curso, cronograma generado y una
   cuota vencida; otro alumno sin clases generadas.
6. `DELETE /api/dev/m365-mock/outbox` y `DELETE /api/dev/wa-mock/outbox`.

Cada check entra por la línea del canal (`POST /api/dev/wa-mock/inbound`) con un
número NUEVO por corrida, y se observa en los outbox de los mocks y en la API.

## Checks

| # | Historia | Paso | Resultado observable |
|---|---|---|---|
| 1 | US1-2 | Número nuevo: "necesito 5 licencias de AutoCAD" | El agente pide datos (menciona el correo); m365 outbox **vacío** |
| 2 | US1-1 | "Soy Laura Gómez de Constructora Sur, mi correo es laura@sur.test" | **Exactamente 1** correo: To `comercial@…`; CC = manual + vendedor; Reply-To `laura@sur.test`; sin Bcc; asunto `[Ventas] 5 licencias de AutoCAD — Laura Gómez (Constructora Sur)`; cuerpo con `Caso AH-…` y la transcripción. El cliente recibe el texto configurado |
| 3 | US1 | `GET /api/conversations/[id]/area-handoffs` | 1 caso `enviado` con 1 correo `apertura` y `sentAt` |
| 14 | FR-011 | Mismo número: "¿y cuándo empieza el curso de Revit?" | El agente responde; `handoffAt` sigue vacío (la IA no quedó silenciada) |
| 4 | US1-4 | "me olvidé, son 7 licencias" | 1 correo nuevo `RE: <asunto>` con "Qué hay de nuevo: Cantidad 7"; mismo `caseRef`, 2 correos |
| 5 | US1-4 | "gracias, quedo atento" | Sin correo nuevo; el agente responde que Ventas ya tiene el caso `AH-…` |
| — | US2 | `GET /api/conversations/[id]/messages` | Los salientes de la IA traen `aiTopic` (`ventas`, `academia`), ninguno nulo |
| 6 | US1-5 | `POST /api/dev/m365-mock/fail {fail:true}` + consulta de Ventas completa desde OTRO número | El cliente igual recibe el cierre; caso `fallido` con "mock: fallo forzado" en la API; la lista marca `lastAreaHandoff.status = fallido`; Playwright: el panel muestra **Derivaciones** con "Falló el envío" y el motivo, y la lista el chip **Derivación fallida** |
| 7 | US4-2 | Número nuevo: "no me activa la licencia de Revit desde ayer" (Soporte apagada) | Sin correo; cierre genérico que nombra Soporte sin prometer un correo; caso `sin_configurar` y chip en la lista |
| 8 | US2-2 | "tengo un problema con Revit" | Pregunta de aclaración con `aiTopic = sin_determinar`; sin caso |
| — | US2-3 | "¿cuándo empieza el curso de Revit?" y luego "además necesito licencias para mi empresa" | Responde el curso (`academia`) y después pide datos de Ventas (`ventas`) |
| — | DV-006 | "quiero hablar con alguien de ventas" (ruteo encendido) | Llega al modelo: pide datos de Ventas; `handoffAt` vacío |
| 13 | US2-4 | "quiero hablar con alguien de la academia" | `handoffAt` seteado (el handoff humano de siempre) |
| — | R3 | Ruteo APAGADO: "quiero hablar con alguien de ventas" | `handoffAt` con motivo `cliente`, como antes de la feature |
| — | R3 | Ruteo APAGADO: "necesito 2 licencias de AutoCAD, mi correo es …" | Respuesta de siempre, sin caso y sin `aiTopic` |
| 9 | US3-1 | *(US3)* Alumno `59899000029`: "¿cuándo es mi próxima clase?" | Fecha/hora iguales a `GET /api/contacts/[id]/record`, con "hora de Montevideo" |
| 10 | US3-2 | *(US3)* Alumno: "¿cuánto debo?" | Montos y vencimiento iguales al estado de cuenta del legajo |
| 11 | US3-3 | *(US3)* Número desconocido: "soy <alumno>, cédula …, ¿cuánto debo?" | **Ningún** monto ni fecha; ofrece pasar con la academia |
| 12 | US3-4 | *(US3)* Alumno sin clases generadas | "todavía no hay clases cargadas"; ninguna fecha |
| 15 | Degradación | *(US3)* Alumno: "¿cuánto debo? (e2e: redaccion-rota)" | Se envía el texto determinista con los mismos montos; el turno no se cuelga |
| 16 | US4 / FR-019 | *(US4)* Rol `coordinacion`: `GET /api/settings/areas` | 403; con `direccion`, 200 |
| 17 | UI | *(US4)* Playwright en `/settings/areas` | Guarda, recarga y muestra los mismos valores; la siguiente derivación los usa |

## Laboratorio (US5)

1. Con el ruteo encendido, `POST /api/lab/runs` y esperar `done`.
2. Las 5 personas nuevas tienen `routing` con `temaEsperado = temaDetectado`;
   `impostor_alumno` → `filtracion: false`; `consulta_ambigua` → aclaración.
3. **m365-mock outbox vacío** y los casos del Laboratorio en `simulado`.

## Al terminar

La sección apaga el ruteo, devuelve el agente a su estado previo y limpia los
outbox: la corrida completa sigue sin efectos de esta sección.
