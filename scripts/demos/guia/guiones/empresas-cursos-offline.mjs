/** Cursos offline de una empresa (datos creados por el guion). */
import { apiComo, exigir, sufijo } from "../datos.mjs";

export const rol = "coordinacion";
export const ruta = "/empresas";

export async function guion(g) {
  const { page } = g;
  const suf = sufijo();
  const { api } = await apiComo("direccion");
  const post = async (u, b) => exigir(u, await api(u, { method: "POST", body: JSON.stringify(b) }));
  const emp = (await post("/api/companies", { legalName: `Offline Demo ${suf} S.A.` })).company;
  for (const n of ["Carla", "Diego"]) {
    const c = (await post("/api/contacts", { firstName: n, lastName: `Offline${suf}`, email: `${n.toLowerCase()}.${suf}@demo.test` })).contact;
    exigir("empresa", await api(`/api/contacts/${c.id}`, { method: "PATCH", body: JSON.stringify({ companyId: emp.id }) }));
  }
  await page.reload({ waitUntil: "load" });
  const buscador = page.getByRole("searchbox");
  await g.escribir(buscador, `Offline Demo ${suf}`);
  await page.getByRole("listitem").filter({ hasText: `Offline Demo ${suf}` }).first().getByRole("button").first().click();
  const seccion = page.getByRole("region", { name: "Cursos offline" });
  await seccion.getByRole("button", { name: /Asignar curso offline/ }).waitFor({ timeout: 60000 });
  g.comenzar();
  const hasta = new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10);

  await g.paso("Cada empresa muestra qué cursos offline tiene su gente y hasta cuándo", seccion, { sostener: 4 });
  await g.paso("«Asignar curso offline» da un curso a todas las personas de la empresa", seccion.getByRole("button", { name: /Asignar curso offline/ }), {
    accion: "clic",
    sostener: 3.4,
    despues: () => seccion.getByLabel("Curso offline").waitFor(),
  });
  await g.paso("Se elige el curso y la fecha de vencimiento del acceso", seccion.getByLabel("Curso offline"), {
    sostener: 5,
    despues: async () => {
      await seccion.getByLabel("Curso offline").selectOption({ label: "Revit® Básico 2025" });
      await seccion.getByLabel("Acceso hasta").fill(hasta);
    },
  });
  await g.paso("Antes de aplicar, «Ver quiénes» muestra quién lo recibe y a quién se extiende", seccion.getByRole("button", { name: "Ver quiénes" }), {
    accion: "clic",
    sostener: 5,
    despues: () => seccion.getByText(/Lo reciben/).waitFor({ timeout: 60000 }),
  });
  await g.paso("Quien se sume a la empresa después no lo recibe automáticamente", seccion.getByText(/Lo reciben/).locator("xpath=ancestor::div[1]"), { sostener: 4 });
  await g.paso("«Confirmar» crea un acceso individual para cada persona", seccion.getByRole("button", { name: "Confirmar" }), {
    accion: "clic",
    sostener: 3.4,
    despues: () => seccion.getByText(/Hasta el/).first().waitFor({ timeout: 60000 }),
  });
  await g.paso("Cada acceso puede extenderse o quitarse desde la lista de personas", seccion.getByRole("button", { name: "Extender" }).first(), { sostener: 4.4 });
}
