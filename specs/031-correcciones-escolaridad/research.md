# Research — 031 Correcciones configurables y escolaridad

Decisiones de diseño (DV) tomadas a partir del spec y del mapa del código
(2026-10-13). Cada una: decisión, por qué, alternativas descartadas.

## DV-001 — La corrección es una tabla propia, versionada

**Decisión**: tabla nueva `correction`, una fila por VERSIÓN de la corrección
de un alumno en una evaluación. Estados: `draft`, `pending`, `published`,
`superseded`. Como mucho una versión `published` y una en trámite
(`draft`/`pending`) por (evaluación, inscripción), garantizado con dos índices
únicos parciales.

**Por qué**: FR-021 exige que la versión publicada siga visible mientras la
nueva espera aprobación: son dos filas vivas a la vez, no una. `submission` no
sirve de soporte: hay correcciones sin entrega (FR-014) y una entrega tiene
varios intentos.

**Alternativas**: columnas de borrador en `assessment_result` (no admite dos
versiones ni historial); columnas en `submission` (falla FR-014).

## DV-002 — La plantilla vive en `assessment`, ejercicios y campos en jsonb

**Decisión**: columnas nuevas en `assessment`: `scale` (`pass_fail` |
`numeric`, default `pass_fail`), `min_score` (int null), `requires_approval`
(bool default false), `criteria` (jsonb `[{id, name, maxPoints}]`),
`text_fields` (jsonb `[{id, name, required}]`). Los `id` internos son nanoid
estables; se validan con Zod al escribir y al leer.

**Por qué**: la plantilla se lee siempre entera junto con la evaluación, nunca
se consulta un ejercicio suelto, y se congela al publicar la primera
corrección (FR-005), así que los `id` no cambian bajo una corrección existente.
Dos tablas hijas más (con RLS, orden y borrado) no compran nada.

**Alternativas**: tablas `assessment_criterion` / `assessment_text_field`
(más joins y migración más pesada sin consultas que las justifiquen).

## DV-003 — El resultado oficial se escribe SOLO al publicar

**Decisión**: una única función `publicarCorreccion()` (en
`src/server/corrections.ts`) es la que, dentro de la misma transacción:
1. marca la versión como `published` y la anterior como `superseded`;
2. escribe `assessment_result.passed` + `assessment_result.score` vía
   `recordResults` (que gana el campo `score`);
3. si la corrección tiene entrega, espeja `passed`, `feedback`,
   `corrected_at/by` en `submission` (compatibilidad con 016).

Si algo falla, **lanza** (no devuelve una `Response`) para que la transacción
revierta todo — mismo criterio que `corregirEntrega` hoy.

**Por qué**: hoy `corregirEntrega` escribe la entrega y el resultado en el
mismo movimiento, y eso hace visible la nota al instante. Con aprobación, ese
atajo es exactamente la fuga que FR-012/FR-024 prohíben. Con una sola puerta de
publicación, los once lectores de `assessment_result.passed` (planilla,
legajo, certificados, portales, reporte por empresa, grilla de programa) no
cambian: siguen leyendo un dato que ahora solo existe publicado.

## DV-004 — `passed` sigue siendo la verdad de aprobación; `score` se suma

**Decisión**: `assessment_result` gana `score integer null`. `passed` se
DERIVA (`score >= min_score`) en la publicación y se guarda igual que hoy.
`approvalState`, `estadoDeModulo` y `programApprovalState` no se tocan.

**Por qué**: es la reversión compatible de DV-001 (010). Todo lo que hoy
decide aprobación sigue mirando un booleano; la nota numérica es información
adicional para mostrar (planilla, portal, escolaridad).

## DV-005 — Los atajos de carga rápida se restringen

**Decisión**: la carga por celda (`PATCH /api/assessments/[id]/results` del
staff y `PATCH /api/portal/assessments/[id]/results` del profesor) y la
corrección vieja de entrega (`PATCH /api/portal/entregas/[id]`) siguen
funcionando **solo** para evaluaciones `pass_fail` sin `requires_approval`. En
cualquier otra evaluación responden 422 `usar_correccion` con un mensaje que
manda al formulario de corrección.

`PATCH /api/portal/entregas/[id]` pasa a delegar en `publicarCorreccion()`
(crea y publica una versión), así que hasta el camino viejo deja registro.

**Por qué**: sin esto, cualquiera con `evaluacion.editar` saltea la aprobación
cargando la celda, y una evaluación numérica quedaría con `passed` sin `score`.

## DV-006 — Capacidad nueva `correcciones.aprobar`

**Decisión**: se agrega a `CAPABILITIES` (bloque académico). Roles de sistema:
`direccion` y `coordinacion` la tienen; `soporte` y `administracion` no.
Backfill en la migración con el patrón `jsonb_build_array` de 0052. Etiqueta en
`roles-client.tsx` y entrada en `GUIA_CAPACIDADES`; el regex de grupo académico
suma `correcciones`.

El profesor NUNCA tiene capacidades de staff (014): en una evaluación que
requiere aprobación, el profesor siempre envía. Quien corrige con
`evaluacion.editar` y además `correcciones.aprobar` publica directo (spec,
supuesto 4).

**Efecto en tests**: `capabilities.test.ts:138` (`coordinación` = todas menos
3) no cambia porque coordinación la recibe.

## DV-007 — Validación de la plantilla y de la corrección: funciones puras

**Decisión**: `src/lib/grading-template.ts` (puro, sin DB) concentra:
`validarPlantilla()` (suma 100, mínimo 1–100, nombres no vacíos, ids únicos),
`notaDeCorreccion()` (suma de ejercicios o nota directa),
`validarCorreccion(plantilla, entrada, modo)` (`draft` tolera faltantes;
`submit`/`publish` exigen todo — FR-013) y `aproboConNota()`.

**Por qué**: es la lógica con más bordes (puntaje sobre el máximo, ejercicio
faltante, nota justo en el mínimo) y se prueba sin base.

## DV-008 — Congelar la plantilla al publicar

**Decisión**: `PUT /api/assessments/[id]/template` rechaza con 409
`plantilla_congelada` un cambio de `scale`, `min_score` o `criteria` (ids y
máximos) si existe una corrección `published` o `superseded` para la
evaluación. Nombres de ejercicios/campos, `required` de campos y
`requires_approval` sí se pueden cambiar.

## DV-009 — Copiar evaluaciones copia la plantilla

**Decisión**: `planAssessmentCopy` incluye `scale`, `minScore`,
`requiresApproval`, `criteria`, `textFields` en cada ítem de `aCopiar`, con
`id` de ejercicios regenerados (la copia es otra evaluación). Sigue sin copiar
`dueAt` ni resultados.

## DV-010 — Lo que ve el alumno se lee de versiones `published`, en su módulo

**Decisión**: función `correccionesPublicadasDeCursada(orgId, contactId,
enrollmentId)` en `src/server/corrections.ts`, expuesta en
`GET /api/portal/me/correcciones?cursada=` con `requireStudentPortal`. La
consulta filtra `status = 'published'` en el WHERE (FR-024: no se consulta) y
verifica que la inscripción sea del `contactId`. La UI
(`student-submissions.tsx`) muestra el detalle dentro de cada evaluación.

`entregasDeCursada` deja de devolver `passed`/`feedback` de entregas cuya
corrección vigente no esté publicada: desde 031 esos campos de `submission`
solo se escriben al publicar (DV-003), así que no hay cambio de consulta, pero
un test lo fija.

**Por qué**: no se mete en `student-portal.ts` para no romper sus guards
(solo lectura, `contactId` en toda firma), pero el módulo nuevo adopta las
mismas reglas y su propio guard estructural.

## DV-011 — Escolaridad: módulo puro + dos puertas, HTML imprimible

**Decisión**:
- `src/lib/escolaridad.ts` (puro): `armarEscolaridad(datos)` arma filas por
  cursada con evaluaciones (nota / aprobado / "Pendiente") y estado final con
  `estadoDeModulo` / `programApprovalState`. Nunca nota ponderada (FR-028).
- `src/server/transcript.ts`: `escolaridadDeContacto(orgId, contactId)` hace
  las lecturas (cursadas, cohortes, cursos, evaluaciones, resultados
  oficiales, asistencia) y llama al armado puro. No lee cobranza. No importa
  `student-record.ts` (ese módulo trae teléfono y estado de cuenta).
- Staff: `GET /api/contacts/[id]/escolaridad/print` (`academico.ver`) devuelve
  HTML de documento A4 vertical (patrón de `certificate/print`, `escapeHtml`),
  enlazado desde el legajo.
- Alumno: `GET /api/portal/me/escolaridad/print` (`requireStudentPortal`), el
  mismo HTML, enlazado desde una tarjeta "Mi escolaridad" del portal.

**Por qué**: el PDF sale de "Imprimir → Guardar como PDF" del navegador (spec,
supuesto; constitución II: sin generadores externos). Un route handler HTML ya
es el patrón probado del certificado y del estado de cuenta.

**Asistencia**: el porcentaje sale de la misma función que usa el legajo
(`attendancePercentage` de `attendance.ts`). Sin asistencia y sin resultados:
"Sin datos" (regla de `estadoDeModulo`, nunca "Aprobado" por omisión).

## DV-012 — Bandeja de aprobación

**Decisión**: página `/correcciones` (staff, `correcciones.aprobar`) con la
lista de versiones `pending`, filtro por cohorte, y un panel de detalle con la
corrección completa (y el enlace a la entrega si hay). Acciones:
`POST /api/corrections/[id]/approve` y `POST /api/corrections/[id]/return`
(comentario obligatorio). Entrada en la barra lateral solo con la capacidad.

## DV-013 — Formulario de corrección compartido

**Decisión**: un componente presentacional `CorrectionForm` (en
`src/components/grading/`) que recibe plantilla + versión vigente + borrador y
emite la entrada; lo usan el portal del profesor (`portal-submissions.tsx`,
reemplaza `FormularioDeCorreccion`) y el panel del staff (desde
`grading-client.tsx`, por alumno). Los botones dependen de un `modo` que llega
del servidor: `publicar` o `enviar` (FR-018) — el cliente no decide permisos.

## DV-014 — Rutas de corrección: una por puerta

**Decisión**:
- Staff (`evaluacion.editar`): `GET|PUT /api/assessments/[id]/corrections/[enrollmentId]`.
- Profesor (`requireTeacherPortal`, alcance 014, cohorte no finalizada):
  `GET|PUT /api/portal/assessments/[id]/corrections/[enrollmentId]`.
- `PUT` recibe `{ action: "draft" | "submit" | "publish", ... }`. El servidor
  decide si `publish` está permitido (sin `requires_approval`, o con la
  capacidad); si no, responde 422 `requiere_aprobacion`.

Dos rutas y no una con un `if` adentro: es la regla de las tres puertas
(ciclos 014/015), y `route-capabilities.test.ts` la vigila.

## DV-015 — Lo que NO cambia

`approvalState`, certificados y el reporte por empresa no se modifican (leen
`passed`, que sigue siendo la verdad). Las correcciones previas a 031 no se
migran a `correction`: siguen viviendo en `submission`/`assessment_result` y
se ven como hoy.
