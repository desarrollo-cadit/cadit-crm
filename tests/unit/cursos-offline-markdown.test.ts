import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown } from "@/components/offline-courses/markdown";

/**
 * cursos-offline (T4) — The tiny markdown renderer for imported content.
 *
 * It builds React elements, never HTML strings: whatever the content says is
 * TEXT unless the renderer itself decided to make it an element. The XSS
 * cases below are the reason it exists instead of `dangerouslySetInnerHTML`.
 */

const html = (source: string) => renderToStaticMarkup(createElement(Markdown, { source }));

describe("Markdown — blocks", () => {
  it("splits paragraphs on blank lines and keeps single line breaks", () => {
    const out = html("uno\ndos\n\ntres");
    expect(out).toContain("<p>uno<br/>dos</p>");
    expect(out).toContain("<p>tres</p>");
  });

  it("renders headings # to ###", () => {
    const out = html("# Uno\n## Dos\n### Tres");
    expect(out).toMatch(/<h3[^>]*>Uno<\/h3>/);
    expect(out).toMatch(/<h4[^>]*>Dos<\/h4>/);
    expect(out).toMatch(/<h5[^>]*>Tres<\/h5>/);
  });

  it("renders unordered and ordered lists", () => {
    const out = html("- a\n* b\n\n1. uno\n2. dos");
    expect(out).toMatch(/<ul[^>]*><li>a<\/li><li>b<\/li><\/ul>/);
    expect(out).toMatch(/<ol[^>]*><li>uno<\/li><li>dos<\/li><\/ol>/);
  });

  it("empty input renders nothing", () => {
    expect(html("   \n\n ")).toBe("");
  });
});

describe("Markdown — inline", () => {
  it("renders bold, italic and code", () => {
    const out = html("**negrita** y *cursiva* y `x = 1`");
    expect(out).toContain("<strong>negrita</strong>");
    expect(out).toContain("<em>cursiva</em>");
    expect(out).toMatch(/<code[^>]*>x = 1<\/code>/);
  });

  it("code content is not parsed further", () => {
    expect(html("`**no**`")).toMatch(/<code[^>]*>\*\*no\*\*<\/code>/);
  });

  it("renders http(s) links opening in a new tab, safely", () => {
    const out = html("[Autodesk](https://autodesk.com/revit)");
    expect(out).toContain('href="https://autodesk.com/revit"');
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain('target="_blank"');
    expect(out).toContain(">Autodesk</a>");
  });

  it("turns plain URLs into links", () => {
    const out = html("ver https://example.com/a?b=1 ahora");
    expect(out).toContain('href="https://example.com/a?b=1"');
    expect(out).toContain(" ahora");
  });
});

describe("Markdown — XSS", () => {
  it("a <script> tag is rendered as escaped text", () => {
    const out = html('<script>alert("x")</script>');
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });

  it("a javascript: link is not linked", () => {
    const out = html("[click](javascript:alert(1))");
    expect(out).not.toContain("<a");
    expect(out).not.toContain('href="javascript');
    expect(out).toContain("click");
  });

  it("a data: link is not linked either", () => {
    expect(html("[x](data:text/html,hi)")).not.toContain("<a");
  });

  it("an attribute-breaking URL stays inside the attribute", () => {
    const out = html('[x](https://a.com/"onmouseover="alert(1))');
    expect(out).not.toMatch(/<a[^>]* onmouseover=/);
  });
});
