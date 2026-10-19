# Feature Specification: Rol Ventas y datos de facturación de las empresas

**Feature Branch**: `040-rol-ventas-y-empresas`

**Created**: 2026-10-19

**Status**: Implementada (primera entrega)

**Depende de**: 005 (inscripciones, empresas), 012 (capacidades, roles, RLS), 013 (Empresas), 026 (rol Administración), 030 addendum (cuenta dual, `addTeamMember`), 2026-10-06 (vendedores), 039 (confirmación de cohortes)

**Input**: Decisiones del dueño (2026-10-19): los vendedores pasan a usar la plataforma con un rol **Ventas** que ve todo lo académico, en lectura y sin plata, y puede crear y editar empresas; la empresa suma los datos que Administración necesita para facturar.

## Por qué esta fase existe

Hoy un vendedor no entra al sistema: pregunta por WhatsApp si una cohorte
"sale", cuándo arranca y quién está anotado. Y cuando vende a una empresa, la
razón social y el RUT son lo único que queda registrado — Administración
termina pidiendo por correo la dirección fiscal, a quién mandarle la factura y
si es contado o crédito.

## User Scenarios & Testing

### US1 — Un vendedor mira la oferta académica sin ver plata (P1)

Valeria (Ventas) entra al panel. En el menú ve Dashboard, Pipeline, Alumnos,
Empresas, Académico, Calendario, Licencias, Talleres y Cursos offline. Abre
Académico, filtra por "Planificada", ve qué cohortes están **Confirmadas** y
abre una: ve el encabezado, los alumnos inscriptos, las clases, la asistencia
y la evaluación. No ve montos, cuotas, saldos, facturas ni morosidad, y no ve
ningún botón que cambie algo de la cursada.

1. **Given** una sesión con el rol `ventas`, **When** pide el roster de una
   cohorte, **Then** el DTO no trae `amount`, `currency`, `installments`,
   `paymentNotes`, `nationalId`, `invoiceNumber`, `receiptNumber`, vendedor
   ni empresa (no viajan: `buildRosterEntry` los arma solo con `cobranza.ver`).
2. **Given** el rol `ventas`, **When** intenta cualquier escritura que no sea
   de empresas (checklist, correos, mover un lead, confirmar, editar una
   cohorte), **Then** la ruta responde 403.
3. **Given** el rol `ventas`, **Then** no ve Finanzas, Bandeja, Grabaciones,
   Correcciones ni Ajustes en el menú.

### US2 — Ventas y Administración cargan los datos de una empresa (P1)

Valeria cierra una venta in-company. En Empresas aprieta **Nueva empresa**,
carga razón social, nombre comercial, RUT, dirección fiscal, contacto de
facturación y condición de pago (contado o crédito a N días). Administración
abre la empresa y ve esos datos al lado del reporte de empleados.

1. **Given** `empresas.editar`, **When** crea una empresa con un RUT que ya
   tiene otra empresa de la organización, **Then** 409 `rut_duplicado`
   nombrando a la existente; no se crea nada.
2. **Given** país Uruguay, **When** el RUT no tiene 12 dígitos, **Then** 422
   `rut_invalido`. Otro país (o país vacío): el identificador fiscal se
   acepta como texto libre.
3. **Given** condición `contado`, **Then** `payment_term_days` queda NULL
   aunque se mande un número.
4. **Given** una sesión sin `empresas.editar` (soporte), **Then** no ve los
   botones y POST/PATCH responden 403.

### US3 — Darle cuenta del panel a un vendedor (P2)

En Ajustes → Vendedores, Carla (coordinación) aprieta **Dar acceso al panel**
en la fila de un vendedor sin cuenta: escribe una contraseña temporal y el
vendedor queda con una cuenta de equipo con el rol Ventas, vinculada
(`seller.user_id`). También puede vincular a alguien que ya es del equipo
desde **Editar**. Un vendedor sin cuenta sigue funcionando como hasta hoy.

1. **Given** quien no tiene todas las capacidades de `ventas`, **Then** 403
   `escalation` (la misma regla de `addTeamMember`).
2. **Given** un vendedor sin correo, **Then** 422: el correo es el usuario.
3. **Given** un correo de profesor, **Then** se le agrega el equipo a su cuenta
   (cuenta dual de 030); de alumno, 409 `es_alumno`.

## Qué expone cada capacidad al rol Ventas (investigado)

Ventas recibe **seis** capacidades. Todas las rutas que abren están
enumeradas en `tests/unit/rol-ventas.test.ts`, que falla si una escritura
nueva queda bajo una de ellas.

| Capacidad | Qué le abre | ¿Escribe? | ¿Plata? |
|---|---|---|---|
| `academico.ver` | Académico, Calendario, Licencias, Talleres, Cursos offline; cohortes, cursos, clases, programa, recesos, aulas, profesores, material, avisos, confirmación (solo GET) | No (todas GET) | Solo el **precio de lista** (`cohort.cost`, `course.list_price`, precio del taller): dato de catálogo desde 006 (ver DV-002). El estado de pago de un inscripto al taller viaja solo con `cobranza.ver` (`workshops.ts`). El **costo por hora del profesor** viajaba a todo `academico.ver`: ahora solo con `academico.editar` o `cobranza.ver` (DV-009). |
| `asistencia.ver` | Pestaña Asistencia (GET) | No | No |
| `evaluacion.ver` | Pestaña Evaluación, imprimir certificado (GET) | No | No |
| `contactos.ver` | Alumnos, legajo, Empresas y su reporte, formularios (GET) | No | El estado de cuenta del legajo no se arma sin `cobranza.ver` (`student-record.ts`). |
| `inscripciones.ver` | Roster de la cohorte, Pipeline (lectura), exportar CSV (nombre y correo), estado de los envíos masivos (GET) | **Ya no** (ver DV-001) | Montos, cuotas, factura, recibo, vendedor y empresa de la inscripción viajan solo con `cobranza.ver` (`buildRosterEntry`). |
| `empresas.editar` (nueva) | Crear y editar empresas | Sí | No (condición de pago, no montos) |

**Cómo se garantiza que la plata no viaja**: las capacidades de Ventas son un
subconjunto de las de soporte más `empresas.editar`, y toda superficie que
soporte ve ya estaba libre de los montos de alumnos (FR-016 de 005, regla dura
de servidor). Se recorrieron todas las columnas de plata del esquema
(`enrollment.amount/currency/invoice_number/receipt_number`, `installment`,
`payment`, `workshop_registration.amount`, `cohort.cost`, `course.list_price`,
`teacher.hourly_rate`): la única que llegaba a una capacidad de Ventas sin
pregunta de por medio era `teacher.hourly_rate` (DV-009), y es el único DTO
que cambió. Lo que lo prueba: `tests/unit/rol-ventas.test.ts` — (1) Ventas no
tiene ninguna capacidad financiera ni `cobranza.*`; (2) `buildRosterEntry` con
las capacidades de Ventas no trae ninguna llave de plata; (3) ninguna ruta
abierta por las capacidades de Ventas importa módulos financieros (`billing`,
`finance`, `finanzas-periodo`, `ventas-por-vendedor`, `billing-bulk`) ni
escribe, salvo las dos de empresas; (4) los armadores de DTO que leen columnas
de plata (`enrollments`, `student-record`, `workshops`) preguntan por
`cobranza.ver`; (5) el DTO del profesor sin `academico.editar` ni
`cobranza.ver` no trae `hourlyRate`.

## Decisiones

- **DV-001 — Se parte `inscripciones.ver`: nace `inscripciones.seguimiento`.**
  Cuatro rutas escribían con `inscripciones.ver` (la "arruga del vocabulario"
  que 012 dejó anotada en `pipeline/leads/[id]`): mover un lead
  (`PATCH /api/pipeline/leads/[id]`), el checklist
  (`PATCH /api/enrollments/[id]/checklist`), el correo de T&C o bienvenida
  (`POST /api/enrollments/[id]/emails`) y el envío a toda la cohorte
  (`POST /api/cohorts/[id]/emails/bulk`). Con Ventas en `inscripciones.ver`,
  un vendedor podía mandarle correos a una cohorte entera: el rol dejaba de ser
  de lectura. Las cuatro pasan a `inscripciones.seguimiento`. **Nadie pierde
  nada**: la migración se la suma a todo rol (de sistema o creado a mano) que
  hoy tiene `inscripciones.ver` — dirección, coordinación, soporte y
  administración incluidas. Ventas no la recibe. Las lecturas siguen con
  `inscripciones.ver`.
- **DV-002 — El precio de lista no es "plata" a efectos del rol.** `cost` de la
  cohorte y el precio de lista del curso son catálogo desde la iteración 006
  (decisión del dueño, comentada en `GET /api/cohorts` y en
  `cohortInputSchema`: soporte los ve y los edita), y el precio del taller ya
  lo publica el sitio (`/api/public/talleres`). Un vendedor los necesita para
  vender. "Sin plata" = sin montos de una persona:
  lo acordado en la inscripción, cuotas, pagos, saldos, morosidad, facturas,
  finanzas. Si el dueño quisiera ocultar también el precio de lista, el cambio
  es en `/api/cohorts`, `/api/courses` y `/api/talleres` (DTO condicionado), y
  queda fuera de esta entrega.
- **DV-003 — `empresas.editar`**: dirección, coordinación y administración
  (Administración completa los datos de facturación; es su primera escritura,
  acotada a empresas). Soporte no. `POST /api/companies` pasa de
  `contactos.editar` a `empresas.editar`: **soporte pierde crear empresas por
  la API**, cosa que no podía hacer desde la UI (el alta inline vive en el
  formulario de inscripción, que exige `inscripciones.editar`). Un rol creado a
  mano con `contactos.editar` también la pierde; se la otorga el dueño desde
  `/settings/roles`. `GET /api/companies` sigue con `contactos.ver`.
- **DV-004 — RUT: validación según el país.** Uruguay (`Uruguay`, `UY`, sin
  importar mayúsculas ni tildes): 12 dígitos, admitiendo puntos, guiones y
  espacios al escribirlo. No se verifica el dígito de control (validación
  laxa a pedido del dueño; un RUT viejo mal cargado no debe bloquear editar el
  resto de la ficha). Otro país o país vacío: texto libre hasta 60 caracteres.
  Se guarda como se escribió (recortado).
- **DV-005 — Duplicado de RUT: 409 duro, comparando normalizado** (solo
  letras y dígitos, en mayúsculas). En la edición solo se controla si el RUT
  cambia: una base con duplicados históricos no impide corregir una dirección.
- **DV-006 — La cuenta del vendedor sale de `addTeamMember`.** No hay un
  segundo camino de alta: `POST /api/sellers/[id]/account` (puerta
  `accesos.gestionar`, y además `inscripciones.editar` adentro porque escribe
  el vendedor) llama a `addTeamMember` con el rol `ventas`, que aplica la
  regla de escalada, la cuenta dual y el rechazo de alumnos. `addTeamMember`
  ahora devuelve el `userId`.
- **DV-007 — Ventas no entra en `ROLE_CAPABILITIES`** (el respaldo de código
  para organizaciones sin roles sembrados), igual que dirección, coordinación
  y administración (026/FR-004). El rol existe por su fila.
- **DV-008 — Pantallas en lectura.** Académico recibe `canEdit`
  (`academico.editar`) y esconde crear, editar y borrar; el roster esconde el
  checklist editable, los correos y el acceso al portal según la capacidad
  que cada ruta exige; el Pipeline no arrastra sin `inscripciones.seguimiento`
  ni ofrece "Gestionar etapas" sin `configuracion.editar`. Las rutas son la
  barrera; esto es para no mostrar botones que devuelven 403 (también le
  sirve a Administración, que hoy los veía).
- **DV-009 — El costo por hora del profesor no viaja a Ventas.**
  `GET /api/teachers` y `/api/teachers/[id]` (`academico.ver`) mandaban
  `hourlyRate` —lo que la academia le paga a cada profesor— a cualquiera.
  Ahora la llave existe solo con `academico.editar` (quien lo carga) o
  `cobranza.ver` (quien ve la plata). Dirección, coordinación, soporte y
  administración lo siguen viendo; nadie pierde nada salvo un rol creado a
  mano con `academico.ver` y sin ninguna de las dos.

## Requisitos funcionales

- **FR-001** Rol de sistema `ventas` ("Ventas") con `academico.ver`,
  `asistencia.ver`, `evaluacion.ver`, `contactos.ver`, `inscripciones.ver`,
  `empresas.editar`. Se siembra en las organizaciones existentes (0061, mismo
  patrón que 0036: `on conflict do nothing`, id determinístico) y en las
  nuevas (`SYSTEM_ROLES`).
- **FR-002** Capacidades nuevas en la lista cerrada: `empresas.editar`,
  `inscripciones.seguimiento`, con texto en la guía y en `/settings/roles`.
- **FR-003** `inscripciones.seguimiento` gobierna las cuatro escrituras de
  DV-001; la migración la suma a todo rol con `inscripciones.ver`, salvo
  `ventas`.
- **FR-004** `company` suma, todas NULL: `trade_name`, `address_street`,
  `address_city`, `address_state`, `address_country`, `billing_contact_name`,
  `billing_email`, `billing_phone`, `payment_terms` (`contado`|`credito`,
  CHECK), `payment_term_days` (1–365, solo con `credito`, CHECK), `notes`.
  `legal_name` sigue obligatoria. Sin tabla nueva: `company` ya tiene RLS.
- **FR-005** `POST /api/companies` y `PATCH /api/companies/[id]` con
  `empresas.editar`, Zod, RUT por país (DV-004), duplicado 409 (DV-005), 404
  si la empresa no es de la organización.
- **FR-006** `/empresas`: alta y edición con todos los campos, controles solo
  con `empresas.editar`; los datos de facturación se ven al abrir la empresa.
- **FR-007** Ajustes → Vendedores: "Dar acceso al panel" (cuenta nueva con rol
  Ventas, o cuenta dual de profesor) y vincular/desvincular a alguien del
  equipo al editar. Sin cuenta, el vendedor funciona como hoy.
- **FR-008** El menú del rol se deriva de sus capacidades (sin cambios en
  `nav.ts`); el listado de Académico ya muestra estado y "Confirmada" (039).
- **FR-009** `hourlyRate` del profesor solo con `academico.editar` o
  `cobranza.ver` (DV-009).

## Fuera de alcance

- Que un vendedor vea "sus" ventas o comisiones (necesita plata).
- Ocultar el precio de lista (DV-002).
- Validar el dígito de control del RUT.
- Prueba E2E (decisión del dueño: esta entrega se valida con unit tests).
