/** Configuración › Formularios: crear un formulario de captación y copiar su URL. */
import { sufijo } from "../datos.mjs";

export const rol = "direccion";
export const ruta = "/settings/forms";

export async function guion(g) {
  const { page } = g;
  const s = sufijo();
  const nombre = `Feria Demo ${s}`;
  const tarjeta = (loc) => loc.locator("xpath=ancestor::*[contains(@class,'rounded-lg')][1]");

  await g.paso(
    "Cada formulario tiene una URL pública para pegar en el sitio web",
    page.getByText("Cada formulario tiene una URL pública de envío"),
    { sostener: 3.8 }
  );

  await g.paso("Cada curso del catálogo ya tiene su propia URL, sin crear nada", tarjeta(page.getByRole("heading", { name: /Un formulario por curso/ })), {
    sostener: 3.6,
  });

  await g.paso("Para campañas con nombre propio se crea un formulario nuevo", tarjeta(page.getByRole("heading", { name: "Nuevo formulario" })), {
    despues: async () => {
      await g.escribir(page.locator("#form-name"), nombre, { retardo: 50 });
    },
    sostener: 4,
  });

  await g.paso("Puede atarse a un curso de interés o quedar genérico", page.locator("#form-course"), {
    despues: async () => {
      const opciones = await page.locator("#form-course option").allTextContents();
      if (opciones[1]) await page.locator("#form-course").selectOption({ index: 1 });
    },
    sostener: 3.4,
  });

  await g.paso("«Crear formulario» genera la URL de envío", page.getByRole("button", { name: "Crear formulario" }), {
    accion: "clic",
    despues: async () => {
      await page.getByRole("heading", { name: nombre }).waitFor({ timeout: 15000 });
    },
    sostener: 2.6,
  });

  const card = tarjeta(page.getByRole("heading", { name: nombre }));
  await g.paso("El formulario queda listado con su URL y un botón para copiarla", card, { sostener: 3.4 });

  await g.paso("Los contactos que llegan por aquí quedan marcados con el origen «Formulario»", card.getByText("Ver snippet de ejemplo (fetch / curl)"), {
    accion: "clic",
    sostener: 4,
  });
}
