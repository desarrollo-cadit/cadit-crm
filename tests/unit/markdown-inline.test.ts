import { describe, expect, it } from "vitest";
import { parseInline, type InlineNode } from "@/lib/markdown-inline";

/**
 * 045 (T030, DV-007; FR-010) — La gramática en línea, extraída de
 * `components/offline-courses/markdown.tsx` para que la usen también las
 * campañas. Una sola gramática: `cursos-offline-markdown.test.ts` sigue verde
 * sin cambios.
 */

const WEB = { esquemas: ["http:", "https:"] as const };
const CORREO = { esquemas: ["https:", "mailto:"] as const, variables: true };

const texto = (nodes: InlineNode[]): string =>
  nodes
    .map((n) => {
      switch (n.type) {
        case "text":
        case "code":
          return n.text;
        case "var":
          return `{${n.name}}`;
        default:
          return texto(n.children);
      }
    })
    .join("");

describe("parseInline", () => {
  it("texto plano → un solo nodo de texto", () => {
    expect(parseInline("hola mundo", WEB)).toEqual([{ type: "text", text: "hola mundo" }]);
  });

  it("negrita y cursiva son nodos", () => {
    expect(parseInline("**fuerte** y *suave*", WEB)).toEqual([
      { type: "bold", children: [{ type: "text", text: "fuerte" }] },
      { type: "text", text: " y " },
      { type: "italic", children: [{ type: "text", text: "suave" }] },
    ]);
  });

  it("un enlace con esquema permitido es un nodo `link`", () => {
    expect(parseInline("[Revit](https://autodesk.com/revit)", WEB)).toEqual([
      { type: "link", href: "https://autodesk.com/revit", children: [{ type: "text", text: "Revit" }] },
    ]);
  });

  it("un enlace con esquema no permitido queda como texto (su etiqueta) y se avisa", () => {
    const rechazados: string[] = [];
    const nodos = parseInline("[clic](javascript:alert(1))", {
      ...WEB,
      alRechazar: (u) => rechazados.push(u),
    });
    expect(nodos.some((n) => n.type === "link")).toBe(false);
    expect(texto(nodos)).toBe("clic");
    expect(rechazados).toEqual(["javascript:alert(1)"]);
  });

  it("los esquemas son configurables: `mailto:` sí en el correo, `http:` no", () => {
    const mail = parseInline("[escribinos](mailto:hola@academia.test)", CORREO);
    expect(mail[0]).toMatchObject({ type: "link", href: "mailto:hola@academia.test" });
    const rechazados: string[] = [];
    const http = parseInline("[viejo](http://academia.test)", { ...CORREO, alRechazar: (u) => rechazados.push(u) });
    expect(http.some((n) => n.type === "link")).toBe(false);
    expect(rechazados).toEqual(["http://academia.test"]);
  });

  it("`{{var|alt}}` es un nodo solo si se piden variables", () => {
    expect(parseInline("Hola {{nombre|colega}}!", CORREO)).toEqual([
      { type: "text", text: "Hola " },
      { type: "var", name: "nombre", alt: "colega" },
      { type: "text", text: "!" },
    ]);
    expect(parseInline("{{ curso_de_interes }}", CORREO)).toEqual([
      { type: "var", name: "curso_de_interes", alt: null },
    ]);
    expect(parseInline("Hola {{nombre}}", WEB)).toEqual([{ type: "text", text: "Hola {{nombre}}" }]);
  });

  it("`<script>` y cualquier HTML quedan como texto literal", () => {
    const html = '<script>alert(1)</script> <b onclick="x">hola</b>';
    expect(parseInline(html, CORREO)).toEqual([{ type: "text", text: html }]);
  });

  it("una URL suelta permitida se vuelve enlace sin su puntuación final", () => {
    expect(parseInline("ver https://academia.test/x.", WEB)).toEqual([
      { type: "text", text: "ver " },
      { type: "link", href: "https://academia.test/x", children: [{ type: "text", text: "https://academia.test/x" }] },
      { type: "text", text: "." },
    ]);
  });
});
