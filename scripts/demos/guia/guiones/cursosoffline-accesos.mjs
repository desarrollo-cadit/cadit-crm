/**
 * Cursos offline: accesos directos (a una persona, a una empresa) y cómo quitarlos.
 * Curso, empresa y personas son propios del guion (sufijo único): asignar a una
 * empresa crea un acceso por cada persona que tiene, y eso no debe tocar datos sembrados.
 */

import { apiComo, exigir, sufijo } from "../datos.mjs";

const suf = sufijo();
const CURSO = `Guía de Civil 3D Demo ${suf}`;
const EMPRESA = `Constructora Demo ${suf} S.A.`;
const PERSONA = `Valeria Demo${suf}`;

const { api } = await apiComo("coordinacion");
const curso = exigir("curso offline", await api("/api/offline-courses", { method: "POST", body: JSON.stringify({ title: CURSO, descriptionMd: "", status: "published" }) }));
const empresa = exigir("empresa", await api("/api/companies", { method: "POST", body: JSON.stringify({ legalName: EMPRESA }) }));
const empresaId = empresa.company?.id ?? empresa.id;
const crearPersona = async (nombre, apellido, empresaDe = null) => {
  const r = exigir(`contacto ${nombre}`, await api("/api/contacts", { method: "POST", body: JSON.stringify({ firstName: nombre, lastName: apellido, email: `${nombre}.${apellido}@ejemplo.test`.toLowerCase() }) }));
  const id = r.contact?.id ?? r.id;
  if (empresaDe) exigir("empresa del contacto", await api(`/api/contacts/${id}`, { method: "PATCH", body: JSON.stringify({ companyId: empresaDe }) }));
  return id;
};
await crearPersona(`Valeria`, `Demo${suf}`);
await crearPersona(`Martin`, `Equipo${suf}`, empresaId);
await crearPersona(`Lucia`, `Equipo${suf}`, empresaId);

export const rol = "coordinacion";
export const ruta = `/cursos-offline/${curso.id}`;

const mas = (dias) => new Date(Date.now() + dias * 86_400_000).toISOString().slice(0, 10);

export async function guion(g) {
  const { page } = g;
  const persona = page.getByText("Dar acceso a una persona").locator("xpath=ancestor::div[contains(@class,'border-dashed')][1]");
  const empresaBloque = page.getByText("Asignar a toda una empresa").locator("xpath=ancestor::div[contains(@class,'border-dashed')][1]");

  await g.paso(
    "En el curso, «Quiénes tienen acceso» lista a cada persona y hasta cuándo lo ve",
    page.getByRole("heading", { name: /Quiénes tienen acceso/ }).locator("xpath=ancestor::section[1]"),
    { sostener: 4.2 }
  );

  await g.paso("Para dar acceso a una persona sin inscripción, se la busca por nombre, correo o teléfono", persona, {
    sostener: 5,
    despues: async () => {
      await g.escribir(persona.getByLabel("Buscar persona"), `Demo${suf}`);
      await persona.getByRole("button", { name: new RegExp(PERSONA.split(" ")[0]) }).click();
    },
  });

  await g.paso("La fecha de acceso es obligatoria: pasada esa fecha, la persona deja de ver el curso", persona, {
    sostener: 4.6,
    despues: async () => {
      await persona.locator("input[type=date]").fill(mas(90));
      await persona.getByRole("button", { name: "Dar acceso" }).click();
      await page.getByText("Acceso directo").first().waitFor();
    },
  });

  await g.paso("Para una empresa se elige la empresa y la fecha, y se revisa quiénes lo reciben", empresaBloque, {
    sostener: 5.4,
    despues: async () => {
      const opcion = empresaBloque.locator("select option", { hasText: EMPRESA });
      await empresaBloque.locator("select").selectOption({ value: await opcion.first().getAttribute("value") });
      await empresaBloque.locator("input[type=date]").fill(mas(60));
      await empresaBloque.getByRole("button", { name: "Ver quiénes" }).click();
      await empresaBloque.getByText(/Lo reciben/).waitFor();
    },
  });

  await g.paso("«Confirmar» crea un acceso individual por cada persona que la empresa tiene hoy", empresaBloque.getByRole("button", { name: "Confirmar" }), {
    accion: "clic",
    sostener: 4.4,
    despues: () => page.getByText(/empresa /).first().waitFor(),
  });

  await g.paso(
    "«Cambiar fecha» y «Quitar» ajustan o retiran un acceso directo",
    page.getByRole("button", { name: "Quitar" }).first().locator("xpath=ancestor::li[1]"),
    { sostener: 3.8 }
  );

  page.once("dialog", (d) => d.accept());
  await g.paso("Al quitarlo, la persona deja de ver el curso en ese momento", page.getByRole("button", { name: "Quitar" }).first(), {
    accion: "clic",
    sostener: 3.4,
    despues: () => page.getByText("Acceso quitado").waitFor(),
  });
}
