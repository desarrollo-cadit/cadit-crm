# Plan — 013 Legajo académico y contenido de cursada

Asume [research.md](research.md) (7 DV resueltas) y
[data-model.md](data-model.md).

## Constitution Check

| Principio | Cómo lo cumple |
|---|---|
| **II — Soberanía** | Cero dependencias nuevas. Los recursos y las grabaciones son ENLACES; el sistema no almacena archivos ni reproduce video. La zona horaria se resuelve con `Intl`, que ya está en el runtime. |
| **I — Seguridad** | Nada nuevo que cifrar. Las grabaciones son enlaces, y su visibilidad se resuelve por capacidad + pertenencia a la cohorte (FR-005d). |
| **III — Multi-tenancy** | `organization_id` NOT NULL en las dos tablas nuevas, `scoped()` en toda query, y **RLS desde la migración** — no después. |
| **IV — Idempotencia** | Generar el cronograma dos veces no duplica clases (`generateSchedule` ya lo resuelve). La migración es aditiva y re-ejecutable. |

**Sin enmienda constitucional.** A diferencia de 007 (M365), esta fase no
agrega ninguna dependencia de runtime.

## Orden, y por qué es ese

La regla que ordena todo: **construir para el panel del staff primero**. Cuando
lleguen 014 y 015, exponen algo que ya funciona y ya tiene datos cargados. Un
portal que estrena su contenido el mismo día que se estrena a sí mismo es dos
cosas rotas al mismo tiempo.

### Paso 1 — Cimientos (zona horaria y enlaces)

Columnas nuevas + la ventana horaria. Es lo único de lo que dependen los
demás pasos, y no cambia ninguna pantalla todavía.

Acá vive el riesgo silencioso de la fase: **hoy `"18:30"` es texto sin zona**.
Componer la fecha real de una clase mal deja a 87 alumnos fuera de países
distintos mirando un horario equivocado. Se resuelve en UNA función pura, con
test, y nadie más compone fechas a mano.

### Paso 2 — El calendario que dice la verdad

La lista mixta (clases reales + proyección marcada) y la acción de generar
cronograma. Es el paso que vuelve útil lo que 009 construyó y nunca se usó.

Se entrega antes que el material porque es lo que hoy está **mal**: el
calendario muestra días teóricos y una clase cancelada sigue apareciendo.
Arreglar una mentira vale más que agregar una función.

### Paso 3 — Material y anuncios

Las dos entidades nuevas, con su ABM en la pantalla de cohorte. Independientes
entre sí y del resto: si el paso 4 se corta, esto ya sirve.

### Paso 4 — El legajo

La pantalla que resume el cambio de CRM a academia. Va última porque **lee
todo lo anterior**: inscripciones, asistencia, resultados, certificados y
estado de cuenta. Construirla antes sería construirla dos veces.

El estado de cuenta dentro del legajo respeta las capacidades de 012: quien no
tiene `cobranza.ver` no lo ve, y el DTO **no se arma** —no se filtra en la UI—,
mismo criterio que `buildRosterEntry`.

### Paso 5 — Reporte por empresa

FR-010c. Sustituye al portal corporativo que el dueño descartó. Es un export,
no una pantalla: 14 inscripciones con empresa y 5 empresas reales.

## Riesgos

- **La zona horaria es el riesgo real de la fase.** Una función pura y probada,
  o esto se convierte en un bug que aparece solo para quien está lejos.
- **El calendario mixto puede confundir** si la proyección no se distingue de
  las clases reales. La marca tiene que ser visible, no un tooltip.
- **`generateSchedule()` nunca corrió en producción.** Antes de ofrecerlo en la
  pantalla hay que verificarlo contra base efímera con datos reales copiados.
- Las 6 cohortes sin horario no pueden generar cronograma: se dice el motivo,
  no se ofrece un botón que falla (criterio T017d de 012).
