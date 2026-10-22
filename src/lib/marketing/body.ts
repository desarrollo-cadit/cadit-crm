import { z } from "zod";
import { hrefPermitido, parseInline, type InlineNode } from "@/lib/markdown-inline";

/**
 * 045 (DV-007, DV-008; FR-007, FR-008, FR-010, FR-023) — El cuerpo de una
 * campaña: bloques JSON, sin HTML libre.
 *
 * Un campo `html` es un campo desconocido y el esquema lo rechaza: no hay
 * manera de meter marcado. El texto de cada bloque usa la gramática en línea
 * de `src/lib/markdown-inline.ts` (negrita, cursiva, enlaces y variables).
 */

export const KNOWN_VARIABLES = ["nombre", "apellido", "curso_de_interes"] as const;
export type KnownVariable = (typeof KNOWN_VARIABLES)[number];

/** Lo que se usa cuando falta el dato y no hay alternativa en línea. */
export const ALTERNATIVAS: Record<KnownVariable, string> = {
  nombre: "",
  apellido: "",
  curso_de_interes: "nuestros cursos",
};

/** Esquemas de enlace: en línea vale escribir un correo; un botón, no. */
export const ESQUEMAS_EN_LINEA = ["https:", "mailto:"] as const;
export const ESQUEMAS_DE_BOTON = ["https:"] as const;

const texto = (max: number) => z.string().trim().min(1, "Falta el texto.").max(max);
const url = z.string().trim().min(1, "Falta el enlace.").max(2000);

const Heading = z.object({ type: z.literal("heading"), level: z.union([z.literal(1), z.literal(2)]), text: texto(200) }).strict();
const Paragraph = z.object({ type: z.literal("paragraph"), text: texto(3000) }).strict();
const List = z
  .object({ type: z.literal("list"), ordered: z.boolean(), items: z.array(texto(500)).min(1).max(30) })
  .strict();
const Image = z
  .object({
    type: z.literal("image"),
    imageId: z.string().min(1).max(64),
    alt: z.string().trim().max(200),
    href: url.optional(),
  })
  .strict();
const Button = z.object({ type: z.literal("button"), label: texto(60), url }).strict();
const Divider = z.object({ type: z.literal("divider") }).strict();

export const BlockSchema = z.discriminatedUnion("type", [Heading, Paragraph, List, Image, Button, Divider]);
export type Block = z.infer<typeof BlockSchema>;

export const MAX_TEXTO_TOTAL = 20_000;

function largoDeTexto(b: Block): number {
  switch (b.type) {
    case "heading":
    case "paragraph":
      return b.text.length;
    case "list":
      return b.items.reduce((n, i) => n + i.length, 0);
    case "image":
      return b.alt.length;
    case "button":
      return b.label.length;
    case "divider":
      return 0;
  }
}

export const CampaignBodySchema = z
  .object({ v: z.literal(1), blocks: z.array(BlockSchema).max(60, "Hasta 60 bloques por correo.") })
  .strict()
  .refine((b) => b.blocks.reduce((n, x) => n + largoDeTexto(x), 0) <= MAX_TEXTO_TOTAL, {
    message: `El correo supera los ${MAX_TEXTO_TOTAL} caracteres de texto.`,
    path: ["blocks"],
  });

export type CampaignBody = z.infer<typeof CampaignBodySchema>;

export const CUERPO_VACIO: CampaignBody = { v: 1, blocks: [] };

export type ErrorDeCuerpo = {
  ok: false;
  code: "variable_desconocida" | "enlace_invalido" | "imagen_ajena";
  message: string;
  fields: { path: string; message: string }[];
};

/** Cada texto con su ruta, para validar y para extraer enlaces. */
function textosDelCuerpo(body: CampaignBody): { path: string; text: string }[] {
  return body.blocks.flatMap((b, i) => {
    const base = `body.blocks.${i}`;
    switch (b.type) {
      case "heading":
      case "paragraph":
        return [{ path: `${base}.text`, text: b.text }];
      case "list":
        return b.items.map((text, j) => ({ path: `${base}.items.${j}`, text }));
      case "button":
        return [{ path: `${base}.label`, text: b.label }];
      default:
        return [];
    }
  });
}

function variablesDe(nodes: InlineNode[]): string[] {
  return nodes.flatMap((n) => {
    if (n.type === "var") return [n.name];
    if (n.type === "bold" || n.type === "italic" || n.type === "link") return variablesDe(n.children);
    return [];
  });
}

function enlacesDe(nodes: InlineNode[]): string[] {
  return nodes.flatMap((n) => {
    if (n.type === "link") return [n.href, ...enlacesDe(n.children)];
    if (n.type === "bold" || n.type === "italic") return enlacesDe(n.children);
    return [];
  });
}

const esConocida = (v: string): v is KnownVariable => (KNOWN_VARIABLES as readonly string[]).includes(v);

/**
 * Lo que el esquema no puede ver: variables desconocidas, URLs inseguras e
 * imágenes que no son de la campaña. Devuelve el PRIMER tipo de error con
 * todas sus rutas (la UI marca cada bloque).
 */
export function validarCuerpo(
  body: CampaignBody,
  subject: string,
  imageIds: readonly string[]
): { ok: true } | ErrorDeCuerpo {
  const variables: { path: string; message: string }[] = [];
  const enlaces: { path: string; message: string }[] = [];
  const imagenes: { path: string; message: string }[] = [];
  const desconocidas = new Set<string>();

  const revisarTexto = (path: string, text: string) => {
    const rechazadas: string[] = [];
    const nodos = parseInline(text, {
      esquemas: ESQUEMAS_EN_LINEA,
      variables: true,
      alRechazar: (u) => rechazadas.push(u),
    });
    for (const v of variablesDe(nodos)) {
      if (!esConocida(v)) {
        desconocidas.add(v);
        variables.push({ path, message: `La variable «${v}» no existe.` });
      }
    }
    for (const u of rechazadas) {
      enlaces.push({ path, message: `El enlace «${u}» no es válido: tiene que empezar con https://.` });
    }
  };

  revisarTexto("subject", subject);
  for (const t of textosDelCuerpo(body)) revisarTexto(t.path, t.text);

  body.blocks.forEach((b, i) => {
    const base = `body.blocks.${i}`;
    if (b.type === "button" && !hrefPermitido(b.url, ESQUEMAS_DE_BOTON)) {
      enlaces.push({ path: `${base}.url`, message: "El enlace del botón tiene que empezar con https://." });
    }
    if (b.type === "image") {
      if (b.href !== undefined && !hrefPermitido(b.href, ESQUEMAS_DE_BOTON)) {
        enlaces.push({ path: `${base}.href`, message: "El enlace de la imagen tiene que empezar con https://." });
      }
      if (!imageIds.includes(b.imageId)) {
        imagenes.push({ path: `${base}.imageId`, message: "Esa imagen no es de esta campaña." });
      }
    }
  });

  if (variables.length > 0) {
    return {
      ok: false,
      code: "variable_desconocida",
      message: `Variable desconocida: ${[...desconocidas].join(", ")}. Podés usar ${KNOWN_VARIABLES.join(", ")}.`,
      fields: variables,
    };
  }
  if (enlaces.length > 0) {
    return { ok: false, code: "enlace_invalido", message: enlaces[0]!.message, fields: enlaces };
  }
  if (imagenes.length > 0) {
    return { ok: false, code: "imagen_ajena", message: imagenes[0]!.message, fields: imagenes };
  }
  return { ok: true };
}

/** El valor de una variable: el dato, la alternativa en línea o la de la lista. */
export function valorDeVariable(name: string, alt: string | null, vars: Record<string, string | undefined>): string {
  const dato = vars[name]?.trim();
  if (dato) return dato;
  if (alt) return alt;
  return esConocida(name) ? ALTERNATIVAS[name] : "";
}

const VARIABLE_EN_TEXTO = /\{\{\s*([a-z_]+)\s*(?:\|([^{}\n]*))?\}\}/g;

/**
 * Reemplaza las variables de un texto plano (el asunto). Nunca deja una llave
 * cruda: una variable desconocida queda vacía.
 */
export function reemplazarVariables(texto: string, vars: Record<string, string | undefined>): string {
  return texto.replace(VARIABLE_EN_TEXTO, (_m, name: string, alt: string | undefined) =>
    valorDeVariable(name, alt === undefined ? null : alt.trim(), vars)
  );
}

/**
 * Las URLs https distintas del cuerpo, en orden de aparición: son las que se
 * guardan como destinos permitidos de los clics (DV-012). Los `mailto:` no se
 * rastrean.
 */
export function extraerEnlaces(body: CampaignBody): string[] {
  const out: string[] = [];
  const agregar = (u: string | null) => {
    if (u && u.startsWith("https:") && !out.includes(u)) out.push(u);
  };
  for (const b of body.blocks) {
    switch (b.type) {
      case "heading":
      case "paragraph":
        enlacesDe(parseInline(b.text, { esquemas: ESQUEMAS_EN_LINEA, variables: true })).forEach(agregar);
        break;
      case "list":
        for (const item of b.items) {
          enlacesDe(parseInline(item, { esquemas: ESQUEMAS_EN_LINEA, variables: true })).forEach(agregar);
        }
        break;
      case "button":
        agregar(hrefPermitido(b.url, ESQUEMAS_DE_BOTON));
        break;
      case "image":
        if (b.href) agregar(hrefPermitido(b.href, ESQUEMAS_DE_BOTON));
        break;
      default:
        break;
    }
  }
  return out;
}
