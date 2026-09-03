# Research — 020 Identidad visual

Todo lo de acá está **medido contra el código de hoy** (2026-08-28), no
estimado. Es lo que define qué es barato y qué es caro en esta fase.

---

## 1. El tema es claro por diseño, y la documentación decía lo contrario

`CLAUDE.md` afirmaba *"Tailwind CSS (tema oscuro propio, acento `#25D366`)"*.
Es falso desde el rediseño Atlas de la [002](../002-diseno-atlas-white-label/spec.md).
Lo real, en `src/app/globals.css`:

```css
--bg: #ffffff;        --bg-panel: #f8f8f9;
--accent: #3f5972;    /* azul acero apagado */
```

**No existe modo oscuro**: ni una clase `.dark`, ni un bloque
`prefers-color-scheme`, ni un selector `[data-theme]`. Corregido en el cierre
de la 014.

## 2. La sobriedad NO fue un descuido: fue una decisión de la 002

Los cuatro presets de marca se llaman, literalmente, **"Azul acero"**,
**"Grafito"**, **"Verde apagado"** y **"Ciruela"**. El comentario de
`src/lib/branding.ts` dice *"Presets sobrios del sistema Atlas"*.

Eso importa para no rehacer el trabajo por el motivo equivocado. La 002 diseñó
para un CRM de WhatsApp que **un equipo interno mira ocho horas por día**: ahí
lo apagado es una virtud, porque lo que tiene que resaltar es el mensaje del
cliente, no la interfaz.

El público cambió. Un alumno abre la plataforma **dos veces por semana, tres
minutos**. Para él, ese mismo silencio no se lee como sobriedad: se lee como
que no pasa nada. **La 020 no corrige un error de la 002; atiende a otra
audiencia que la 002 no tenía.**

## 3. Los tokens SÍ están centralizados (esto es lo que abarata la fase)

`tailwind.config.ts` mapea todo a variables CSS:

```ts
background: "var(--bg)",  foreground: "var(--text)",
border: "var(--border)",  primary: { DEFAULT: "var(--accent)" }, …
```

**Consecuencia**: cambiar la identidad visual es cambiar tokens y los 10
primitivos de `src/components/ui/`, no reescribir 24 pantallas. Sin esto la
fase no cerraría.

### Corrección (2026-08-28): son 10 archivos, no 3

La primera medición buscó `bg-white|text-black|bg-gray-|bg-slate-|bg-zinc-` y
se perdió lo que de verdad abunda: los **hex arbitrarios de Tailwind**,
`bg-[#faf7f0]` y compañía. Con el patrón correcto:

| Archivo | Ocurrencias |
|---|---|
| `settings/whatsapp-wizard.tsx` | 7 |
| `inbox/contact-panel.tsx` | 7 |
| `lab/lab-client.tsx` | 4 |
| **`ui/badge.tsx`** | 3 |
| `settings/team-client.tsx` | 3 |
| `pipeline/stage-manager.tsx` | 2 |
| `inbox/conversation-list.tsx` | 2 |
| `agent/agent-client.tsx` | 2 |
| `inbox/message-thread.tsx` | 1 |
| `inbox/composer.tsx` | 1 |

**El que más importa es `ui/badge.tsx`**, porque es un primitivo: sus variantes
`success`, `warning` y `destructive` traen los seis colores escritos a mano
(`text-[#8a6d3b]`, `bg-[#faf7f0]`…) en vez de usar los tokens. Un badge es lo
que más se repite en las pantallas de cursada, y hoy **no responde al tema**.

Esto no cambia la conclusión —siguen siendo 10 archivos y no 85— pero sí el
tamaño de T011.

### Los tokens de estado casi no se usan

`--success` aparece 8 veces (`text-success` ×7, `bg-success` ×1) y
`--warning` **ninguna**: el badge, que sería su lugar natural, tiene los
colores hardcodeados. Corregir el token sin migrar el badge no cambiaría nada
en pantalla.

## 4. HALLAZGO — el color secundario más usado NO pasa contraste

Contraste real contra el fondo blanco, calculado con la fórmula WCAG que el
propio repo ya implementa en `src/lib/branding.ts`:

| Token | Hex | Contraste | Veredicto |
|---|---|---|---|
| `--text` | `#1a1a1e` | 17.35:1 | ✅ |
| `--text-2` | `#56565e` | 7.27:1 | ✅ |
| **`--text-3`** | **`#8c8c95`** | **3.33:1** | ❌ **no pasa AA para texto normal** |
| **`--text-4`** | **`#aeaeb6`** | **2.20:1** | ❌ no pasa nada |
| `--accent` | `#3f5972` | 7.28:1 | ✅ |
| `--success` | `#5f8f74` | 3.71:1 | ⚠️ solo texto grande |
| `--warning` | `#b08b5e` | 3.13:1 | ⚠️ solo texto grande |
| `--danger` | `#a2504c` | 5.54:1 | ✅ |

`--text-3` es lo que Tailwind expone como **`text-muted-foreground`**, y se usa
**234 veces en 45 archivos** — más `text-text-3` directo, 43 veces más.

O sea: **el color de más de la mitad del texto secundario de la plataforma no
alcanza el mínimo legible.** Eso no es una opinión estética. Es lo que hace que
la interfaz se sienta lavada, y es lo primero que hay que arreglar: si sube el
contraste del texto secundario, la pantalla gana peso sin cambiar un solo color
de marca.

## 5. El acento es configurable por organización: nada se puede hardcodear

`resolveAccentSet()` deriva `hover`/`soft`/`tint`/`text` de cualquier hex, y ya
fuerza ≥ 3:1 contra blanco. El CSS se inyecta por SSR (`accentCssVariables`),
así que no hay parpadeo.

**Restricción dura para el diseño**: cualquier propuesta tiene que verse bien
con un acento arbitrario, no solo con el azul de CAD IT.

**Y un bug latente para el modo oscuro**: `soft` y `tint` se derivan mezclando
hacia **blanco** (`mix(base, WHITE, 0.82)` y `0.94`). En un tema oscuro eso es
exactamente al revés — habría que mezclar hacia el fondo. `resolveAccentSet`
está atado al tema claro y hay que abrirlo antes de tocar nada más.

## 6. La superficie a cubrir

- **24 pantallas**: 18 del panel, 3 del portal del profesor, 2 de auth, 1
  pública de verificación de certificado.
- **10 primitivos** en `src/components/ui/`: badge, button, card, checkbox,
  input, label, select, skeleton, table, textarea.
- El portal del profesor (3 pantallas, 7 usuarios) es el mejor lugar para
  estrenar el tema: ya funciona y el público es chico. Si el salto no convence
  ahí, no se lleva a 340 alumnos.

## Decisiones a verificar con el dueño

- **DV-001** — ¿Modo oscuro por defecto, claro por defecto, o que elija la
  persona? Es la decisión que más condiciona todo lo demás.
- **DV-002** — El acento de CAD IT hoy es el azul acero por defecto. ¿Hay un
  color de marca real que haya que respetar?
- **DV-003** — ¿El panel del staff cambia también, o solo lo que ven alumnos y
  profesores? El staff mira esto ocho horas por día y la sobriedad ahí es una
  virtud, no un problema.
