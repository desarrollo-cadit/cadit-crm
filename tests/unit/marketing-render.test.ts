import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/lib/branding";
import { renderCampaignEmail, type RenderContext } from "@/lib/marketing/render-email";
import type { CampaignBody } from "@/lib/marketing/body";

/**
 * 045 (T032; FR-007, FR-008, FR-011, FR-023) — El HTML del correo: escapado,
 * en tablas con estilos en línea, con el color de la marca medido, y con el
 * pie y la baja SIEMPRE presentes.
 */

const ctx = (over: Partial<RenderContext> = {}): RenderContext => ({
  subject: "Novedades para {{nombre|vos}}",
  academyName: "Academia Test",
  accent: "#3f5972",
  senderName: "Academia Test Novedades",
  footer: { address: "Av. Siempre Viva 742, Montevideo", contact: "hola@academia.test" },
  unsubscribeUrl: "https://crm.academia.test/baja/mkr_1.firma",
  imageUrls: { mki_1: "https://crm.academia.test/api/public/marketing/images/tok" },
  ...over,
});

const body = (...blocks: CampaignBody["blocks"]): CampaignBody => ({ v: 1, blocks });

describe("renderCampaignEmail", () => {
  it("todo texto se escapa", () => {
    const { html } = renderCampaignEmail(
      body({ type: "paragraph", text: "<script>alert(1)</script> & <b>hola</b>" }),
      {},
      ctx()
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;");
  });

  it("el valor de una variable no se interpreta como Markdown ni HTML", () => {
    const { html } = renderCampaignEmail(
      body({ type: "paragraph", text: "Hola {{nombre}}" }),
      { nombre: "[clic](https://malo.test) <i>x</i>" },
      ctx()
    );
    expect(html).not.toContain('href="https://malo.test');
    expect(html).toContain("&lt;i&gt;x&lt;/i&gt;");
  });

  it("tablas de 600 px con estilos en línea: sin `<style>` ni `class`", () => {
    const { html } = renderCampaignEmail(
      body({ type: "heading", level: 1, text: "Hola" }, { type: "divider" }),
      {},
      ctx()
    );
    expect(html).toMatch(/<table[^>]*width="600"/);
    expect(html).not.toMatch(/<style/i);
    expect(html).not.toMatch(/\sclass=/i);
  });

  it.each(["#3f5972", "#f5d000", "#ffffff", "no-es-hex"])(
    "el botón usa el acento (%s) con contraste ≥ 4.5 contra su texto blanco",
    (accent) => {
      const { html } = renderCampaignEmail(
        body({ type: "button", label: "Inscribite", url: "https://a.test" }),
        {},
        ctx({ accent })
      );
      const m = /<a [^>]*style="[^"]*background-color:(#[0-9a-f]{6})[^"]*"[^>]*>Inscribite<\/a>/i.exec(html);
      expect(m, "no encontré el botón").not.toBeNull();
      expect(contrastRatio(m![1]!, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    }
  );

  it("el pie (remitente, dirección, contacto) y la baja están SIEMPRE, aun con cuerpo vacío", () => {
    const { html } = renderCampaignEmail(body(), {}, ctx());
    expect(html).toContain("Academia Test Novedades");
    expect(html).toContain("Av. Siempre Viva 742, Montevideo");
    expect(html).toContain("hola@academia.test");
    expect(html).toContain("No quiero recibir más correos");
    expect(html).toContain('href="https://crm.academia.test/baja/mkr_1.firma"');
  });

  it("con `trackLink` cada enlace https pasa por el clic; los `mailto:` no", () => {
    const { html } = renderCampaignEmail(
      body(
        { type: "paragraph", text: "[a](https://a.test) y [m](mailto:x@a.test)" },
        { type: "button", label: "b", url: "https://b.test" },
        { type: "image", imageId: "mki_1", alt: "foto", href: "https://c.test" }
      ),
      {},
      ctx({ trackLink: (u) => `https://crm.test/clic?u=${encodeURIComponent(u)}` })
    );
    expect(html).toContain(`href="https://crm.test/clic?u=${encodeURIComponent("https://a.test/")}"`);
    expect(html).toContain(`href="https://crm.test/clic?u=${encodeURIComponent("https://b.test/")}"`);
    expect(html).toContain(`href="https://crm.test/clic?u=${encodeURIComponent("https://c.test/")}"`);
    expect(html).toContain('href="mailto:x@a.test"');
    expect(html).not.toContain('href="https://a.test/"');
  });

  it("sin `trackLink` (vista previa, prueba) los enlaces quedan directos", () => {
    const { html } = renderCampaignEmail(
      body({ type: "button", label: "b", url: "https://b.test" }),
      {},
      ctx()
    );
    expect(html).toContain('href="https://b.test/"');
  });

  it("las imágenes usan la URL pública absoluta y su texto alternativo", () => {
    const { html } = renderCampaignEmail(body({ type: "image", imageId: "mki_1", alt: "Portada" }), {}, ctx());
    expect(html).toContain('src="https://crm.academia.test/api/public/marketing/images/tok"');
    expect(html).toContain('alt="Portada"');
  });

  it("asunto y cuerpo personalizados, nunca con `{{`", () => {
    const r = renderCampaignEmail(
      body(
        { type: "paragraph", text: "Hola {{nombre|colega}}, sobre {{curso_de_interes}}" },
        { type: "list", ordered: true, items: ["{{apellido}}"] }
      ),
      { nombre: "Ana" },
      ctx()
    );
    expect(r.subject).toBe("Novedades para Ana");
    expect(r.html).toContain("Hola Ana, sobre nuestros cursos");
    expect(r.html).not.toContain("{{");
    expect(r.subject).not.toContain("{{");
  });
});
