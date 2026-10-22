import { describe, expect, it } from "vitest";
import {
  CampaignBodySchema,
  KNOWN_VARIABLES,
  extraerEnlaces,
  reemplazarVariables,
  validarCuerpo,
  type CampaignBody,
} from "@/lib/marketing/body";

/**
 * 045 (T031; FR-007, FR-008, FR-010, FR-023) — El cuerpo de una campaña:
 * bloques sin HTML libre, variables conocidas con alternativa, URLs seguras y
 * la lista de enlaces que se van a rastrear.
 */

const cuerpo = (...blocks: CampaignBody["blocks"]): CampaignBody => ({ v: 1, blocks });

describe("CampaignBodySchema", () => {
  it("acepta los seis tipos de bloque", () => {
    const r = CampaignBodySchema.safeParse(
      cuerpo(
        { type: "heading", level: 1, text: "Novedades" },
        { type: "paragraph", text: "Hola **{{nombre}}**" },
        { type: "list", ordered: false, items: ["uno", "dos"] },
        { type: "image", imageId: "mki_1", alt: "Portada" },
        { type: "button", label: "Inscribite", url: "https://academia.test/revit" },
        { type: "divider" }
      )
    );
    expect(r.success).toBe(true);
  });

  it("un campo `html` o un tipo desconocido falla", () => {
    expect(
      CampaignBodySchema.safeParse({ v: 1, blocks: [{ type: "paragraph", text: "x", html: "<b>x</b>" }] }).success
    ).toBe(false);
    expect(CampaignBodySchema.safeParse({ v: 1, blocks: [{ type: "html", html: "<b>x</b>" }] }).success).toBe(false);
  });

  it("límites: nivel de título, largo, ítems, cantidad de bloques y texto total", () => {
    expect(CampaignBodySchema.safeParse(cuerpo({ type: "heading", level: 3 as 1, text: "x" })).success).toBe(false);
    expect(CampaignBodySchema.safeParse(cuerpo({ type: "heading", level: 2, text: "x".repeat(201) })).success).toBe(false);
    expect(CampaignBodySchema.safeParse(cuerpo({ type: "paragraph", text: "x".repeat(3001) })).success).toBe(false);
    expect(CampaignBodySchema.safeParse(cuerpo({ type: "list", ordered: true, items: [] })).success).toBe(false);
    expect(
      CampaignBodySchema.safeParse(cuerpo({ type: "list", ordered: true, items: Array(31).fill("x") })).success
    ).toBe(false);
    expect(
      CampaignBodySchema.safeParse(cuerpo({ type: "list", ordered: true, items: ["x".repeat(501)] })).success
    ).toBe(false);
    expect(CampaignBodySchema.safeParse(cuerpo({ type: "button", label: "x".repeat(61), url: "https://a.test" })).success).toBe(false);
    expect(CampaignBodySchema.safeParse({ v: 1, blocks: Array(61).fill({ type: "divider" }) }).success).toBe(false);
    expect(CampaignBodySchema.safeParse({ v: 1, blocks: Array(60).fill({ type: "divider" }) }).success).toBe(true);
    const largo = Array(8).fill({ type: "paragraph", text: "x".repeat(2600) });
    expect(CampaignBodySchema.safeParse({ v: 1, blocks: largo }).success).toBe(false);
    expect(CampaignBodySchema.safeParse({ v: 1, blocks: [] }).success).toBe(true);
  });
});

describe("validarCuerpo", () => {
  it("las variables conocidas son exactamente nombre, apellido y curso_de_interes", () => {
    expect([...KNOWN_VARIABLES].sort()).toEqual(["apellido", "curso_de_interes", "nombre"]);
  });

  it("todo en orden → ok", () => {
    const b = cuerpo(
      { type: "paragraph", text: "Hola {{nombre|colega}}, mirá [esto](https://a.test) o [escribinos](mailto:x@a.test)" },
      { type: "image", imageId: "mki_1", alt: "x", href: "https://a.test/img" }
    );
    expect(validarCuerpo(b, "Para {{nombre}}", ["mki_1"])).toEqual({ ok: true });
  });

  it("variable desconocida → `variable_desconocida` con el nombre y la ruta", () => {
    const r = validarCuerpo(cuerpo({ type: "paragraph", text: "Hola {{edad}}" }), "Asunto", []);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("variable_desconocida");
    expect(r.message).toContain("edad");
    expect(r.fields).toEqual([expect.objectContaining({ path: "body.blocks.0.text" })]);
  });

  it("también en el asunto", () => {
    const r = validarCuerpo(cuerpo(), "Hola {{telefono}}", []);
    expect(r).toMatchObject({ ok: false, code: "variable_desconocida", fields: [{ path: "subject" }] });
  });

  it.each([
    ["http:", "http://a.test"],
    ["javascript:", "javascript:alert(1)"],
    ["data:", "data:text/html,hola"],
    ["que no parsea", "no es una url"],
  ])("botón con %s → `enlace_invalido` con la ruta del bloque", (_caso, url) => {
    const r = validarCuerpo(cuerpo({ type: "divider" }, { type: "button", label: "Ir", url }), "A", []);
    expect(r).toMatchObject({ ok: false, code: "enlace_invalido", fields: [{ path: "body.blocks.1.url" }] });
  });

  it("`mailto:` vale en línea pero no en un botón", () => {
    expect(validarCuerpo(cuerpo({ type: "paragraph", text: "[x](mailto:a@b.test)" }), "A", []).ok).toBe(true);
    expect(
      validarCuerpo(cuerpo({ type: "button", label: "x", url: "mailto:a@b.test" }), "A", [])
    ).toMatchObject({ ok: false, code: "enlace_invalido" });
  });

  it("enlace en línea `http:` → `enlace_invalido`", () => {
    const r = validarCuerpo(cuerpo({ type: "list", ordered: false, items: ["ok", "[x](http://a.test)"] }), "A", []);
    expect(r).toMatchObject({ ok: false, code: "enlace_invalido", fields: [{ path: "body.blocks.0.items.1" }] });
  });

  it("`href` de imagen que no es https → `enlace_invalido`", () => {
    const r = validarCuerpo(cuerpo({ type: "image", imageId: "mki_1", alt: "x", href: "http://a.test" }), "A", ["mki_1"]);
    expect(r).toMatchObject({ ok: false, code: "enlace_invalido", fields: [{ path: "body.blocks.0.href" }] });
  });

  it("imagen que no es de la campaña → `imagen_ajena`", () => {
    const r = validarCuerpo(cuerpo({ type: "image", imageId: "mki_otra", alt: "x" }), "A", ["mki_1"]);
    expect(r).toMatchObject({ ok: false, code: "imagen_ajena", fields: [{ path: "body.blocks.0.imageId" }] });
  });
});

describe("reemplazarVariables", () => {
  it("usa el valor, después la alternativa en línea, después la de la lista", () => {
    expect(reemplazarVariables("Hola {{nombre|colega}}", { nombre: "Ana" })).toBe("Hola Ana");
    expect(reemplazarVariables("Hola {{nombre|colega}}", {})).toBe("Hola colega");
    expect(reemplazarVariables("Hola {{nombre}}!", {})).toBe("Hola !");
    expect(reemplazarVariables("Sobre {{curso_de_interes}}", {})).toBe("Sobre nuestros cursos");
    expect(reemplazarVariables("Sobre {{ curso_de_interes }}", { curso_de_interes: "Revit" })).toBe("Sobre Revit");
  });

  it("nunca deja una llave cruda", () => {
    expect(reemplazarVariables("{{desconocida}} y {{apellido}}", {})).not.toContain("{{");
  });
});

describe("extraerEnlaces", () => {
  it("URLs https únicas en orden (botones, en línea, href de imagen), sin mailto", () => {
    const b = cuerpo(
      { type: "paragraph", text: "[a](https://a.test) y [m](mailto:x@a.test)" },
      { type: "button", label: "b", url: "https://b.test" },
      { type: "image", imageId: "mki_1", alt: "x", href: "https://c.test" },
      { type: "list", ordered: false, items: ["[a otra vez](https://a.test)"] }
    );
    expect(extraerEnlaces(b)).toEqual(["https://a.test/", "https://b.test/", "https://c.test/"]);
  });
});
