# Contrato — Escolaridad

## `GET /api/contacts/[id]/escolaridad/print` — `academico.ver`

## `GET /api/portal/me/escolaridad/print` — `requireStudentPortal`

Ambas devuelven `200 text/html; charset=utf-8`: un documento A4 vertical
(`@page { size: A4; margin: 18mm }`) con el mismo cuerpo, armado por una sola
función de render. Contacto ajeno o sin cursadas visibles → 404 (staff) / la
del propio alumno siempre existe (puede decir "Todavía no tenés cursadas").

Todo texto interpolado pasa por `escapeHtml` (`src/lib/utils.ts`).

### Contenido

1. Encabezado: nombre de la academia, título "Escolaridad", fecha de emisión
   (zona de la academia).
2. Alumno: nombre completo y documento (`contact.national_id`) si está cargado.
3. Por cursada, en orden cronológico (inicio de cohorte):
   - curso · cohorte · período (`desde – hasta`, o "en curso");
   - estado final: **Aprobado**, **No aprobado**, **En curso** (pendiente) o
     **Sin datos**;
   - asistencia `N%` si hay datos, si no "sin registro";
   - tabla de evaluaciones: nombre · obligatoria/opcional · resultado
     (`N/100` en numérica, `Aprobada`/`No aprobada` en `pass_fail`,
     `Pendiente` sin resultado oficial).
   - Especializaciones: el programa con su estado y, debajo, cada módulo con
     la misma forma.
4. Pie: "Documento informativo emitido por <academia>. No reemplaza al
   certificado." y una nota `.noprint` con "Usá Imprimir → Guardar como PDF".

### Lo que NO lleva

Cobranza, teléfono, correo, notas internas del staff, correcciones en
borrador/pendientes, nota final ponderada.

## Pure builder

```ts
// src/lib/escolaridad.ts
export function armarEscolaridad(input: EscolaridadInput): Escolaridad;
export function renderEscolaridadHtml(e: Escolaridad, tz: string): string;
```

`EscolaridadInput` trae filas planas (cursadas, evaluaciones, resultados
oficiales, porcentajes de asistencia, dispensas). Ninguna lectura de base en
este módulo.
