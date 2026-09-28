# US cursos-offline — Biblioteca de cursos offline (LearnDash)

Automatizado en `scripts/e2e/cursos-offline.mjs` (lo llama `scripts/e2e-selftest.mjs`
al final). Para correrlo solo, con la app E2E levantada, basta una entrada que
inicie sesión como staff y llame a `seccionCursosOffline({ api, ok, BASE, getCookie })`.

## Preparación

- App con mocks (`.env.e2e`, puerto 3005) y base **efímera** `vocero_e2e` migrada
  (incluye 0042). La sección se niega a correr si `DATABASE_URL` no apunta a
  `vocero_e2e`: el importador escribe directo en esa base.
- Sesión de staff con `academico.ver` y `academico.editar`.
- Fixture SINTÉTICO en `tests/e2e/fixtures/cursos-offline/` (`courses.json` +
  `quiz-map.json`), con la misma forma que el export real. El contenido del cliente
  nunca entra al repo (CadIT es MIT).
  - "Curso E2E A": 2 lecciones × 2 temas; el tema 1.1 trae negrita, lista, enlace y
    un `<script>` literal. Cuestionario simple (opción única, `retries_allowed "1"`,
    aprobación 80) y cuestionario múltiple (sin límite de intentos).
  - "Curso E2E B": 1 lección, sin cuestionarios.
  - Un cuestionario `pending` (9003) y uno `skip` (9004) en el mapa.

## 1. Importar, dos veces

1. Compilar el importador (como `pnpm import:offline-courses`) y correrlo con
   `--file`, `--map`, `--org <organización>` y `--apply`.
   - **Esperado**: sale con 0; informa `PENDING … quiz:9003` y `skipped (skip): quiz:9004`.
2. Correrlo otra vez con los mismos archivos.
   - **Esperado**: 0 inserts, 0 updates, 0 deletes en todas las tablas.

## 2. Biblioteca del staff

1. `GET /api/offline-courses` → A (2 lecciones, 4 temas, 2 cuestionarios) y B
   (1 lección, 0 cuestionarios).
2. `GET /api/offline-courses/<A>` → el detalle trae `isCorrect` ("4" y "Azul" en el
   simple), `retriesAllowed 1`, `passingPercentage 80`.
3. Ni el pendiente ni el descartado aparecen en ningún curso. Un id inventado → 404.
4. `/cursos-offline` pinta la lista; `/cursos-offline/<A>` muestra
   `<strong>negrita E2E</strong>` y el `<script>` como TEXTO (`&lt;script&gt;`).

## 3. Asignación y excepciones por alumno

1. Crear curso académico, dos profesores, una cohorte de cada uno y dos alumnos en la
   primera.
2. `PUT /api/cohorts/<cohorte>/offline-courses {courseIds:[A]}` → la cohorte hereda A.
   Con un id inventado → 422 y la asignación queda igual.
3. Quitar A al alumno 2 (`revoke`); agregar B al alumno 1 (`grant`).
4. `GET /api/enrollments/<id>/offline-courses`:
   - alumno 1: A **Heredado** (`inherited`), B **Agregado** (`granted`);
   - alumno 2: A **Quitado** (`revoked`), B **Sin acceso** (`none`).

## 4. Portal del alumno

1. Dar acceso al portal a los dos y entrar con la contraseña temporal.
2. Alumno 1: la lista trae A y B. Alumno 2: lista vacía; `GET` de A → **404**
   (nunca 403), el tema y la miniatura también 404.
3. Alumno 1 abre el tema 1.1: `contentMd` tal cual, `prev` nulo, `next` = "Tema 1.2 E2E".
4. Abre el cuestionario simple: en el JSON crudo **no** aparece `isCorrect` ni
   `is_correct`; `maxAttempts 2`, quedan 2.

## 5. Corrección y reintentos

1. Intento 1 con respuestas equivocadas → 201, `passed false`, 0 %, queda 1.
2. Intento 2 correcto → `passed true`, 100 %, quedan 0.
3. Intento 3 → **409** `attempts_exhausted`.
4. Cuerpo malformado → 422. Cuestionario inexistente → 404 (GET y POST). El alumno 2
   no puede enviar → 404.
5. Opción múltiple: elegir solo una de las dos correctas no aprueba; el conjunto exacto
   aprueba; `attemptsRemaining` nulo (sin límite).
6. El alumno ve su historial: 2 intentos, aprobado.

## 6. Historial: profesor y staff

1. El profesor de la cohorte: `GET /api/portal/cohorts/<cohorte>/offline-attempts` →
   los 2 intentos del alumno 1 en el simple; ni respuestas ni clave.
2. El profesor de otra cohorte → **404**.
3. Staff: `/api/cohorts/<cohorte>/offline-attempts` y
   `/api/enrollments/<alumno 1>/offline-courses` → 4 intentos. Cohorte o inscripción
   inventada → 404.

## 7. Pantallas del portal

1. `/portal/cursos-offline` y `/portal/cursos-offline/<A>` responden 200 al alumno
   (la lista se pide del lado del cliente; el contenido ya se verificó por la API).
