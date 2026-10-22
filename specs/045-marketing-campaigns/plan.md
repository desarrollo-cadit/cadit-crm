# Implementation Plan: Marketing — campañas por correo (etapa 1)

**Branch**: `045-marketing-campaigns` | **Fecha**: 2026-10-22 | **Spec**: [spec.md](./spec.md)

**Migración**: `drizzle/0071_campanas_de_marketing.sql` · **Research**:
[research.md](./research.md) · **Modelo**: [data-model.md](./data-model.md) ·
**Contratos**: [contracts/](./contracts/) · **Prueba local**:
[quickstart.md](./quickstart.md)

## Summary

Sección **Marketing** del panel: audiencias armadas con filtros de negocio
(origen, etapa, grupo, curso, curso de interés, empresa, fecha de alta) que se
evalúan al usarse; campañas con un cuerpo de **bloques** (títulos, párrafos con
negrita/cursiva/enlaces, listas, imágenes subidas, botones) sin HTML libre,
vista previa idéntica al correo y envío de prueba; envío de a uno por
Microsoft 365 desde un **buzón de marketing separado**, con tope de 500,
idempotente, cancelable, que se pausa ante el límite del proveedor y se
retoma solo tras un reinicio; enlace de **baja firmado** sin login que toda
campaña posterior respeta y que no toca el correo operativo; tabla de
destinatarios y métricas (enviados, fallidos, bajas, clics). Sin dependencias
nuevas: reusa el bucle de `processRecipients`, el adaptador `src/lib/m365`, el
volumen `MEDIA_DIR` y la gramática de `markdown.tsx`.

## Technical Context

**Language/Version**: TypeScript estricto (`strict` + `noUncheckedIndexedAccess`), Node 22.

**Primary Dependencies**: Next.js 15 (App Router) + React 19, Drizzle ORM, Better Auth (organization), Zod, Tailwind (tokens), `node:crypto` (HMAC/HKDF). **Ninguna dependencia nueva** (research R5).

**Storage**: PostgreSQL con RLS (`tenant_isolation`), 8 tablas nuevas (data-model); imágenes en el volumen `MEDIA_DIR` (`saveMediaFile`).

**Testing**: Vitest (unit puro con TDD rojo-primero, servidor con dobles de base, guards estructurales) + self-test E2E `scripts/e2e/marketing.mjs` contra la app viva con el m365-mock.

**Target Platform**: contenedor Linux (Coolify / docker compose), una instancia = un negocio.

**Project Type**: web monolito (`src/app` + `src/server` + `src/lib` + `src/components`).

**Performance Goals**: vista previa de audiencia < 1 s con ~5 000 contactos (SC-001); 500 correos en < 30 min (SC-002: 2 s de pausa ≈ 17-20 min); el envío corre en segundo plano y no bloquea pedidos.

**Constraints**: de a un correo por vez; una campaña `enviando` por organización; Exchange ~30 correos/min por buzón; sin cola externa; `is_test` nunca; a lo sumo una vez por destinatario.

**Scale/Scope**: cientos de destinatarios por campaña (tope 500), decenas de campañas al año, ~6 pantallas (Marketing: lista, audiencia, campaña/editor, detalle; Ajustes → Marketing; página pública de baja).

## Constitution Check

*Antes de la Fase 0 y re-evaluado tras el diseño (Fase 1): **PASA**, sin violaciones.*

| Principio | Estado | Cómo se cumple |
|---|---|---|
| **I. Seguridad** | ✅ | La credencial M365 sigue en el entorno y jamás viaja (solo `m365Configured: boolean`). Un dato que no se debe ver no viaja: `marketing.ver` es la única puerta a nombres+correos en bloque; la página de baja no muestra el correo ni el nombre; token inválido = mismo texto neutro, 404 nunca 403. Enlaces firmados con HMAC (HKDF de `ENCRYPTION_KEY`) y `timingSafeEqual`. HTML del correo armado por una función pura que escapa todo texto; sin HTML libre (FR-010). Redirección de clics solo a URLs guardadas de la campaña (sin redirección abierta). |
| **II. Soberanía (1.8.0 ítem 3)** | ✅ | Mismo adaptador `src/lib/m365`, sin servicio nuevo. **(a)** buzón de marketing en `marketing_settings`, distinto de `M365_SENDER` (422 `buzon_no_separado`) y probado antes de usarse; la `ApplicationAccessPolicy` se documenta en el quickstart. **(b)** enlace de baja firmado en cada correo (pie no editable), sin login; la baja se registra en el contacto, la consultan TODAS las audiencias y el ejecutor antes de cada envío, y ningún módulo de correo operativo la importa (test estructural). **(c)** tope 500 validado al confirmar; envío de a uno (bucle secuencial, una campaña `enviando` por organización). **(d)** `is_test`: exclusión explícita "prueba" en la única función que arma destinatarios. Imágenes en `MEDIA_DIR`, servidas por la app. |
| **III. Multi-tenancy** | ✅ | 8 tablas con `organization_id` NOT NULL, índices org-first y RLS + `tenant_isolation` escritas a mano en la 0071. Consultas con `scoped()`. Rutas de staff en `withAuth`; públicas y ejecutor en `withOrganizationScope` (`resolveSoleOrganizationId`). |
| **IV. Idempotencia** | ✅ | `UNIQUE (campaign_id, email)`; reclamo atómico `pendiente → enviando`; fila `enviando` huérfana tras reinicio → `fallido/interrumpido` (nunca se reenvía); 429 vuelve a `pendiente` porque Graph no lo aceptó; baja con índice único parcial y `on conflict do nothing`; 0071 re-ejecutable. |
| **V. Calidad** | ✅ | Gate `typecheck + lint + build + test`; TDD en lo puro (`audience`, `body`, `render-email`, `link-token`, transiciones). |
| **VI. Specs antes de código** | ✅ | spec aprobada; este plan; tareas después. |
| **VII. Trazabilidad** | ✅ | Decisiones DV-001..DV-014 abajo; preguntas abiertas P-01..P-04 con responsable (el dueño). |
| **VIII. Foco (1.8.0)** | ✅ | Solo contactos PROPIOS (los de la base: formularios, WhatsApp, inscripciones). No hay importación de listas, ni constructor de flujos, ni WhatsApp masivo. |
| **IX. Verificación en vivo** | ✅ | Self-test `marketing` con el m365-mock (outbox, 500, 429, 403, reinicio, cancelación, baja, clic). Lo no verificable (aspecto en Outlook/Gmail, la política de Exchange real) queda marcado "pendiente de verificación humana" (quickstart §6). |

## Decisiones

- **DV-001 Tablas propias, bucle compartido.** `marketing_campaign` +
  `marketing_campaign_recipient` con estado persistido por fila; se
  generaliza `processRecipients` (`bulk-sends.ts:237`) a `RecipientRef = { id }`
  y lo usan los dos motores. No se extiende `bulk_send_*`: cohorte e
  inscripción NOT NULL con cascada, estado derivado, candado en memoria
  (research R1).
- **DV-002 A lo sumo una vez.** Reclamo atómico antes de Graph; una fila
  `enviando` sin dueño tras un reinicio se marca `fallido / interrumpido` y no
  se reintenta. Preferimos un correo que no salió (visible en la tabla) a uno
  duplicado (SC-004).
- **DV-003 Lease en la base + retomar solo.** `lease_until` en la campaña
  (patrón Zoom); `startMarketingOnBoot` y una periódica (`MARKETING_TICK_SEC`)
  retoman `enviando` con lease vencido o pausa cumplida (US3-5, Edge límite).
- **DV-004 `sendMail` aprende tres cosas**: `sender` y `fromName` opcionales, y
  distinguir `throttled` (429/503 + `Retry-After`) y `mailbox_denied`
  (401/403) de `send_failed`. Los llamadores operativos no cambian.
- **DV-005 Una campaña enviándose por organización** (índice único parcial):
  el cupo de Exchange es por buzón.
- **DV-006 Buzón, remitente y pie en la base**, no en el entorno: el dueño los
  cambia y los prueba desde Ajustes (US5). La credencial sigue en el entorno.
- **DV-007 Cuerpo en bloques JSON** con la gramática en línea de
  `markdown.tsx` extraída a `src/lib/markdown-inline.ts`; `<textarea>` por
  bloque (pegar = texto plano). Render puro a HTML con estilos en línea y tablas;
  color de `getBranding` → `resolveAccentSet(accent, "light")`.
- **DV-008 Variables con alternativa en línea** `{{nombre|colega}}`; los valores
  se congelan por destinatario al confirmar (`vars`), así reanudar produce el
  mismo correo.
- **DV-009 Audiencia = filtros vivos; campaña = foto.** Los filtros se copian a
  la campaña en borrador y se congelan al confirmar junto con los
  destinatarios (FR-005, FR-006). Confirmar exige `expectedCount` igual al
  recalculado (FR-019: "la cantidad exacta").
- **DV-010 Baja en dos pasos** (GET muestra, POST registra) por los escáneres
  de seguridad de correo. Ver **P-01**.
- **DV-011 Baja por persona Y por dirección**: se excluye si hay baja activa
  por `contact_id` o por correo normalizado; sobrevive al borrado del contacto.
- **DV-012 Clics solo a destinos guardados** (`marketing_campaign_link`), token
  de clic con propósito distinto al de baja.
- **DV-013 Imágenes con token público de 256 bits**, por bytes, 5 MB, colgadas
  de la campaña.
- **DV-014 Capacidades**: `marketing.ver` / `.enviar` → Dirección,
  Coordinación, Ventas; `marketing.configurar` (ajustes y revertir bajas) →
  Dirección. Soporte y Administración, ninguna. Ver **P-02**.

## Project Structure

### Documentation (this feature)

```text
specs/045-marketing-campaigns/
├── spec.md
├── plan.md              # este archivo
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── audiences.md
│   ├── campaigns.md
│   ├── send-and-cancel.md
│   ├── recipients-and-metrics.md
│   ├── images.md
│   ├── public-unsubscribe.md
│   ├── public-click.md
│   └── marketing-settings.md
└── tasks.md             # /speckit-tasks (no lo crea este plan)
```

### Source Code

| Capa | Archivo | Qué hace |
|---|---|---|
| Migración | `drizzle/0071_campanas_de_marketing.sql` (+ `meta/_journal.json`) | 8 tablas, índices, CHECKs, RLS a mano, capacidades por `key` |
| Esquema | `src/lib/db/schema.ts` · `src/lib/db/ids.ts` | Tablas y prefijos `mks/mka/mkc/mkr/mkl/mkk/mku/mki` |
| Entorno | `src/lib/env.ts` | `MARKETING_SEND_PAUSE_MS`, `MARKETING_TICK_SEC` |
| Capacidades | `src/lib/capabilities.ts` · `src/lib/guia.ts` · `src/components/settings/roles-client.tsx` | 3 capacidades, filtros por rol, guía y rótulos |
| Navegación | `src/lib/nav.ts` | "Marketing" en el grupo CRM; pestaña de Ajustes |
| Puro | `src/lib/markdown-inline.ts` | Gramática en línea compartida (extraída de `components/offline-courses/markdown.tsx`, que pasa a usarla) |
| Puro | `src/lib/marketing/audience.ts` | `AudienceFilters` (Zod), partición de exclusiones, deduplicación, tope |
| Puro | `src/lib/marketing/body.ts` | `CampaignBody` (Zod), variables, validación de URLs, extracción de enlaces |
| Puro | `src/lib/marketing/render-email.ts` | Bloques + marca + pie + enlaces rastreados → HTML con estilos en línea |
| Puro | `src/lib/marketing/link-token.ts` | HKDF, firmar/verificar tokens de baja y de clic |
| Puro | `src/lib/marketing/transitions.ts` | Transiciones de campaña y destinatario; clasificación de resultados de `sendMail` |
| Adaptador | `src/lib/m365/client.ts` | `sender`, `fromName`, códigos `throttled` (`retryAfterMs`) y `mailbox_denied` |
| Plantilla | `docs/email-templates/campana-marketing.html` | Armazón 600 px con `{{{cuerpo}}}` y pie fijo; `TemplateName` en `src/server/email/templates.ts` |
| Servidor | `src/server/marketing/settings.ts` | Leer/guardar ajustes, "listo para enviar", probar el buzón |
| Servidor | `src/server/marketing/audiences.ts` | `evaluarAudiencia` (única fuente de destinatarios), opciones de filtros, CRUD |
| Servidor | `src/server/marketing/campaigns.ts` | CRUD de borrador, vista previa, prueba, confirmar envío, cancelar, DTOs y métricas |
| Servidor | `src/server/marketing/images.ts` | Subir, borrar, leer por token |
| Servidor | `src/server/marketing/send.ts` | Render por destinatario + `sendMail` desde el buzón de marketing (único llamador con `sender`) |
| Servidor | `src/server/marketing/runner.ts` | Lease, reanudación, bucle `processRecipients`, pausa, cancelación, `startMarketingScheduler` |
| Servidor | `src/server/marketing/unsubscribe.ts` | Verificar token, registrar baja, revertir, estado por contacto, registrar clic |
| Servidor | `src/server/bulk-sends.ts` | `processRecipients` genérico (sin cambio de comportamiento) |
| Servidor | `src/server/seguimiento.ts` | `marketing` en el DTO y entradas en la línea de tiempo |
| Arranque | `src/instrumentation-node.ts` | `startMarketingOnBoot()` (misma guarda `shouldStartScheduler`) |
| Rutas staff | `src/app/api/marketing/audiences/{route.ts,options/route.ts,preview/route.ts,[id]/route.ts}` | contracts/audiences.md |
| Rutas staff | `src/app/api/marketing/campaigns/{route.ts,[id]/route.ts,[id]/preview,[id]/test,[id]/send,[id]/cancel,[id]/metrics,[id]/recipients,[id]/links,[id]/images,[id]/images/[imageId]}/route.ts` | contracts/campaigns.md, send-and-cancel.md, recipients-and-metrics.md, images.md |
| Rutas staff | `src/app/api/settings/marketing/{route.ts,test/route.ts}` | contracts/marketing-settings.md |
| Rutas staff | `src/app/api/contacts/[id]/marketing-unsubscribe/route.ts` | Revertir baja |
| Rutas públicas | `src/app/api/public/marketing/{images/[token],unsubscribe,click/[token]/[linkId]}/route.ts` | Sin sesión, `withOrganization` |
| Página pública | `src/app/baja/[token]/page.tsx` | Confirmación de baja |
| Mock | `src/app/api/dev/m365-mock/fail/route.ts` · `src/server/dev/m365-mock-state.ts` · `[...path]/route.ts` | Modos `throttle` (429 + `Retry-After`) y `deny` (403) |
| UI | `src/app/(app)/marketing/{page.tsx,audiencias/[id]/page.tsx,campanas/[id]/page.tsx}` | Lista (pestañas Campañas / Audiencias), audiencia, campaña |
| UI | `src/components/marketing/audience-builder.tsx` | Filtros + conteo + excluidos por motivo + lista paginada |
| UI | `src/components/marketing/campaign-editor.tsx` · `block-editor.tsx` · `email-preview.tsx` | Bloques, imágenes, variables, vista previa en `<iframe sandbox srcdoc>`, prueba |
| UI | `src/components/marketing/send-dialog.tsx` | "Se enviará a N personas" (reusa `ConfirmSendDialog`) |
| UI | `src/components/marketing/campaign-results.tsx` | Métricas, tabla de destinatarios con filtros, cancelar, aviso de pausa/detención |
| UI | `src/app/(app)/settings/marketing/page.tsx` · `src/components/settings/marketing-settings-client.tsx` | Buzón, remitente, pie, probar |
| UI | Pestaña Seguimiento del contacto (componente existente de `/contacts/[id]`) | Baja con fecha y campaña; "Reactivar" con `marketing.configurar` |
| E2E | `scripts/e2e/marketing.mjs` + registro en `scripts/e2e-selftest.mjs` | Self-test de punta a punta |
| Docs | `CLAUDE.md` | Fila del mapa del código, viñeta de Soberanía (1.8.0), sección 045 |

### Tests

| Archivo | Qué fija |
|---|---|
| `tests/unit/marketing-audiencia.test.ts` | Filtros Zod, partición (prueba > baja > archivado > sin_correo > duplicado), dedupe por normalizado, tope |
| `tests/unit/marketing-cuerpo.test.ts` | Bloques, variables desconocidas, alternativas, URLs inseguras, HTML pegado queda texto |
| `tests/unit/marketing-render.test.ts` | Escapado, estilos en línea, color de marca con contraste, pie y baja SIEMPRE presentes, enlaces rastreados |
| `tests/unit/marketing-token.test.ts` | Firma, alteración, propósito cruzado (clic ≠ baja), otro destinatario |
| `tests/unit/marketing-envio.test.ts` | Ejecutor con dobles: reclamo, interrumpido, 429 → pendiente + pausa, 403 → detenida, baja a mitad, cancelación, terminar |
| `tests/unit/marketing-guard.test.ts` | El correo operativo no importa `server/marketing`; solo `send.ts` pasa `sender`; `evaluarAudiencia` es el único origen de destinatarios |
| Ajustados | `route-capabilities` (excepciones públicas), `rls-cobertura` (8 tablas), `rol-ventas` (suma `.ver`/`.enviar`), `seed-roles`, `guia`, `bulk-sends` (firma genérica), `m365-client` (códigos nuevos) |

**Structure Decision**: monolito existente; dominio nuevo en
`src/server/marketing/` y `src/lib/marketing/`, igual que `offline-courses` y
`zoom`. Nada de `src/server/email/` cambia salvo el `TemplateName`.

## Entrega por fases

Cada fase termina con el gate técnico verde y su parte del self-test.

| Fase | Prioridad | Historias | Contenido | Se puede mostrar |
|---|---|---|---|---|
| **F1 Audiencias** | P1 | US1 | 0071 completa (todas las tablas, RLS, capacidades), nav, guía, `audience.ts`, `audiences.ts`, rutas de audiencias, `audience-builder` | Contar, listar y guardar segmentos, con excluidos por motivo |
| **F2 Editor + vista previa + prueba** | P1 | US2 | `markdown-inline`, `body.ts`, `render-email.ts`, plantilla, imágenes (subir y servir), editor, vista previa, prueba; `sendMail` con `sender`/`fromName`; ajustes **mínimos** (buzón/remitente/pie por PUT) para poder probar | Redactar y recibir una prueba |
| **F3 Envío + resultados** | P1 | US3 | `link-token`, `send.ts`, `runner.ts` (lease, reanudar, pausa, cancelar), `throttled`/`mailbox_denied`, arranque y periódica, rutas send/cancel/metrics/recipients/links, clic público, `campaign-results`, mock 429/403 | Campaña a una audiencia de prueba con tabla y métricas |
| **F4 Bajas** | P1 | US4 | Página `/baja/[token]`, POST público, exclusión en audiencias y en el ejecutor, Seguimiento, revertir, guard de correo operativo | **Requisito de lanzamiento**: F3 no se habilita en producción sin F4 |
| **F5 Ajustes de marketing** | P2 | US5 | Pantalla completa, "Probar el buzón" con verificación, mensajes de error de Exchange, "qué falta" en el botón Enviar | Configurar y probar el buzón sin tocar el entorno |

F3 y F4 se integran en la misma rama antes de desplegar: el enlace de baja es
condición de la constitución (1.8.0 II.b), no una mejora.

## Riesgos y preguntas abiertas (para el dueño)

- **P-01 — Baja en uno o dos clics.** La spec dice "abre el enlace … y ve la
  confirmación". Planificamos dos pasos (página + botón "Confirmar la baja")
  porque los filtros de seguridad de Microsoft 365 y otros abren los enlaces
  solos y darían de baja a gente que no lo pidió. ¿Se acepta? *Responsable:
  dueño.*
- **P-02 — Quién envía.** Propuesta: Ventas y Coordinación pueden enviar sin
  aprobación de nadie; solo Dirección configura el buzón y revierte bajas.
  ¿Correcto, o Ventas solo arma borradores? *Responsable: dueño.*
- **P-03 — Interrumpido = no reenviar.** Si el servidor se cae justo mientras
  Graph acepta un correo, esa persona queda "Falló: se interrumpió" y no se
  reintenta (puede haberle llegado). Alternativa: reintentar y aceptar un
  posible duplicado. Elegimos no duplicar (SC-004). *Responsable: dueño.*
- **P-04 — Nombre del remitente.** Exchange suele mostrar el nombre del buzón y
  no el que manda la app; hay que configurar el mismo nombre en el buzón.
- **R-01 — Sin `List-Unsubscribe`.** Graph `sendMail` solo acepta cabeceras
  `X-…`: Gmail/Outlook no mostrarán su botón nativo de "Cancelar suscripción".
  El enlace del pie cumple la ley y la constitución; la entregabilidad puede
  resentirse con volúmenes grandes (no es el caso: ≤ 500).
- **R-02 — Clics inflados por escáneres.** Se ignoran clics repetidos < 10 s;
  "personas únicas" es la métrica a mirar.
- **R-03 — Política de Exchange.** Si el buzón de marketing no está en la
  `ApplicationAccessPolicy`, "Probar el buzón" lo detecta antes del primer
  envío (US5-2). Verificación humana en producción.

## Complexity Tracking

Sin violaciones de la constitución: no aplica.

## Verificación

- Unit (Vitest), TDD en lo puro (rojo primero): los seis archivos de la tabla
  de tests.
- Servidor con dobles de base: ejecutor (reanudar, 429, 403, cancelar, baja a
  mitad), confirmar envío (tope, `conteo_cambio`, `otra_campana_enviando`,
  `buzon_no_listo`), registrar baja idempotente, clic a enlace de otra campaña
  → 404.
- PostgreSQL descartable: migraciones 0000→0071 con el migrador, 0071 dos veces
  sin error, RLS habilitada con `tenant_isolation` en las 8 tablas, capacidades
  sumadas solo a los roles por `key`.
- Gate: `pnpm typecheck && pnpm lint && pnpm test` y
  `NEXT_DIST_DIR=.next-build pnpm build`.
- E2E: `E2E_SECCIONES=marketing` según quickstart §5.
- Pendiente de verificación humana: aspecto del correo en Outlook/Gmail/móvil
  y la `ApplicationAccessPolicy` real (quickstart §6).

## Decisiones del dueño (2026-10-22)

- **P-01 — Baja en dos pasos**: el enlace abre una página y la baja se confirma
  con un botón; los escáneres de correo que abren enlaces no dan de baja a
  nadie.
- **P-02 — Envío sin aprobación previa**: quien tiene `marketing.enviar`
  (Dirección, Coordinación, Ventas) envía directamente, con vista previa, envío
  de prueba y confirmación con la cantidad exacta.
- **P-03 — Caída a mitad de un envío**: el destinatario en vuelo se marca
  "falló" y no se reintenta; se prefiere perder un envío a duplicarlo.
- **P-04 — Nombre del remitente**: se configura en el buzón compartido de
  Microsoft 365 (Exchange suele mostrar ese nombre).
