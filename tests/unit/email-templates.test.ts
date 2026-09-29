import { describe, expect, it } from "vitest";
import { renderTemplate } from "@/server/email/templates";
import { contenidoPortalPara } from "@/server/email/portal-access-copy";
// 023 — `escapeHtml` se unificó en `@/lib/utils`: había tres copias divergentes.
import { escapeHtml } from "@/lib/utils";

/**
 * 007 — Las plantillas se leen de `docs/email-templates/*.html` y el servidor
 * solo reemplaza `{{marcadores}}`. Estos casos cubren lo que puede salir mal
 * en un correo que va con la firma de la empresa.
 */
describe("renderTemplate", () => {
  it("reemplaza los marcadores con los valores dados", () => {
    // El correo de términos usa `nombreCompleto`, no el nombre de pila:
    // documenta un préstamo y el nombre es parte del documento.
    const html = renderTemplate("licencia-atc", {
      nombreCompleto: "Romina Bentancor",
      curso: "Civil 3D",
      academia: "CAD IT",
    });
    expect(html).toContain("Estimad@ Romina Bentancor");
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
      nombreCompleto: '<img src=x onerror="alert(1)">',
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

/**
 * El correo de acceso al portal lo reciben alumnos Y profesores. El texto que
 * describe qué hay adentro depende de a quién va: a un profesor no se le
 * promete un legajo ni certificados que no tiene.
 */
describe("correo de acceso al portal", () => {
  const base = { nombre: "Ana", academia: "CAD IT" };
  // Lo que lee la persona: los comentarios de la plantilla son para quien la edita.
  const visible = (html: string) => html.replace(/<!--[\s\S]*?-->/g, "");

  it("al profesor le describe su portal, sin hablarle como alumno", () => {
    const html = visible(
      renderTemplate("acceso-portal", {
        ...base,
        contenidoPortal: contenidoPortalPara("profesor"),
      })
    );
    expect(html).toContain("tus cohortes");
    expect(html).not.toMatch(/legajo/i);
    expect(html).not.toMatch(/alumno/i);
  });

  it("al alumno le sigue contando sus cursadas, legajo y certificados", () => {
    const html = renderTemplate("acceso-portal", {
      ...base,
      contenidoPortal: contenidoPortalPara("alumno"),
    });
    expect(html).toContain(
      "Ahí vas a encontrar tus cursadas, tu legajo y tus certificados."
    );
    expect(html).toContain("ya tenés acceso al portal de CAD IT");
  });
});
