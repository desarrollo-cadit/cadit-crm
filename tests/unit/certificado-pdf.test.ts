import { readFileSync } from "node:fs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { armarCertificado, type CertificadoSnapshot } from "@/lib/certificado";
import {
  descripcionEntraEnCertificado,
  renderCertificadoPdf,
  respuestaCertificadoPdf,
} from "@/lib/certificado-pdf";

/**
 * 038 — El PDF real: plantillas y fuentes del repo, sin base.
 *
 * No compara píxeles (eso se miró a ojo contra los ejemplos del dueño): fija
 * que cada formato sale sobre SU plantilla, con su tamaño y orientación, y
 * que los casos que rompen un diseño —nombres largos, tildes y eñes, seis
 * módulos, sin descripción— no tiran.
 */

const opts = { codigo: "K7Q2M9XA", baseUrl: "https://campus.cadit.com.uy" };

function snap(over: Partial<CertificadoSnapshot> = {}): CertificadoSnapshot {
  return {
    version: 1,
    formato: "curso",
    alumno: "Sofía Núñez Muñoz",
    curso: "REVIT Arquitectura",
    cohorte: "REVIT 42",
    anio: 2026,
    modulo: null,
    modulos: [],
    descripcion: "Modelado arquitectónico en Autodesk Revit.",
    ...over,
  };
}

async function pagina(s: CertificadoSnapshot) {
  const bytes = await renderCertificadoPdf(armarCertificado(s, opts));
  expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  const doc = await PDFDocument.load(bytes);
  expect(doc.getPageCount()).toBe(1);
  return doc.getPage(0).getSize();
}

describe("renderCertificadoPdf", () => {
  it("el general sale en A4 VERTICAL", async () => {
    const { width, height } = await pagina(
      snap({
        formato: "especializacion",
        curso: "Especialización en Proyectos BIM",
        descripcion: null,
        modulos: ["BIM Management", "Proyecto BIM", "Coordinación BIM", "Implementación BIM"],
      })
    );
    expect(Math.round(width)).toBe(595);
    expect(Math.round(height)).toBe(842);
  }, 20_000);

  it("el de módulo y el de curso salen en A4 APAISADO", async () => {
    for (const s of [
      snap({ formato: "modulo", modulo: { ordinal: 1, nombre: "BIM Management" } }),
      snap(),
    ]) {
      const { width, height } = await pagina(s);
      expect(Math.round(width)).toBe(842);
      expect(Math.round(height)).toBe(595);
    }
  }, 20_000);

  it("no tira con nombres larguísimos, tildes y eñes, seis módulos y sin descripción", async () => {
    const acentos = "ÁÉÍÓÚÑÜ áéíóúñü";
    await pagina(
      snap({
        formato: "especializacion",
        alumno: `María de los Ángeles Güemes Núñez de la Peña Ibáñez ${acentos}`,
        curso: "Especialización internacional en coordinación y gestión de proyectos BIM para infraestructura",
        descripcion: null,
        modulos: [
          "BIM Management",
          "Proyecto BIM",
          "Coordinación BIM",
          "Implementación BIM",
          "Gestión de la información y estándares internacionales",
          `Módulo ${acentos}`,
        ],
      })
    );
    await pagina(
      snap({
        formato: "modulo",
        alumno: `José Ñandú Güiro ${acentos}`,
        modulo: { ordinal: 6, nombre: `Coordinación ${acentos}` },
        descripcion: "palabra ".repeat(120),
      })
    );
    await pagina(snap({ descripcion: null }));
    // Un carácter de control en el nombre no rompe el documento.
    await pagina(snap({ alumno: "Ana\nPérez\t" }));
  }, 30_000);
});

describe("respuestaCertificadoPdf (FR-015)", () => {
  it("se descarga como adjunto con alumno y curso en el nombre", async () => {
    const r = await respuestaCertificadoPdf(armarCertificado(snap(), opts), "REVIT Arquitectura");
    expect(r.headers.get("content-type")).toBe("application/pdf");
    const disp = r.headers.get("content-disposition") ?? "";
    expect(disp).toContain("attachment;");
    expect(disp).toContain('filename="Certificado - Sofia Nunez Munoz - REVIT Arquitectura.pdf"');
    expect(r.headers.get("cache-control")).toContain("no-store");
  }, 20_000);
});

describe("descripcionEntraEnCertificado (US3, escenario 3)", () => {
  it("un párrafo como los del ejemplo entra; uno enorme no", async () => {
    expect(
      await descripcionEntraEnCertificado(
        "El alumno es capaz de gestionar la integración de diferentes modelos. En las diferentes etapas del proyecto se conocieron los posibles conflictos y sus soluciones, buscando lograr la capacidad de ser el nexo entre los modeladores, de generar una integración y cooperación total."
      )
    ).toBe(true);
    expect(await descripcionEntraEnCertificado("Mmmmmmmmmm ".repeat(60))).toBe(false);
  }, 20_000);
});

describe("los archivos del diseño están versionados con el producto", () => {
  const dir = path.join(process.cwd(), "assets", "certificados");
  it.each([
    "especializacion-vertical.pdf",
    "especializacion-horizontal.pdf",
    "curso-horizontal.pdf",
    "fonts/poppins/Poppins-Regular.ttf",
    "fonts/poppins/Poppins-SemiBold.ttf",
    "fonts/poppins/Poppins-Bold.ttf",
    "fonts/poppins/OFL.txt",
    "fonts/parisienne/Parisienne-Regular.ttf",
    "fonts/parisienne/OFL.txt",
  ])("%s", (f) => {
    expect(readFileSync(path.join(dir, f)).length).toBeGreaterThan(1000);
  });
});
