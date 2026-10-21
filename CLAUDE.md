# CadIT CRM — Guía para Claude

CadIT es un CRM de WhatsApp open source (MIT), self-hosted, con agente de IA y
Laboratorio de auto-evaluación. Una instancia = un negocio. Este archivo guía a
Claude Code (u otro asistente) para operar y **modificar** este repositorio —
el caso típico: una agencia adaptando CadIT para un cliente.

## Stack

**Next.js 15 (App Router) + React 19** en monolito · TypeScript estricto
(`strict` + `noUncheckedIndexedAccess`) · Tailwind CSS (**tema Atlas, claro y
oscuro**, acento sobreescribible por white-label) · **PostgreSQL + Drizzle ORM**
(migraciones versionadas en
`drizzle/`, aplicadas al ARRANCAR el contenedor) · **Better Auth** + plugin
organization · **Zod** en todo input externo · nanoid con prefijos (`ct_`,
`cv_`, `msg_`…) · pnpm · Vitest (unit) + guiones E2E en `tests/e2e/`
conducidos con Playwright · Docker multi-stage (standalone, healthcheck
`/api/health`) · deploy en Coolify (Ruta A) o docker compose + Caddy (Ruta B).

Tiempo real por **SSE** (`/api/events`): heartbeat `: ping` ~25s, headers
anti-buffering, catch-up por refetch con `since=`. Sin WebSockets, sin colas
externas: el trabajo en segundo plano (agente, Laboratorio) es in-process.

## Mapa del código (fronteras de modificación)

| Quieres cambiar… | Toca… |
|---|---|
| El cerebro/proveedor LLM | `src/lib/ai/` (adaptador OpenRouter-compatible, `chatJson<T>`) |
| El comportamiento/prompt del agente | `src/server/ai/prompts.ts` |
| Las acciones que puede tomar el agente | `src/server/ai/actions.ts` + ejecución en `src/server/ai/pipeline.ts` |
| Las personas o el juez del Laboratorio | `src/server/lab/personas.ts` · `src/server/lab/judge.ts` |
| El canal WhatsApp (Graph API) | `src/lib/meta/` (cliente único) + `src/server/whatsapp/` |
| Cobranza (cuotas, pagos, morosidad) | `src/server/billing.ts` + `/api/enrollments/[id]/{installments,payments}` |
| **Facturación** (número de factura y de recibo, pendientes de facturar) | `src/lib/facturacion-regla.ts` (`pendienteDeFacturar`, la MISMA regla del aviso T-7/T-2 de 039) + `src/lib/facturacion.ts` (vista, filtros, totales por moneda, CSV) + `src/server/facturacion.ts` + `/facturacion` + `/api/facturacion` (`cobranza.ver`) + `PATCH /api/enrollments/[id]/invoice` y `PATCH /api/payments/[id]/receipt` (`facturacion.editar`: solo documentos, nunca montos) |
| Clases y asistencia | `src/server/attendance.ts` + `/api/cohorts/[id]/attendance` |
| **Quién puede qué** | `src/lib/capabilities.ts` (lista CERRADA) + `src/server/roles.ts` + `/settings/roles` |
| Clases, cronograma y calendario | `src/server/classes.ts` + `/api/cohorts/[id]/{classes,schedule}` + `/api/calendar` |
| **Calendario por profesor** (filtro `?profesor=`, carga semanal sin dinero) | `src/lib/teacher-load.ts` (puro: profesor efectivo = suplencia ∪ cohorte, filtro, horas) + `listCalendarClasses(…, teacherIds)` / `listCalendarTeachers` en `src/server/classes.ts` + `/api/calendar?teacherIds=` + `src/components/calendar/calendar-client.tsx` |
| Horarios con zona horaria | `src/lib/schedule-time.ts` — **el único lugar** que compone fechas de clase |
| **Recesos** (días sin clase) y borrar / reprogramar clases | `src/lib/recess.ts` (puro) + `src/server/recesses.ts` + `src/server/class-changes.ts` + `/api/recesses` + `/settings/recesos` + `/api/class-sessions/[id]/reschedule` |
| **Inscripción automática a módulos** (especializaciones) | `src/lib/module-auto-enroll.ts` (puro) + `src/server/module-enrollment.ts` + `/api/cohorts/[id]/modules/enrollments` (vista previa + regularización) + `/api/enrollments/[id]/module` (sacar de un módulo) |
| La pestaña Alumnos de un módulo | `src/server/module-roster.ts` + `src/components/cohorts/module-roster-client.tsx` |
| Licencias (varias por inscripción, una por programa) | `src/server/licenses.ts` + `src/lib/license-rules.ts` + `src/components/enrollments/license-list.tsx` |
| Material y avisos | `src/server/resources.ts` + `/api/resources` + `/api/cohorts/[id]/announcements` |
| Legajo del alumno | `src/server/student-record.ts` + `/contacts/[id]/legajo` |
| Reporte por empresa | `src/server/company-report.ts` + `/empresas` |
| **Empresas y sus datos de facturación** (RUT, dirección fiscal, contacto, contado/crédito) | `src/lib/company.ts` (puro: Zod, RUT por país, normalización) + `src/server/companies.ts` (alta/edición, 409 `rut_duplicado`) + `/api/companies` (GET `contactos.ver`, POST `empresas.editar`) + `/api/companies/[id]` (PATCH `empresas.editar`) + `src/components/companies/` |
| **Rol Ventas** (todo lo académico en lectura, sin plata) | `SYSTEM_ROLES` en `src/lib/capabilities.ts` + migración 0061; lo que puede llamar y que no viaje plata lo fija `tests/unit/rol-ventas.test.ts`. Escribir en el seguimiento de una inscripción (mover leads, checklist, correos) es `inscripciones.seguimiento`, NO `inscripciones.ver` |
| **Cuenta del panel de un vendedor** | `darCuentaAVendedor()` en `src/server/sellers.ts` (pasa por `addTeamMember`, rol `ventas`) + `/api/sellers/[id]/account` + `src/components/settings/sellers-client.tsx` |
| Costo por hora de los profesores (plata) | `puedeVerCostoDocente()` en `src/server/teachers.ts`: viaja solo con `academico.editar` o `cobranza.ver` |
| **Acceso al portal** (alumnos y profesores) | `src/server/access.ts` + `src/lib/auth/portal.ts` |
| **El portal del profesor** | `src/lib/portal-api.ts` + `src/server/teacher-portal.ts` + `/api/portal/{cohorts,classes,hours}` |
| **El portal del alumno** | `src/lib/portal-api.ts` + `src/server/student-portal.ts` + `/api/portal/me/*` |
| **El caparazón del portal** (barra lateral) | `src/app/(portal)/layout.tsx` + `src/components/portal/portal-nav.tsx` |
| **La pantalla de acceso** | `src/app/(auth)/layout.tsx` + `src/app/(auth)/login/page.tsx` |
| Copiar evaluaciones entre cohortes | `planAssessmentCopy()` en `src/server/grading.ts` |
| **Plantilla de corrección** (escala, mínimo, ejercicios, campos) | `src/lib/grading-template.ts` (puro) + `guardarPlantilla()` en `src/server/grading.ts` + `/api/assessments/[id]/template` |
| **Correcciones** (borrador, envío, publicación) | `src/server/corrections.ts` + `/api/assessments/[id]/corrections/[enrollmentId]` (staff) + `/api/portal/assessments/[id]/corrections/[enrollmentId]` (profesor) + `src/components/grading/` |
| **Bandeja de aprobación** | `/correcciones` + `/api/corrections/*` (`correcciones.aprobar`) + `src/components/grading/correction-inbox.tsx` |
| **Escolaridad** (PDF descargable) | `src/lib/escolaridad.ts` (armado puro) + `src/lib/escolaridad-pdf.ts` (PDF con `pdf-lib`) + `src/server/transcript.ts` + `/api/contacts/[id]/escolaridad/print` + `/api/portal/me/escolaridad/print` |
| **Certificados en PDF** (diseño, emisión masiva, descarga) | `src/lib/certificado.ts` (contenido y diagramación, puro) + `src/lib/certificado-pdf.ts` (dibuja sobre `assets/certificados/*.pdf` con Poppins/Parisienne vía `@pdf-lib/fontkit`) + `src/server/certificate-pdf.ts` (snapshot congelado al emitir) + `emitirATodos()` en `src/server/certificates.ts` + `/api/portal/me/certificados/[code]/pdf` (alumno) + `/api/certificates/[code]/pdf` (`contactos.ver`) + `/api/enrollments/[id]/certificate/print` (`evaluacion.ver`) + `/api/cohorts/[id]/certificates` (`certificados.emitir`) + `/api/certificates/preview` (`academico.ver`) |
| La regla de aprobación (cursada, módulo, programa) | `src/lib/approval.ts` (re-exportada por `src/server/grading.ts`) |
| Baja de alumnos y profesores | `src/server/contacts-admin.ts` (`decidirBaja`) |
| **Licencias del grupo** (un programa para toda la cohorte; lo grupal bloquea lo individual) | `src/lib/group-licenses.ts` (planes puros: todo o nada, conversión, sincronización) + `src/server/group-licenses.ts` (`asignarAlGrupo`, `quitarDelGrupo`, `sincronizarLicenciasDelGrupo`, que llaman el alta, los módulos automáticos, "Mudar" y la baja) + `/api/cohorts/[id]/group-licenses` + `src/components/cohorts/group-licenses-panel.tsx`; el bloqueo individual vive en `assignLicense`/`unassignLicense` (`src/server/licenses.ts`) y en `setEnrollmentOverride` (cursos offline) |
| **Vista de Licencias** (quién tiene cada programa) y **catálogo de programas** (alta, nombre, foto, total; ya no es una pestaña de Académico) | `src/lib/license-view.ts` (cuentas puras, misma regla que el stock) + `src/server/license-view.ts` + `/api/licenses` + `/licencias` (`src/components/licenses/licenses-view.tsx`; alta/edición con `src/components/licenses/software-form.tsx` → `/api/software`, controles sólo con `academico.editar`) |
| **Vencimiento de accesos** (un mes después del fin de la cohorte) y fecha fijada a mano | `src/lib/access-expiry.ts` (reglas puras: referencia, +1 mes calendario, aviso) + `src/server/access-expiry.ts` (`estadosDeAcceso`, `fijarAccesoHasta`) + `PATCH /api/enrollments/[id]/access-until` + `/api/cohorts/[id]/content-access` + `/api/contacts/[id]/content-access` + `src/components/access/content-access.tsx`; el corte del alumno vive en `src/server/student-portal.ts` y `src/server/offline-courses/{access,student,submit}.ts` |
| **Accesos directos a cursos offline** (persona sin inscripción, con fecha) y "asignar a toda la empresa" | `src/lib/offline-grants.ts` (planes puros) + `src/server/offline-courses/grants.ts` + `/api/offline-courses/[id]/{access,grants,grants/company}` + `/api/offline-course-grants/[id]` + `src/components/offline-courses/course-access-panel.tsx` + `src/components/access/direct-grants.tsx` |
| **Cursos offline desde la empresa** (`/empresas`: resumen por curso, gente con sus accesos, asignar / extender / quitar) | `companyOfflineGrants()` en `src/server/offline-courses/grants.ts` + `resumenDeCursosDeEmpresa` / `esExtension` en `src/lib/offline-grants.ts` + `GET /api/companies/[id]/offline-grants` (`contactos.ver`: solo nombres, cursos y fechas) + `src/components/companies/company-offline-courses.tsx`; escribe por las MISMAS rutas de 043 (`academico.editar`) |
| La empresa de una persona (`contact.company_id`) | `src/server/contact-company.ts` (completa, nunca pisa) + `PATCH /api/contacts/[id]` |
| Portal para quien no tiene inscripción | `grantPortalAccessToContact` en `src/server/access.ts` + `/api/contacts/[id]/portal-access` |
| **Aislamiento entre organizaciones (RLS)** | `src/lib/db/with-tenant.ts` + `docs/rls-rol-de-conexion.md` |
| Campos/tablas | `src/lib/db/schema.ts` → `pnpm db:generate` → migración nueva en `drizzle/` |
| La ingesta/envío de mensajes | `src/server/inbox/` (ingest idempotente, send con guard de sandbox, ventana 24h) |
| Cómo se identifica a un contacto | `src/server/inbox/identity.ts` (teléfono normalizado o `bsuid:<id>`) |
| **Áreas** (casilla y copias de Ventas, Soporte y Administración; derivación del agente) | `src/lib/areas.ts` (`AREAS` = derivación, `CONFIG_AREAS` suma Administración, solo avisos internos) + `src/server/areas/` + `src/lib/area-config-form.ts` (formulario puro) + `/settings/areas` (`areas.configurar`) + `/api/settings/areas*` |
| Conectar TU propio bot en vez del agente | `src/app/api/bot/*` + `src/server/bot/auth.ts` (X-API-Key) |
| **Grabaciones de Zoom** | `src/lib/zoom/` (adaptador ÚNICO, solo lectura) + `src/server/zoom/` (sync, lease, matching, assignment, scheduler) + `/grabaciones` + `/settings/zoom` + `/api/recordings*` + `/api/settings/zoom/*` |
| **Tipos de curso** (curso / módulo / taller) | `src/lib/course-kind.ts` (puro) + `condicionDeCatalogo()` en `src/server/public-catalog.ts` + filtros de Académico en `src/lib/academic-filters.ts` |
| **Talleres** (ediciones, inscriptos, cobro, avisos) | `src/lib/workshops.ts` (reglas puras: cupo, elegibilidad, cuota, DTO público, recordatorio) + `src/server/workshops.ts` + `src/server/workshop-scope.ts` (los talleres NO son cursadas) + `src/server/workshop-notices.ts` / `workshop-reminders.ts` (WhatsApp, `WORKSHOP_REMINDER_INTERVAL_MIN`) + `/talleres` + `/api/talleres/*` + `/api/public/talleres` |
| **Confirmar una cohorte** ("sale"; ortogonal a `status`) | `src/server/cohort-confirmation.ts` + `/api/cohorts/[id]/confirmation` (`cohortes.confirmar`) + `src/components/cohorts/cohort-confirmation.tsx` |
| **Avisos internos por correo** (Soporte al confirmar; Administración a T-7/T-2 con las inscripciones sin factura) | `src/lib/staff-notices.ts` (ventanas, idempotencia, contenido; puro) + `src/server/staff-notices.ts` (reclamo en `staff_notice`, envío fuera de transacción, periódica `STAFF_NOTICES_INTERVAL_MIN`) |
| **Avisos de cobranza a Administración** (venta nueva con copia al vendedor, pago registrado, morosidad semanal los lunes) | `src/lib/billing-notices.ts` (qué es una venta, destinatarios, semana ISO, saldo y morosidad por moneda, correos; puro) + `src/server/billing-notices-queue.ts` (`avisarAAdministracion`: encola en la transacción del alta o del pago y manda con `onAfterCommit`) + `src/server/billing-notices.ts` (envío y periódica, misma `STAFF_NOTICES_INTERVAL_MIN`); llave `staff_notice.dedup_key` (`claveDeAviso`). Guiones y cargas pasan `avisoInterno: false` |
| **Avisos de nuevos interesados** (cada formulario público: página de curso, formulario de campaña, inscripción a taller → correo al área "Nuevos interesados", con vendedores en copia) | `src/lib/lead-notices.ts` (llave por persona + interés + día, destinatarios, contenido; puro) + `src/server/lead-notices-queue.ts` (`avisarInteresadoNuevo`: encola en un savepoint de la transacción del formulario, con el payload congelado, y manda con `onAfterCommit`; nunca rompe el envío) + `src/server/lead-notices.ts` (envío y reintento en la misma periódica `runInternalNoticesForOrg`); lo llaman SOLO `registerPublicLead` (`src/server/intake-forms.ts`) y `submitPublicWorkshopRegistration` (`src/server/workshops.ts`). Área `interesados` en `CONFIG_AREAS` (migración 0065) |
| **Seguimiento de leads** (pestaña «Seguimiento» del contacto: cada envío de formulario público, notas y «le escribí por correo / WhatsApp»; abre primero en un lead) | `src/lib/seguimiento.ts` (puro: wa.me, mailto, línea de tiempo, pestaña inicial, body del POST) + `src/server/seguimiento.ts` (`registrarEnvioDeFormulario`, en savepoint, lo llaman SOLO `registerPublicLead` y `submitPublicWorkshopRegistration`) + tablas `contact_form_submission` / `contact_activity` (migración 0066, backfill desde `staff_notice`) + `/api/contacts/[id]/seguimiento` (GET `contactos.ver`, POST `inscripciones.seguimiento`) + `src/components/contacts/seguimiento-client.tsx` |
| Áreas configurables (Ventas, Soporte, **Administración**, **Nuevos interesados**) vs. áreas a las que deriva el agente (solo Ventas y Soporte) | `CONFIG_AREAS` / `AREAS` en `src/lib/areas.ts` + `src/server/areas/config.ts` (`getAllAreaConfigs` / `getAreaConfigs`) |
| UI | `src/components/` + `src/app/(app)/` |

Los mocks del entorno de pruebas viven en `src/app/api/dev/` (wa-mock +
ai-mock) tras un gate único (`src/lib/dev-guard.ts`): 404 incondicional en
producción.

**Identidad de contacto**: Meta está migrando de teléfono a Business-Scoped
User IDs, así que `from` puede no venir. La llave estable es
`contact.wa_identity` (teléfono normalizado 521→52, o `bsuid:<id>`); `phone` es
un atributo OPCIONAL. Nunca asumas que un contacto tiene teléfono.

**Cerebro externo**: `/api/bot/*` (autenticada por `BOT_API_KEY`) deja que un
microservicio propio conduzca la conversación sin que el token de WhatsApp
salga del CRM: marcar leído + "escribiendo…", descargar adjuntos y reiniciar la
conversación de pruebas. Respeta `conversation.ai_enabled`/`handoff_at` igual
que el agente in-process. Sin la key, esa superficie responde 401 y el CRM
funciona igual.

## Reglas de la constitución (no negociables)

Ver [.specify/memory/constitution.md](.specify/memory/constitution.md).

- **Soberanía (II, endurecida)**: dependencias de runtime SOLO WhatsApp Cloud
  API, proveedor LLM OpenRouter-compatible opcional, Microsoft Graph para el
  correo transaccional a alumnos (constitución 1.3.0, tras `src/lib/m365`) y el
  reproductor embebido de Vimeo para los videos de cursos offline (constitución
  1.4.0: solo el navegador carga el iframe de `player.vimeo.com`; el servidor no
  llama a Vimeo, sin tokens, sin almacenar video, tras un único componente) y
  Zoom para LEER las grabaciones en la nube (constitución 1.6.0, tras
  `src/lib/zoom`, solo lectura, Server-to-Server OAuth, credenciales cifradas
  cargadas por la UI, opcional) y, desde 1.7.0, para que el NAVEGADOR cargue
  en un iframe el reproductor oficial de una grabación de Zoom ya adjudicada
  (solo el navegador; el servidor no descarga, retransmite ni guarda video;
  tras `src/components/portal/zoom-recording-player.tsx`; una clase sin
  enlace de Zoom funciona igual). PROHIBIDO en v1 introducir S3/R2, Stripe, Google u otros servicios externos.
  Auth y BD self-hosted.
- **Seguridad (I)**: secretos cifrados en reposo (AES-256-GCM, `lib/crypto`);
  jamás al cliente ni a logs. El token de WhatsApp solo muestra sus últimos 4.
- **Multi-tenancy (III)**: `organization_id` NOT NULL en toda tabla de dominio;
  toda query pasa por `scoped()` de `src/lib/db/tenant.ts`.
- **Idempotencia (IV)**: webhooks dedup por `wa_message_id` UNIQUE; estados
  monotónicos; seeds y migraciones re-ejecutables.
- **Sandbox del Laboratorio**: las conversaciones `is_test` JAMÁS tocan la API
  real — el sender lanza excepción (no lo "arregles": es un guardrail).

## Permisos, portal y aislamiento (ciclo 012)

**Capacidades, no roles.** Nunca compares `session.role === "algo"`: los roles
se renombran y se editan desde `/settings/roles`, así que ese `if` miente en
cuanto alguien toca la pantalla. Preguntá por la capacidad:

```ts
export const GET = requireCapability("cobranza.ver", async (session) => { … });
// en server components / UI:
sessionCapabilities(session).includes("cobranza.ver")
```

La lista de capacidades es **cerrada y tipada** (`src/lib/capabilities.ts`):
el compilador rechaza una inventada. Los ROLES viven en la base porque son lo
que el dueño cambia sin deploy; el mapeo de código queda como respaldo si la
organización no tiene roles sembrados. Hay tests que fallan si vuelve a
colarse una comparación por nombre de rol o si una ruta nueva no declara
capacidad.

**Dos audiencias, dos puertas.** El staff vive en `member` y entra por
`requireSession()`. Alumnos y profesores viven en `account_link` y entran por
`resolvePortalSession()`. La separación es **estructural**: una cuenta de
portal no tiene fila en `member`, así que falla `withAuth` por construcción,
no por disciplina.

**La cuenta dual (030).** Un PROFESOR puede ser además del equipo: el alta de
Equipo con su correo no crea otra cuenta, le agrega una fila de `member` al
MISMO usuario (`addTeamMember` en `src/server/team.ts`; sin contraseña nueva,
la regla de escalada vale igual). Un correo de ALUMNO se sigue rechazando.
La cuenta dual pasa las dos puertas porque TIENE las dos filas — ninguna
puerta tiene un `if` para ella. Quitar del equipo borra solo `member`; dar de
baja al profesor borra solo su `account_link` (cascada). "Ver como: Equipo /
Profesor" aparece en las dos barras y guarda la elección en la cookie `vista`
(`src/lib/view-preference.ts`), que solo decide a dónde lleva `/`.

**RLS.** Toda tabla de dominio tiene la política `tenant_isolation`, y cada
pedido autenticado corre dentro de una transacción que declara
`app.current_org` (`withAuth` → `withTenantTransaction`). Consecuencias que
hay que tener presentes al escribir código nuevo:

- Si un handler **lanza**, la transacción revierte las escrituras de ese
  pedido. Devolver una `Response` de error NO revierte.
- Una superficie SIN sesión que toque datos (webhook, `/api/bot/*`, catálogo
  público) debe envolverse en `withOrganizationScope(orgId, actor, fn)`.
- Una tarea *fire-and-forget* **no ve las filas que la transacción que la
  disparó acaba de crear**. Usá `onAfterCommit()`.
- Cinco tablas quedan fuera de RLS a propósito (`member`, `account_link`,
  `role`, `invitation`, `meta_credentials`): son las que responden "¿de quién
  es esto?" y se leen antes de que exista un alcance que declarar.

La app se conecta como `cadit_app`, un rol de PostgreSQL **sujeto** a RLS.
Conectarse como `postgres` (dueño de las tablas) desactiva el filtrado sin
avisar. Ver `docs/rls-rol-de-conexion.md`.

**`db:generate` NO genera las políticas RLS.** Produce tablas e índices y las
deja afuera. Al agregar una tabla de dominio hay que sumar a mano
`enable row level security` + la política `tenant_isolation` en la migración;
`tests/unit/rls-cobertura.test.ts` falla si alguien se olvida.

## Cursada y legajo (ciclo 013)

- **Los horarios de clase se componen en UN solo lugar**: `classInstant()` de
  `src/lib/schedule-time.ts`. Nunca armes una fecha de clase a mano — el texto
  `"18:30"` no lleva zona, y hay 87 alumnos fuera de Uruguay.
- **`days_of_week` cuenta desde el LUNES** (`WEEKDAY_LABELS`), no desde el
  domingo como `Date.getDay()`. `buildClassSchedule` convierte con
  `(getDay() + 6) % 7`.
- **El calendario mezcla clases reales y proyección.** Una fila `projected` es
  un dibujo: no se cancela, no lleva enlace ni grabación y no registra
  asistencia. Se vuelve real cuando alguien genera el cronograma.
- **Cuidado con los defaults optimistas.** `approvalState([], null, null)`
  devuelve "aprobado", y en la planilla de cohorte está bien. En el legajo se
  convierte en una afirmación falsa sobre una persona: por eso ahí existe
  `sin_datos`. Igual con la asistencia — **0% porque nadie pasó lista no es 0%
  porque no vino**.
- **Un dato que no se debe ver NO VIAJA.** El estado de cuenta del legajo no se
  arma si falta `cobranza.ver`; no se esconde en la UI.

## Identidad visual (ciclo 020)

**Los colores viven en tokens. Punto.** `globals.css` declara `:root` (claro) y
`:root[data-theme="dark"]`, y `tailwind.config.ts` los mapea a nombres
semánticos. Escribir un color en un `.tsx` —un hex, `bg-white`, `bg-amber-500`,
lo que sea— **hace fallar `tests/unit/tema-oscuro.test.ts`**, que además dice el
archivo y la línea. No es celo: cada color escrito a mano es una mancha clara
en el tema oscuro.

**Tres trampas que ya costaron caro:**

1. **`bg-token/50` NO EXISTE.** Tailwind solo aplica el modificador de opacidad
   a los colores de SU paleta; sobre un `var(--x)` no emite ninguna regla. Eran
   52 clases que no hacían nada, incluido el hover de las filas de tabla. Si
   necesitás una variante más suave, agregá un token.
2. **Tailwind escanea el archivo entero**, comentarios incluidos: escribir el
   nombre de una clase vieja en un comentario le hace generar la regla muerta.
3. **Los comentarios de `globals.css` viajan al CSS servido.** Cualquier script
   que verifique el CSS tiene que quitarlos primero o va a dar falsos
   negativos.

**El contraste se calcula, no se mira.** `contrastRatio()` vive en
`src/lib/branding.ts` —una sola fórmula— y `contraste.test.ts` recorre las
combinaciones declaradas en los dos temas exigiendo 4.5:1 (3:1 para íconos y
bordes de control). Los valores se LEEN del CSS: un test que repite los colores
a mano deja de hablar del producto.

**`resolveAccentSet(hex, theme)` aleja el color DEL FONDO** hasta alcanzar el
umbral. Sobre fondo claro alejarse es oscurecer; sobre oscuro, aclarar. La
misma frase sirve para los dos temas — decirla como "oscurecer hasta contrastar
con blanco" fue el bug que ató todo al tema claro. `THEME_SURFACES` es la única
fuente de verdad del color de fondo y hay un test que compara contra el CSS.

**La preferencia de tema va en COOKIE, no en `localStorage`**: el servidor tiene
que saber qué pintar antes de mandar el HTML, o hay un fogonazo blanco en cada
carga.

**Dos intensidades, un solo sistema.** `[data-surface="portal"]` sube radios y
presencia de marca en el portal, y **no puede** redefinir `--bg`, `--bg-panel`
ni ningún token de texto: eso invalidaría las garantías de contraste. El panel
del staff conserva su densidad (`--row-py`, `text-xs/sm/base` intactos) porque
el equipo lo mira ocho horas por día.

**El alumno tiene su propio mundo: "campus"** (2026-09-29). Es un portal de
estudio moderno (referencia: Coderhouse), a todo el ancho y con migas de pan
en cada pantalla. Las rutas del ALUMNO encienden `data-world="campus"`
(`PortalWorld`, lista de exclusión con las rutas del profesor). El bloque NO
redefine texto ni `--bg`: solo agrega `--bg-page` y los radios/sombras, y
`tests/unit/mundo-campus.test.ts` exige contraste también sobre ese fondo.
Las piezas viven en `src/components/portal/campus.tsx`; el detalle, en
`DESIGN.md`.

**La barra lateral es navy (#001b5e) en toda la app y en los dos temas**
(clase `barra-marca`): redefine sus propios tokens para que todo lo de
adentro quede en blanco, y fija `color` porque el texto sin clase hereda el
color ya resuelto de la página. Al agregar colores a `tailwind.config.ts`,
**reiniciá el dev server**: si no, las clases nuevas no se generan y no avisa
nada.

## El portal del profesor (ciclo 014)

**Dos puertas, y un test que las separa.** El staff entra por
`requireCapability`; el profesor, por `requireTeacherPortal`
(`src/lib/portal-api.ts`). No se mezclan en ningún sentido: una ruta de
`api/portal/` con `requireCapability` le estaría exigiendo a un profesor una
capacidad de staff —o no entra nunca, o alguien se la asigna para destrabarlo y
de paso le abre el panel entero—. `tests/unit/route-capabilities.test.ts` falla
si pasa cualquiera de las dos cosas.

**Ausencia = 404, jamás 403.** `teacherReachesCohort()` devuelve un **booleano**
y `teacherCohortDetail()` devuelve **`null`**: quien elige el código de estado
es la ruta. Un 403 confirmaría que la cohorte existe, y eso ya es información
que el profesor ajeno no tenía. Hay un test que exige que
`src/server/teacher-portal.ts` **no contenga ningún `403`** fuera de
comentarios: la regla se rompe con cualquier `if (!puede) return 403` bien
intencionado, y como no hay ninguno para copiar, quien lo agregue tiene que
escribirlo a mano.

**Un dato que el profesor no debe ver no se consulta.** No se consulta, no se
arma y no viaja. El roster del staff hace casi lo mismo que el del portal —
casi: trae correo, teléfono y estado de cuenta. Reusarlo es exactamente cómo un
campo financiero termina en la pantalla equivocada (FR-008). Hay un guard
estructural que prohíbe nombrar columnas de plata o de contacto en ese módulo.

**El alcance incluye la suplencia**: `cohort.teacher_id` ∪
`class_session.teacher_id`. Quien cubrió UNA clase tiene que poder cargar su
asistencia.

**`attendance.recorded_by`** (migración 0031) existe porque con el portal la
asistencia deja de tocarla solo la coordinación. El profesor puede corregir una
clase pasada —el sistema no discute con lo que pasó en el aula— y una
corrección sin autor no se puede revisar. Es nullable: las marcas anteriores no
tienen autor, e inventarles uno sería peor.

**Un fallo del correo no se lleva puesta la contraseña.** Invitar crea la
cuenta y RECIÉN DESPUÉS manda el correo. Como devolver una `Response` de error
no revierte la transacción, un fallo del envío dejaba la cuenta creada y la
contraseña perdida —y reintentar generaba otra y volvía a fallar igual—. Hoy
`GrantPortalAccessResult` trae `emailError` y el acceso se entrega igual: la
pantalla muestra la contraseña y dice que hay que dictarla. **Vale con M365
configurado y sin configurar**: una caída de Graph produce el mismo agujero.

## El portal del alumno y el caparazón (ciclos 015 / 021)

**Tres puertas, no dos.** Al staff (`requireCapability`) y al profesor
(`requireTeacherPortal`) se les suma el alumno (`requireStudentPortal`). Son
tres envoltorios y no uno con un parámetro a propósito: un envoltorio único que
decide adentro "¿alumno o profesor?" tiene, por construcción, un camino en el
que la respuesta se elige mal. `tests/unit/route-capabilities.test.ts` falla si
una ruta mezcla dos, y `tests/unit/student-portal.test.ts` guarda la forma del
módulo — sin `403`, sin escrituras, y **toda función exportada recibe
`contactId`**: no existe un camino de lectura que no pase por "¿de quién es
esto?".

**`student-portal.ts` no reusa `student-record.ts`** aunque calculen casi lo
mismo. Casi: el legajo lleva cédula y teléfono, y su estado de cuenta aparece
según una capacidad de STAFF que un alumno nunca va a tener. Hay test.

**El portal tiene la MISMA forma que el panel: barra lateral.** 014 lo había
resuelto con un encabezado angosto y una columna de 768px centrada, pensando en
el profesor de pie en el aula; se ganó el celular y se perdió el escritorio.
Hoy `PortalNav` es barra fija en `md+` y cajón abajo de `md`, con blancos de
44px. `tests/unit/portal-intensidad.test.ts` declara qué superficies encienden
`data-surface="portal"` — hoy el portal y el acceso — y falla si aparece otra
sin declararla.

**Las evaluaciones son por cohorte, no por curso** (`assessment.cohort_id`), y
eso es lo que impide que editar un curso altere una cohorte en marcha. El
precio es que cada cohorte nace vacía, y por eso existe *copiar de otra
cohorte* — copiar, no heredar. La deduplicación es por **nombre normalizado**,
no por `id`: la copia crea filas nuevas, así que el `id` nunca coincide.

## Grabaciones de Zoom (ciclo 030)

- **Zoom solo en `src/lib/zoom`** (constitución 1.6.0): ninguna URL, token ni
  `fetch` a Zoom fuera del adaptador — `tests/unit/zoom-adapter-guard.test.ts`
  falla si aparece. **Solo lectura**: el adaptador no tiene ningún método que
  escriba en Zoom.
- **El reproductor embebido** (constitución 1.7.0) vive SOLO en
  `ZoomRecordingPlayer` (`src/components/portal/zoom-recording-player.tsx`)
  y lo que se embebe lo decide `zoomEmbedUrl()` de `src/lib/zoom/links.ts`
  (https, `zoom.us`/`*.zoom.us`, `/rec/share/` o `/rec/play/`). Cualquier
  otro enlace sigue siendo enlace. Lo usan los portales del alumno y del
  profesor; el panel del staff NO embebe. Siempre lleva "Abrir en Zoom"
  debajo: un iframe de otro origen que falla no se puede detectar.
  `tests/unit/zoom-recording-player.test.ts` guarda las tres cosas.
- **La adjudicación se proyecta sobre `class_session.recording_url`** (+
  `recording_source` = `zoom`|`manual`). Los portales no se tocan: ven la
  grabación por la misma columna de siempre, y una grabación sin adjudicar no
  tiene por dónde llegarles (`tests/unit/portal-grabaciones.test.ts`). **Un
  enlace manual nunca se pisa** y una decisión manual nunca la deshace la
  sincronización.
- **Una corrida por organización**: lease en `zoom_sync_state` (UPDATE … WHERE
  lease vencido), no un advisory lock de sesión. El botón responde 409 si está
  tomado. Ninguna transacción abierta durante el HTTP a Zoom: cada página se
  guarda en su propio `inOrgScope` corto.
- **La periódica** (`src/server/zoom/scheduler.ts`) arranca desde
  `instrumentation-node.ts` solo si `ZOOM_SYNC_INTERVAL_MIN > 0` (**default 0
  = apagada**), nunca en tests ni en `next build`. Quién está vencido lo dice
  la base (`zoom_connection.last_sync_at`), así que sobrevive a reinicios; al
  arrancar, las corridas huérfanas sin lease vigente pasan a `error`.
- **E2E**: la app de pruebas se levanta SIEMPRE con
  `ZOOM_API_BASE_URL=<app>/api/dev/zoom-mock/v2` y
  `ZOOM_OAUTH_BASE_URL=<app>/api/dev/zoom-mock`; la sección
  `grabaciones-zoom` aborta si `/api/dev/zoom-mock/config` dice que no.

## Correcciones y escolaridad (ciclo 031)

- **Una sola puerta escribe el resultado oficial: `publicarCorreccion()`**
  (`src/server/corrections.ts`). Pasa la anterior a `superseded`, publica, llama
  a `recordResults` con origen `correccion` y espeja la devolución en la
  entrega. **Lanza, no devuelve**: si devolviera un error, la transacción
  quedaría con una versión `published` sin resultado. Quien quiera "publicar"
  por otro lado está abriendo una segunda verdad.
- **Borrador y pendiente NO VIAJAN al alumno.** `correccionesPublicadasDeCursada`
  filtra `published` en el WHERE, y el DTO del alumno no tiene `status` ni
  `reviewComment`: el comentario de quien aprueba es para quien corrigió.
  Editar una publicada crea una versión nueva en trámite; el alumno sigue
  viendo la vigente hasta que la nueva se publique.
  `tests/unit/correcciones-guard.test.ts` guarda las dos cosas.
- **Los atajos son solo para `pass_fail` sin aprobación** (`admiteAtajo()`).
  La celda de la planilla, la del profesor y `PATCH /api/portal/entregas/[id]`
  responden 422 `usar_correccion` en cualquier otra evaluación. El default
  de `recordResults` es el origen `atajo` (el lado seguro); solo
  `publicarCorreccion()` pasa `correccion` y solo ese camino escribe `score`.
  La corrección vieja de la entrega, cuando aplica, igual crea y publica una
  versión.
- **`passed` sigue siendo la verdad de la aprobación** (DV-001 de 010
  revertida de forma compatible): la nota 1–100 deriva `passed` contra el
  mínimo y se muestra, pero no pondera nada.
- **La plantilla se congela con la primera publicación**: cambiar escala,
  mínimo o ejercicios responde 409 `plantilla_congelada` — si no, las notas
  ya publicadas dejarían de sumar contra lo que dicen. Los ejercicios suman
  100 o no hay ejercicios.
- **Quién publica lo decide la ruta, no el módulo**: recibe un booleano
  `puedeAprobar` (la capacidad `correcciones.aprobar`). El profesor nunca la
  tiene, así que en una evaluación con aprobación solo puede enviar.
- **La escolaridad es derivada y pura.** `armarEscolaridad` y
  `renderEscolaridadHtml` (`src/lib/escolaridad.ts`) no leen la base; la
  lectura está en `src/server/transcript.ts`, que **nunca lee cobranza** ni
  importa el legajo (hay test). "Pendiente" (sin resultado oficial) no es
  "No aprobada", y no hay nota final ponderada.
- **La regla de aprobación vive en `src/lib/approval.ts`** para que la
  escolaridad la use sin arrastrar el servidor; `grading.ts` la re-exporta,
  así que los llamadores viejos no cambian.

## Vencimiento de accesos (ciclo 043)

- **Se calcula al LEER, no se revoca.** Un mes calendario después del fin de
  la cohorte (`end_date`; sin ella, la última clase no cancelada; sin
  ninguna, no vence) el alumno deja de ver grabaciones, enlaces de clase,
  material, avisos y los cursos offline que le dio ESA cohorte. Notas,
  asistencia, certificados, escolaridad y legajo no vencen. No hay cron ni
  columna "vencido": `src/lib/access-expiry.ts` decide con fechas.
- **El corte es del servidor.** Vencido = no viaja: `studentCourseDetail`
  ni consulta material ni avisos y vacía `recordingUrl`/`meetingUrl`; los
  cursos offline vencidos responden 404 como si no existieran.
  `tests/unit/vencimiento-de-accesos-estructura.test.ts` obliga a clasificar
  toda ruta nueva de `api/portal/me` como CONTENIDO (vence) o LOGRO (no).
- **Especialización**: madre e hijas vencen juntas, un mes después del ÚLTIMO
  módulo; un módulo sin fecha deja al programa sin vencimiento. La fecha
  manual (`enrollment.access_until`) va en la madre; en una hija, 422.
- **Cursos offline** = cohortes vigentes ∪ accesos directos vigentes
  (`offline_course_grant`, de la PERSONA, con fecha obligatoria, se revoca
  marcando). Gana la fecha más tarde. Un acceso directo da el curso aunque una
  cohorte lo haya quitado. El intento de un curso que llega solo por acceso
  directo se guarda con `enrollment_id` NULL.
- El portal del profesor NO vence.
- Antes de desplegar algo que toque esto: `scripts/accesos-que-vencen.sql`
  lista a quién le vence a una fecha (solo lectura).

## Variables de entorno

Ver `.env.example` (cada una con guía inline). Las claves: `APP_BASE_URL`,
`DATABASE_URL`, `BETTER_AUTH_SECRET`, `ENCRYPTION_KEY` (32 bytes base64),
`META_WEBHOOK_VERIFY_TOKEN` (segmento secreto del webhook), `META_APP_SECRET`
(opcional, firma), y para IA:

```bash
OPENROUTER_API_TOKEN=sk-or-...
OPENROUTER_MODEL=anthropic/claude-sonnet-4.5
OPENROUTER_JUDGE_MODEL=anthropic/claude-haiku-4.5   # opcional: juez más barato
```

Para el self-test local existe además el modo de pruebas interno (mocks) —
ver `specs/001-vocero-core/quickstart.md`. Nunca actives mocks en producción.

## Manejo de credenciales (obligatorio)

Cuando una feature necesite una variable/credencial nueva: (1) agrégala a
`.env` como placeholder `REEMPLAZA_...` (append), (2) deja guía inline `#` de
cómo obtenerla, (3) resume en el chat y sigue. `.env` está gitignored; para
deploy, las vars van también en la plataforma de hosting (runtime, no build).

## Definición de Hecho REFORZADA (obligatoria)

"Typecheck + lint + build (+ tests)" es el piso, NO el techo. Una feature no
está "Hecha" hasta correr el **self-test de COMPORTAMIENTO de punta a punta**
(Playwright + mocks: `WA_MOCK_ENABLED=true`, `META_GRAPH_BASE_URL` → wa-mock,
`OPENROUTER_BASE_URL` → ai-mock) y dejarlo verde: flujo real como usuario,
resultado observable, y el camino infeliz degradando sin colgarse. Prohibido
delegar la prueba al usuario. Si algo depende de un LLM/proveedor externo,
todo turno tolera formato inesperado con extracción robusta + reintentos — un
hipo del proveedor nunca tumba el turno. Al detectar un fallo: diagnostica,
corrige y re-verifica tú mismo hasta verde (loop de auto-corrección).

Gate técnico:

```bash
pnpm typecheck && pnpm lint && pnpm build && pnpm test
```

**Con el dev server levantado, el build va a OTRO directorio.** `pnpm build`
escribe en `.next`, que es el mismo que usa `next dev`: los dos procesos se
pisan los chunks y el dev server empieza a tirar `Cannot find module
'./XXXX.js'` en rutas al azar. El error no dice nada sobre la causa y parece
que se perdieron datos, porque las pantallas quedan en 500.

```bash
NEXT_DIST_DIR=.next-build pnpm build   # con `pnpm dev` corriendo
```

`next.config.ts` ya lee `NEXT_DIST_DIR` desde el ciclo 008 justamente por
esto. Si ya pasó: parar el dev server, `rm -rf .next` y volver a levantarlo —
la base no se toca, el estropicio es solo del build.

Guiones E2E por historia en `tests/e2e/*.md`. Parte de ellos ya están
automatizados: con la app viva y los mocks encendidos, `pnpm test:e2e`
(`scripts/e2e-selftest.mjs`) los conduce contra la app real y sale distinto de
cero si algo falla. Al agregar una historia, extiende el arnés en vez de dejar
solo el `.md`.

## Modo Objetivo — Loop SDD

Cuando el dueño da una META (no prompts paso a paso): Discover → Plan →
Execute → Verify → Iterate, de forma autónoma, volviendo solo con el objetivo
verificado en vivo o con un bloqueo real (decisión de producto, credenciales,
acción irreversible/costosa). Agrupa TODAS las preguntas bloqueantes al inicio.
El estado durable son los artefactos SDD en `specs/` (spec/plan/tasks) —
manténlos al día. Invocable como `/loop-sdd <objetivo>`.

## Memoria persistente

Memoria de archivos en `memory/` (índice `memory/MEMORY.md`, cargado por
sesión). Persiste decisiones, gotchas y correcciones; no dupliques lo que el
repo ya registra. Los subagentes con `memory: project` usan
`.claude/agent-memory/`.

## Arquitectura de agentes

1. **Orquestador** = la sesión principal de Claude Code (este CLAUDE.md + skill
   `loop-sdd`).
2. **Subagentes** (`.claude/agents/`): `deploy-ops` (deploy/logs/healthchecks,
   no escribe código de app) · `public-site-builder` (páginas públicas/legales
   y config de paneles externos).
