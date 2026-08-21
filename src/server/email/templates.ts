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

export type TemplateName = "licencia-atc" | "bienvenida-cohorte";

/** Cache en proceso: en producción los archivos no cambian entre pedidos. */
const cache = new Map<TemplateName, string>();

function loadTemplate(name: TemplateName): string {
  const cached = cache.get(name);
  if (cached && process.env.NODE_ENV === "production") return cached;
  const html = readFileSync(path.join(TEMPLATE_DIR, `${name}.html`), "utf8");
  cache.set(name, html);
  return html;
}

/**
 * Escapa el valor antes de insertarlo: los datos vienen de la base (nombre
 * del alumno, notas) y sin esto un `<` en un nombre rompe el HTML del correo
 * —o peor, permite inyectar marcado en un mensaje que sale con la firma de
 * la empresa—.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Reemplaza `{{clave}}` por su valor. Un marcador sin valor queda vacío y NO
 * se deja el `{{clave}}` crudo: es preferible una línea incompleta antes que
 * mandarle al alumno un correo con llaves a la vista.
 */
export function renderTemplate(
  name: TemplateName,
  values: Record<string, string | null | undefined>
): string {
  const html = loadTemplate(name);
  return html.replace(/\{\{(\w+)\}\}/g, (_match, key: string) =>
    escapeHtml(values[key] ?? "")
  );
}
