# Reglas de revisión de código — cadit-crm (Vocero CRM)

Convenciones reales de este repo, para revisión automática de diffs. Ver
`CLAUDE.md` para el contexto completo del producto; esto es el resumen
accionable para code review.

## TypeScript

- `strict` + `noUncheckedIndexedAccess` activos — no debilitarlos ni usar `any`
  para esquivar un error de tipos.
- Validar con Zod todo input externo (body de request, query params) antes de
  tocar la base de datos.
- Server-side en archivos planos bajo `src/server/*.ts` (un archivo por
  dominio), no carpetas, salvo que la lógica ya justifique la subdivisión.

## Multi-tenancy (no negociable)

- Toda tabla de dominio lleva `organization_id NOT NULL`.
- Toda query de dominio pasa por `scoped(...)` (`src/lib/db/tenant.ts`) — un
  `WHERE` sin `organizationId` explícito es un defecto de seguridad, no un
  detalle de estilo.

## Rutas API

- Toda ruta autenticada usa `withAuth` (o `requireFullAccess` cuando el rol
  `soporte` no debe acceder) de `src/lib/api.ts`, nunca sesión manual.
- Errores de negocio via `apiError(status, code, message)`, mensaje explícito
  y accionable — no genéricos tipo "algo salió mal" cuando se puede decir qué
  falló (ej. qué campo está duplicado).
- Body JSON parseado con `parseBody` + esquema Zod, no `req.json()` crudo.

## Seguridad y dependencias

- Ninguna dependencia externa nueva en runtime salvo las TRES permitidas por
  la constitución (`.specify/memory/constitution.md` 1.3.0, Principio II):
  WhatsApp Cloud API, el adaptador OpenRouter-compatible del LLM (opcional) y
  Microsoft Graph para el correo transaccional a alumnos (tras `src/lib/m365`)
  — nada de S3/R2, Stripe, Google u otros servicios externos.
- Secretos nunca al cliente ni a logs; cifrados en reposo.

## Estilo y comentarios

- Sin comentarios que expliquen QUÉ hace el código (los nombres ya lo dicen);
  solo el POR QUÉ cuando no es obvio (una constraint, un workaround, una
  decisión de producto).
- No añadir abstracciones, flags o manejo de errores para escenarios que no
  pueden ocurrir.

## Tests

- TDD estricto: la lógica de negocio nueva va acompañada de test unitario
  (Vitest, `pnpm test`).
- Features con comportamiento observable de cara al usuario requieren
  verificación en vivo antes de darse por terminadas (Principio IX de la
  constitución) — no alcanza con tipos/lint/build en verde.

## Commits

- Conventional commits, sin atribución de IA ("Co-Authored-By" u similar).
