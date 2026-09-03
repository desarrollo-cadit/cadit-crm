import { describe, expect, it } from "vitest";
import { renderTemplate } from "@/server/email/templates";
// 023 — `escapeHtml` se unificó en `@/lib/utils`: había tres copias divergentes.
import { escapeHtml } from "@/lib/utils";

/**
 * 007 — Las plantillas se leen de `docs/email-templates/*.html` y el servidor
 * solo reemplaza `{{marcadores}}`. Estos casos cubren lo que puede salir mal
 * en un correo que va con la firma de la empresa.
 */
describe("renderTemplate", () => {
  it("reemplaza los marcadores con los valores dados", () => {
    const html = renderTemplate("licencia-atc", {
      nombre: "Romina",
      curso: "Civil 3D",
      academia: "CAD IT",
    });
    expect(html).toContain("Hola Romina");
    expect(html).toContain("Civil 3D");
  });

  it("no deja marcadores crudos cuando falta un valor", () => {
    const html = renderTemplate("bienvenida-cohorte", { nombre: "Ana" });
    expect(html).not.toMatch(/\{\{\w+\}\}/);
  });

  /**
   * Los valores vienen de la base (nombre del alumno, notas). Sin escapar, un
   * `<` rompe el HTML del correo y, peor, permite inyectar marcado en un
   * mensaje que sale con la identidad de la academia.
   */
  it("escapa el HTML de los valores", () => {
    const html = renderTemplate("licencia-atc", {
      nombre: '<img src=x onerror="alert(1)">',
      curso: "Revit & AutoCAD",
    });
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img");
    expect(html).toContain("Revit &amp; AutoCAD");
  });

  it("escapa comillas, que romperían el href del botón del grupo", () => {
    const html = renderTemplate("bienvenida-cohorte", {
      grupoWhatsapp: 'https://chat.whatsapp.com/x" onmouseover="alert(1)',
    });
    expect(html).not.toContain('" onmouseover=');
    expect(html).toContain("&quot;");
  });

  it("escapeHtml cubre los cinco caracteres", () => {
    expect(escapeHtml(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&#39;");
  });
});
