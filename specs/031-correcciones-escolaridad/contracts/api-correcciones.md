# Contrato — API de plantillas y correcciones

Todas las entradas se validan con Zod (`parseBody`); errores con `apiError`.
Ausencia o falta de alcance del profesor = **404**, nunca 403 (014).

## Tipos compartidos

```ts
type Scale = "pass_fail" | "numeric";
type Criterion = { id: string; name: string; maxPoints: number };   // 1..100
type TextField = { id: string; name: string; required: boolean };
type Template = {
  scale: Scale;
  minScore: number | null;          // 1..100 si numeric; null si pass_fail
  requiresApproval: boolean;
  criteria: Criterion[];            // vacío o Σ maxPoints = 100; solo numeric
  textFields: TextField[];
};

type CorrectionStatus = "draft" | "pending" | "published" | "superseded";
type CorrectionDto = {
  id: string;
  status: CorrectionStatus;
  submissionId: string | null;
  score: number | null;
  passed: boolean | null;
  feedback: string | null;
  criterionScores: { criterionId: string; points: number | null; comment: string | null }[];
  textValues: { fieldId: string; value: string }[];
  correctedByName: string | null;
  submittedAt: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewComment: string | null;     // NUNCA viaja al portal del alumno
  publishedAt: string | null;
};

type CorrectionInput = {
  action: "draft" | "submit" | "publish";
  submissionId?: string | null;
  score?: number | null;            // solo numeric SIN ejercicios
  passed?: boolean | null;          // solo pass_fail
  feedback?: string | null;         // ≤ 5000
  criterionScores?: { criterionId: string; points: number | null; comment?: string | null }[];
  textValues?: { fieldId: string; value: string }[];   // value ≤ 5000
};
```

## Plantilla (staff)

### `PUT /api/assessments/[id]/template` — `evaluacion.editar`

Body: `Template` (ids de ejercicios/campos nuevos pueden venir vacíos; el
servidor los genera).

- 200 `{ assessment: AssessmentDto & Template }`
- 422 `plantilla_invalida` — mensaje con la causa (p. ej. "Los ejercicios suman 90; faltan 10").
- 409 `plantilla_congelada` — cambio de escala/mínimo/ejercicios con correcciones publicadas.
- 404 `not_found`.

`GET /api/cohorts/[id]/grading` (existente) agrega `Template` a cada
evaluación y `scores: Record<assessmentId, number|null>` por alumno.

## Correcciones — staff

### `GET /api/assessments/[id]/corrections/[enrollmentId]` — `evaluacion.editar`

200 `{ template: Template, published: CorrectionDto | null, inProgress: CorrectionDto | null, submissions: { id, url, title, submittedAt }[], mode: "publish" | "submit" }`

`mode` lo decide el servidor: `publish` si la evaluación no requiere aprobación
o la sesión tiene `correcciones.aprobar`; si no, `submit`.

### `PUT /api/assessments/[id]/corrections/[enrollmentId]` — `evaluacion.editar`

Body: `CorrectionInput`.

- 200 `{ correction: CorrectionDto }`
- 422 `correccion_incompleta` — falta puntaje en "Ejercicio 2" / falta "A mejorar" (solo `submit`/`publish`).
- 422 `puntaje_fuera_de_rango` — "Ejercicio 2: máximo 30".
- 422 `requiere_aprobacion` — `publish` sin permiso.
- 409 `en_aprobacion` — hay una versión `pending`: no se edita hasta que se apruebe o devuelva.
- 404 `not_found` — evaluación, inscripción de otra cohorte o entrega ajena.

## Correcciones — profesor

### `GET|PUT /api/portal/assessments/[id]/corrections/[enrollmentId]` — `requireTeacherPortal`

Mismos cuerpos y respuestas que la ruta de staff, con estas reglas:
- alcance por `teacherReachesCohort` (titular o suplente); fuera de alcance → 404;
- cohorte finalizada → 422 `cohorte_finalizada`;
- `mode` es `submit` si la evaluación requiere aprobación (el profesor nunca
  tiene capacidades de staff), `publish` si no.

## Aprobación — staff con `correcciones.aprobar`

### `GET /api/corrections?status=pending&cohortId=` 

200 `{ items: { id, assessmentName, cohortId, cohortName, studentName, correctedByName, submittedAt, score, passed }[] }`

### `GET /api/corrections/[id]`

200 `{ correction: CorrectionDto, template: Template, assessmentName, studentName, cohortName, published: CorrectionDto | null, submission: { url, title } | null }`

### `POST /api/corrections/[id]/approve`

Solo `pending` → `published` (DV-003). 200 `{ correction }`; 409 `estado_invalido`.

### `POST /api/corrections/[id]/return`

Body `{ comment: string (1..2000) }`. Solo `pending` → `draft` con
`review_comment`. 200 `{ correction }`; 409 `estado_invalido`; 422 sin comentario.

## Alumno

### `GET /api/portal/me/correcciones?cursada=<enrollmentId>` — `requireStudentPortal`

Solo versiones `published` de inscripciones del `contactId` de la sesión.
Cursada ajena → 404.

200 `{ assessments: { assessmentId, scale, minScore, criteria: Criterion[], textFields: TextField[], correction: StudentCorrectionDto }[] }`

```ts
type StudentCorrectionDto = Omit<CorrectionDto,
  "status" | "submittedAt" | "reviewedByName" | "reviewedAt" | "reviewComment"> ;
```

## Compatibilidad (DV-005)

| Ruta existente | Desde 031 |
|---|---|
| `PATCH /api/assessments/[id]/results` | igual para `pass_fail` sin aprobación; si no, 422 `usar_correccion` |
| `PATCH /api/portal/assessments/[id]/results` | ídem |
| `PATCH /api/portal/entregas/[id]` | ídem; cuando aplica, crea y publica una versión vía `publicarCorreccion()` |
| `POST /api/cohorts/[id]/assessments/copy` | copia también la plantilla (DV-009) |
