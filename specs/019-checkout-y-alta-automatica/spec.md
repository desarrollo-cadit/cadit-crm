# 019 — Checkout y alta automática

**Estado**: idea a futuro, sin comprometer · **Depende de**: 012, 015

## Qué resolvería

Hoy el camino desde "alguien quiere el curso" hasta "está cursando" es todo
manual: el interesado llena el formulario del sitio, alguien lo contacta,
acuerdan el pago, lo cobran por transferencia o link de Mercado Pago, alguien
lo carga en el CRM, y alguien más le da el acceso.

Con checkout: **compra → inscripción → cuenta → adentro**, sin intervención.

Es el modelo de Coderhouse, y encaja exactamente con la regla que ya está
decidida en [012](../012-identidad-y-permisos/spec.md): el alumno nace de la
inscripción (FR-005b). El checkout no la contradice — la automatiza.

## Lo que ya existe a favor

- **Catálogo público** con cursos y sus próximas cohortes
  (`/api/public/courses`), consumido por el sitio.
- **Captación por curso** (`/api/public/courses/<slug>/submit`) con CORS y
  límite por IP.
- **Cobranza completa** (008): plan de cuotas, pagos, recibos, morosidad.
- **Correo transaccional** (007) para mandar la bienvenida.
- **La regla lead→alumno** (012) que hace que el alta automática sea coherente.

Falta una sola pieza para cerrar el circuito: **cobrar**.

## El choque, dicho antes de empezar

La constitución (principio II) prohíbe en su lista de vetados: *"almacenamiento
de objetos externo (S3/R2), **Stripe u otro billing**, y servicios de Google"*.

Un checkout exige una pasarela. Sería la **tercera enmienda constitucional**:

1. M365 / Microsoft Graph — enmendada en 1.3.0 (correo transaccional)
2. Zoom — propuesta en [018](../018-zoom-automatico/spec.md), sin comprometer
3. Pasarela de pago — esta

Tres enmiendas en pocos meses no invalidan la constitución, pero sí obligan a
preguntarse si la lista cerrada sigue describiendo el producto que se está
construyendo. Vale la pena revisarla entera antes que enmendarla por tercera
vez de a una.

## Decisiones a verificar

- **DV-001**: ¿Qué pasarela? En Uruguay y Paraguay las opciones no son las
  mismas que en Europa o EE.UU. Mercado Pago ya se usa a mano (aparece en las
  observaciones de pago de la importación). ¿Mercado Pago, dLocal, otra?
- **DV-002**: ¿El checkout cobra el total o la primera cuota? Los planes de
  008 admiten cuotas; una pasarela normalmente cobra una vez o suscribe.
- **DV-003**: ¿Qué pasa si el pago se aprueba y la cohorte se llenó? La
  cohorte tiene `capacity` pero hoy nadie la valida al inscribir.
- **DV-004**: ¿Cómo se maneja un reembolso? Toca la inscripción, el plan de
  cuotas, el acceso al portal (DV-007 de 012) y la pasarela.
- **DV-005**: **Facturación fiscal.** Vender online a Uruguay y Paraguay tiene
  obligaciones tributarias distintas. Hoy `invoice_number` se carga a mano
  porque la factura la emite otro sistema. Automatizar el cobro sin resolver
  esto deja un hueco contable, no técnico.
- **DV-006**: ¿Multi-moneda en el checkout? Ya hay UYU y PYG en el sistema
  (007). Cobrar en guaraníes desde una pasarela uruguaya no es trivial.

## Riesgos

| Riesgo | Por qué importa |
|---|---|
| Facturación fiscal | Es el que hunde estos proyectos, y no es un problema de software |
| Cupo de la cohorte | Cobrar y no poder dar el lugar es el peor error posible |
| Tercera enmienda | Conviene revisar la lista cerrada entera, no parchearla otra vez |
| Reembolsos | Tocan cuatro sistemas a la vez (pago, inscripción, cuotas, acceso) |

## Out of Scope

- Suscripciones o membresías recurrentes.
- Cupones y descuentos.
- Carrito con varios cursos.
