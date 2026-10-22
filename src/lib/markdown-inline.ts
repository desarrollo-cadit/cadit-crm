/**
 * 045 (DV-007) — La gramática en línea, UNA sola para todo el producto.
 *
 * Nació adentro de `components/offline-courses/markdown.tsx` (cursos offline)
 * y se extrajo para que las campañas de marketing usen exactamente las mismas
 * reglas. Es puro: devuelve NODOS, nunca HTML. Quien dibuja (React o el
 * correo) decide qué elemento es cada nodo, y todo lo demás es texto: un
 * `<script>` escrito en un párrafo llega como texto y se escapa al dibujarlo.
 *
 * Reconoce: `code`, [texto](url), **negrita**, *cursiva*, URLs sueltas y —solo
 * si se piden— variables `{{nombre|alternativa}}`. Un enlace cuyo esquema no
 * está permitido NO es un enlace: queda su etiqueta como texto y se avisa por
 * `alRechazar` (las campañas lo convierten en un error de validación).
 */

export type InlineNode =
  | { type: "text"; text: string }
  | { type: "code"; text: string }
  | { type: "bold"; children: InlineNode[] }
  | { type: "italic"; children: InlineNode[] }
  | { type: "link"; href: string; children: InlineNode[] }
  | { type: "var"; name: string; alt: string | null };

export type InlineOptions = {
  /** Esquemas con los que un enlace es enlace (`"https:"`, `"mailto:"`…). */
  esquemas: readonly string[];
  /** Reconocer `{{var|alt}}` (campañas). Apagado por defecto. */
  variables?: boolean;
  /** Se llama con cada URL rechazada por su esquema o porque no parsea. */
  alRechazar?: (url: string) => void;
};

/**
 * One regex, alternatives in priority order. `exec` returns the LEFTMOST
 * match, and at one position tries the alternatives left to right — so code
 * wins over bold, and a markdown link wins over the bare URL inside it.
 *
 * The link target allows one level of balanced parentheses so that
 * `[x](javascript:alert(1))` is consumed WHOLE and then refused, instead of
 * leaving a stray `)` behind.
 */
const BASE =
  "(`[^`\\n]+`)|\\[([^\\]\\n]+)\\]\\(([^()\\s]*(?:\\([^()\\s]*\\)[^()\\s]*)*)\\)|\\*\\*([^*\\n]+?)\\*\\*|\\*([^*\\s][^*\\n]*?)\\*|(https?:\\/\\/[^\\s<>]+)";
const VARIABLE = "\\{\\{\\s*([a-z_]+)\\s*(?:\\|([^{}\\n]*))?\\}\\}";

const SIN_VARIABLES = new RegExp(BASE);
const CON_VARIABLES = new RegExp(`${BASE}|${VARIABLE}`);

/** La URL normalizada si su esquema está permitido; `null` si no o si no parsea. */
export function hrefPermitido(raw: string, esquemas: readonly string[]): string | null {
  try {
    const url = new URL(raw);
    return esquemas.includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

/** A bare URL does not own its trailing punctuation: "ver https://x.com." */
function trimUrl(url: string): { url: string; rest: string } {
  let end = url.length;
  while (end > 0) {
    const ch = url[end - 1]!;
    if (".,;:!?'\"".includes(ch)) {
      end -= 1;
      continue;
    }
    if (ch === ")") {
      const body = url.slice(0, end);
      const opens = body.split("(").length - 1;
      const closes = body.split(")").length - 1;
      if (closes > opens) {
        end -= 1;
        continue;
      }
    }
    break;
  }
  return { url: url.slice(0, end), rest: url.slice(end) };
}

/** Junta textos vecinos: `[a, b]` de texto es un solo nodo. */
function push(out: InlineNode[], node: InlineNode) {
  const last = out[out.length - 1];
  if (node.type === "text" && last?.type === "text") last.text += node.text;
  else if (node.type !== "text" || node.text) out.push(node);
}

function parse(text: string, opts: InlineOptions, allowLinks: boolean): InlineNode[] {
  const re = opts.variables ? CON_VARIABLES : SIN_VARIABLES;
  const out: InlineNode[] = [];
  let rest = text;

  while (rest) {
    const m = re.exec(rest);
    if (!m) {
      push(out, { type: "text", text: rest });
      break;
    }
    if (m.index > 0) push(out, { type: "text", text: rest.slice(0, m.index) });
    const [whole, code, linkText, linkUrl, bold, italic, bareUrl, varName, varAlt] = m;

    if (code !== undefined) {
      out.push({ type: "code", text: code.slice(1, -1) });
    } else if (linkText !== undefined) {
      const label = parse(linkText, opts, false);
      const href = allowLinks ? hrefPermitido(linkUrl ?? "", opts.esquemas) : null;
      if (href) out.push({ type: "link", href, children: label });
      else {
        if (allowLinks) opts.alRechazar?.(linkUrl ?? "");
        for (const n of label) push(out, n);
      }
    } else if (bold !== undefined) {
      out.push({ type: "bold", children: parse(bold, opts, allowLinks) });
    } else if (italic !== undefined) {
      out.push({ type: "italic", children: parse(italic, opts, allowLinks) });
    } else if (bareUrl !== undefined) {
      const { url, rest: tail } = trimUrl(bareUrl);
      const href = allowLinks ? hrefPermitido(url, opts.esquemas) : null;
      if (href) out.push({ type: "link", href, children: [{ type: "text", text: url }] });
      else {
        if (allowLinks) opts.alRechazar?.(url);
        push(out, { type: "text", text: url });
      }
      if (tail) push(out, { type: "text", text: tail });
    } else if (varName !== undefined) {
      out.push({ type: "var", name: varName, alt: varAlt === undefined ? null : varAlt.trim() });
    }
    rest = rest.slice(m.index + whole.length);
  }
  return out;
}

export function parseInline(text: string, opts: InlineOptions): InlineNode[] {
  return parse(text, opts, true);
}
