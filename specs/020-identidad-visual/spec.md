# 020 — Identidad visual

**Estado**: **IMPLEMENTADA (2026-08-28)** · **Depende de**: 002 ·
**Habilita**: 015, 016, 017

Los cinco criterios de éxito quedaron verificados: **663 tests** y
`pnpm test:e2e` en **144/144**.

| | Criterio | Cómo se verificó |
|---|---|---|
| SC-001 | 0 combinaciones bajo 4.5:1 | `contraste.test.ts` y `tema-oscuro.test.ts` CALCULAN el contraste sobre los valores leídos del CSS |
| SC-002 | Ninguna pantalla rota al cambiar de tema | Cada token de color claro tiene contraparte oscura, por test; las 19 rutas responden en los dos temas |
| SC-003 | Acentos arbitrarios siguen contrastando | 5 acentos extremos × 2 temas |
| SC-004 | 0 colores hardcodeados | Test estructural con archivo y línea; migradas 35 ocurrencias + 70 usos de la paleta de Tailwind |
| SC-005 | La densidad del panel no bajó | `--row-py` y `text-xs/sm/base` intactos, por test |

**Lo que esta fase NO logró, y conviene decirlo acá**: el dueño pidió que la
plataforma fuera *"atractiva, que genere ganas de interactuar"*, y lo que se
entregó es un sistema **correcto**, no uno **lindo**. La 020 sacó los defectos
que hacían imposible cualquier estética —texto ilegible, colores que no
responden al tema, estados que no existían— y dejó todo en tokens para que el
salto visual sea barato. **El salto en sí es otra fase.**

## Por qué esta fase existe

El dueño lo dijo así: *"es muy blanco y a los alumnos eso no les gusta, debe
ser atractivo, que genere ganas de interactuar con la plataforma"*.

Tenía razón, y la documentación estaba equivocada: `CLAUDE.md` afirmaba que el
tema era oscuro. El tema es **blanco** (`--bg: #ffffff`) con un acento
deliberadamente apagado.

Y no fue un descuido. La [002](../002-diseno-atlas-white-label/spec.md) diseñó
para un CRM de WhatsApp que **un equipo interno mira ocho horas por día**: ahí
lo apagado es una virtud, porque lo que tiene que resaltar es el mensaje del
cliente y no la interfaz. Los cuatro presets se llaman "Azul acero", "Grafito",
"Verde apagado" y "Ciruela".

**Lo que cambió es el público.** Un alumno abre la plataforma dos veces por
semana, tres minutos. Para él ese silencio no se lee como sobriedad: se lee
como que no pasa nada. Esta fase no corrige un error de la 002 — atiende a una
audiencia que la 002 no tenía.

**Va ANTES de la [015](../015-portal-alumno/spec.md)**, y el orden no es
negociable: construir el portal del alumno con el aspecto viejo obliga a
rehacerlo entero después. Es la única secuencia que no paga el trabajo dos
veces.

## El hallazgo que ordena la fase

Medido, no opinado (ver [research.md](research.md)):

> **`--text-3` (`#8c8c95`) tiene 3.33:1 de contraste sobre blanco: no alcanza
> el mínimo WCAG AA para texto normal. Y es lo que Tailwind expone como
> `text-muted-foreground`, usado 234 veces en 45 archivos.**

Más de la mitad del texto secundario de la plataforma está por debajo de lo
legible. Eso no es una discusión de gusto: es la causa mecánica de que la
interfaz se vea lavada. **Subir ese contraste da más que cualquier paleta
nueva, y no toca la marca.**

`--text-4` está peor todavía: 2.20:1.

## User Scenarios

### US1 — El alumno entra y le dan ganas de quedarse (Priority: P1)

Un alumno abre la plataforma en el celular. Lo que ve tiene jerarquía clara,
contraste suficiente para leer con una mano en el ómnibus, y una identidad que
se parece a la de la academia. No parece una planilla.

**Por qué P1**: es el motivo entero de la fase.

### US2 — La persona elige claro u oscuro (Priority: P1)

Quien prefiere el modo oscuro lo activa y la plataforma entera lo respeta, sin
parpadeo al cargar y sin que ninguna pantalla quede ilegible.

**Por qué P1**: hoy es imposible — no existe modo oscuro en ningún lado.

### US3 — La academia mantiene su color (Priority: P1)

La organización configura su acento en Configuración → Marca y el tema nuevo
lo respeta, en claro y en oscuro, sin romper contraste.

**Por qué P1**: es white-label desde la 002. Un rediseño que hardcodee un color
rompe una promesa que ya está en producción.

### US4 — El staff no pierde su herramienta de trabajo (Priority: P2)

Quien usa el panel ocho horas por día sigue teniendo una interfaz densa y
tranquila. El salto visual no le agrega ruido a la bandeja de entrada.

**Por qué P2**: es la contracara. Un rediseño que alegra al alumno y le
arruina el día al equipo es un rediseño fallido.

### US5 — Tocar algo se siente (Priority: P2)

Un botón responde al toque, una fila responde al hover, algo que carga se ve
cargando. La pantalla acusa recibo de lo que la persona hace.

**Por qué P2**: es la diferencia entre "funciona" y "está vivo", y es barato
una vez que los primitivos están tocados.

## Requirements

- **FR-001**: Ninguna combinación de texto sobre fondo del sistema PUEDE quedar
  por debajo de **4.5:1** (WCAG AA, texto normal). Los tokens que hoy no
  llegan —`--text-3` y `--text-4`— DEBEN corregirse.
- **FR-002**: El sistema DEBE ofrecer tema **claro y oscuro**, aplicados a las
  24 pantallas, sin parpadeo en la carga inicial (igual que hoy resuelve el
  acento: CSS inyectado en el `<head>` por SSR).
- **FR-003**: El acento por organización DEBE seguir funcionando en los dos
  temas. `resolveAccentSet()` **NO PUEDE** seguir derivando `soft` y `tint`
  mezclando hacia blanco: en tema oscuro eso invierte el resultado.
- **FR-004**: La identidad DEBE vivir en **tokens**, no en pantallas. Cambiar
  el tema NO DEBE requerir tocar los 45 archivos que usan
  `text-muted-foreground`.
- **FR-005**: Los 3 archivos con color hardcodeado DEBEN migrarse a tokens; si
  no, quedan como manchas claras dentro del tema oscuro.
- **FR-006**: La densidad del panel del staff NO DEBE aumentar. Menos filas
  visibles en la bandeja es una regresión, no un rediseño.
- **FR-007**: Los estados interactivos (hover, foco, activo, cargando,
  deshabilitado) DEBEN estar definidos en los 10 primitivos de
  `src/components/ui/`, no improvisados por pantalla.
- **FR-008**: El foco por teclado DEBE ser visible en los dos temas. Hoy `ring`
  usa `--accent`, que con un acento oscuro sobre fondo oscuro desaparece.
- **FR-009**: DEBE respetarse `prefers-reduced-motion`, que ya está
  implementado en `globals.css` y no puede perderse.
- **FR-010**: El portal del profesor DEBE ser la primera superficie migrada: 3
  pantallas, 7 usuarios, ya funcionando. Es el lugar barato para equivocarse.

## Decisiones a verificar

- **DV-001 — RESUELTA (2026-08-28): el tema por defecto es CLARO.** El oscuro
  queda como opción de la persona (US2), no como default.
- **DV-002 — RESUELTA (2026-08-28): se usa el acento que configura la
  organización**, con la maquinaria de white-label que ya existe desde la 002.
  El dueño preguntó si era muy complicado reusarla en el resto de la
  plataforma. **No lo es: ya está hecho y ya es global.**

  `src/app/layout.tsx` —el layout RAÍZ— inyecta `accentCssVariables(branding.accent)`
  en el `<head>` por SSR. Eso alcanza a las 24 pantallas: panel, portal del
  profesor, login y la página pública de verificación de certificado. Se
  configura en `/settings/branding`, detrás de `configuracion.editar`, que de
  los tres roles del sistema **solo tiene Dirección**.

  **Y se mantiene UN solo color configurable, no una paleta editable.** Esa es
  la decisión de ingeniería que hay que sostener: `resolveAccentSet()` recibe
  un hex y **deriva** `hover`, `soft`, `tint` y `text`, forzando ≥ 3:1 contra
  el fondo. Dejar que alguien fije los cinco a mano es exactamente cómo se
  llega a texto blanco sobre amarillo — y el que lo configura no se entera,
  porque en su pantalla se veía bien. Lo que la 020 agrega no es más campos:
  es que esa derivación funcione **también en tema oscuro** (FR-003).

  Los tokens de texto (`--text-3`, `--text-4`) **no son de marca y no se
  configuran**: son del sistema, y su contraste es una garantía, no un gusto.
- **DV-003 — RESUELTA (2026-08-28), delegada por el dueño: sí al panel, pero
  solo en lo que es CORRECCIÓN; la personalidad va a los portales.**

  La distinción que ordena la fase: hay dos cosas mezcladas bajo "rediseño".

  - **Corrección** — contraste, foco visible por teclado, estados de carga,
    tema oscuro. Eso es **defecto**, no gusto. `--text-3` en 3.33:1 lo sufre
    **más que nadie el staff**, que lo lee ocho horas por día contra los tres
    minutos del alumno. Dejarlos afuera de un arreglo de legibilidad sería
    absurdo: son los que más entrecierran los ojos. **Va a las 24 pantallas.**
  - **Personalidad** — presencia del acento, generosidad del espaciado, escala
    tipográfica más marcada, superficies con más carácter. Eso es para quien
    entra poco y hay que engancharlo. **Va a los portales**, no a la bandeja
    de entrada.

  Un solo sistema de tokens, **dos intensidades**. No dos diseños: eso sería
  mantener dos sistemas y que se separen en tres meses.

  Lo sostiene FR-006, que ya estaba escrito: la densidad del panel no aumenta.
  Un rediseño que alegra al alumno y le arruina el día al equipo es un
  rediseño fallido.

- **DV-004 — RESUELTA (2026-08-28), delegada por el dueño: la tipografía NO se
  cambia. Se cambia la ESCALA.**

  Geist se queda, por tres motivos:

  1. `next/font` la descarga **en build y la sirve self-hosted**, sin CDN. Eso
     es principio II de la constitución, y cambiarla obliga a re-verificarlo.
  2. **No es la causa.** La interfaz no se siente muerta por la familia
     tipográfica: se siente muerta por un secundario en 3.33:1. Cambiar la
     fuente sin arreglar el contraste sería mover los muebles con la luz
     apagada.
  3. Es lo más caro de revisar —toca las 24 pantallas, todos los interlineados
     y todos los anchos— y lo que menos devuelve por unidad de riesgo.

  Lo que SÍ cambia es la **escala**: hoy hay muy poca distancia entre un título
  y un texto secundario, y eso aplana la jerarquía. Es un cambio de tokens, no
  de fuente.

## Success Criteria

- **SC-001**: **0 combinaciones** de texto sobre fondo por debajo de 4.5:1, en
  los dos temas, verificado por un test que calcula el contraste — no por
  inspección visual.
- **SC-002**: Cambiar de tema no deja **ninguna** de las 24 pantallas con texto
  ilegible o fondo equivocado.
- **SC-003**: Un acento arbitrario de organización sigue dando contraste
  suficiente en los dos temas, verificado con los 4 presets más un color
  extremo (uno muy claro y uno muy oscuro).
- **SC-004**: **0 colores hardcodeados** fuera de los tokens, verificado por
  test estructural.
- **SC-005**: La bandeja de entrada muestra al menos tantas conversaciones sin
  scroll como antes del cambio.

## Out of Scope

- **La sensación de avance del alumno** (barras de progreso, "te faltan 3
  clases", hitos). Eso es **producto, no pintura**, y va en la
  [015](../015-portal-alumno/spec.md) — que hoy es de solo lectura y lista
  datos. Listar no es avanzar. Se registra allá, no acá.
- Ilustraciones, animaciones de celebración y micro-interacciones decorativas.
- Rediseñar la estructura de navegación o mover funciones de lugar.
- El correo transaccional (`docs/email-templates`), que tiene sus propias
  reglas de compatibilidad.
