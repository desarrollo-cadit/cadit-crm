import { escapeHtml } from "@/lib/utils";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * 007 — Render de las plantillas HTML de correo.
 *
 * Los HTML viven en `docs/email-templates/` como archivos sueltos y NO
 * embebidos en un template literal: así el dueño puede abrirlos en el
 * navegador, mandarlos a revisar y editarlos sin tocar TypeScript. El
 * servidor solo reemplaza los `{{marcadores}}`.
 */

const TEMPLATE_DIR = path.join(process.cwd(), "docs", "email-templates");

export type TemplateName =
  | "licencia-atc"
  | "bienvenida-cohorte"
  | "acceso-portal"
  // 029 — correo de derivación a un área (Ventas/Soporte).
  | "derivacion-area"
  // 045 — campañas de marketing (armazón con pie fijo y baja).
  | "campana-marketing";

declare const safeHtmlBrand: unique symbol;

/**
 * 029 — HTML ya escapado, apto para el marcador `{{{x}}}`.
 *
 * Es un tipo MARCADO: un `string` cualquiera no lo es, así que pasar texto
 * crudo a un bloque no compila. Lo produce `markSafeHtml`, y a esa función
 * solo la llaman `htmlRows()` de `src/server/areas/email.ts` y (036) los
 * bloques de `src/server/email/welcome-email.ts`, que escapan cada valor antes.
 */
export type SafeHtml = string & { readonly [safeHtmlBrand]: true };

/** Solo para quien YA escapó todo valor que viene de afuera (ver `SafeHtml`). */
export function markSafeHtml(html: string): SafeHtml {
  return html as SafeHtml;
}

/** Cache en proceso: en producción los archivos no cambian entre pedidos. */
const cache = new Map<TemplateName, string>();

function loadTemplate(name: TemplateName): string {
  const cached = cache.get(name);
  if (cached && process.env.NODE_ENV === "production") return cached;
  // 036 — Los comentarios son notas para quien edita la plantilla, no para
  // quien recibe el correo: no viajan. Además el reemplazo de marcadores
  // también corría adentro de ellos y metía datos del alumno en el HTML
  // escondido. Se conservan los condicionales de Outlook (`<!--[if mso]>`).
  const html = readFileSync(path.join(TEMPLATE_DIR, `${name}.html`), "utf8").replace(
    /<!--(?!\[if)(?!<!\[endif)[\s\S]*?-->\s*/g,
    ""
  );
  cache.set(name, html);
  return html;
}

/**
 * Escapa el valor antes de insertarlo: los datos vienen de la base (nombre
 * del alumno, notas) y sin esto un `<` en un nombre rompe el HTML del correo
 * —o peor, permite inyectar marcado en un mensaje que sale con la firma de
 * la empresa—.
 */
// 023 — `escapeHtml` se mudó a `@/lib/utils`: había tres copias y dos
// se habían quedado sin escapar el apóstrofo.

/**
 * Reemplaza `{{clave}}` por su valor. Un marcador sin valor queda vacío y NO
 * se deja el `{{clave}}` crudo: es preferible una línea incompleta antes que
 * mandarle al alumno un correo con llaves a la vista.
 */
export function renderTemplate(
  name: TemplateName,
  values: Record<string, string | null | undefined>,
  /**
   * 029 — Bloques de varias filas (`{{{x}}}`): se insertan SIN escapar, por
   * eso solo aceptan `SafeHtml`.
   */
  blocks: Record<string, SafeHtml | undefined> = {}
): string {
  const html = loadTemplate(name);
  // UNA sola pasada: si primero se insertaran los bloques y después los
  // `{{x}}`, un `{{marcador}}` que escribió el cliente en la transcripción se
  // reemplazaría por un valor.
  return html.replace(
    /\{\{\{(\w+)\}\}\}|\{\{(\w+)\}\}/g,
    (_match, block: string | undefined, key: string | undefined) =>
      block !== undefined ? (blocks[block] ?? "") : escapeHtml(values[key!] ?? "")
  );
}
