# 024 — El recorrido del alumno

**Estado**: implementada · **Depende de**: 015, 023 · **Habilita**: —

## Por qué esta fase existe

El portal del alumno respondía bien las preguntas de hecho —cuándo es la
clase, cuánto debo, aprobé o no— y no respondía la que la persona hace de
verdad al entrar: **¿cómo voy?**

Dos síntomas concretos:

1. **La pantalla de una cursada era un listado hacia abajo**: asistencia,
   evaluaciones, clases, avisos y material, uno atrás del otro. Con doce
   clases son tres pantallas de scroll, y lo que la persona vino a buscar —el
   enlace de la próxima, la devolución de una entrega— queda enterrado.
2. **Nada transmitía movimiento.** Los datos eran correctos y estáticos: una
   lista de cajas iguales se lee como un formulario, no como una cursada que
   avanza.

## La decisión que define la fase

**Un hito solo se marca cumplido si el sistema tiene con qué probarlo.**

Es la misma regla que hizo existir `sin_datos` en el legajo (013/T030) y
`pendiente` en las evaluaciones (010/FR-005), y acá pesa más que en ningún
lado: esto es lo que la persona lee sobre su propio recorrido.

Consecuencia directa: **no hay puntos, ni niveles, ni rachas, ni medallas**.
Nada que el sistema tenga que inventar. Cada hito es un hecho con fecha, o un
hecho que todavía no pasó.

Una medalla regalada no motiva a nadie —se nota— y un "no alcanzado" sobre un
dato que nadie cargó es una acusación. Con 41 camadas importadas sin
asistencia, la versión ingenua le diría a media academia que no llegó al
mínimo.

## User Scenarios

### US1 — Dónde estoy parado (Priority: P1)

Como alumno quiero ver de un vistazo qué parte de la cursada llevo y qué me
falta, sin tener que contar clases en una lista.

### US2 — Qué logré (Priority: P1)

Como alumno quiero ver lo que ya cumplí —clases, evaluaciones aprobadas,
asistencia— con su fecha, porque un recorrido sin fechas no es un recorrido.

### US3 — Hacia dónde voy (Priority: P1)

Como alumno quiero ver el próximo hito marcado, para saber qué sigue.

### US4 — Encontrar lo que vine a buscar (Priority: P1)

Como alumno quiero llegar a las clases, las evaluaciones, el material o los
avisos sin recorrer las otras tres secciones.

## Requirements

- **FR-001**: Un hito DEBE marcarse `cumplido` solo con evidencia en la base.
- **FR-002**: Sin dato cargado, el hito DEBE decir `sin_datos` — nunca
  `no_alcanzado`. **0% porque nadie pasó lista no es 0% porque no vino.**
- **FR-003**: Una evaluación sin corregir es `pendiente`, jamás desaprobada.
- **FR-004**: EXACTAMENTE un hito se marca "acá estás": el primer pendiente
  **con fecha**. Una cursada terminada no marca ninguno.
- **FR-005**: Los hitos se calculan en el SERVIDOR. La regla de qué se puede
  afirmar no puede quedar a criterio de quien escriba la próxima pantalla.
- **FR-006**: Una cursada de menos de 4 clases NO muestra hito de mitad de
  camino: aporta menos que el ruido que agrega.
- **FR-007**: El detalle DEBE separarse por lo que se viene a HACER —clases,
  evaluaciones, material, avisos—, no por origen del dato.
- **FR-008**: En celular el recorrido va PRIMERO; en escritorio, al costado.
  Al final quedaba después de doce clases de scroll.

## Success Criteria

- **SC-001**: Un alumno abre su cursada y sabe en qué clase va sin contar.
- **SC-002**: Una camada importada sin asistencia NO muestra ningún hito en
  `no_alcanzado`, verificado por test.
- **SC-003**: Una evaluación sin corregir nunca aparece como no lograda.
- **SC-004**: Un certificado anulado se ve, y dice que lo está.

## Out of Scope

- Puntos, niveles, rachas, insignias: nada que el sistema deba inventar.
- Comparar el recorrido con el de otros alumnos (FR-002 de 015 lo prohíbe).
- Notificar cuando se cumple un hito: es 017, fuera de alcance por decisión
  del dueño.
