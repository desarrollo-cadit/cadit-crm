# Data Model — 014 Portal del profesor

Asume las resoluciones de [research.md](research.md). Si el dueño resuelve
distinto una DV, **este documento se corrige antes de generar la migración**
(la regla ya hizo falta usarla en 012).

## Lo que YA existe y alcanza

Medido antes de proponer nada. **Esta fase casi no agrega modelo**: lo que
necesita ya está construido por 009, 012 y 013.

| Qué | Dónde | Estado |
|---|---|---|
| Identidad de portal | `account_link` (`kind = 'profesor'`, `teacher_id`) | 012 · **0 filas** |
| Sesión de portal | `resolvePortalSession()` + `portalTeacherId()` | 012 · listo |
| Profesor de la cohorte | `cohort.teacher_id` | 33 de 41 cohortes |
| **Profesor de una clase (suplencia)** | `class_session.teacher_id` | 009 · **ya existe**, vacío |
| Asistencia y su autor | `attendance` + `recorded_by` | 009 · listo (DV-001) |
| Evaluaciones por cohorte | `assessment.cohort_id` | 010 · **0 filas** |
| Cohorte finalizada | `cohort.status = 'finalizada'` | 005 · listo (DV-005) |
| Material y anuncios | `resource`, `announcement` | 013 · listo |
| Horas por clase | `class_session.hours` | 009 · listo (US5) |

**La suplencia de FR-001 no necesita modelo nuevo.** `class_session.teacher_id`
está desde 009 y nadie lo usó; alcanza con consultarlo.

## Lo único que se agrega

### `contact.archived_at`

| Columna | Tipo | Nota |
|---|---|---|
| `archived_at` | timestamp NULL | `NULL` = activo. DV-008 |

**Por qué archivar y no borrar.** El borrado de un contacto cae en cascada
sobre `enrollment`, y de ahí sobre `certificate`, `payment`, `installment`,
`attendance`, `assessment_result` y `license`. Un click destruiría el
historial académico y financiero de una persona, **incluidos sus certificados
emitidos**. Un certificado es un documento: borrarlo no corrige un error,
borra la prueba de que alguien se recibió.

**Qué implica estar archivado**: el contacto no aparece en listas, buscadores
ni en el portal, y no se le puede dar acceso. Todo lo demás queda: sus notas,
sus pagos y sus certificados siguen existiendo y el legajo se puede abrir.

**Se borra de verdad solo el contacto SIN ninguna inscripción** — un lead que
nunca cursó, o un error de carga. Ahí no hay historial que proteger.

**No lleva columna de archivado el profesor**: DV-008 resolvió que se exige
reasignar sus cohortes antes de darlo de baja, así que cuando se borra ya no
quedó nada colgando.

## Lo que NO se agrega, y por qué

- **Ninguna tabla de "permisos del profesor".** El alcance se deriva de los
  datos: un profesor ve una cohorte si figura en `cohort.teacher_id` o en el
  `teacher_id` de alguna de sus clases. Una tabla puente sería un segundo
  lugar donde puede desincronizarse la verdad.
- **Ninguna columna de "tarifa visible".** FR-010 dice que el profesor ve sus
  horas y no su tarifa: se resuelve NO armando ese campo en el DTO, igual que
  el estado de cuenta del legajo en 013.
- **Ningún endpoint compartido con el staff** (FR-008). El portal vive en
  `/api/portal/...` y arma sus propios DTO. Reusar los del staff es lo que
  haría que un campo agregado para coordinación apareciera un día en la
  pantalla del profesor sin que nadie lo decidiera.

## El alcance del profesor, en una regla

```
cohortes del profesor P =
    { c : c.teacher_id = P }                          (es su cohorte)
  ∪ { c : ∃ s ∈ class_session, s.cohort_id = c        (dictó una clase suelta:
              ∧ s.teacher_id = P }                     suplencia, FR-001)
```

Todo lo demás del portal —clases, alumnos, asistencia, evaluaciones,
material— se filtra por ese conjunto. **Fuera de él, 404 y no 403** (FR-002):
un 403 confirma que la cohorte existe, y eso ya es información sobre la
academia que el profesor no tiene por qué tener.

## Migración

Una sola, aditiva: `contact.archived_at` (NULL, no toca ninguna fila).
Sin RLS nueva — `contact` ya está bajo `tenant_isolation` desde 0025.
