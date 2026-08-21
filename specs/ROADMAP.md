# Roadmap — del CRM comercial a la gestión académica

**Creado**: 2026-08-21

## Dónde estamos

Los ciclos 001-007 construyeron un CRM comercial competente: bandeja de
WhatsApp, pipeline, agente de IA, catálogo de cursos, camadas, inscripciones
con datos comerciales, onboarding de soporte y correo transaccional.

El ciclo de vida del alumno está cubierto hasta el momento en que paga y entra
al aula. **Después de ahí, el sistema no sabe nada.**

## El hueco, en una frase

Hoy el CRM registra que un alumno **se inscribió**. No registra que asistió,
que rindió, que aprobó, que pagó la tercera cuota ni que terminó el curso.

## La cadena

El orden no es arbitrario: cada eslabón habilita al siguiente.

```
008 Cobranza  ──▶  009 Clases y asistencia  ──▶  010 Evaluación y certificados
     │                      │                            │
  ¿quién debe?      ¿quién vino? ¿cuántas          ¿quién aprobó?
  ¿cuánto entró?     horas dictó el profe?          ¿quién se recibe?
```

- **Sin sesiones de clase** no hay asistencia, y sin asistencia no hay criterio
  de aprobación por presencia.
- **Sin evaluación ni asistencia** no hay aprobación, y sin aprobación no hay
  certificado.
- **Cobranza va primero** porque es el hueco más caro: es plata que hoy se
  controla en un Excel paralelo, y es lo que convierte el dashboard de
  *facturado* en *cobrado*.

| # | Feature | Por qué ahora | Depende de |
|---|---------|---------------|------------|
| [008](008-cobranza/spec.md) | Cobranza y cuotas | El CRM no sabe quién debe. `enrollment.installments` es un integer suelto y `payment_notes` texto libre. | — |
| [009](009-clases-y-asistencia/spec.md) | Clases y asistencia | No existe la entidad "clase". `teacher.hourly_rate` no tiene horas que multiplicar. | — |
| [010](010-evaluacion-y-certificados/spec.md) | Evaluación y certificados | El alumno entra al roster y nunca termina. El certificado es el producto final de una academia. | 009 |
| [011](011-operativa-menor/spec.md) | Operativa menor | Cuatro huecos chicos de alto retorno: lista de espera, automatizaciones, encuesta y precio de lista. | — (el scheduler habilita el resto) |

## Deuda técnica

Los hallazgos del reviewer sobre código ya shippeado viven en
[../docs/deuda-tecnica.md](../docs/deuda-tecnica.md). No bloquean esta cadena;
se atacan por mérito propio cuando se toca cada archivo.

## Nota sobre 006 y 007

Los ciclos 006 (ficha comercial del curso, categorías, temario estructurado) y
007 (multi-moneda, catálogo público, correo transaccional, importación real)
se implementaron sin carpeta de spec: sus decisiones viven en los comentarios
del código y en los mensajes de commit `d90037b`, `9591ecf`, `4b8e9d2`,
`01a7e28`, `da4f7d6`, `b269e35` y `17e4844`. Los números 006 y 007 quedan
tomados; esta cadena arranca en 008.
