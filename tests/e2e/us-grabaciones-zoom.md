# US 030 — Grabaciones de Zoom: conexiones, sección central y adjudicación

Automatizado en `scripts/e2e/grabaciones-zoom.mjs` (sección `grabaciones-zoom`
de `scripts/e2e-selftest.mjs`, también al final de la corrida completa). Solo:

```bash
E2E_SECCIONES=grabaciones-zoom node --env-file=.env.e2e scripts/e2e-selftest.mjs
```

Estado: **los 20 checks automatizados** + el bloque de pantalla y el addendum.
El check 19 (periódica) vive en su propia sección, `grabaciones-zoom-periodica`,
porque necesita la app con la periódica ENCENDIDA y la sección principal la
necesita APAGADA:

```bash
# app con ZOOM_SYNC_INTERVAL_MIN=1 (además de las ZOOM_*_BASE_URL del mock)
E2E_SECCIONES=grabaciones-zoom-periodica node --env-file=.env.e2e scripts/e2e-selftest.mjs
```

**Guard**: las dos secciones empiezan preguntándole a la app
`GET /api/dev/zoom-mock/config` a dónde le habla su adaptador, y ABORTAN (con
un check en rojo) si no son las del zoom-mock — una corrida que olvidó las
variables le mandó credenciales de mentira a zoom.us. La principal además
aborta si la periódica está encendida.

## Preparación (por la API, como un usuario)

- App con el zoom-mock: `WA_MOCK_ENABLED=true`,
  `ZOOM_API_BASE_URL=<app>/api/dev/zoom-mock/v2`,
  `ZOOM_OAUTH_BASE_URL=<app>/api/dev/zoom-mock`, `ZOOM_SYNC_INTERVAL_MIN=0`.
  Base `vocero_e2e` con la migración 0052. **Nunca** se llama a Zoom real.
- Al empezar se archivan las conexiones de corridas anteriores y se vacía el
  mock (si no, la sincronización de la organización las incluiría).

1. Sesión de staff (operador E2E, puede todo).
2. Dos aulas: "Zoom 1" (PMI `https://zoom.us/j/1110000001`) y "Zoom 2"
   (PMI `https://zoom.us/j/2220000002`), con sufijo por corrida.
3. Cohortes A (Zoom 1, `meeting_url` `https://zoom.us/j/9990000001?pwd=x`),
   B (Zoom 2) y C (Zoom 1, mismo horario que A: choque deliberado), martes y
   jueves 18:30–21:30 en las últimas tres semanas; cronogramas generados.
   Enlace de grabación pegado a mano en A/3.
4. `POST /api/dev/zoom-mock/seed` con `pageSize: 2`, una cuenta y dos usuarios:
   - R1: `u1`, reunión `9990000001`, A/1 + 4 min (enlace con `pwd` ya embebido).
   - R2: `u2`, reunión `2220000002` (PMI), B/1 + 2 min.
   - R3: `u1`, reunión `1110000001` (PMI Zoom 1), inicio de A/2 = C/2.
   - R4: `u1`, reunión `9990000001`, un domingo 10:00, `password: 7777`.
   - R5: `u2`, B/2 + 3 min, `share_url` sin `pwd`, `recording_play_passcode: abc123`.
   - R6: `u1`, reunión `9990000001`, A/3 + 1 min (A/3 tiene enlace manual).

## Checks

| # | Historia | Paso | Resultado observable |
|---|---|---|---|
| 1 | US4 | `POST /api/settings/zoom/connections` con `clientSecret: "bad-…"` + `POST …/test` | 201 `sin_probar` con `clientSecretLast4`; `/test` → 200 `{ok:false, error:"credenciales_invalidas", message}` legible; estado `error`; ninguna respuesta trae el secreto |
| 2 | US4 | `PATCH` con secreto bueno + `/test` | Vuelve a `sin_probar`; `/test` lista `u1`, `u2`; GET con `status: ok` y solo `clientSecretLast4`; el log del mock no guarda autorización |
| 3 | US4 | `PUT /api/settings/zoom/rooms/{Zoom1}` → `u1`; Zoom 2 → `u2`; Zoom 2 → `u1` | 200, 200, 409 `usuario_ya_vinculado` con `roomName` = Zoom 1 |
| 4 | US1 | `POST /api/recordings/sync` dos veces seguidas | 202 `{runIds}`, luego 409 `sync_en_curso` con `startedAt` |
| 5 | US1 | Esperar `GET /api/recordings/sync` con `running: null` | `lastRun.status = ok`, `newCount = 6` |
| 6 | US1 | `GET /api/recordings` | R1..R6, más recientes primero, con aula y cuenta; R5 `playUrl` termina en `pwd=abc123` y `passcode: null`; R4 `passcode: "7777"`; ninguna columna cifrada; log del mock con `next_page_token` y tramos ≤ 30 días; filtro por aula Zoom 2 → R2/R5; cursor 4 + 2. *(US2: estados R1 asignada A/1, R2 asignada B/1, R3 ambigua A/2–C/2, R4 sin_clase, R6 conflicto con A/3)* |
| 6b | US1 | Segunda sincronización | Mismas 6 filas (mismos ids), `newCount = 0` |
| 7 | US2 | Segunda sincronización | Mismos estados (idempotencia de la adjudicación) |
| 8 | US6 | Portal del alumno de A (`/api/portal/me/*`) y del profesor de A | Clase 1 ofrece R1, la 3 el enlace manual; R3/R4/R6 (no adjudicadas) y R2/R5 (otra cohorte) no aparecen en ninguna respuesta; sin `recordingSource` |
| 9 | US6 | Alumno de B y profesor de B | R1 no aparece en ningún `GET /api/portal/me/*`; la cursada de A → 404; la cohorte A para el profesor de B → 404; B sí ve R2 en B/1 |
| US6-3 | US6 | El profesor de A pega su enlace en A/3 (que ofrecía R6) + sync | Gana el suyo; R6 → `manual/sin_clase`; la sincronización no lo pisa |
| 10 | US3 | `PUT /api/recordings/R3/assignment {classSessionId: C/2}` → sync | `manual/asignada` a C/2, se mantiene |
| 11 | US3 | `DELETE /api/recordings/R1/assignment` → sync | R1 `manual/sin_clase`; A/1 sin grabación en el portal |
| 12 | US3 | `POST /api/recordings/R1/assignment/reset` | Vuelve a A/1 (`auto/asignada`) |
| 13 | US3 | `PUT …/R6/assignment {A/3}` sin `replace` | 409 `requiere_reemplazo`; con `replace:true` → 200 |
| 14 | US3 | Asignar a una clase cancelada | 422 `clase_cancelada` |
| 15 | US5 | `zoom-mock/fail {429, times:2, retryAfterSec:1}` + sync | Termina `ok` |
| 16 | US5 | `fail {500, times:100}` + sync (se apaga al terminar) | `lastRun.status = error` con mensaje propio, `syncedThrough` sin cambio, `/api/health` y las clases responden durante la corrida |
| 17 | US1 | Archivar la conexión + sync | 422 `sin_conexiones`; las 6 siguen listadas con `connection.archived = true`; al final se desarchiva |
| 18 | US1 | Sin conexiones activas (al empezar) | Sync → 422 `sin_conexiones`; en una base que nunca conectó Zoom, `configured:false` (estado "Conectá Zoom"); el enlace manual de A/3 funciona igual |
| 19 | US5 | Sección `grabaciones-zoom-periodica`: conexión + aula nuevas con R8, SIN apretar Sincronizar | R8 aparece sola en ≤ intervalo + 150 s y la corrida termina `ok`; con la periódica apagada se salta con aviso |
| 20 | US1/US3 | Cuenta `soporte` y cuenta con un rol sin `grabaciones.ver` | Soporte: `/grabaciones` y la lista 200, asignar y sincronizar 403. Sin la capacidad: `/api/recordings` y su estado 403 y el menú de `/contacts` no enlaza `/grabaciones` (el de soporte sí) |

## Pantalla (`/grabaciones`, Playwright)

- Filtro aula "Zoom 2" + rango B/1–B/2 → solo R2 y R5.
- "Copiar enlace" en R5 (contexto con `clipboard-read`) deja su `playUrl` en el
  portapapeles y muestra "Enlace copiado".
- "Ver" es un enlace a `playUrl` con `target="_blank"` y `rel="noopener…"`
  (se comprueba por atributos: abrirlo saldría a zoom.us).
- Capturas en tema claro y oscuro (`<tmp>/cadit-030-grabaciones-{light,dark}.png`).
- *(US2/US3)* La fila ambigua se destaca y su diálogo muestra A/2 y C/2 como sugeridas.

## Addendum (prueba en vivo, 2026-10-09)

| # | Qué | Acción | Resultado esperado |
|---|---|---|---|
| A2 | Sin aulas vinculadas | Sync con la conexión probada y ninguna aula | 422 `sin_aulas` "No hay aulas vinculadas a Zoom: vinculalas en Configuración › Zoom"; sin corrida ni `syncedThrough` |
| A3 | Vincular | `PUT /settings/zoom/rooms/{aula}` con correo y PMI | `account_email` del aula = correo de Zoom; Zoom 2 (enlace ≠ PMI) avisa con `suggestedUrl`, Zoom 1 no |
| A3 | Actualizar enlace (UI) | Botón "Actualizar enlace del aula a la sala personal de Zoom" | El aviso desaparece; `roomUrl` = `https://zoom.us/j/<pmi>`; el nombre no cambia |
| A4 | Transcripción | R5 con `TRANSCRIPT` | `hasTranscript` y chip "Transcripción" solo en R5; duración "2 h 55 min" |
| B | Tabla | Página/tamaño/orden | `total` + `totalPages`; página fuera de rango → la última; `sort=asc` invierte; tamaño 30 → 422; filtros en la URL sobreviven al recargar; a 390 px solo scrollea la tabla |
| A1 | Aula vinculada después | Zoom 3 → u3 tras sincronizar | u3 pide 90 días (u1 solo el solape); trae R7 de hace 60 días |

Al salir, la sección deja el zoom-mock vacío y sin falla programada.

La sección `roles` suma la cuenta dual (profesor + equipo, "Ver como").
