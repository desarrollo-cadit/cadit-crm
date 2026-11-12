/** Marketing: redactar una campaña de correo con bloques, variables y vista previa. */

import { apiComo, exigir, sufijo } from "../datos.mjs";

/* Dato de apoyo: la audiencia que la campaña va a elegir. */
const suf = sufijo();
const { api } = await apiComo("coordinacion");
const audiencia = `Leads ${suf}`;
exigir(
  "alta de la audiencia",
  await api("/api/marketing/audiences", {
    method: "POST",
    body: JSON.stringify({ name: audiencia, filters: { v: 1, contactTypes: ["lead"] } }),
  })
);
const nombre = `Nuevos grupos de Revit ${suf}`;

export const rol = "coordinacion";
export const ruta = "/marketing?tab=campanas";

export async function guion(g) {
  const { page } = g;

  await g.paso("«Nueva campaña» abre el formulario para redactar el correo", page.getByRole("link", { name: "Nueva campaña" }), {
    accion: "clic",
    sostener: 3,
    despues: async () => {
      await page.getByLabel("Nombre (interno)").waitFor();
    },
  });

  await g.paso(
    "Indique un nombre interno, la audiencia y el asunto",
    page.getByRole("region", { name: "Datos de la campaña" }),
    {
      sostener: 5,
      despues: async () => {
        await g.escribir(page.getByLabel("Nombre (interno)"), nombre);
        await page.getByLabel("Audiencia").selectOption({ label: audiencia });
        await g.escribir(page.getByLabel("Asunto"), "Inscripciones abiertas: nuevos grupos de Revit");
      },
    }
  );

  await g.paso("Al crearla, se habilita el editor de bloques y la vista previa", page.getByRole("button", { name: "Crear campaña" }), {
    accion: "clic",
    sostener: 3.4,
    despues: async () => {
      await page.getByRole("button", { name: "Título", exact: true }).waitFor();
    },
  });

  const editor = page.getByRole("region", { name: "Correo" });
  await g.paso("El correo se arma con bloques: título, párrafo, lista, imagen, botón y separador", editor, {
    sostener: 6,
    despues: async () => {
      await page.getByRole("button", { name: "Título", exact: true }).click();
      await g.escribir(page.getByLabel("Texto del título"), "Arrancan los grupos de Revit");
      await page.getByRole("button", { name: "Párrafo", exact: true }).click();
      await g.escribir(page.getByLabel("Texto del párrafo"), "Hola  ya están abiertas las inscripciones.");
      await page.getByLabel("Texto del párrafo").evaluate((e) => e.setSelectionRange(5, 5));
      await page.getByRole("button", { name: "Nombre", exact: true }).click();
      await page.getByRole("button", { name: "Botón", exact: true }).click();
      await page.getByText("Texto del botón", { exact: true }).locator("xpath=following-sibling::input").fill("Quiero inscribirme");
      await page.getByText("Enlace (https)", { exact: true }).locator("xpath=following-sibling::input").fill("https://example.com/inscripcion");
    },
  });

  await g.paso(
    "Las variables, como el nombre, se reemplazan por los datos de cada persona",
    page.getByLabel("Texto del párrafo"),
    { sostener: 4 }
  );

  await g.paso(
    "La vista previa muestra el correo tal como se enviaría, con el asunto",
    page.getByRole("region", { name: "Vista previa" }),
    { sostener: 4.4 }
  );

  await g.paso(
    "Para la prueba y el envío hace falta el buzón de marketing, que se configura en Ajustes",
    page.getByText("Para poder enviarla falta").locator("xpath=ancestor::div[contains(@class,'rounded-md')][1]"),
    { sostener: 4.6 }
  );

  await g.paso(
    "Al enviar se confirma la cantidad de personas y los correos salen de a uno",
    page.getByRole("button", { name: "Enviar campaña" }),
    { sostener: 4.6 }
  );
}
