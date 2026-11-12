/** Marketing: armar una audiencia, ver la vista previa y guardarla. */

import { sufijo } from "../datos.mjs";

export const rol = "coordinacion";
export const ruta = "/marketing?tab=audiencias";

const suf = sufijo();
const nombre = `Leads de formulario ${suf}`;

/** Un filtro desplegable (`<details>`) por el nombre de su encabezado. */
const filtro = (page, titulo) =>
  page.locator("details").filter({ has: page.locator("summary", { hasText: titulo }) }).first();

export async function guion(g) {
  const { page } = g;
  const resultado = page.locator("section[aria-label='A quién le llegaría']");
  const cifra = resultado.locator("xpath=./div[1]");

  // Un origen con una cantidad razonable de personas, tomado de las opciones reales.
  const opciones = await page.evaluate(() => fetch("/api/marketing/audiences/options").then((r) => r.json()));
  const origenes = [...opciones.sources].sort((a, b) => b.count - a.count);
  const origen = origenes.find((s) => s.count >= 15 && s.count <= 400) ?? origenes[0];

  await g.paso("«Nueva audiencia» abre el armador de filtros", page.getByRole("link", { name: "Nueva audiencia" }), {
    accion: "clic",
    sostener: 2.8,
    despues: async () => {
      await page.getByLabel("Nombre", { exact: true }).waitFor();
      await resultado.getByText(/persona/).first().waitFor();
    },
  });

  await g.paso("Escriba un nombre que describa a quiénes apunta", page.getByLabel("Nombre", { exact: true }), {
    sostener: 3.4,
    despues: async () => {
      await g.escribir(page.getByLabel("Nombre", { exact: true }), nombre);
    },
  });

  await g.paso("Abra un filtro y marque una o varias opciones, por ejemplo el origen", filtro(page, "Origen"), {
    accion: "clic",
    sostener: 4.6,
    despues: async () => {
      await filtro(page, "Origen").getByLabel(new RegExp(origen.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).first().check();
    },
  });

  await g.paso("A la derecha, la cantidad de personas se recalcula al instante", cifra, { sostener: 4 });

  await g.paso("Cada filtro nuevo se suma a los anteriores y acota la audiencia", filtro(page, "Etapa del pipeline"), {
    accion: "clic",
    sostener: 4.4,
    despues: async () => {
      const abierto = filtro(page, "Etapa del pipeline");
      await abierto.getByRole("checkbox").first().check();
    },
  });

  await g.paso("La vista previa muestra quiénes recibirían el correo", resultado.locator("table"), { sostener: 3.6 });

  await g.paso("«Guardar audiencia» la deja disponible para las campañas", page.getByRole("button", { name: "Guardar audiencia" }), {
    accion: "clic",
    sostener: 4,
    despues: async () => {
      await page.getByRole("button", { name: "Guardar cambios" }).waitFor();
    },
  });
}
