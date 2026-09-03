# Tasks — 020 Identidad visual

Orden de [plan.md](plan.md). Cada paso termina con el gate en verde.

**Toda pantalla nueva se crea Y se hace accesible según capacidades** (regla
permanente del dueño). Acá casi no hay pantallas nuevas: la única es el
conmutador de tema, que es de la persona y no lleva capacidad.

---

## Phase 0: Bloqueante

- [x] T001 Resolver las cuatro DV. **RESUELTAS 2026-08-28**: DV-001 (tema claro
      por defecto, oscuro opcional), DV-002 (el acento de la organización, con
      la maquinaria de la 002 que ya es global — un solo color configurable, el
      resto derivado), DV-003 (**corrección para las 24 pantallas, personalidad
      solo en los portales**), DV-004 (**Geist se queda; cambia la escala**).

---

## Phase 1: Contraste — el defecto medido

- [x] T002 [TEST] `tests/unit/contraste.test.ts`, **31 casos**. Los valores se
      **leen de `globals.css`**, no se declaran en el test: un test que repite
      los colores a mano deja de hablar del producto en cuanto alguien toca el
      CSS y se olvida del test. Se exportó `contrastRatio()` desde
      `src/lib/branding.ts` para que haya **una sola** fórmula WCAG — dos
      implementaciones se separan, y el día que se separen el test dice que
      está todo bien mientras la pantalla está mal.
      **Nació en rojo con 12 fallos**, uno no previsto: `--border-strong` daba
      **1.31:1** y es el borde de los campos de formulario.
- [x] T003 Tokens corregidos buscando el valor **más claro** que alcanza el
      umbral contra el peor fondo claro (`--bg-hover`), no eligiendo un gris a
      ojo: la sobriedad de Atlas se conserva, la ilegibilidad no.
      `--text-3` **#8c8c95 → #6e6e75** (3.33 → 4.60:1) y
      `--border-strong` **#e0e1e6 → #939397** (1.31 → 3.06:1).
      **`--text-4` NO se llevó a 4.5**: ahí quedaba indistinguible de
      `--text-3` y la escala de cuatro niveles se colapsaba en tres. Se
      redefinió por su ROL —ícono y decoración, 3:1 de WCAG 1.4.11— y el único
      texto que lo usaba (la hora del mensaje, 10.5px) se migró a `--text-3`.
      Hay un test que falla si `--text-4` vuelve a combinarse con un tamaño de
      fuente: sin eso, la excepción sería una excusa.
- [x] T004 `--success` (3.71 → 4.61:1) y `--warning` (3.13 → 4.58:1).
      **Hallazgo**: no alcanzaba con corregir los tokens porque `ui/badge.tsx`
      —un PRIMITIVO— traía los seis colores escritos a mano. El badge es lo
      que más se repite en la cursada y era lo que menos respondía al tema.
      Migrado a tokens nuevos (`--success-soft`, `--warning-border`, …), con
      test de que no vuelvan los hex.
- [x] T005 Escala: `--text-step-1/2/3` mapeados a `text-lg/xl/2xl` en
      `tailwind.config.ts`. Se agrandan **solo los pasos de titular** (1.125 →
      1.25rem el primero): `xs`, `sm` y `base` quedan intactos porque
      agrandarlos bajaría la densidad del panel (FR-006). El salto entre
      cuerpo y título pasa de 1.28× a 1.43×.
- [x] T006 Gate: typecheck, lint, build, **595 tests en 66 archivos**.
      **Verificado contra el CSS que Next sirve de verdad (21/21)**: los cinco
      tokens llegan al navegador con el valor nuevo y ninguno con el viejo,
      `text-lg` resuelve a la escala, `text-sm` sigue en `0.875rem` (densidad
      intacta), el badge usa `var(--success-soft)` en vez de un hex, y las 4
      pantallas sin sesión siguen respondiendo.
      **Dos falsos negativos fueron míos, no del código**: la primera versión
      del script buscaba los hex viejos como texto suelto, y aparecían (a) en
      los comentarios de `globals.css`, que viajan al CSS servido, y (b) en
      los otros 9 archivos con color hardcodeado, que son T011 de la fase 3.

---

## Phase 2: Abrir la derivación del acento

- [x] T007 [TEST] `tests/unit/acento-tema.test.ts`, **22 casos**. La regla se
      escribió de una manera que vale para los dos temas —*`soft` y `tint` son
      el acento acercándose AL FONDO*— porque decirla como "más claro" fue el
      error original.
      **Nació en rojo.**
- [x] T008 `resolveAccentSet(hex, theme)`. La corrección de fondo está en
      `ensureContrast()`: **aleja el color del fondo** hasta alcanzar el
      umbral. Sobre fondo claro alejarse es oscurecer; sobre fondo oscuro,
      aclarar. La versión vieja decía "oscurecer hasta contrastar con blanco",
      que en oscuro es exactamente lo contrario de lo que hay que hacer.
      `THEME_SURFACES` queda como **única fuente de verdad** del color de
      fondo; la fase 3 agrega el test que falla si `globals.css` se separa.
      **Mejora que no estaba pedida y salió del test**: `accent-text` ahora
      garantiza 4.5:1 **contra `tint`**, que es donde de verdad se apoya. Antes
      no había ninguna garantía — los cuatro presets pasaban por suerte.
- [x] T009 [TEST] Cinco acentos extremos (amarillo casi blanco, azul casi
      negro, blanco puro, negro puro, rojo saturado) × dos temas. Más un test
      de que los presets del handoff **siguen devolviendo los valores exactos**
      en claro: que esta fase no le cambie el color a una organización sin que
      nadie lo haya pedido.
- [x] T010 `accentCssVariables()` emite los dos juegos, `:root` y
      `[data-theme="dark"]`, para poder cambiar de tema sin volver al servidor.
      Gate: typecheck, lint, **617 tests en 67 archivos**.
      **Regresión mía, encontrada por el gate**: al reordenar dejé la
      normalización DESPUÉS de buscar el preset, y un hex inválido pasó a
      devolver una derivación parecida en vez de los valores exactos del
      handoff. El acento por defecto **es** un preset, así que normalizar va
      primero. Lo cazó `branding.test.ts`, que ya existía desde la 002.

---

## Phase 3: Tema oscuro

- [x] T011 **35 ocurrencias migradas en 9 archivos** (no 3: ver la corrección
      en [research.md](research.md)). El mapeo salió de lo que cada color
      SIGNIFICA, no de su valor: `#8a6d3b` → `text-warning`, `#eff7f1` →
      `bg-success-soft`, etc. Tres necesitaron token propio porque no eran
      estado: `--tick-read` (el celeste del doble tilde de WhatsApp, que
      reconoce cualquiera y no es marca), `--voice-client` (la voz del cliente
      en el Laboratorio, que si usara el acento se confundiría con la del
      agente) y `--on-accent` (la perilla del interruptor, que en oscuro deja
      de ser blanca — por eso es token y no `bg-white`).
- [x] T012 [TEST] Estructural, en `tests/unit/tema-oscuro.test.ts`: **0
      colores fuera de tokens** en los `.tsx`, con el archivo y la línea del
      infractor en el mensaje. Lo que impide, dicho sin rodeos: que alguien
      resuelva un color con `bg-[#faf7f0]` porque es más rápido que agregar un
      token.
- [x] T013 Juego completo de tokens oscuros. **No son los mismos colores
      invertidos**: se derivaron con el mismo método que los claros —buscar el
      valor que alcanza el umbral contra el PEOR fondo del tema, acá
      `--bg-hover` (#232328), el más claro de los oscuros—. El chat se ACLARA
      un paso respecto del fondo en vez de oscurecerse: la burbuja tiene que
      despegarse del panel, y en oscuro despegarse es subir.
      **Dos tests sostienen el tema**: que `--bg` coincida con
      `THEME_SURFACES.dark.bg` (contra eso se deriva el acento; si se separan,
      el contraste se calcula contra un fondo que no existe) y que **cada token
      de color claro tenga contraparte oscura** — el que falte se queda con el
      valor claro, y una sola mancha blanca arruina el tema entero.
- [x] T014 Conmutador en `src/components/theme-toggle.tsx`, accesible desde el
      panel y desde el portal. **La preferencia va en una COOKIE, no en
      `localStorage`**: el servidor tiene que saber qué tema pintar antes de
      mandar el HTML, y `localStorage` solo se lee en el navegador — la primera
      pintura saldría en claro y el oscuro llegaría un instante después. Un
      fogonazo blanco en cada carga es exactamente lo que alguien elige el tema
      oscuro para no ver. No lleva capacidad: es una preferencia, no un
      permiso.
- [x] T015 [TEST] El contraste se verifica en los dos temas (20 casos oscuros).
      **Bug encontrado en el test de la fase 1**: recorría el archivo CSS
      entero, así que al aparecer el bloque oscuro sus declaraciones pisaron a
      las claras y pasó a comparar texto de un tema contra fondos del otro.
      Ahora se acota al bloque `:root`.
- [x] T016 Gate: typecheck, lint, build, **637 tests en 68 archivos**.
      **Verificado en vivo (22/22 + 38/38)**: sin cookie el `<html>` sale
      `data-theme="light"` (DV-001); con cookie sale `dark` **en el HTML, antes
      del `<body>`** — o sea sin destello; los dos juegos de acento viajan
      juntos y son distintos (el de esta organización deriva de `#1b3bbb` en
      claro a `#3e59c5` en oscuro); y **las 19 rutas responden en los dos
      temas**, ninguna 500.

---

## Phase 4: Que tocar algo se sienta

- [x] T017 `Button` gana `loading`: deshabilita, gira y marca **`aria-busy`**
      —el giro sin eso solo le sirve a quien puede verlo—. Y deshabilita
      mientras trabaja, porque el doble clic accidental es la forma más común
      de duplicar una acción, y acá hay acciones que no se deshacen.
      Existía porque **casi todas las pantallas ya lo resolvían a mano y cada
      una a su manera**: `{busy ? "Emitiendo…" : "Emitir"}`, un `disabled`
      suelto, un texto que cambiaba. Todas decían lo mismo y ninguna igual.
      Migrados tres botones reales para que no quede como código muerto.
      Además: pulsación en el botón, hover en los campos y en las filas.
- [x] T018 **El hallazgo de la tarea**: `ring` es `--accent` y el fondo de un
      botón primario **también** es `--accent`. Sin hueco, el foco de ese botón
      era el acento dibujado sobre el acento — invisible justo para quien
      navega con teclado, que es quien lo necesita.
      Se resolvió con `ring-offset-2 ring-offset-background` en los cinco
      controles enfocables: el hueco es del color del fondo, así que separa
      siempre y en los dos temas. De paso `ring-1` pasó a `ring-2`: un anillo
      de un píxel pegado al borde del campo es indistinguible del borde.
      La garantía es de punta a punta: `ring-ring` → `var(--accent)` (test
      sobre `tailwind.config.ts`) → y `acento-tema.test.ts` exige que ese
      acento alcance 3:1 contra el fondo de su tema, para cualquier
      organización.
- [x] T019 [TEST] `prefers-reduced-motion` sigue cortando transiciones **y**
      animaciones. Es de las regresiones que nadie nota, porque a quien afecta
      no suele reportarlas.
- [x] T020 Gate: typecheck, lint, build, **655 tests en 69 archivos**
      (19 nuevos en `tests/unit/estados-primitivos.test.ts`).
      **Verificado contra el CSS servido (4/4)**: la clase del hueco se
      compila, toma el color del fondo, la pulsación existe
      (`.active\:translate-y-px:active`) y el bloque de movimiento reducido
      sobrevivió al build.

---

## Phase 5: Personalidad, solo en los portales

- [x] T021 Intensidad "portal" como bloque `[data-surface="portal"]`: radios
      más generosos, hover con el tinte de la marca y aire propio. **Se
      encendió con un atributo, no con clases**, porque lo que cambia son
      TOKENS: el mismo sistema, más presente.
      **Se descartó tintar la superficie.** Se probó poner `--accent-tint`
      como fondo de panel y el peor caso —un acento casi negro— dejaba
      `--text-3` en **4.44:1**, abajo del mínimo. Además una página tintada en
      todos lados se lee lavada, no marcada. La marca se hace presente en los
      ELEMENTOS acentuados (encabezado, pestaña activa, hover, bordes), no en
      el fondo bajo el texto.
- [x] T022 Aplicada a las 4 pantallas del portal: titulares un paso más
      grandes, tarjetas con sombra y borde que reacciona, pestaña activa con
      el color de la marca en vez de un gris.
- [x] T023 [TEST] `tests/unit/portal-intensidad.test.ts`, 7 casos. **La
      barrera**: la intensidad NO puede redefinir `--bg`, `--bg-panel` ni
      ningún token de texto —eso invalidaría las garantías de contraste sin
      que ningún test se entere—, el bloque tiene que seguir siendo chico (un
      sistema con dos intensidades, no dos diseños que se separan en tres
      meses), `--row-py` sigue en 11px y la escala no remapeó `xs`/`sm`/`base`.
      Más un test de que `data-surface="portal"` **solo** aparezca en el layout
      del portal.
- [x] T024 Gate: typecheck, lint, build, **663 tests en 70 archivos**.

      **HALLAZGO GRANDE DE LA FASE, y no estaba previsto: 52 clases que no
      hacían nada.** Tailwind solo sabe aplicar opacidad a los colores de su
      propia paleta; sobre un color `var(--x)` **no emite ninguna regla**. O
      sea que `hover:bg-accent/50`, `bg-secondary/50` (×10),
      `hover:bg-destructive/90` y 49 más eran efectos que nunca ocurrieron —
      incluido **el hover de las filas de tabla**. Todas migradas al token
      sólido que expresaba la intención.

      **Y el guard de T012 tenía un agujero**: solo miraba `bg-gray-*` y
      compañía, así que dejaba pasar **70 usos** de la paleta de Tailwind
      (`text-white` ×16, `bg-black/60` ×11, los ocho colores de cohorte del
      calendario, los avisos en ámbar). Todos se ven bien en claro y son
      manchas en oscuro. Migrados a tokens nuevos: `--overlay`, `--on-state`,
      `--now-line`, `--danger-hover` y los 16 de cohorte. El patrón ahora
      prohíbe la paleta entera.

      `--on-state` merece su renglón: el texto sobre un relleno de estado no
      puede ser `--on-accent`, porque en tema oscuro los estados se ACLARAN
      para contrastar con el fondo y ahí el blanco encima cae a **3.1:1**. Cada
      tema elige el suyo.

---

## Phase 6: Cierre

- [x] T025 `pnpm test:e2e` en **144/144** contra base efímera, con 8 checks
      nuevos: el tema sale del SERVIDOR ya puesto y **antes del `<body>`** (sin
      destello), los dos juegos de acento viajan juntos, las 6 pantallas
      responden en los dos temas y el conmutador está donde se lo encuentra.
      Lo que el arnés NO comprueba es que se vea lindo: eso no se comprueba
      así.
- [x] T026 `CLAUDE.md` con una sección propia —las tres trampas que ya
      costaron caro— y el ROADMAP con la 020 en ✅ y la aclaración de que es el
      CIMIENTO, no el salto estético.

---

## Notas de riesgo

- **El riesgo no es romper: es tocar mucho y que se note poco.** Por eso el
  paso 1 va primero y se puede soltar solo.
- **El tema oscuro a medias es peor que no tenerlo.** T011 antes que T013.
- **La personalidad se va a querer filtrar al panel.** El staff mira la bandeja
  ocho horas por día; ahí lo apagado juega a favor. T023 es la barrera.
- **La sensación de avance NO es de esta fase** — es producto y va a la
  [015](../015-portal-alumno/spec.md). Es lo que más se va a querer colar en el
  paso 5.
