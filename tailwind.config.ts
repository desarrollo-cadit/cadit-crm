import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

/**
 * Los nombres semánticos existentes (background, primary, muted…) se remapean
 * a los tokens del sistema Atlas para que toda la app comparta el tema claro;
 * la escala `brand-*` expone el acento white-label.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "var(--border)",
        "border-strong": "var(--border-strong)",
        input: "var(--border-strong)",
        ring: "var(--accent)",
        background: "var(--bg)",
        foreground: "var(--text)",
        subtle: "var(--bg-subtle)",
        primary: {
          DEFAULT: "var(--accent)",
          foreground: "#ffffff",
        },
        secondary: {
          DEFAULT: "var(--bg-panel)",
          foreground: "var(--text-2)",
        },
        destructive: {
          DEFAULT: "var(--danger)",
          foreground: "#ffffff",
        },
        muted: {
          DEFAULT: "var(--bg-panel)",
          foreground: "var(--text-3)",
        },
        accent: {
          DEFAULT: "var(--bg-hover)",
          foreground: "var(--text)",
        },
        card: {
          DEFAULT: "var(--bg)",
          foreground: "var(--text)",
        },
        popover: {
          DEFAULT: "var(--bg)",
          foreground: "var(--text)",
        },
        brand: {
          DEFAULT: "var(--accent)",
          hover: "var(--accent-hover)",
          soft: "var(--accent-soft)",
          tint: "var(--accent-tint)",
          text: "var(--accent-text)",
        },
        "text-2": "var(--text-2)",
        "text-3": "var(--text-3)",
        "text-4": "var(--text-4)",
        chat: "var(--chat-bg)",
        "bubble-out": "var(--bubble-out)",
        "bubble-out-text": "var(--bubble-out-text)",
        "tick-read": "var(--tick-read)",
        overlay: "var(--overlay)",
        "now-line": "var(--now-line)",
        // Paleta CATEGÓRICA de cohortes: distinguir, no comunicar estado.
        ...Object.fromEntries(
          [1, 2, 3, 4, 5, 6, 7, 8].flatMap((n) => [
            [`cohort-${n}`, `var(--cohort-${n}-bg)`],
            [`cohort-${n}-fg`, `var(--cohort-${n}-fg)`],
          ])
        ),
        "voice-client": "var(--voice-client)",
        "on-accent": "var(--on-accent)",
        "on-state": "var(--on-state)",
        success: {
          DEFAULT: "var(--success)",
          soft: "var(--success-soft)",
          border: "var(--success-border)",
        },
        warning: {
          DEFAULT: "var(--warning)",
          soft: "var(--warning-soft)",
          border: "var(--warning-border)",
        },
        danger: {
          DEFAULT: "var(--danger)",
          soft: "var(--danger-soft)",
          border: "var(--danger-border)",
        },
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius)",
        lg: "var(--radius-lg)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        pop: "var(--shadow-pop)",
      },
      fontFamily: {
        sans: ["var(--font-geist)", "Hanken Grotesk", "-apple-system", "sans-serif"],
      },
      /**
       * 020 (T005) — Solo los pasos de TITULAR se remapean a la escala nueva.
       *
       * Se hace acá y no en las pantallas por el mismo motivo que los colores:
       * las 24 pantallas ya escriben `text-lg`, así que cambiar el token las
       * alcanza a todas sin tocar un solo archivo.
       *
       * `xs`, `sm` y `base` quedan en el default de Tailwind a propósito:
       * agrandar el cuerpo bajaría la densidad del panel (FR-006).
       */
      fontSize: {
        lg: ["var(--text-step-1)", { lineHeight: "1.75rem" }],
        xl: ["var(--text-step-2)", { lineHeight: "2rem" }],
        "2xl": ["var(--text-step-3)", { lineHeight: "2.25rem" }],
      },
    },
  },
  plugins: [animate],
};

export default config;
