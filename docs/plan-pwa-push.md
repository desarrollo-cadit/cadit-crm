# Plan: Portal del alumno como PWA con notificaciones push

Estado: PLAN (nada implementado). Fecha: 2026-11-04. Base: `main` en `e43f532`.

## Decisión y por qué

- PWA primero, app nativa (Expo) solo si la adopción de la PWA es baja.
- CadIT Campus es UNA sola empresa (sin white-label por cliente), así que una app en tiendas
  sería viable, pero el alumno solo consulta (notas, material, grabaciones, certificados) y
  recibe avisos. No justifica un segundo código ni cambiar la auth a bearer.
- Push web funciona en Android (Chrome) y en iOS 16.4+ SOLO con la PWA agregada a la pantalla
  de inicio y el permiso pedido desde un gesto del usuario. Aparece en pantalla bloqueada.
- Riesgo real = adopción en iOS, no la técnica. Por eso hay una pantalla guiada (Fase 3).

## Hechos verificados del repo

- `public/` solo tiene logos y `robots.txt`. NO hay manifest ni service worker.
- Next 15 App Router: el manifest va en `src/app/manifest.ts`. El service worker, estático en
  `public/sw.js` (sin dependencias).
- Última migración: `0095_mcp_token_rol`. La nueva es **0096**.
- Constitución 1.9.0 (`.specify/memory/constitution.md`): prohíbe servicios externos nuevos.
  Web Push pasa por los servidores de push de Apple/Google/Mozilla (el navegador los elige),
  así que hay que **enmendar a 1.10.0**, igual que se hizo con Zoom y Vimeo: dependencia
  OPCIONAL, tras un único adaptador, sin cuentas ni tokens de terceros (VAPID propio).
- No existe la dependencia `web-push` en `package.json`.
- Periódicas in-process arrancan desde `src/instrumentation-node.ts` con una variable
  `*_INTERVAL_MIN` (default 0 = apagada). Los avisos por correo del alumno ya existen en
  `src/server/email/assessment-notices.ts` (idempotencia con `assessment_notice.dedup_key`).
- Punto de publicación de una corrección: `publicarCorreccion()` en
  `src/server/corrections.ts:282` (usar `onAfterCommit`, no fire-and-forget suelto).
- Rutas del alumno: `/api/portal/me/*` con `requireStudentPortal` (`src/lib/portal-api.ts`).
  Cada ruta nueva debe clasificarse CONTENIDO o LOGRO (`tests/unit/vencimiento-de-accesos-estructura.test.ts`).
  Suscribirse a push no es contenido de curso: clasificar como cuenta, no vence.

## Fases

### Fase 1 — PWA instalable (sin push)
- `src/app/manifest.ts`: nombre, `display: standalone`, `start_url: /`, colores desde tokens
  (navy `#001b5e` para `theme_color`), íconos 192/512 + maskable (generar desde el isotipo).
- `public/sw.js` mínimo: instalar/activar + (por ahora) nada de caché de API. NO cachear
  respuestas autenticadas ni de `/api/*`.
- Registrar el SW solo en el portal (`src/app/(portal)/layout.tsx`), en producción.
- Verificar: Lighthouse "installable"; instalar en Android y en iOS (Añadir a inicio).

### Fase 2 — Suscripciones y envío (servidor)
- Migración **0096**: tabla `push_subscription` (`id` con prefijo nanoid, `organization_id`
  NOT NULL, `account_link_id` o `contact_id`, `endpoint` UNIQUE, `p256dh`, `auth`,
  `user_agent`, `created_at`, `last_seen_at`, `disabled_at`). Sumar a mano
  `enable row level security` + política `tenant_isolation` (`db:generate` no la genera;
  `tests/unit/rls-cobertura.test.ts` falla si falta). Cifrar `auth`/`p256dh` en reposo
  (`lib/crypto`) por la regla de secretos.
- Dependencia `web-push` + claves VAPID: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
  `VAPID_SUBJECT` en `.env` como placeholders `REEMPLAZA_...` con guía inline de cómo
  generarlas (`npx web-push generate-vapid-keys`). Privada solo en servidor, jamás al cliente.
- Adaptador ÚNICO `src/lib/push/` (analogía con `src/lib/zoom`): `enviar(subscription, payload)`;
  test-guard que falle si aparece `web-push` o `webpush` fuera del adaptador.
- `src/server/push/subscriptions.ts`: alta idempotente por `endpoint`, baja, y marcar
  `disabled_at` ante 404/410 del servicio de push (suscripción muerta).
- Rutas (alumno, `requireStudentPortal`): `POST /api/portal/me/push/subscribe`,
  `DELETE /api/portal/me/push/subscribe`, `GET /api/portal/me/push/config` (clave pública).
- Resiliencia: el envío NUNCA lanza hacia el flujo de negocio; errores se registran y se
  descartan. Un fallo de push no revierte una corrección publicada.

### Fase 3 — Pantalla guiada y permiso
- Componente en el portal: detecta plataforma (iOS/Android), si ya está instalada
  (`display-mode: standalone`) y el estado de `Notification.permission`.
- iOS no instalada: pasos con capturas ("Compartir → Añadir a pantalla de inicio").
- Botón explícito "Activar avisos" (gesto del usuario) → `Notification.requestPermission()`
  → `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` → POST.
- Preferencias por tipo de aviso (activar/desactivar cada uno) en la pantalla de cuenta.
- Copy en voseo institucional, "grupo" y "curso" (ver memoria portal-copy-register).

### Fase 4 — Disparadores
Cada uno reusa el MISMO selector/ventana que el aviso por correo equivalente (una sola
regla, dos canales), con idempotencia propia (`dedup_key` en tabla `push_notice` o columna
en la existente) para no duplicar en reinicios:
1. Corrección publicada → en `publicarCorreccion()` vía `onAfterCommit`.
2. Recordatorio de entrega N días antes → periódica existente de avisos de evaluaciones.
3. Prórroga aprobada/rechazada → en `extension-requests.ts`.
4. Clase por empezar (p. ej. 1 h antes) → periódica nueva `PUSH_CLASS_REMINDER_INTERVAL_MIN`
   (default 0). Saltear grupos finalizados, acceso vencido, contactos de prueba, archivados,
   etapa perdida.
- Payload mínimo y sin datos sensibles (la pantalla bloqueada es visible): título + frase
  corta + URL de destino. Nunca notas ni montos en el texto.
- Respetar el corte por vencimiento de acceso: no avisar de contenido ya vencido.

### Fase 5 — Medición y decisión sobre app nativa
- Métricas simples: % de alumnos con PWA instalada, % con push activo, por plataforma.
- Si el push activo en iOS es bajo y el negocio valora presencia en tiendas → evaluar Expo
  reusando `/api/portal/me/*` (requeriría plugin `bearer` de Better Auth y leer
  `Authorization` en `resolvePortalSession()`).

## Constitución y tests a tocar
- Enmendar `.specify/memory/constitution.md` a 1.10.0 (Web Push opcional, tras `src/lib/push`).
- Actualizar `CLAUDE.md`: fila nueva en el mapa del código + nota de constitución.
- Tests nuevos: adaptador (mock, jamás push real), guard de adaptador único, RLS, idempotencia
  de disparadores, "el servicio caído no rompe publicar corrección", DTO sin `status`/notas.
- Respetar: tests relacionados + typecheck + lint por fase; suite completa + build una vez
  antes de pushear a main. No correr e2e salvo pedido (memorias no-e2e-runs, agents-run-related-tests-only).

## Preguntas abiertas para el dueño
- ¿Qué avisos entran en la primera versión? (propuesta: 1, 3 y 4 de la Fase 4.)
- ¿Anticipación del recordatorio de clase? (propuesta: 60 min.)
- ¿Se envía también al profesor? (hoy el plan es solo alumno.)
