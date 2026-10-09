---
name: CadIT
description: Sistema de diseño Atlas del panel de gestión académica de CadIT
colors:
  accent-steel: "#3f5972"
  accent-steel-hover: "#334a60"
  accent-steel-soft: "#dde5ee"
  accent-steel-tint: "#f3f6f9"
  accent-steel-text: "#2b4056"
  sheet-white: "#ffffff"
  sheet-subtle: "#fbfbfc"
  sheet-panel: "#f8f8f9"
  sheet-hover: "#f4f4f5"
  ink: "#1a1a1e"
  ink-2: "#56565e"
  ink-3: "#6e6e75"
  ink-4: "#8d8d93"
  rule-light: "#ecedf0"
  rule-strong: "#939397"
  success-sage: "#4f7761"
  warning-ochre: "#866a48"
  danger-brick: "#a2504c"
  success-soft: "#eff7f1"
  warning-soft: "#faf7f0"
  danger-soft: "#faf1f0"
  night-bg: "#141417"
  night-panel: "#1c1c20"
  night-hover: "#232328"
  night-ink: "#e8e8ec"
  night-ink-2: "#a8a8b0"
  night-ink-3: "#8a8a93"
  night-rule: "#2a2a30"
typography:
  headline:
    fontFamily: "Geist, Hanken Grotesk, -apple-system, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: "2.25rem"
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Geist, Hanken Grotesk, -apple-system, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: "1.75rem"
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Geist, Hanken Grotesk, -apple-system, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.25rem"
    letterSpacing: "-0.01em"
    fontFeature: "tnum"
  label:
    fontFamily: "Geist, Hanken Grotesk, -apple-system, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: "1rem"
  section-label:
    fontFamily: "Geist, Hanken Grotesk, -apple-system, sans-serif"
    fontSize: "10.5px"
    fontWeight: 600
    letterSpacing: "0.025em"
rounded:
  sm: "7px"
  md: "10px"
  lg: "14px"
  full: "9999px"
spacing:
  row: "11px"
  card: "20px"
components:
  button-primary:
    backgroundColor: "{colors.accent-steel}"
    textColor: "{colors.sheet-white}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "{colors.accent-steel-hover}"
  button-secondary:
    backgroundColor: "{colors.sheet-panel}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.md}"
    height: "36px"
  button-outline:
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "36px"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "4px 12px"
    height: "36px"
  card:
    backgroundColor: "{colors.sheet-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "{spacing.card}"
  badge-success:
    backgroundColor: "{colors.success-soft}"
    textColor: "{colors.success-sage}"
    rounded: "{rounded.full}"
    padding: "2px 10px"
  badge-warning:
    backgroundColor: "{colors.warning-soft}"
    textColor: "{colors.warning-ochre}"
    rounded: "{rounded.full}"
    padding: "2px 10px"
  badge-danger:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger-brick}"
    rounded: "{rounded.full}"
    padding: "2px 10px"
  nav-item-active:
    backgroundColor: "{colors.accent-steel-tint}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
---

# Design System: CadIT

## Overview

**Creative North Star: "La mesa de dibujo técnico"**

Atlas es la mesa de un dibujante de CAD. La hoja es blanca, las líneas finas
son grises y fríos, y un único acento acero marca la cota que importa. Todo lo
demás se retira. La precisión es la estética: cada gris se calculó para llegar
exactamente al umbral de contraste contra el peor fondo, no se eligió a ojo. El
sistema existe para el staff que opera la academia ocho horas por día. Ahí lo
apagado es una virtud, porque nada compite con el dato.

La densidad es alta y deliberada. El cuerpo de texto se queda en 14 px, las
filas llevan 11 px de aire y solo los pasos de titular crecieron. El tema claro
y el oscuro son dos derivaciones del mismo método y no una inversión de colores.
El acento es white-label: cada organización lo reemplaza y el sistema lo aleja
del fondo hasta que alcanza el contraste.

**Alcance.** Atlas es el sistema del panel del staff, de la pantalla de acceso y
del portal del profesor. El **portal del alumno** usa el mundo **"campus"**
(decisión del dueño, 2026-09-29), que se activa con `data-world="campus"` solo
en las rutas del alumno (`PortalWorld`). Cada sección de abajo tiene una
subsección "Campus" con lo que cambia; lo que no se menciona se hereda de Atlas.

**Campus, en una frase:** un portal de estudio moderno, con Coderhouse como
referencia: fondo gris claro, tarjetas blancas redondeadas con sombra suave,
títulos en negrita, el acento de la organización como único color de acción y
todo el ancho de la pantalla, con migas de pan en cada pantalla. El dueño
descartó un mundo temático anterior (láminas de plano) por verse como un
ticket: el alumno tiene que sentir una plataforma actual.

**La barra lateral** es la misma en toda la app (panel, profesor y alumno) y
en los dos temas: el navy de la marca CadIT (el del "IT" del logo), con texto
e íconos en blanco.

**Key Characteristics:**
- Neutros fríos calculados al umbral WCAG y un solo acento acero configurable.
- Densidad de herramienta: cuerpo de 14 px y titulares escalonados a 20, 24 y 30 px.
- Dos temas completos y simétricos, con la preferencia guardada en una cookie.
- La grilla de plano (28/140 px) como única textura de marca.
- Una variante `portal` que sube los radios y la presencia de marca sin tocar las superficies de texto.

## Colors

Una hoja blanca fría, tinta casi negra y un acento acero apagado que aparece
solo donde hay algo para hacer o algo seleccionado.

### Primary
- **Acero de cota** (accent-steel): el relleno del botón primario, el ícono del ítem de navegación activo, el foco de teclado y el caret. Es el default: el white-label lo reemplaza en tiempo de ejecución por el color de la organización, ajustado por `resolveAccentSet()`.
- **Acero profundo** (accent-steel-hover): el hover del botón primario.
- **Acero velado** (accent-steel-soft): la selección de texto y el avatar del usuario.
- **Tinte de calco** (accent-steel-tint): el fondo del ítem activo y, en el portal, de todo hover.
- **Acero para texto** (accent-steel-text): el texto sobre las superficies de acento suaves.

### Neutral
- **Hoja** (sheet-white): el fondo de página y de tarjeta.
- **Hoja sutil / de panel / de hover** (sheet-subtle, sheet-panel, sheet-hover): tres pasos de gris frío para la barra lateral, los bloques secundarios y las filas bajo el puntero.
- **Tinta, 4 niveles** (ink a ink-4): el texto principal, el secundario, el apagado (4.6:1 contra el peor fondo) y el de íconos o decoración (3:1, nunca texto).
- **Línea fina** (rule-light): separa bloques que ya se distinguen por su fondo.
- **Línea de campo** (rule-strong): el borde que dice dónde se escribe (3:1).
- **Noche** (night-*): las mismas funciones en el tema oscuro, derivadas contra `night-hover`.

### Estado
- **Salvia, ocre y ladrillo** (success-sage, warning-ochre, danger-brick): los estados en versión apagada y legible como texto chico. Cada uno tiene su fondo suave y su borde.
- **Paleta de cohortes** (8 pares fondo/texto en `globals.css`): es categórica, no semántica. Sirve para distinguir cohortes vecinas en el calendario.

### Campus (portal del alumno)
- **Fondo de página** (`--bg-page` #f4f5f8 claro, #0e0e11 oscuro): el gris sobre el que apoyan las tarjetas. Las tarjetas siguen en `--bg`.
- El mundo **no redefine** texto, `--bg` ni el acento: valen las garantías de Atlas y la derivación del acento white-label. `tests/unit/mundo-campus.test.ts` exige que el texto se lea también sobre `--bg-page`.
- **Barra lateral** (`--barra-fondo` #001b5e, `--barra-tinta` #ffffff, en los dos temas): la barra redefine sus propios tokens, así que todo lo de adentro queda en blanco sin tocar un `.tsx`. Hover y activo aclaran el navy con un velo blanco; el test verifica el contraste en los dos casos.

**The One-Action-Color Rule.** El azul vivo del acento es para lo que se hace (el botón "Ingresar a la clase", el progreso, los enlaces). La navegación es navy; el resto, neutros.

### Named Rules
**The Colors-Live-In-Tokens Rule.** Ningún `.tsx` escribe un color, ni siquiera `bg-white`. `tests/unit/tema-oscuro.test.ts` falla con el archivo y la línea del infractor.

**The No-Opacity-On-Var Rule.** `bg-token/50` no emite ninguna regla. Si hace falta una variante más suave, se agrega un token o una clase con `color-mix`.

**The Computed-Contrast Rule.** El contraste se calcula con `contrastRatio()` y lo verifica `contraste.test.ts`: 4.5:1 para texto y 3:1 para íconos y bordes de control, en los dos temas.

## Typography

**Display Font:** no hay.
**Body Font:** Geist (con Hanken Grotesk y la fuente del sistema como respaldo), self-hosted mediante `next/font`.

**Character:** una sola grotesca técnica y neutra en todos los roles. La jerarquía sale del tamaño y el peso, nunca de un cambio de familia. Tracking de -0.01em en todo el cuerpo y números tabulares globales para que las cifras de una tabla no bailen.

### Hierarchy
- **Headline** (600, 30px, 36px): el título de página.
- **Title** (600, 20–24px): el título de sección y de tarjeta.
- **Body** (400, 14px, 20px): todo el contenido operativo. No crece, para no bajar la densidad.
- **Label** (500, 12px): los badges, los botones chicos y los metadatos.
- **Section label** (600, 10.5px, mayúsculas, tracking 0.025em): el encabezado de grupo en la barra lateral.

### Named Rules
**The Headline-Steps-Only Rule.** Solo se remapean `text-lg`, `text-xl` y `text-2xl`. `xs`, `sm` y `base` se quedan en el default de Tailwind porque el panel se mira ocho horas por día.

### Campus (portal del alumno)
Misma Geist, con más peso: los títulos van en **bold** y la jerarquía es de plataforma, no de panel.
- **Hora de la próxima clase:** 36–48px bold, lo más grande de la pantalla.
- **h1 de pantalla:** 24–30px bold (`EncabezadoDePagina`), siempre debajo de las migas.
- **Título de sección:** 18px semibold (`TituloDeSeccion`).
- **Lectura (métrica):** 24px bold con etiqueta de 12px arriba y nota de 12px abajo.

## Layout

La misma forma para el panel y el portal: una barra lateral fija de 240 px en
`md+` y un cajón de 256 px (máximo 85vw) con encabezado pegajoso en celular. En
escritorio el contenido scrollea por dentro y en celular por fuera. El contenido
del portal se centra en un máximo de 1024 px con 16/32 px de margen lateral. En
el portal, las áreas táctiles son de 44 px.

## Elevation & Depth

Casi plano. La profundidad se resuelve con los pasos tonales de la hoja (blanco,
sutil, panel, hover) y con líneas finas. Las sombras son mínimas y ambientales.
En el tema oscuro se profundizan porque sobre negro casi no se ven.

### Shadow Vocabulary
- **Apoyo** (`0 1px 2px rgba(20,20,30,.05)`): las tarjetas y los campos en reposo.
- **Flotante** (`0 6px 20px -6px rgba(20,20,35,.12)`): los menús y los paneles elevados.
- **Emergente** (`0 12px 32px -8px rgba(20,20,35,.22)`): los diálogos y el cajón móvil.

## Shapes

Esquinas suavemente redondeadas: 7, 10 y 14 px. La variante portal las sube a
10, 14 y 20 px para que la misma información se lea menos administrativa. Los
badges y los avatares son de radio completo. La única geometría de marca es la
grilla de plano de la pantalla de acceso: una retícula fina cada 28 px y una
gruesa cada 140 px, derivadas del acento con `color-mix`.

## Components

### Buttons
- **Shape:** esquinas suaves (10px), altura de 36 px (32 px en `sm`, 40 px en `lg`).
- **Primary:** relleno acero y texto blanco, peso 500 y 14px.
- **Hover / Focus:** el hover oscurece un paso. El foco es un anillo de acento de 2 px con 2 px de separación del color del fondo, para que el anillo no se pierda sobre el propio acento. Al presionar, baja 1 px.
- **Secondary / Outline / Ghost:** relleno de panel, borde de campo o nada, con hover al gris de hover.
- **Loading:** `loading` deshabilita, muestra el giro y marca `aria-busy`. Ninguna pantalla improvisa su propio "cargando".

### Chips (badges)
- **Style:** píldora con fondo suave, borde y texto del estado (success, warning o destructive), o acero sólido para el default.
- **Grabaciones de Zoom (030):** reusan los chips existentes, sin tokens nuevos. Adjudicación: *Asignada* = success, *Ambigua* = warning, *En conflicto* = destructive, *Sin clase* / *Pendiente* = secondary; el modo (*Automática* / *Manual*) y *Transcripción* van en `outline`; *Ya no está en Zoom* en destructive. En la lista de clases de una cohorte, el origen de la grabación es un chip junto al enlace: *Zoom* en success, *manual* en secondary. `/grabaciones` es una tabla de densidad de staff (encabezado fijo, scroll horizontal solo dentro del contenedor) y el estado de la sincronización es texto `text-xs` en `muted-foreground`, con el error en `destructive`.
- **Reproductor de grabación de Zoom (030, portales):** en la lista de clases del alumno y del profesor, una grabación de Zoom (`/rec/share/` o `/rec/play/`) se abre con el botón *Ver grabación* / *Ocultar grabación* (`aria-expanded`) y se ve debajo de la fila, a todo el ancho: 16:9, `rounded-lg`, borde `border`, fondo `secondary` mientras carga, `shadow-sm` (el mundo campus sube el radio por tokens). Debajo, siempre, *¿No se ve? Abrir en Zoom* en `text-xs` con el enlace en `brand-text`. Un enlace que no es de Zoom sigue siendo el botón-enlace *Grabación*. El panel del staff no embebe.

### Cards / Containers
- **Corner Style:** 14px (20px en el portal).
- **Background:** hoja blanca con una línea fina y la sombra de apoyo.
- **Internal Padding:** 20px.

### Inputs / Fields
- **Style:** fondo transparente, borde de campo (3:1), 10px de radio y 36px de alto. En hover el borde pasa a `ink-3`.
- **Focus:** el mismo anillo con separación que los botones.

### Navigation
- **Style:** barra lateral en hoja sutil. Grupos con etiqueta de sección en versalitas de 10.5px. Ítems de 14px con ícono de 18px en `ink-3`. El ítem activo lleva el tinte de calco y el ícono en acero.
- **Mobile:** encabezado pegajoso con disparador de 44px y cajón con el velo `--overlay`.

### Avisos: toast = evento, inline = estado
**Toast = el resultado de algo que la persona acaba de hacer** (guardar, crear, borrar, asignar, copiar, sincronizar, enviar, invitar), el fallo de esa acción y un aviso pasajero ("No hay aulas vinculadas a Zoom", con enlace a Configuración › Zoom). **Inline = lo que no puede desaparecer:** el error de un campo junto al campo (y la validación local de un formulario, incluido el error del login), un secreto que se muestra una sola vez (la contraseña temporal del portal o del equipo: el toast puede anunciar que el correo falló, la contraseña queda en pantalla), un informe para leer (lo que quedó sin generar, el resultado de un cuestionario) y el ESTADO de la pantalla (vacía, error de carga que dura hasta recargar, "Sincronización automática apagada", una sincronización en curso).

- **Una sola puerta:** `notify.success|error|warning|info` de `src/lib/notify.ts`. Nadie importa `sonner` directo; `tests/unit/notify.test.ts` lo exige.
- **Duraciones:** éxito e info 4s, advertencia 6s, error 8s; advertencias y errores llevan botón de cierre, y `persist: true` deja un error hasta que lo cierren. Pasar el mismo `id` reemplaza el aviso en vez de apilar otro igual.
- **Piel:** `<AppToaster>` (`src/components/ui/toaster.tsx`) monta sonner sin estilos propios y lo viste con tokens (`--bg`, `--border`, texto e íconos de estado), así que sigue al tema por el mismo `data-theme` del `<html>`. Va montado dentro de cada caparazón (panel, portal y acceso) para heredar los radios de `data-surface="portal"`. Abajo a la derecha en escritorio, abajo al centro en el celular.

### Grilla de plano (signature)
El panel de marca de la pantalla de acceso lleva una retícula técnica sobre el
acento y un velo del propio acento que calma la banda central donde va el
texto. Es la única ilustración del sistema y dice "academia de CAD" antes de
que nadie lea una palabra.

### Campus: las piezas del mundo (`src/components/portal/campus.tsx`)
- **Tarjeta:** blanca, 16px de radio, borde fino y sombra suave; 20–24px de padding.
- **EncabezadoDePagina:** migas de pan, h1 y una línea que dice para qué sirve la pantalla, con lugar para un chip o una acción a la derecha. Va en TODAS las pantallas del alumno.
- **ChipDeEstado:** redondeado, con fondo suave del estado. "Sin registro" es el único chip de borde punteado.
- **Métrica / GrillaDeMetricas:** etiqueta, valor y nota; la nota lleva la condición que da sentido al número ("mín. 75%").
- **ProgresoDeClases:** una fila de segmentos redondeados, uno por clase. Lleno en acento = dictada o presente, rojo = ausente, ocre = justificada, punteado = sin registro, gris = por dictar; la clase que sigue lleva un anillo del acento y `minPct` marca el mínimo. Los segmentos presentes aparecen escalonados al cargar (500ms), apagado con movimiento reducido.
- **Próxima clase:** tarjeta a todo el ancho con un tinte del acento: fecha y hora grandes a la izquierda, la clase al centro y "Ingresar a la clase" a la derecha.

## Do's and Don'ts

### Do:
- **Do** preguntar por un token semántico (`text-muted-foreground`, `bg-brand-soft`) antes que por un valor.
- **Do** apoyar el logo sobre el plato blanco (`--brand-plate`) en los dos temas. Los archivos de marca están dibujados para fondo claro.
- **Do** declarar cada token nuevo en `:root` y en `:root[data-theme="dark"]`.
- **Do** mostrar "sin datos" cuando falta el dato. Nunca un 0 % ni un "aprobado" por omisión.
- **Do** anunciar el resultado de una acción con `notify`, y dejar inline los errores de campo, los secretos de una sola vez y el estado de la pantalla.

### Don't:
- **Don't** escribir un color en un `.tsx`: ni hex, ni `bg-white`, ni `bg-amber-500`.
- **Don't** usar el modificador de opacidad de Tailwind sobre un token `var()`.
- **Don't** redefinir `--bg`, `--bg-panel` ni los tokens de texto dentro de `[data-surface="portal"]`.
- **Don't** agrandar el cuerpo de texto del panel del staff.
- **Don't** nombrar una clase vieja en un comentario: Tailwind escanea los comentarios y genera la regla muerta.
- **Don't** encender `data-world="campus"` fuera de `PortalWorld`, ni en las rutas del profesor (`/portal/cohortes`, `/portal/dictado`, `/portal/horas`).
- **Don't** dibujar como presente un segmento sin lista tomada, ni escribir "cursaste" cuando solo se sabe que la clase se dictó.
- **Don't** volver a mundos temáticos (láminas, sellos girados, letra técnica) en el portal del alumno: el dueño los descartó.
- **Don't** usar un borde de color de más de 1px al costado de una tarjeta para destacarla: se destaca con tinte o con anillo.
