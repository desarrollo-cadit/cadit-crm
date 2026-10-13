# Quickstart — verificar 031

## 1. Preparar

```bash
pnpm db:migrate            # aplica 0054 (re-ejecutable)
pnpm dev                   # con WA_MOCK_ENABLED=true y mocks como siempre
```

Backup antes de migrar en entornos con datos: `backups/` (patrón de 0052/0053).

## 2. Gate técnico

```bash
pnpm typecheck && pnpm lint && NEXT_DIST_DIR=.next-build pnpm build && pnpm test
```

Tests nuevos esperados:
- `grading-template.test.ts` — plantilla (suma 100, mínimo, congelada), nota por suma, puntaje fuera de rango, nota en el mínimo aprueba, borrador tolera faltantes.
- `correcciones.test.ts` — transiciones; publicar escribe `assessment_result` y la entrega; borrador/pendiente NO; versión publicada sigue vigente mientras la nueva está en trámite; atajos devuelven 422 `usar_correccion`.
- `correcciones-guard.test.ts` — guard estructural: la lectura del alumno filtra `published` en el WHERE, toda función exportada para el alumno recibe `contactId`, sin `403`, `reviewComment` no aparece en el DTO del alumno.
- `escolaridad.test.ts` — armado puro: Pendiente ≠ No aprobada, "Sin datos", especialización con módulos, sin nota ponderada, HTML escapado.
- `capabilities.test.ts` / `route-capabilities.test.ts` actualizados.

## 3. E2E (`E2E_SECCIONES=correcciones pnpm test:e2e`)

Sección nueva `scripts/e2e/correcciones.mjs`:

1. Staff define en una evaluación: numérica, mínimo 60, ejercicios 40/30/30, campo "A mejorar" obligatorio, requiere aprobación.
2. Ejercicios que suman 90 → 422 `plantilla_invalida`.
3. Profesor guarda borrador → el alumno (`/api/portal/me/correcciones`) no ve nada; `grading` sigue sin resultado.
4. Profesor intenta `publish` → 422 `requiere_aprobacion`; `submit` → `pending`.
5. Carga por celda sobre esa evaluación → 422 `usar_correccion`.
6. Aprobador devuelve con comentario → `draft` con comentario; alumno sigue sin ver.
7. Profesor reenvía, aprobador aprueba → alumno ve 80/100, ejercicios y comentarios; `grading` muestra aprobado + 80; sin `reviewComment` en la respuesta del alumno.
8. Cambiar la escala → 409 `plantilla_congelada`.
9. Profesor edita la publicada → la nueva queda `pending` y el alumno sigue viendo 80.
10. Escolaridad: staff y alumno obtienen HTML con el curso, "80/100" y estado; otra evaluación sin corregir dice "Pendiente".
11. Evaluación `pass_fail` sin aprobación: corrección vieja `PATCH /api/portal/entregas/[id]` sigue funcionando y deja una versión `published`.

## 4. Navegador (Playwright)

- Profesor: corregir con el formulario de ejercicios desde el portal; ver la nota calculada en vivo.
- Staff: bandeja `/correcciones`, aprobar y devolver.
- Alumno: ver la corrección completa en su cursada; abrir "Mi escolaridad" e imprimir (vista previa sin barras).
- Tema oscuro en las pantallas nuevas (tokens; `tema-oscuro.test.ts`).
