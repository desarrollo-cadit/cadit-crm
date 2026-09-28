# US 029 — Navegación de cohortes y agregados de la especialización

Automatizado en `scripts/e2e/navegacion-029.mjs` (lo llama `scripts/e2e-selftest.mjs`
al final). Para correrlo solo, con la app E2E levantada, basta una entrada que
inicie sesión y llame a `seccion029({ api, ok, BASE, getCookie })`.

## Preparación

- App con mocks (`.env.e2e`, puerto 3005) y base `vocero_e2e` migrada (incluye 0041).
- Sesión de staff con `academico.editar`, `asistencia.editar`, `evaluacion.ver`.

## 1. Material de clases en UN pedido

1. Crear una cohorte común con días, horario y fecha de fin; generar su cronograma.
2. Cargar un material en la clase 1 y otro en la clase 2.
3. `GET /api/resources?classesOfCohortId=<cohorte>` → `byClass` con esas dos clases.
4. Abrir `/cohorts/<cohorte>` → pestaña **Clases**.
   - **Esperado**: la red muestra **exactamente 1** request a `/api/resources?…`
     (con `classesOfCohortId`), no uno por fila. "Guía 1" aparece en su clase.
   - Agregar o quitar material en una fila actualiza solo esa fila, sin volver a pedir.

## 2. Encabezado y miga de pan

1. En la cohorte común: miga `Académico › <cohorte>`, nombre y fechas.
2. En un módulo: `Académico › <especialización> › Módulo 1 — <nombre>`, insignia
   `Módulo 1 de 3`, y `Módulo 2 →` hacia el siguiente.
3. Clic en la especialización de la miga → `/cohorts/<madre>`.

## 3. La madre entra por el Recorrido

1. Especialización con tres módulos (el tercero sin días) y un alumno inscripto en
   la madre y en el módulo 1 (en curso).
2. Abrir `/cohorts/<madre>`.
   - **Esperado**: la pestaña activa es **Recorrido**. Arriba, los módulos en orden
     (profesor, fechas, clases dictadas/total). Abajo, la grilla alumno × módulo:
     `Cursando` en el módulo 1 y `Sin cursada` en los otros, con texto (no solo
     color); al pasar el mouse, la asistencia real; clic → el módulo. Última
     columna: el certificado (`Pendiente`). Nada de montos.

## 4. Clases de la madre: generar todos

1. Pestaña **Clases** de la madre: cada módulo en su sección, enlazado.
2. Botón **Generar cronograma de todos los módulos** → 1 request (201).
   - **Esperado**: módulos 1 y 2 con clases reales; el 3 salteado con el motivo
     "No declara días de cursada.".
   - El material de todos los módulos llega en 1 request.
3. Repetir la generación (API) → nada generado, 3 salteados, misma cantidad de clases.

## 5. Asistencia y Evaluación de la madre

1. Pestaña **Asistencia**: selector `Todos · Módulo 1 · Módulo 2 · Módulo 3`.
   - `Todos`: la grilla del Recorrido, de solo lectura.
   - Elegir `Módulo 1 — …` abre la planilla de ese módulo (pide
     `/api/cohorts/<módulo>/attendance`), editable con las mismas capacidades.
2. **Evaluación** funciona igual con la planilla de evaluaciones del módulo.

## Camino infeliz

- Sin `evaluacion.ver`, `Todos` explica que el resumen requiere ese permiso y ofrece
  elegir un módulo (la grilla no viaja).
- Si el pedido de material falla, la pestaña lo dice con **Reintentar** y no dibuja
  paneles vacíos (que afirmarían "no hay material").
- Generar sobre una cohorte común → 422 `not_a_program`.
