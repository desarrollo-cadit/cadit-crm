import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buscarEmpresaPorNombre } from "@/lib/company";
import { armarAvisoInteresado, type InteresadoNuevo } from "@/lib/lead-notices";
import { publicWorkshopRegistrationSchema } from "@/server/workshops";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/**
 * Talleres en la web: la imagen del taller (la misma portada del curso,
 * `course.image_url`, subida con `/api/courses/[id]/image`) y la empresa que
 * la persona escribe al anotarse.
 */

describe("la imagen del taller", () => {
  it("el staff la sube por la MISMA ruta que la portada de un curso", () => {
    const campo = read("src/components/workshops/workshop-image-field.tsx");
    expect(campo).toContain("fetch(`/api/courses/${courseId}/image`, { method: \"PUT\", body })");
    expect(campo).toContain('accept="image/jpeg,image/png,image/webp"');
  });

  it("se puede cargar desde el alta y desde el detalle del taller", () => {
    expect(read("src/components/workshops/workshops-client.tsx")).toContain("subirImagenDeTaller(");
    expect(read("src/components/workshops/workshop-detail-client.tsx")).toContain("<WorkshopImageField");
  });

  it("la edición del staff trae la imagen del taller (la del curso)", () => {
    expect(read("src/server/workshops.ts")).toMatch(/imageUrl: course\.imageUrl,[\s\S]*startDate: cohort\.startDate/);
  });
});

describe("la empresa al anotarse desde la web", () => {
  const base = { name: "Ana", phone: "59899123456" };

  it("es opcional: sin empresa el envío vale igual", () => {
    const r = publicWorkshopRegistrationSchema.safeParse(base);
    expect(r.success).toBe(true);
    expect(r.success && r.data.company).toBeUndefined();
  });

  it("se recorta, y vacía cuenta como que no vino", () => {
    const con = publicWorkshopRegistrationSchema.parse({ ...base, company: "  Acme SA  " });
    expect(con.company).toBe("Acme SA");
    const vacia = publicWorkshopRegistrationSchema.parse({ ...base, company: "   " });
    expect(vacia.company).toBeUndefined();
  });

  it("admite hasta 200 caracteres", () => {
    expect(publicWorkshopRegistrationSchema.safeParse({ ...base, company: "a".repeat(200) }).success).toBe(true);
    expect(publicWorkshopRegistrationSchema.safeParse({ ...base, company: "a".repeat(201) }).success).toBe(false);
  });

  it("la ruta pública del taller usa este contrato y pasa la empresa", () => {
    const ruta = read("src/app/api/public/talleres/[id]/submit/route.ts");
    expect(ruta).toContain("parseBody(req, publicWorkshopRegistrationSchema)");
    expect(ruta).toContain("company: body.data.company ?? null");
  });
});

describe("a qué empresa se vincula (por nombre)", () => {
  const empresas = [
    { id: "co_1", legalName: "Construcciones del Este S.A.", tradeName: "Del Este" },
    { id: "co_2", legalName: "Ingeniería Montevideo SRL", tradeName: null },
  ];

  it("coincide con la razón social sin importar mayúsculas, tildes ni espacios", () => {
    expect(buscarEmpresaPorNombre(empresas, "ingenieria   montevideo srl")).toBe("co_2");
    expect(buscarEmpresaPorNombre(empresas, "CONSTRUCCIONES DEL ESTE S.A.")).toBe("co_1");
  });

  it("coincide también con el nombre comercial", () => {
    expect(buscarEmpresaPorNombre(empresas, "del este")).toBe("co_1");
  });

  it("un nombre parecido no es el mismo: no adivina", () => {
    expect(buscarEmpresaPorNombre(empresas, "Ingeniería Montevideo")).toBeNull();
  });

  it("vacío no coincide con nada", () => {
    expect(buscarEmpresaPorNombre(empresas, "   ")).toBeNull();
  });

  it("el alta del taller vincula la empresa sin pisar la del contacto y sin romper la inscripción", () => {
    const srv = read("src/server/companies.ts");
    expect(srv).toContain("export async function vincularEmpresaPorNombre(");
    expect(srv).toContain("completarEmpresaDelContacto(");
    expect(srv).toContain("buscarEmpresaPorNombre(");
    // En un savepoint que no lanza: un fallo de la empresa no se lleva la inscripción.
    expect(srv).toMatch(/vincularEmpresaPorNombre[\s\S]*getDb\(\)\.transaction\([\s\S]*catch/);
    const talleres = read("src/server/workshops.ts");
    expect(talleres).toContain("vincularEmpresaPorNombre(organizationId, contacto.contactId, input.company)");
  });

  it("la lista de inscriptos del staff muestra la empresa del contacto", () => {
    const srv = read("src/server/workshops.ts");
    expect(srv).toMatch(/company: \{ id: string; name: string \} \| null/);
    expect(read("src/components/workshops/workshop-detail-client.tsx")).toContain("<TableHead>Empresa</TableHead>");
  });
});

describe("el aviso de nuevo interesado lleva la empresa", () => {
  const base: InteresadoNuevo = {
    contactId: "ct_1",
    nombre: "Ana",
    apellido: "Pérez",
    telefono: "59899123456",
    email: null,
    mensaje: null,
    interes: { tipo: "taller", nombre: "Revit", cohorte: null, inicio: null, horario: null },
    origen: "formulario:Taller Revit",
    contactoNuevo: true,
    recibidoEn: "2026-10-20T15:30:00.000Z",
    resultado: "anotado",
  };
  const opts = { baseUrl: "https://crm.example", timeZone: "America/Montevideo" };

  it("con empresa, aparece (escapada)", () => {
    const { html } = armarAvisoInteresado({ ...base, empresa: "Acme <SA>" }, opts);
    expect(html).toContain("Empresa");
    expect(html).toContain("Acme &lt;SA&gt;");
  });

  it("sin empresa, no hay fila", () => {
    const { html } = armarAvisoInteresado(base, opts);
    expect(html).not.toContain(">Empresa<");
  });

  it("el encolado congela la empresa del formulario", () => {
    expect(read("src/server/lead-notices-queue.ts")).toContain("empresa: envio.datos.company ?? null");
  });
});
