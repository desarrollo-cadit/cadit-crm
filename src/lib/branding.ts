/**
 * White-label: nombre del CRM + acento por organización.
 * Presets sobrios del sistema Atlas; para un color personalizado se derivan
 * hover/soft/tint/text y se garantiza contraste con texto blanco.
 */

export type AccentSet = {
  accent: string;
  hover: string;
  soft: string;
  tint: string;
  text: string;
};

export type Branding = {
  name: string;
  accent: string; // hex del acento base elegido
};

export const DEFAULT_BRANDING: Branding = { name: "CadIT", accent: "#3f5972" };

/** Presets del handoff (valores exactos). */
export const ACCENT_PRESETS: Record<string, { label: string; set: AccentSet }> = {
  "#3f5972": {
    label: "Azul acero",
    set: { accent: "#3f5972", hover: "#334a60", soft: "#dde5ee", tint: "#f3f6f9", text: "#2b4056" },
  },
  "#4b5563": {
    label: "Grafito",
    set: { accent: "#4b5563", hover: "#3b4350", soft: "#e2e5ea", tint: "#f4f5f7", text: "#333a45" },
  },
  "#3f6b66": {
    label: "Verde apagado",
    set: { accent: "#3f6b66", hover: "#335752", soft: "#dcebe8", tint: "#f2f8f6", text: "#2b4a46" },
  },
  "#5f5470": {
    label: "Ciruela",
    set: { accent: "#5f5470", hover: "#4d4459", soft: "#e6e1ec", tint: "#f6f4f8", text: "#443c52" },
  },
};

type Rgb = { r: number; g: number; b: number };

export function isValidHex(hex: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(hex);
}

function hexToRgb(hex: string): Rgb {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

function rgbToHex({ r, g, b }: Rgb): string {
  const c = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Mezcla `color` hacia `target` en proporción t (0..1). */
function mix(color: Rgb, target: Rgb, t: number): Rgb {
  return {
    r: color.r + (target.r - color.r) * t,
    g: color.g + (target.g - color.g) * t,
    b: color.b + (target.b - color.b) * t,
  };
}

const WHITE: Rgb = { r: 255, g: 255, b: 255 };
const BLACK: Rgb = { r: 0, g: 0, b: 0 };

/** Luminancia relativa (WCAG). */
function luminance({ r, g, b }: Rgb): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/**
 * 020 (T002) — Contraste WCAG entre dos colores, de 1 a 21.
 *
 * Se exporta para que el test de contraste use **esta** fórmula y no una copia:
 * dos implementaciones de lo mismo se separan, y el día que se separen el test
 * va a decir que todo está bien mientras la pantalla está mal.
 *
 * El umbral no es uno solo: **4.5:1** para texto normal, **3:1** para texto
 * grande y para elementos no textuales (íconos, bordes de foco).
 */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(hexToRgb(a));
  const lb = luminance(hexToRgb(b));
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/* ============================================================
 * 020 (T008, FR-003) — La derivación, abierta al tema
 * ============================================================ */

export type ThemeName = "light" | "dark";

/**
 * El fondo de cada tema. **Es la única fuente de verdad del color de fondo**:
 * `globals.css` declara el mismo valor y `tests/unit/tema-oscuro.test.ts`
 * falla si se separan. Dos definiciones del mismo color se separan siempre, y
 * cuando se separan la derivación calcula contra un fondo que ya no existe.
 */
export const THEME_SURFACES: Record<ThemeName, { bg: string }> = {
  light: { bg: "#ffffff" },
  dark: { bg: "#141417" },
};

/**
 * Aleja `color` del fondo hasta alcanzar el contraste pedido.
 *
 * Dicho así vale para los dos temas, y esa es la corrección de fondo de esta
 * fase: la versión vieja decía "oscurecer hasta contrastar con blanco", que en
 * tema oscuro es exactamente lo contrario de lo que hay que hacer. Sobre fondo
 * claro, alejarse es oscurecer; sobre fondo oscuro, aclarar.
 */
function ensureContrast(color: Rgb, bg: Rgb, target: number): Rgb {
  const away = luminance(bg) > 0.5 ? BLACK : WHITE;
  let c = color;
  // Tope de vueltas: sin él, un objetivo imposible cuelga el render.
  for (let i = 0; i < 60 && contrast(c, bg) < target; i++) {
    c = mix(c, away, 0.08);
  }
  return c;
}

function contrast(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Set completo para cualquier acento y tema.
 *
 * En **claro** los presets del handoff de la 002 se devuelven tal cual: son
 * valores que alguien eligió a mano, y que esta fase no se los pise es lo que
 * evita cambiarle el color a una organización sin que nadie lo pidiera.
 *
 * En **oscuro** no hay presets —el handoff no tenía tema oscuro— así que todo
 * se deriva.
 */
export function resolveAccentSet(
  accentHex: string,
  theme: ThemeName = "light"
): AccentSet {
  /**
   * La normalización va ANTES de buscar el preset, no después: el acento por
   * defecto ES un preset, así que un hex inválido tiene que devolver sus
   * valores exactos del handoff y no una derivación parecida.
   */
  const hex = isValidHex(accentHex) ? accentHex.toLowerCase() : DEFAULT_BRANDING.accent;

  const preset = ACCENT_PRESETS[hex];
  if (preset && theme === "light") return preset.set;

  const bg = hexToRgb(THEME_SURFACES[theme].bg);
  /** Hacia el fondo: es lo que aclara en tema claro y oscurece en tema oscuro. */
  const haciaElFondo = bg;
  /** Al frente: lo contrario del fondo. */
  const alFrente = luminance(bg) > 0.5 ? BLACK : WHITE;

  const base = ensureContrast(hexToRgb(hex), bg, 3);
  const tint = mix(base, haciaElFondo, 0.94);

  return {
    accent: rgbToHex(base),
    hover: rgbToHex(mix(base, alFrente, 0.16)),
    soft: rgbToHex(mix(base, haciaElFondo, 0.82)),
    tint: rgbToHex(tint),
    /**
     * `text` va ENCIMA de `tint` (chips, badges de marca), así que su contraste
     * se mide contra `tint` y no contra el fondo de la página. Antes no había
     * ninguna garantía: los cuatro presets pasaban por suerte, no por
     * construcción.
     */
    text: rgbToHex(ensureContrast(mix(base, alFrente, 0.28), tint, 4.5)),
  };
}

/**
 * CSS de variables para inyectar en el `<head>` (SSR, sin flash).
 *
 * Emite los DOS juegos: el claro en `:root` y el oscuro bajo
 * `[data-theme="dark"]`. Que viajen juntos es lo que permite cambiar de tema
 * sin volver al servidor.
 */
export function accentCssVariables(accentHex: string): string {
  const bloque = (s: AccentSet) =>
    `--accent:${s.accent};--accent-hover:${s.hover};--accent-soft:${s.soft};--accent-tint:${s.tint};--accent-text:${s.text};`;
  return (
    `:root{${bloque(resolveAccentSet(accentHex, "light"))}}` +
    `[data-theme="dark"]{${bloque(resolveAccentSet(accentHex, "dark"))}}`
  );
}

export function normalizeBranding(input: Partial<Branding> | null): Branding {
  const name = input?.name?.trim().slice(0, 30) || DEFAULT_BRANDING.name;
  const accent =
    input?.accent && isValidHex(input.accent)
      ? input.accent.toLowerCase()
      : DEFAULT_BRANDING.accent;
  return { name, accent };
}
