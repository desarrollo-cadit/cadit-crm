# Plan — 020 Identidad visual

Las cuatro DV están resueltas ([spec.md](spec.md)): tema **claro** por defecto,
acento **configurable por la organización** con la maquinaria que ya existe,
**corrección para todos / personalidad para los portales**, y **Geist se queda**
(cambia la escala, no la familia).

## El orden, y por qué

El riesgo de esta fase no es técnico: es **que se note poco y haya tocado
mucho**. Por eso el orden va de lo que más devuelve por línea tocada a lo que
menos.

```
1. Contraste          ← lo que más cambia la sensación, y no toca la marca
2. La derivación      ← abrir resolveAccentSet al tema oscuro
3. Tema oscuro        ← el token set completo + el conmutador
4. Primitivos         ← estados vivos en los 10 de components/ui
5. Personalidad       ← solo en los portales
6. Cierre             ← gate, E2E y docs
```

**El paso 1 va primero a propósito.** Es el único que arregla un defecto
medido (3.33:1) en vez de expresar un gusto, y se puede soltar solo: si la fase
se cortara ahí, la plataforma ya habría mejorado.

**El paso 2 va antes del 3** porque `resolveAccentSet()` está atado al tema
claro: deriva `soft` y `tint` mezclando hacia blanco. Construir el tema oscuro
encima de esa función sin abrirla primero es construir sobre algo que va a dar
el color invertido.

## Cómo se verifica que no se rompió nada

El problema de un cambio visual es que **no falla: se ve mal**. Un test no
puede decidir si algo es lindo, pero sí puede sostener lo que no es opinable:

- **El contraste se calcula, no se mira.** La fórmula WCAG ya está en
  `src/lib/branding.ts` — se reusa para recorrer todas las combinaciones
  declaradas de texto sobre fondo, en los dos temas, y fallar bajo 4.5:1.
- **Ningún color fuera de tokens**, verificado por test estructural sobre los
  `.tsx`. Hoy son 3 archivos; después tienen que ser 0.
- **Acentos extremos**: los 4 presets más un color casi blanco y uno casi
  negro, en los dos temas.
- **La densidad del panel** no baja: se cuenta contra el valor de hoy.

## Riesgos

- **Que el tema oscuro quede a medias.** Una sola pantalla con fondo claro
  dentro del tema oscuro lo arruina entero. Por eso los 3 archivos con color
  hardcodeado se migran ANTES de encender el oscuro, no después.
- **Que la personalidad se filtre al panel.** El paso 5 es el único que puede
  romper FR-006, y por eso va último y acotado a `(portal)`.
- **Que el acento de una organización rompa el contraste en oscuro.** Cubierto
  por el test de acentos extremos; es la razón de que el paso 2 exista.
- **Que se pierda `prefers-reduced-motion`**, que ya está implementado. Si el
  paso 4 agrega transiciones sin respetarlo, es una regresión de
  accesibilidad.

## Lo que esta fase NO hace

La sensación de avance del alumno —progreso, hitos, "te faltan 3 clases"— es
**producto, no pintura**, y va a la [015](../015-portal-alumno/spec.md). Está
en el Out of Scope del spec y conviene repetirlo acá: es lo que más se va a
querer colar en el paso 5.
