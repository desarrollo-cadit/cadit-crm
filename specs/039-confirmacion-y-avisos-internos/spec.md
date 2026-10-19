# Feature Specification: Confirmación de cohortes y avisos internos por correo

**Feature Branch**: `039-confirmacion-y-avisos-internos`

**Created**: 2026-10-19

**Status**: Implementada (primera entrega)

**Depende de**: 005 (inscripciones, empresas, licencias), 007 (correo M365), 012 (capacidades, RLS), 029 (áreas de derivación), 033 (patrón de la periódica in-process), 035 (licencias del grupo)

**Input**: Decisiones del dueño (2026-10-19): confirmar una cohorte a mano; al confirmarla, avisar a Soporte qué alumnos cursan y qué licencias necesita cada uno; 7 y 2 días antes del inicio, avisar a Administración qué inscripciones todavía no tienen factura.

## Por qué esta fase existe

Que una cohorte "sale" hoy se decide de palabra. Soporte se entera tarde de
a quién tiene que instalarle licencias, y Administración descubre el día de
inicio que hay alumnos sin factura. El sistema ya tiene todos los datos
(inscripciones, licencias individuales y del grupo, número de factura,
empresa); falta el acto explícito de confirmar y el aviso a quien tiene que
actuar.

## User Scenarios & Testing

### US1 — Coordinación confirma una cohorte (P1)

Carla (coordinación) abre la cohorte, aprieta **Confirmar cohorte**, lee el
diálogo y confirma. El encabezado muestra "Confirmada · por Carla el …" y el
estado de cada aviso. Puede **Quitar confirmación**.

1. **Given** una cohorte sin confirmar, **When** alguien con
   `cohortes.confirmar` la confirma, **Then** queda `confirmed_at`/`confirmed_by`
   y sale el aviso a Soporte después del commit.
2. **Given** una cohorte confirmada, **When** se vuelve a confirmar, **Then**
   no cambia quién ni cuándo y no sale otro correo (idempotente).
3. **Given** soporte o administración, **Then** no ven los botones y la ruta
   responde 403.
4. **Given** una cohorte inexistente o de otra organización, **Then** 404.

### US2 — Soporte recibe la lista de alumnos y licencias (P1)

Al confirmar, la casilla del área Soporte (+ copias) recibe: curso y cohorte,
inicio (fecha y hora en la zona de la academia), profesor, software declarado
y programas del grupo, y la lista de alumnos activos con correo, teléfono y
licencias (programa, grupo/individual, sin asignar, licencia propia).

- Área apagada o sin casilla → el aviso se **omite** y queda registrado; nunca
  lanza.
- Un fallo del correo no deshace la confirmación: queda `failed` y la
  periódica lo reintenta (hasta 3 intentos).

### US3 — Administración recibe las inscripciones sin factura (P1)

Para cohortes confirmadas, 7 y 2 días de calendario antes del inicio (zona de
la academia), la casilla del área Administración recibe las inscripciones
**madre**, activas (contacto sin baja), sin `invoice_number`, con documento,
correo, monto y moneda, y razón social + RUT si tienen empresa.

- Todas facturadas → no se manda nada; queda `skipped / nada_que_enviar`.

### US4 — Configurar el área Administración (P2)

`area_config` admite `administracion` (casilla + copias; sin vendedores en
copia). El agente de WhatsApp **no** deriva consultas a Administración.

## Reglas (decididas y documentadas)

### Ventanas de facturación

Sea `faltan` = días de calendario entre HOY (zona de la organización) y el día
de inicio.

| Aviso | Sale cuando | Además |
|---|---|---|
| `facturacion_t2` | `faltan ∈ {2, 1}` | Sale aunque la confirmación sea tardía (incluso 1 día antes). |
| `facturacion_t7` | `faltan ∈ [3, 7]` | Solo si la cohorte ya estaba confirmada el día T-7 (día de confirmación ≤ inicio − 7). |

- Confirmada 3 días antes: la de T-7 **no** sale retroactiva; la de T-2 sale en
  su día.
- Un servidor apagado el día T-7 se pone al día mientras siga dentro de
  `[T-7, T-3]`.
- Llegada la ventana de T-2, la de T-7 ya no sale.
- El día de inicio y después, ningún aviso.

### Idempotencia (`staff_notice`, UNIQUE organización + cohorte + tipo)

| Estado previo | ¿Se vuelve a intentar? |
|---|---|
| sin registro | sí |
| `sent` | **nunca** (ni reconfirmando) |
| `failed` | sí, hasta 3 intentos |
| `pending` (reclamo en vuelo) | solo si el reclamo tiene más de 30 min (proceso caído) |
| `skipped` | solo por un acto humano: volver a confirmar (aviso a Soporte). La periódica no insiste. |
| `cancelled` | sí (la cohorte se volvió a confirmar); la cuenta de intentos arranca de nuevo |

El reclamo es un compare-and-swap (`pending` + `claimed_at`) en una
transacción corta; el envío a Graph va fuera de toda transacción; el resultado
se registra solo si el reclamo sigue siendo el mismo (`claimed_at`).

### Quitar la confirmación y reconfirmar

- Quitar cancela los avisos de **facturación** que no salieron (`pending`,
  `failed`, `skipped` → `cancelled`). Lo enviado queda enviado.
- El aviso a Soporte no se cancela: lo que ya se le dijo no se des-dice por
  correo. Reconfirmar no se lo vuelve a mandar si ya salió (`sent`); sí lo
  reintenta si había quedado omitido o fallido.

### Qué alumnos van en cada aviso

- **Soporte**: toda inscripción activa con `cohort_id` = la cohorte (madres o
  hijas). En un curso o una especialización son las madres; en un módulo son
  las hijas — si no, confirmar un módulo avisaría que no cursa nadie.
- **Administración**: solo madres (la plata vive en la madre), activas, sin
  factura.

## Requisitos funcionales

- **FR-001** `cohort.confirmed_at` / `confirmed_by` (FK `user`, `set null`).
  `cohort.status` no cambia.
- **FR-002** Capacidad `cohortes.confirmar`: `direccion` y `coordinacion`
  (migración la suma a los roles ya sembrados); soporte y administración no;
  `owner`/`member` del respaldo sí.
- **FR-003** `GET|POST|DELETE /api/cohorts/[id]/confirmation`; POST/DELETE con
  `cohortes.confirmar`, GET con `academico.ver`; idempotentes; 404 si no existe.
- **FR-004** UI en el encabezado de la cohorte + insignia "Confirmada" en el
  listado de Académico. Colores solo por tokens.
- **FR-005** `area_config.area` admite `administracion`; `AREAS` (derivación del
  agente) no cambia.
- **FR-006** Aviso a Soporte después del commit (`onAfterCommit`).
- **FR-007** Avisos de facturación por la periódica in-process
  (`STAFF_NOTICES_INTERVAL_MIN`, default 0 = apagada; nunca en tests ni en
  `next build`).
- **FR-008** `staff_notice` con RLS (`tenant_isolation`) y UNIQUE
  `(organization_id, cohort_id, kind)`.

## Fuera de alcance

- Pantalla Configuración › Áreas: hoy no existe (la configuración de áreas es
  solo por `/api/settings/areas`, desde 029). Administración se configura por
  la misma API.
- Avisos por WhatsApp, recordatorios al alumno, avisos de talleres.
- Prueba E2E (decisión del dueño, 2026-10-19: esta entrega se valida con unit
  tests).
